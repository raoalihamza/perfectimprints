"""Phase E: Geiger brand logo scrape.

Reads Geiger's `/c/shop-by-brand` A-Z index in a single request. Every brand
entry is an anchor that links to `/b/brand-names#/filter:brand:<NAME>` and
wraps an `<img>` whose `src` is the brand logo (hosted on `imgsirv.geiger.com`
or `geiger-public-hosted-files-dev.s3.amazonaws.com`). We:

1. Pull every brand's name + letter group + logo URL out of the index HTML.
2. Download each logo to `data/geiger/brand-logos/<slug>.<ext>` (resumable —
   skip if the file already exists).
3. Cross-reference with `data/geiger/products.json` to count products per
   brand (slug-keyed, case-insensitive, diacritic-stripped).
4. Emit `data/geiger/brands.json` covering the union of brands seen on the
   shop-by-brand index AND brands present only in the product catalog.

The original spec assumed per-brand pages with hero logos; in practice every
logo is inline on the A-Z index, so this is a 1-fetch HTML pull + N image
downloads. Total runtime: ~3-5 minutes for ~200 brands at 1 req/sec.

SCRAPE-910 fallback: `www.geiger.com` challenges requests from datacenter IPs
(GitHub-hosted runners), so the single index fetch used to kill the scrape-e
job (SCRAPE-900/901). A failed fetch, or a parse that yields zero brands, is
now NON-FATAL: we keep the committed brands.json and logo files untouched
(the scrape_catalogs.py keep-previous-on-failure pattern), warn loudly, write
`data/geiger/brand-index-fetch-status.json` (read by the monthly summary so
Patrick's email says so), and exit cleanly. Cost of a fallback run: a brand
new to Geiger is missed until a run from an unblocked machine succeeds;
existing brands and logos stay correct. The per-logo downloads below were
deliberately LEFT on plain httpx (no Chrome TLS impersonation): they only
ever execute after the index fetch succeeded, i.e. from a machine Geiger is
not challenging, they have worked from such machines since May, and each
download is already individually non-fatal. Switching their transport to
curl_cffi would change the error-handling path of code that only runs where
it already works.
"""

from __future__ import annotations

import datetime as dt
import html
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import httpx
import orjson
from bs4 import BeautifulSoup, Tag
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .client import RateLimiter, ScraperClient
from .config import GEIGER_BASE_URL, OUTPUT_DIR, PROJECT_ROOT

SHOP_BY_BRAND_URL = "https://www.geiger.com/c/shop-by-brand"
BRAND_LOGOS_DIR = OUTPUT_DIR / "brand-logos"
# Mirror directory under /public so Next.js serves logos directly without
# touching Sanity. brands.json records the public URL form below.
PUBLIC_BRAND_LOGOS_DIR = PROJECT_ROOT / "public" / "brand-logos"
BRANDS_JSON_PATH = OUTPUT_DIR / "brands.json"
PRODUCTS_JSON_PATH = OUTPUT_DIR / "products.json"

LOGO_DOWNLOAD_TIMEOUT = 30
ALLOWED_EXTS = {".gif", ".png", ".jpg", ".jpeg", ".webp", ".svg"}

# Written on every Phase E run. mode is "fresh" (index scraped, brands.json
# rewritten) or "fallback-committed" (index fetch/parse failed; committed
# brands.json + logos kept). Gitignored; never part of the rebuild PR.
BRAND_STATUS_FILE = OUTPUT_DIR / "brand-index-fetch-status.json"


def _write_brand_status(mode: str, error: str | None = None) -> None:
    status: dict[str, Any] = {
        "phase": "e",
        "mode": mode,
        "at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SHOP_BY_BRAND_URL,
    }
    if error:
        status["error"] = error
    if mode == "fallback-committed" and BRANDS_JSON_PATH.exists():
        try:
            kept = orjson.loads(BRANDS_JSON_PATH.read_bytes())
            status["keptScrapedAt"] = kept.get("scrapedAt")
            status["keptTotalBrands"] = kept.get("totalBrands")
        except Exception:  # noqa: BLE001 - status is best-effort metadata
            pass
    BRAND_STATUS_FILE.write_bytes(orjson.dumps(status, option=orjson.OPT_INDENT_2))


