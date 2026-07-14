"""Scrape of Geiger's seasonal catalogs (Milestone 3 lead pages data layer).

Geiger publishes a handful of themed catalogs each year (Ideas, Green Guide,
Women's Collection, Holiday Guide, USA Made, Retail Collective, Trend Talk).
Each catalog lead page needs (a) the catalog's product set + facets so the page
can render a filterable product grid, and (b) the catalog's flipbook/PDF
metadata so the page can link "BROWSE CATALOG" and show real page images.

This is a YEARLY-cadence refresh (catalogs turn over when Geiger publishes new
editions), dispatched manually from the Studio "Site Refresh" panel — no cron.

Product sources come in three modes (config in CATALOGS below):
  * category — Searchspring category.json with `bgfilter.category_path`
               (exactly the deals/new/rush pattern). Ideas, Green Guide.
  * search   — Searchspring search.json with `q=<phrase>`. Women's Collection,
               Holiday Guide (their SHOP NOW buttons are keyword searches).
  * filter   — Searchspring search.json with a deterministic attribute filter,
               no q. Used for USA Made: `bgfilter.refine_by=Made in the USA`
               returns the CLEAN ~611-product Made-in-USA set (identical result
               set to `filter.refine_by=...`, verified 2026-07-15; `bgfilter.`
               is used so the degenerate single-value refine_by facet is
               treated as background and stays out of the sidebar facets —
               same convention as `bgfilter.category_path` on the other
               scrapers). This is a deliberate, Patrick-approved deviation
               from the literal SHOP NOW URL (`q=made in the usa`, ~641, noisy).
  * None     — no product source; Patrick curates products manually in Studio
               (Retail Collective, Trend Talk). The entry still ships in the
               output with its browse URL so all 7 catalogs render from one file.

Like the deals scraper, after the base listing we issue one filtered call per
facet value to capture that value's SKU list, so the catalog page sidebar can
do accurate client-side filter intersections without any runtime API.

Catalog asset metadata (the 5 internal flipbook viewers): each run re-parses
`https://patrickblack.geiger.com/c/<viewer-slug>` for the embedded yupub
`tid` (NOT hardcoded — Geiger may re-upload a new edition under a new tid),
then calls `https://api.yupub.com/?task=get_me&tid=<tid>` (XML) and records
the PDF filename/url/filesize/page count plus the CloudFront `baseURL` (page
images live at `<baseURL>/Leaf_N.jpg`). These are undocumented vendor
internals, so ANY failure there is NON-FATAL: we keep the previous values from
the existing catalogs.json, warn loudly, and carry on — product data is the
priority and must never be blocked by the flipbook vendor.

Output: data/geiger/catalogs.json.
Run:    python -m scripts.scrapers.geiger.scrape_catalogs  (pnpm scrape-catalogs)
"""

from __future__ import annotations

import datetime as dt
import re
import time
import xml.etree.ElementTree as ET
from typing import Any

import orjson
from tqdm import tqdm

from .client import ScraperClient
from .config import OUTPUT_DIR, SEARCHSPRING_BASE_URL, SEARCHSPRING_PER_PAGE, SEARCHSPRING_SITE_ID

META_URL = "https://kfx28d.a.searchspring.io/api/meta/meta.json"
SEARCHSPRING_SEARCH_URL = "https://kfx28d.a.searchspring.io/api/search/search.json"
YUPUB_API_URL = "https://api.yupub.com/"

# The BROWSE CATALOG targets we emit must use the affiliate host (never
# www.geiger.com — Section 18). The /c/ viewer pages exist on the affiliate
# host and are what the catalog lead pages will link to.
AFFILIATE_VIEWER_BASE = "https://patrickblack.geiger.com/c"

# Facets we never want as user-facing filter sections (same as deals/rush).
SKIP_FACET_FIELDS = {"ss_category_hierarchy"}