def _slugify(name: str) -> str:
    """Brand-name → slug per CLAUDE.md spec.

    Rules:
      - HTML-unescape first (products.json carries `Cutter &amp; Buck` etc.)
      - lowercase
      - strip diacritics (BrüMate → brumate)
      - drop & + , . ' " (Cutter & Buck → cutter-buck; Baggo, Inc. → baggo-inc)
      - collapse remaining non-alphanumerics to single hyphens
      - trim leading/trailing hyphens
    """
    decoded = html.unescape(name)
    normalized = unicodedata.normalize("NFKD", decoded)
    ascii_form = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_form.lower()
    # Drop punctuation that shouldn't become a separator
    cleaned = re.sub(r"[&'\"’]", "", lowered)
    # Collapse all other non-alphanumerics into a single hyphen
    slug = re.sub(r"[^a-z0-9]+", "-", cleaned).strip("-")
    return slug


def _decode_brand_fragment(fragment: str) -> str:
    """Decode the doubly-URL-encoded `filter:brand:<NAME>` payload.

    Geiger's fragments look like `$2520` (= `%20` = space), `$25C3$25BC` (= `%C3%BC` = ü).
    First pass converts `$25` back to `%`, then standard unquote handles the rest.
    """
    # `$25` is the encoded `%`; replace and unquote twice for safety
    once = unquote(fragment.replace("$25", "%"))
    twice = unquote(once)
    return twice.strip()


def _ext_from_url(url: str) -> str:
    """Pull the file extension off an image URL (default `.gif`)."""
    path = urlparse(url).path
    suffix = Path(path).suffix.lower()
    if suffix in ALLOWED_EXTS:
        return suffix
    return ".gif"


def _extract_brands_from_index(html: str) -> list[dict[str, Any]]:
    """Walk the brand-index HTML and yield brand records with letter grouping.

    Letters appear as standalone <h4>A</h4> sibling nodes; we maintain a
    running letter as we sweep through the document in source order.
    """
    soup = BeautifulSoup(html, "lxml")
    current_letter: str | None = None
    seen_names: set[str] = set()
    brands: list[dict[str, Any]] = []

    # We sweep every tag in document order. When we hit a single-letter <h4>
    # we update `current_letter`; when we hit a brand anchor we record it.
    for el in soup.find_all(True):
        if not isinstance(el, Tag):
            continue
        if el.name == "h4":
            txt = el.get_text(strip=True)
            if len(txt) == 1 and txt.isalpha():
                current_letter = txt.upper()
            continue
        if el.name != "a":
            continue
        href = el.get("href", "")
        if "brand-names" not in href or "filter:brand:" not in href:
            continue
        m = re.search(r"filter:brand:([^&#?]+)", href)
        if not m:
            continue
        name = _decode_brand_fragment(m.group(1))
        if not name or name in seen_names:
            continue
        seen_names.add(name)

        img = el.find("img")
        logo_url = ""
        img_alt = ""
        if isinstance(img, Tag):
            logo_url = (img.get("src") or img.get("data-src") or "").strip()
            img_alt = (img.get("alt") or "").strip()

        # Reconstruct the Geiger filter URL (always works, even for niche brands
        # that don't have a `/b/<slug>` landing page).
        geiger_url = f"{GEIGER_BASE_URL}{href}" if href.startswith("/") else href

        brands.append(
            {
                "name": name,
                "slug": _slugify(name),
                "letter": current_letter or _first_letter(name),
                "geigerUrl": geiger_url,
                "logoSourceUrl": logo_url,
                "logoAlt": img_alt,
            }
        )

    return brands


def _first_letter(name: str) -> str:
    for ch in name:
        if ch.isalpha():
            return ch.upper()
    return "#"


_logo_limiter = RateLimiter(min_interval=1.0)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1.5, min=1, max=15),
    retry=retry_if_exception_type(
        (httpx.HTTPStatusError, httpx.RequestError, httpx.TimeoutException)
    ),
    reraise=True,
)
def _download_logo(client: httpx.Client, url: str, dest: Path) -> int:
    """Download a single logo. Returns the number of bytes written."""
    _logo_limiter.wait()
    r = client.get(url, timeout=LOGO_DOWNLOAD_TIMEOUT)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    return len(r.content)