# The 7 catalogs. Slugs are STABLE — the Sanity catalog docs (later prompt) key
# off them; do not rename once pages exist. `viewer_slug` is the /c/ path on
# the Geiger site (internal flipbook viewer); `browse_url` overrides it for the
# two catalogs hosted on external flipbook services.
CATALOGS: list[dict[str, Any]] = [
    {
        "slug": "ideas",
        "title": "Ideas",
        "source": {"mode": "category", "key": "Home > Shop By > Ideas"},
        "viewer_slug": "ideas",
    },
    {
        "slug": "green-guide",
        "title": "Green Guide",
        "source": {"mode": "category", "key": "Home > Shop By > Green Guide"},
        "viewer_slug": "greenguide",
    },
    {
        "slug": "womens-collection",
        "title": "Women's Collection",
        "source": {"mode": "search", "key": "Womens Collection"},
        "viewer_slug": "womens-collection",
    },
    {
        "slug": "holiday-guide",
        "title": "Holiday Guide",
        "source": {"mode": "search", "key": "Holiday Guide"},
        "viewer_slug": "holidayguide",
    },
    {
        "slug": "usa-made",
        "title": "USA Made",
        # Clean deterministic attribute filter (~611), NOT the noisy
        # `q=made in the usa` search (~641). Patrick-approved. See module doc.
        "source": {"mode": "filter", "key": "refine_by=Made in the USA"},
        "viewer_slug": "usamade",
    },
    {
        "slug": "retail-collective",
        "title": "Retail Collective",
        # No Searchspring source — Patrick curates products manually in Studio.
        "source": None,
        "viewer_slug": None,
        "browse_url": "https://docs.geiger.com/books/gdej/#p=1",
    },
    {
        "slug": "trend-talk",
        "title": "Trend Talk 2026",
        "source": None,
        "viewer_slug": None,
        "browse_url": "https://online.fliphtml5.com/hrknz/fvlr/#p=1",
    },
]


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_product(raw: dict[str, Any]) -> dict[str, Any]:
    """Shape into the GeigerProduct contract used by lib/categories.ts."""
    sku = raw.get("sku")
    if not sku:
        raise ValueError(f"Product is missing sku: {raw!r}")

    badges = raw.get("badges")
    if not isinstance(badges, list):
        badges = []

    raw_paths = raw.get("category_path") or []
    cleaned_paths: list[str] = []
    for p in raw_paths:
        if not isinstance(p, str):
            continue
        cleaned_paths.append(
            p.replace("&amp;", "&")
            .replace("&gt;", ">")
            .replace("&lt;", "<")
            .replace("&quot;", '"')
            .replace("&#039;", "'")
            .strip()
        )

    # Some Searchspring feeds send is_new_item/is_on_sale as the string "Yes"
    # (seen on the new-products feed). Coerce to real bools so the downstream
    # GeigerProduct contract stays clean.
    def _coerce_bool(v: Any) -> bool:
        if isinstance(v, str):
            return v.strip().lower() in {"yes", "true", "1"}
        return bool(v)

    return {
        "sku": str(sku),
        "name": str(raw.get("name") or "").strip(),
        "brand": raw.get("brand"),
        "low_price": _to_float(raw.get("low_price")),
        "high_price": _to_float(raw.get("high_price")),
        "msrp": _to_float(raw.get("msrp")),
        "min_qty": _to_int(raw.get("min_qty")),
        "imageUrl": raw.get("imageUrl"),
        "description": str(raw.get("description") or ""),
        "category_paths": cleaned_paths,
        "badges": badges,
        "is_new_item": _coerce_bool(raw.get("is_new_item")),
        "is_on_sale": _coerce_bool(raw.get("is_on_sale")),
        "product_type_unigram": raw.get("product_type_unigram"),
        "geiger_url": raw.get("url"),
    }


def _fetch_meta(client: ScraperClient) -> dict[str, Any]:
    """Pull the per-facet labels map. Keys are field names, values are {label, ...}."""
    params = {"siteId": SEARCHSPRING_SITE_ID}
    response = client.get_json(META_URL, params=params)
    return response.get("facets") or {}


def _source_base_params(source: dict[str, Any]) -> tuple[str, list[tuple[str, str]]]:
    """Endpoint URL + base query params for a catalog's product source."""
    mode = source["mode"]
    key = source["key"]
    common: list[tuple[str, str]] = [
        ("siteId", SEARCHSPRING_SITE_ID),
        ("resultsFormat", "native"),
        ("perPage", str(SEARCHSPRING_PER_PAGE)),
    ]
    if mode == "category":
        return SEARCHSPRING_BASE_URL, [("bgfilter.category_path", key), *common]
    if mode == "search":
        return SEARCHSPRING_SEARCH_URL, [("q", key), *common]
    if mode == "filter":
        # key is "<field>=<value>", sent as a background filter so the (single-
        # value, degenerate) facet itself stays out of the sidebar facets.
        field, _, value = key.partition("=")
        return SEARCHSPRING_SEARCH_URL, [(f"bgfilter.{field}", value), *common]
    raise ValueError(f"Unknown source mode: {mode!r}")


def _paginate(
    client: ScraperClient, url: str, base_params: list[tuple[str, str]]
) -> dict[str, Any]:
    """Paginate a Searchspring listing to the end; return merged results + page-1 facets."""
    page = 1
    all_results: list[dict[str, Any]] = []
    facets: list[dict[str, Any]] = []
    while True:
        params = [*base_params, ("page", str(page))]
        response = client.get_json(url, params=params)
        results = response.get("results") or []
        all_results.extend(results)
        if page == 1:
            facets = response.get("facets") or []
        pagination = response.get("pagination", {})
        total_pages = int(pagination.get("totalPages", page))
        if page >= total_pages or not results:
            break
        page += 1
    return {"results": all_results, "facets": facets}


def _value_filter_params(field: str, raw_value: dict[str, Any]) -> list[tuple[str, str]]:
    """Build Searchspring filter params for one facet value entry."""
    vtype = raw_value.get("type")
    if vtype == "range":
        low = raw_value.get("low")
        high = raw_value.get("high")
        params: list[tuple[str, str]] = []
        if low is not None and low != "":
            params.append((f"filter.{field}.low", str(low)))
        if high is not None and high != "":
            params.append((f"filter.{field}.high", str(high)))
        return params
    value = raw_value.get("value")
    if value is None:
        return []
    return [(f"filter.{field}", str(value))]


def _value_id(field: str, raw_value: dict[str, Any]) -> str:
    """Stable URL-friendly id for a facet value used in our app's query string."""
    if raw_value.get("type") == "range":
        low = raw_value.get("low") or ""
        high = raw_value.get("high") or ""
        return f"{low}-{high}"
    return str(raw_value.get("value") or "").strip()


def _fetch_value_skus(
    client: ScraperClient,
    url: str,
    base_params: list[tuple[str, str]],
    field: str,
    raw_value: dict[str, Any],
) -> list[str]:
    """For one facet value, return the catalog SKUs that match it."""
    filtered = [*base_params, *_value_filter_params(field, raw_value)]
    skus: list[str] = []
    page = 1
    while True:
        params = [*filtered, ("page", str(page))]
        response = client.get_json(url, params=params)
        for r in response.get("results") or []:
            sku = r.get("sku")
            if sku:
                skus.append(str(sku))
        pagination = response.get("pagination", {})
        total_pages = int(pagination.get("totalPages", page))
        if page >= total_pages:
            break
        page += 1
    return skus


def _normalize_facet_section(
    field: str,
    raw_facet: dict[str, Any],
    meta_label: str | None,
) -> dict[str, Any]:
    """Strip Searchspring noise and bring the section into our internal shape."""
    label = raw_facet.get("label") or meta_label or field
    ftype = raw_facet.get("type") or "list"
    values_raw = raw_facet.get("values") or []
    values: list[dict[str, Any]] = []
    for v in values_raw:
        if int(v.get("count") or 0) <= 0:
            continue
        values.append(
            {
                "id": _value_id(field, v),
                "value": v.get("value"),
                "label": v.get("label") or v.get("value"),
                "count": int(v.get("count") or 0),
                "type": v.get("type") or "value",
                "low": v.get("low"),
                "high": v.get("high"),
                "skus": [],  # filled in by caller
            }
        )
    return {
        "field": field,
        "label": label,
        "type": ftype,
        "values": values,
    }


def _is_degenerate_section(section: dict[str, Any], total_products: int) -> bool:
    """Drop facet sections that can't partition the result set (rush pattern):
    fewer than 2 values, or one value covering 100% of the products."""
    values = section.get("values") or []
    if len(values) < 2:
        return True
    if total_products > 0:
        for v in values:
            if int(v.get("count") or 0) >= total_products:
                return True
    return False