def _mirror_to_public(canonical: Path, public_dest: Path) -> None:
    """Copy a canonical logo into /public/brand-logos so Next.js serves it."""
    if public_dest.exists() and public_dest.stat().st_size == canonical.stat().st_size:
        return
    public_dest.parent.mkdir(parents=True, exist_ok=True)
    public_dest.write_bytes(canonical.read_bytes())


def _build_brand_to_count(
    products: list[dict[str, Any]],
) -> tuple[Counter[str], dict[str, str]]:
    """Count products per slugified brand name (case + diacritic insensitive).

    Returns (counts_by_slug, canonical_name_by_slug). Both names are
    HTML-unescaped to defang `Cutter &amp; Buck` style entities sitting in
    products.json.
    """
    counts: Counter[str] = Counter()
    name_for_slug: dict[str, str] = {}
    for p in products:
        raw = (p.get("brand") or "").strip()
        if not raw:
            continue
        clean = html.unescape(raw)
        slug = _slugify(clean)
        if not slug:
            continue
        counts[slug] += 1
        # Keep the longest/most-descriptive brand name encountered for this slug
        if slug not in name_for_slug or len(clean) > len(name_for_slug[slug]):
            name_for_slug[slug] = clean
    return counts, name_for_slug


def _load_products() -> list[dict[str, Any]]:
    if not PRODUCTS_JSON_PATH.exists():
        print(f"  WARNING: {PRODUCTS_JSON_PATH} not found — product counts will be zero.")
        return []
    raw = orjson.loads(PRODUCTS_JSON_PATH.read_bytes())
    if isinstance(raw, dict) and "products" in raw:
        return raw["products"]
    if isinstance(raw, list):
        return raw
    return []