def _scrape_products_and_facets(
    client: ScraperClient,
    meta_facets: dict[str, Any],
    source: dict[str, Any],
    catalog_label: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Full products + facets-with-SKU-memberships for one sourced catalog."""
    url, base_params = _source_base_params(source)

    base = _paginate(client, url, base_params)
    raw_results = base["results"]
    raw_facets = base["facets"]

    products: list[dict[str, Any]] = []
    seen_skus: set[str] = set()
    for r in raw_results:
        try:
            p = _normalize_product(r)
        except ValueError as e:
            tqdm.write(f"  [{catalog_label}] Skipping malformed product: {e}")
            continue
        if p["sku"] in seen_skus:
            continue
        seen_skus.add(p["sku"])
        products.append(p)

    sections: list[dict[str, Any]] = []
    for raw_facet in raw_facets:
        field = raw_facet.get("field")
        if not field or field in SKIP_FACET_FIELDS:
            continue
        meta_label = (meta_facets.get(field) or {}).get("label")
        section = _normalize_facet_section(field, raw_facet, meta_label)
        if not section["values"]:
            continue
        if _is_degenerate_section(section, len(products)):
            tqdm.write(
                f"  [{catalog_label}] Dropping degenerate facet '{section['field']}' "
                f"({len(section['values'])} value(s))"
            )
            continue
        sections.append(section)

    total_value_calls = sum(len(s["values"]) for s in sections)
    tqdm.write(
        f"  [{catalog_label}] {len(products)} products; capturing SKU membership "
        f"for {total_value_calls} facet values across {len(sections)} sections..."
    )

    raw_facet_by_field = {f.get("field"): f for f in raw_facets if f.get("field")}
    for section in tqdm(sections, desc=f"{catalog_label} facets", unit="sec", leave=False):
        raw_section = raw_facet_by_field.get(section["field"], {})
        raw_values = raw_section.get("values") or []
        raw_by_id = {_value_id(section["field"], v): v for v in raw_values}
        for value_entry in section["values"]:
            raw_v = raw_by_id.get(value_entry["id"])
            if not raw_v:
                continue
            try:
                value_entry["skus"] = _fetch_value_skus(
                    client, url, base_params, section["field"], raw_v
                )
            except Exception as e:  # noqa: BLE001
                tqdm.write(
                    f"  [{catalog_label}] Warn: {section['field']}="
                    f"{value_entry['label']!r} call failed: {e}"
                )
                value_entry["skus"] = []

    return products, sections


# ---------------------------------------------------------------------------
# Catalog asset metadata (yupub flipbook) — best-effort, NEVER fatal
# ---------------------------------------------------------------------------

# The viewer page embeds a share link like
#   https://my.yupub.com/?tid=<uuid>&m=patrickblack
_TID_RE = re.compile(r"my\.yupub\.com/\?tid=([0-9a-fA-F-]{36})")

_ASSET_ATTEMPTS = 3


def _get_with_retry(client: ScraperClient, url: str, params: Any) -> Any:
    """The shared client only auto-retries httpx exception types; curl_cffi
    DNS hiccups (seen in the wild against api.yupub.com) surface immediately.
    Wrap with a small blanket retry — these calls are best-effort anyway."""
    last: Exception | None = None
    for attempt in range(1, _ASSET_ATTEMPTS + 1):
        try:
            return client.get(url, params=params)
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < _ASSET_ATTEMPTS:
                time.sleep(2 * attempt)
    raise last if last else RuntimeError(f"unreachable: {url}")


def _fetch_catalog_assets(client: ScraperClient, viewer_slug: str) -> dict[str, Any]:
    """Parse the /c/<slug> viewer for the yupub tid, then pull get_me XML.

    Returns the `pdf` object for catalogs.json. Raises on any failure — the
    caller treats it as non-fatal and falls back to previous data.
    """
    viewer_url = f"{AFFILIATE_VIEWER_BASE}/{viewer_slug}"
    resp = _get_with_retry(client, viewer_url, params=None)
    match = _TID_RE.search(resp.text)
    if not match:
        raise ValueError(f"No yupub tid found in {viewer_url}")
    tid = match.group(1)

    meta_resp = _get_with_retry(
        client, YUPUB_API_URL, params={"task": "get_me", "tid": tid}
    )
    doc = ET.fromstring(meta_resp.text)  # root element is <doc ...>
    if doc.tag != "doc":
        found = doc.find("doc")
        if found is None:
            raise ValueError(f"Unexpected yupub get_me XML for tid {tid}")
        doc = found

    base_url = (doc.get("baseURL") or "").rstrip("/")
    filename = doc.get("filename") or ""
    if not base_url or not filename:
        raise ValueError(f"yupub get_me missing baseURL/filename for tid {tid}")

    return {
        "tid": tid,
        "url": f"{base_url}/{filename}",
        "filename": filename,
        "filesize": _to_int(doc.get("filesize")),
        "pages": _to_int(doc.get("totalPageNumber")),
        # Page images live at <baseUrl>/Leaf_N.jpg (normal-res; TLeaf_N.jpg
        # thumbs, HLeaf_N.jpg hi-res) — used later for landing-page photos.
        "baseUrl": base_url,
    }


def _load_previous_catalogs() -> dict[str, dict[str, Any]]:
    """Previous catalogs.json entries by slug, for non-fatal asset fallback."""
    path = OUTPUT_DIR / "catalogs.json"
    if not path.exists():
        return {}
    try:
        with open(path, "rb") as f:
            data = orjson.loads(f.read())
        return {c.get("slug"): c for c in data.get("catalogs") or [] if c.get("slug")}
    except Exception as e:  # noqa: BLE001
        print(f"  Warn: could not read previous catalogs.json: {e}")
        return {}


def run() -> None:
    print(f"Scraping {len(CATALOGS)} Geiger catalogs")
    started = time.monotonic()
    previous = _load_previous_catalogs()

    output_catalogs: list[dict[str, Any]] = []

    with ScraperClient() as client:
        print("  Fetching meta.json for facet labels...")
        meta_facets = _fetch_meta(client)

        for cfg in CATALOGS:
            slug = cfg["slug"]
            title = cfg["title"]
            source = cfg["source"]
            viewer_slug = cfg.get("viewer_slug")
            print(f"\n[{slug}] {title}")

            browse_url = (
                cfg.get("browse_url")
                if cfg.get("browse_url")
                else f"{AFFILIATE_VIEWER_BASE}/{viewer_slug}"
            )

            products: list[dict[str, Any]] = []
            facets: list[dict[str, Any]] = []
            if source is not None:
                products, facets = _scrape_products_and_facets(
                    client, meta_facets, source, slug
                )
            else:
                print(f"  [{slug}] No product source — products curated manually in Studio.")

            pdf: dict[str, Any] | None = None
            if viewer_slug:
                try:
                    pdf = _fetch_catalog_assets(client, viewer_slug)
                    print(
                        f"  [{slug}] PDF: {pdf['filename']} "
                        f"({pdf['pages']} pages, {pdf['filesize']} bytes)"
                    )
                except Exception as e:  # noqa: BLE001
                    prev_pdf = (previous.get(slug) or {}).get("pdf")
                    print(
                        f"  [{slug}] WARNING: catalog asset metadata failed ({e}). "
                        + (
                            "Keeping previous PDF metadata."
                            if prev_pdf
                            else "No previous metadata to fall back to — pdf will be null."
                        )
                    )
                    pdf = prev_pdf or None

            output_catalogs.append(
                {
                    "slug": slug,
                    "title": title,
                    "source": source,
                    "browseUrl": browse_url,
                    "pdf": pdf,
                    "totalProducts": len(products),
                    "products": products,
                    "facets": facets,
                }
            )

    output = {
        "scrapedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "catalogs": output_catalogs,
    }

    output_path = OUTPUT_DIR / "catalogs.json"
    with open(output_path, "wb") as f:
        f.write(orjson.dumps(output, option=orjson.OPT_INDENT_2))

    elapsed = time.monotonic() - started
    print(f"\nWrote {len(output_catalogs)} catalogs to {output_path}")
    for c in output_catalogs:
        print(
            f"  {c['slug']}: {c['totalProducts']} products, "
            f"{len(c['facets'])} facet sections, "
            f"pdf={'yes (' + str((c['pdf'] or {}).get('pages')) + 'p)' if c['pdf'] else 'none'}"
        )
    print(f"Total runtime: {elapsed / 60:.1f} min")


if __name__ == "__main__":
    run()