def run() -> None:
    print("Phase E: Brand logo scrape starting...")
    BRAND_LOGOS_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: fetch the A-Z brand index (single request via Cloudflare-aware
    # client) and parse out brand records. SCRAPE-910: both are NON-FATAL.
    # On failure we keep the committed brands.json + logos untouched (the
    # scrape_catalogs.py keep-previous pattern) instead of failing the job.
    # A parse yielding ZERO brands is treated as a failure too: proceeding
    # would overwrite a good brands.json with a logo-less orphan-only file.
    print(f"  Fetching {SHOP_BY_BRAND_URL}")
    try:
        with ScraperClient() as client:
            response = client.get(SHOP_BY_BRAND_URL)
        print(f"  Got {len(response.text):,} bytes (status {response.status_code})")
        index_brands = _extract_brands_from_index(response.text)
        if not index_brands:
            raise RuntimeError(
                "Brand index parse produced zero brands (page shape changed?)"
            )
    except Exception as e:  # noqa: BLE001 - any fetch/parse failure falls back
        reason = f"{type(e).__name__}: {e}"
        _write_brand_status("fallback-committed", error=reason)
        print("::warning::Phase E brand index fetch FAILED - keeping the "
              "committed brands.json and logo files. Brands new to Geiger "
              "will be missed until a run from an unblocked machine succeeds.")
        print("\n" + "!" * 72)
        print("PHASE E FALLBACK: brand index fetch failed; keeping the previous")
        print("data/geiger/brands.json and logo files for this rebuild.")
        print(f"  Reason: {reason}")
        if BRANDS_JSON_PATH.exists():
            try:
                kept = orjson.loads(BRANDS_JSON_PATH.read_bytes())
                print(f"  Kept brands.json scrapedAt: {kept.get('scrapedAt')} "
                      f"({kept.get('totalBrands')} brands)")
            except Exception:  # noqa: BLE001
                pass
        else:
            print("  NOTE: no previous brands.json exists either - the brands")
            print("  index page will be empty until a successful Phase E run.")
        print("!" * 72 + "\n")
        return

    print(f"  Parsed {len(index_brands)} brands from index")
    by_letter: dict[str, int] = defaultdict(int)
    for b in index_brands:
        by_letter[b["letter"]] += 1
    print(f"  By letter: " + ", ".join(f"{L}={by_letter[L]}" for L in sorted(by_letter)))

    # Step 3: download logos to canonical location + mirror into /public for Next.js to serve.
    print("\n  Downloading logos (skipping any already on disk)...")
    downloaded = skipped = failed = no_logo = 0
    with httpx.Client(http2=True, follow_redirects=True) as http:
        for i, brand in enumerate(index_brands, start=1):
            logo_src = brand["logoSourceUrl"]
            if not logo_src:
                no_logo += 1
                brand["logoPath"] = None
                brand["logoUrl"] = None
                continue
            ext = _ext_from_url(logo_src)
            filename = f"{brand['slug']}{ext}"
            dest = BRAND_LOGOS_DIR / filename
            public_dest = PUBLIC_BRAND_LOGOS_DIR / filename
            canonical_rel = dest.relative_to(OUTPUT_DIR.parent).as_posix()
            public_url = f"/brand-logos/{filename}"

            if dest.exists() and dest.stat().st_size > 0:
                skipped += 1
            else:
                try:
                    size = _download_logo(http, logo_src, dest)
                    downloaded += 1
                    if i % 25 == 0 or i == len(index_brands):
                        print(f"    [{i}/{len(index_brands)}] {brand['slug']:30s} {size:>6} bytes")
                except Exception as e:
                    failed += 1
                    brand["logoPath"] = None
                    brand["logoUrl"] = None
                    print(f"    [{i}/{len(index_brands)}] FAIL {brand['slug']:30s} {type(e).__name__}: {e}")
                    continue
            _mirror_to_public(dest, public_dest)
            brand["logoPath"] = canonical_rel
            brand["logoUrl"] = public_url
    print(f"  Logos: downloaded={downloaded}, skipped (already on disk)={skipped}, "
          f"failed={failed}, brands without a logo URL={no_logo}")
    print(f"  Mirrored to {PUBLIC_BRAND_LOGOS_DIR}")

    # Step 4: count products per brand and merge orphan brands (in products.json
    # but not on the shop-by-brand page).
    print("\n  Cross-referencing brand product counts from products.json...")
    products = _load_products()
    counts, name_for_slug = _build_brand_to_count(products)
    print(f"  products.json: {len(products):,} products across {len(counts)} unique brand slugs")

    indexed_slugs = {b["slug"] for b in index_brands}
    for b in index_brands:
        b["productCount"] = counts.get(b["slug"], 0)
        b["description"] = None

    # Orphan brands (in products.json but not on Geiger's index) — keep them so
    # /brands/[slug] pages still render even without a logo.
    for slug, count in counts.items():
        if slug in indexed_slugs:
            continue
        if count == 0:
            continue
        canonical_name = name_for_slug.get(slug) or slug
        index_brands.append(
            {
                "name": canonical_name,
                "slug": slug,
                "letter": _first_letter(canonical_name),
                "geigerUrl": f"{GEIGER_BASE_URL}/b/brand-names",
                "logoSourceUrl": "",
                "logoAlt": "",
                "logoPath": None,
                "logoUrl": None,
                "productCount": count,
                "description": None,
            }
        )

    # Step 5: sort alphabetically and write brands.json
    index_brands.sort(key=lambda b: (b["letter"], b["name"].lower()))
    with_logos = sum(1 for b in index_brands if b["logoPath"])
    with_products = sum(1 for b in index_brands if b["productCount"] > 0)

    payload = {
        "scrapedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalBrands": len(index_brands),
        "brandsWithLogos": with_logos,
        "brandsWithProducts": with_products,
        "source": SHOP_BY_BRAND_URL,
        "brands": index_brands,
    }
    BRANDS_JSON_PATH.write_bytes(orjson.dumps(payload, option=orjson.OPT_INDENT_2))
    _write_brand_status("fresh")

    print("\nPhase E complete.")
    print(f"  Total brands:        {len(index_brands)}")
    print(f"  With logos:          {with_logos}")
    print(f"  With products:       {with_products}")
    print(f"  Output:              {BRANDS_JSON_PATH}")
    print(f"  Logo directory:      {BRAND_LOGOS_DIR}")


if __name__ == "__main__":
    run()
    sys.exit(0)
