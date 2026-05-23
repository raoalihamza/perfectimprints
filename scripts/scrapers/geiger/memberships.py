"""Phase C: Per-URL facet/modifier membership scrape.

For each non-root PI URL (type in {facet, modifier, compound-facet}), make one
filtered Searchspring API call to capture the SKU list. Total: ~21,715 URLs.

Inputs:
  - data/pi-urls/category-urls.json
  - data/mappings/pi-to-geiger.json  (Phase D output)

Output:
  - data/geiger/facet-memberships.json

Throttle: 1 req/sec (ScraperClient). Checkpoint every 100 URLs.
"""

from __future__ import annotations

import datetime as dt
import threading
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import orjson
from tqdm import tqdm

from .checkpoint import CheckpointManager
from .client import ScraperClient
from .config import (
    OUTPUT_DIR,
    PROJECT_ROOT,
    SEARCHSPRING_BASE_URL,
    SEARCHSPRING_PER_PAGE,
    SEARCHSPRING_SITE_ID,
)

# Map PI facet type (URL slug) -> Searchspring filter field name.
# Verified from Searchspring response inspection on a Drinkware category. Most
# fields are category-specific (apparel_*, drinkware_size), but the API still
# accepts the field name across categories — it just returns 0 hits if the
# field is irrelevant. PI facet types not in this map fall through to the
# verbatim slug (e.g., "industry" -> "industry") and may return zero results.
FACET_FIELD_MAP: dict[str, str] = {
    "color": "colors",
    "material": "material",
    "brand": "brand",
    "supplier": "supplier",
    "feature": "refine_by",
    "activity": "refine_by",
    "eco-friendly": "refine_by",
    "decoration": "full_color",
    "size": "size",
    "type": "product_type_unigram",
    "ounce-capacity": "drinkware_size",
    "gender": "apparel_gender",
    "special-feature": "refine_by",
    "shape": "shape",
    "style": "apparel_style",
    "production-time": "production_time",
    "theme": "refine_by",
    "age": "age",
    "industry": "industry",
    "neckline": "apparel_neckline",
    "fit": "apparel_fit",
    "mah": "mah",
    "sun-protection": "refine_by",
    "sleeve-length": "apparel_sleeve_length",
    "length": "length",
    "match-types": "match_types",
    "sleeve-style": "apparel_style",
    "lens": "lens",
    "umbrella-size": "umbrella_size",
    "flash-drive-capacity": "flash_drive_capacity",
    "can-capacity": "can_capacity",
    "page-count": "page_count",
    "ink-color": "ink_color",
    "wax-type": "wax_type",
    "paper-type": "paper_type",
    "liter-capacity": "liter_capacity",
    "line": "line",
    "match-count": "match_count",
    "point-size": "point_size",
    "distributor-group": "distributor_group",
}

# Modifier-specific filter payloads. Each callable returns a dict of params to
# merge into the base request. See CLAUDE.md Section 16.
def _modifier_params_closeout() -> dict[str, Any]:
    # Searchspring's only "on sale" facet value is `filter.refine_by=Deals`.
    # `filter.is_on_sale=true` was tried and returned 0 across all categories.
    return {"filter.refine_by": "Deals"}


def _modifier_params_no_minimum() -> dict[str, Any]:
    # min_qty range: items needing fewer than 25 units. Searchspring range
    # syntax uses bracketed operator: filter.<field>.low / .high
    return {"filter.min_qty.high": "24"}


def _modifier_params_eco_friendly() -> dict[str, Any]:
    return {"filter.refine_by": "Eco Friendly"}


def _modifier_params_production_time() -> dict[str, Any]:
    # Rush items: production_time at the low end (1-5 days).
    return {"filter.production_time.high": "5"}


def _modifier_params_material() -> dict[str, Any]:
    # Single observed PI URL with bare 'material' modifier and no value.
    # Treat as root (no extra filter); the page itself is essentially a
    # landing variant of the root category.
    return {}


def _modifier_params_search() -> dict[str, Any]:
    # CLAUDE.md: search is a landing variant of the root, no extra filter.
    return {}


MODIFIER_BUILDERS = {
    "closeout": _modifier_params_closeout,
    "no-minimum": _modifier_params_no_minimum,
    "eco-friendly": _modifier_params_eco_friendly,
    "production-time": _modifier_params_production_time,
    "material": _modifier_params_material,
    "search": _modifier_params_search,
}

PI_URLS_FILE = PROJECT_ROOT / "data" / "pi-urls" / "category-urls.json"
MAPPINGS_FILE = PROJECT_ROOT / "data" / "mappings" / "pi-to-geiger.json"
OUTPUT_FILE = OUTPUT_DIR / "facet-memberships.json"

# Cap pagination per URL to avoid runaway requests for a single popular facet.
MAX_PAGES_PER_URL = 50  # 50 pages * 60 perPage = 3000 SKUs max per URL


import re

# Numeric Searchspring facet fields. When the PI URL value is a slug like
# "26-oz" or "1-day", we need to extract the leading integer instead of
# sending a string — otherwise Searchspring returns HTTP 400.
NUMERIC_FACET_FIELDS: set[str] = {
    "drinkware_size",
    "production_time",
    "min_qty",
    "mah",
    "page_count",
    "match_count",
    "liter_capacity",
    "can_capacity",
    "flash_drive_capacity",
}


def _deslugify(slug: str) -> str:
    """`stainless-steel` -> `Stainless Steel`. Searchspring filter values
    use the human-readable form, not the URL slug."""
    return " ".join(part.capitalize() for part in slug.split("-"))


def _numeric_from_slug(slug: str) -> str | None:
    """Extract the leading integer from a URL value slug.

    `26-oz` -> `26`, `1-day` -> `1`, `rush` -> None (no number).
    """
    m = re.match(r"(\d+)", slug)
    return m.group(1) if m else None


def _facet_filter_field(pi_facet_type: str) -> str:
    return FACET_FIELD_MAP.get(pi_facet_type, pi_facet_type)


# ---------------------------------------------------------------------------
# Slug-based resolver: many PI facet URLs (e.g. /cat/bags/material/eco-friendly)
# map to a DEDICATED Geiger category page (/b/eco-friendly-bags), not a filter.
# Hitting the dedicated category via bgfilter.category_path returns the real
# product set; filter.material=Eco Friendly returns 0 because Geiger doesn't
# tag products that way. This module builds a slug index from categories.json
# and tries direct-slug / combined-slug matches per PI URL before falling back
# to filter-based queries.
# ---------------------------------------------------------------------------

_SLUG_INDEX_CACHE: dict[str, dict[str, Any]] | None = None
_PATH_CHILDREN_CACHE: dict[str, list[dict[str, Any]]] | None = None
_BRAND_INDEX_CACHE: dict[str, str] | None = None


def _load_brand_index() -> dict[str, str]:
    """Map a normalized PI brand slug (a-z0-9 only) to the Geiger brand name
    as it appears in products.json. Built once and cached.

    Example entries:
      'hanes'        -> 'Hanes'
      'cutterbuck'   -> 'Cutter & Buck'
      'travismathew' -> 'TravisMathew'
      'stanley'      -> 'STANLEY'
    """
    global _BRAND_INDEX_CACHE
    if _BRAND_INDEX_CACHE is not None:
        return _BRAND_INDEX_CACHE

    products_file = PROJECT_ROOT / "data" / "geiger" / "products.json"
    products_data = orjson.loads(products_file.read_bytes())

    def _norm_brand(s: str) -> str:
        # Decode HTML entity for `&` then strip everything non-alphanumeric.
        s = s.replace("&amp;", "&").lower()
        return re.sub(r"[^a-z0-9]", "", s)

    index: dict[str, str] = {}
    for prod in products_data["products"]:
        b = prod.get("brand")
        if b:
            normalized_name = b.replace("&amp;", "&")
            index[_norm_brand(b)] = normalized_name

    _BRAND_INDEX_CACHE = index
    return index


def _pi_slug_to_brand_name(pi_brand_slug: str) -> str | None:
    """Resolve a PI brand slug to the Geiger brand name (or None if no match)."""
    n = re.sub(r"[^a-z0-9]", "", pi_brand_slug.lower())
    return _load_brand_index().get(n)


def _load_geiger_indexes() -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    """Returns (slug_index, path_to_children).

    path_to_children: parentPath -> [child node info]. Used to find children
    of a PI root's mapped Geiger category whose names match a PI facet value.
    """
    global _SLUG_INDEX_CACHE, _PATH_CHILDREN_CACHE
    if _SLUG_INDEX_CACHE is not None and _PATH_CHILDREN_CACHE is not None:
        return _SLUG_INDEX_CACHE, _PATH_CHILDREN_CACHE

    cats_file = PROJECT_ROOT / "data" / "geiger" / "categories.json"
    cats = orjson.loads(cats_file.read_bytes())

    slug_index: dict[str, dict[str, Any]] = {}
    path_children: dict[str, list[dict[str, Any]]] = {}

    def walk(nodes: list[dict[str, Any]], parent_path: str, top_branch: str) -> None:
        children_of_parent: list[dict[str, Any]] = []
        for node in nodes:
            path = f"{parent_path} > {node['name']}"
            slug = node["slug"]
            info = {
                "name": node["name"],
                "slug": slug,
                "categoryPath": path,
                "parentBranch": top_branch,
            }
            if slug not in slug_index:
                slug_index[slug] = info
            children_of_parent.append(info)
            walk(node.get("children", []), path, top_branch)
        if children_of_parent:
            path_children[parent_path] = children_of_parent

    for top in cats["tree"]:
        walk([top], "Home", top["name"])

    _SLUG_INDEX_CACHE = slug_index
    _PATH_CHILDREN_CACHE = path_children
    return slug_index, path_children


def _load_geiger_slug_index() -> dict[str, dict[str, Any]]:
    """Backwards-compatible accessor — returns only the slug index."""
    idx, _ = _load_geiger_indexes()
    return idx


def _parent_branch_of(category_path: str) -> str:
    """`Home > Drinkware > Water Bottles` -> `Drinkware`."""
    parts = category_path.split(" > ")
    return parts[1] if len(parts) >= 2 else ""


def _slug_candidates(facet_value: str, root_slug: str) -> list[str]:
    """Order matters: more specific combinations first."""
    return [
        f"{facet_value}-{root_slug}",  # eco-friendly-bags
        f"{root_slug}-{facet_value}",  # bags-eco-friendly
        facet_value,                    # stainless-steel
    ]


def _norm(s: str) -> str:
    """Normalize for loose name/slug comparison."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve_slug_match(
    entry: dict[str, Any],
    root_category_path: str,
    slug_index: dict[str, dict[str, Any]] | None = None,
) -> str | None:
    """For a PI URL entry, return a dedicated Geiger categoryPath if one matches.

    Strategy (facet/compound-facet only; modifiers fall through):

      A. Children-of-root lookup. For each child of the PI root's mapped
         Geiger path, check if the child's NAME (normalized) matches OR
         contains the facet value. This catches things like
         `/cat/water-bottles/material/plastic` -> `...> Water Bottles > Plastic Bottles`
         and `/cat/tote-bags/material/canvas` -> `...> Tote Bags > Canvas Tote Bags`.

      B. Slug index lookup with combined candidates:
         `<value>-<root>`, `<root>-<value>`, and bare `<value>`. Restricted to
         the SAME top-level branch as the root to avoid cross-category leaks.
         Bare-value matches require the root's leaf name to appear in the
         matched path.
    """
    slug_index, path_children = _load_geiger_indexes()

    url_type = entry["type"]
    if url_type not in {"facet", "compound-facet"}:
        return None

    expected_branch = _parent_branch_of(root_category_path)
    root_slug = entry["rootSlug"]
    root_leaf_name = root_category_path.split(" > ")[-1]

    facet_values: list[str] = []
    if url_type == "facet":
        facet_values.append(entry["facetValue"])
    else:
        facet_values.extend(f["value"] for f in entry["facets"])

    # --- Strategy A: children of the root's Geiger path -----------------
    children = path_children.get(root_category_path, [])
    for facet_value in facet_values:
        v_norm = _norm(facet_value)
        if not v_norm:
            continue
        best: dict[str, Any] | None = None
        for child in children:
            name_norm = _norm(child["name"])
            slug_norm = _norm(child["slug"])
            if v_norm == name_norm or v_norm == slug_norm:
                best = child
                break
            # Allow substring match if facet value appears as a word in
            # the child name (e.g. "canvas" in "Canvas Tote Bags").
            if v_norm in name_norm or v_norm in slug_norm:
                best = best or child
        if best is not None:
            return best["categoryPath"]

    # --- Strategy B: combined slug candidates ---------------------------
    for facet_value in facet_values:
        for candidate in _slug_candidates(facet_value, root_slug):
            node = slug_index.get(candidate)
            if node is None:
                continue
            if node["parentBranch"] != expected_branch:
                continue
            if candidate == facet_value:
                if root_leaf_name not in node["categoryPath"]:
                    continue
            return node["categoryPath"]

    return None


def _format_facet_value(field: str, url_value: str) -> str | None:
    """Format the URL value slug for a Searchspring filter.

    Numeric fields (drinkware_size, production_time, etc.) need the leading
    integer extracted. Non-numeric fields get the human-readable form.
    Returns None if a numeric field has a slug with no extractable number
    (e.g., production_time/rush) — caller should drop the filter entirely.
    """
    if field in NUMERIC_FACET_FIELDS:
        return _numeric_from_slug(url_value)
    return _deslugify(url_value)


def _build_request_params(
    entry: dict[str, Any],
    geiger_category_path: str,
    use_slug_resolver: bool = False,
) -> list[tuple[str, Any]]:
    """Compose Searchspring params from a PI URL entry + mapped category_path.

    Returns a list of (key, value) tuples so that compound facets with the
    same filter type twice (e.g., feature/with-carabiner/feature/travel-size)
    can send both values without one overwriting the other.

    When `use_slug_resolver=True` and the entry is a facet/compound-facet,
    we first try `resolve_slug_match` to find a dedicated Geiger category
    page. If found, use bgfilter=<that path> alone (no filter.X=Y).
    """
    url_type = entry["type"]

    # Try slug resolver first for facet/compound-facet URLs.
    if use_slug_resolver and url_type in {"facet", "compound-facet"}:
        resolved_path = resolve_slug_match(entry, geiger_category_path)
        if resolved_path is not None:
            return [
                ("siteId", SEARCHSPRING_SITE_ID),
                ("bgfilter.category_path", resolved_path),
                ("resultsFormat", "native"),
                ("perPage", SEARCHSPRING_PER_PAGE),
                ("page", 1),
            ]

    params: list[tuple[str, Any]] = [
        ("siteId", SEARCHSPRING_SITE_ID),
        ("bgfilter.category_path", geiger_category_path),
        ("resultsFormat", "native"),
        ("perPage", SEARCHSPRING_PER_PAGE),
        ("page", 1),
    ]

    if url_type == "facet":
        field = _facet_filter_field(entry["facetType"])
        value = _format_facet_value(field, entry["facetValue"])
        if value is not None:
            params.append((f"filter.{field}", value))

    elif url_type == "compound-facet":
        for f in entry.get("facets", []):
            field = _facet_filter_field(f["type"])
            value = _format_facet_value(field, f["value"])
            if value is not None:
                params.append((f"filter.{field}", value))

    elif url_type == "modifier":
        modifier = entry["modifier"]
        builder = MODIFIER_BUILDERS.get(modifier)
        if builder is None:
            raise ValueError(f"Unknown modifier {modifier!r} on URL {entry['url']!r}")
        for k, v in builder().items():
            params.append((k, v))

    else:
        raise ValueError(f"Unsupported URL type {url_type!r} on {entry['url']!r}")

    return params


def _fetch_skus(
    client: ScraperClient,
    base_params: list[tuple[str, Any]],
) -> tuple[list[str], int]:
    """Paginate one Searchspring query and return (deduped SKU list, total_results)."""
    skus: list[str] = []
    seen: set[str] = set()
    page = 1
    total_results = 0

    while page <= MAX_PAGES_PER_URL:
        # Replace the (key='page', value=N) tuple each iteration.
        params = [(k, v) for k, v in base_params if k != "page"] + [("page", page)]
        response = client.get_json(SEARCHSPRING_BASE_URL, params=params)

        if page == 1:
            total_results = int(response.get("pagination", {}).get("totalResults", 0))

        results = response.get("results") or []
        if not results:
            break

        for raw in results:
            sku = raw.get("sku")
            if sku and sku not in seen:
                seen.add(sku)
                skus.append(str(sku))

        pagination = response.get("pagination", {})
        total_pages = int(pagination.get("totalPages", page))
        if page >= total_pages:
            break
        page += 1

    return skus, total_results


def _iter_non_root_urls() -> Iterator[dict[str, Any]]:
    pi_data = orjson.loads(PI_URLS_FILE.read_bytes())
    for entry in pi_data["urls"]:
        if entry.get("type") in {"facet", "modifier", "compound-facet"}:
            yield entry


def _save_output(
    memberships: dict[str, list[str]],
    urls_with_zero: int,
    urls_with_errors: list[str],
    total_processed: int,
) -> None:
    payload = {
        "scrapedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalUrlsProcessed": total_processed,
        "urlsWithProducts": sum(1 for v in memberships.values() if v),
        "urlsWithZeroProducts": urls_with_zero,
        "urlsWithErrors": urls_with_errors,
        "memberships": memberships,
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "wb") as f:
        f.write(orjson.dumps(payload, option=orjson.OPT_INDENT_2))


_thread_local = threading.local()


def _get_thread_client() -> ScraperClient:
    """One ScraperClient per worker thread. Each has its own RateLimiter,
    so N workers produce N req/sec total (1 req/sec/worker per CLAUDE.md §16).
    """
    client = getattr(_thread_local, "client", None)
    if client is None:
        client = ScraperClient()
        _thread_local.client = client
    return client


# ---------------------------------------------------------------------------
# Tier 2 search fallback
# ---------------------------------------------------------------------------

SEARCHSPRING_SEARCH_URL = "https://kfx28d.a.searchspring.io/api/search/search.json"

_SKU_CATEGORY_PATHS_CACHE: dict[str, list[str]] | None = None


def _load_sku_category_paths() -> dict[str, list[str]]:
    """SKU -> category_paths list from products.json. Used to filter search
    results so we only keep SKUs that actually belong to the PI URL's root
    Geiger category."""
    global _SKU_CATEGORY_PATHS_CACHE
    if _SKU_CATEGORY_PATHS_CACHE is not None:
        return _SKU_CATEGORY_PATHS_CACHE

    products_file = PROJECT_ROOT / "data" / "geiger" / "products.json"
    products_data = orjson.loads(products_file.read_bytes())

    index: dict[str, list[str]] = {}
    for prod in products_data["products"]:
        sku = str(prod.get("sku") or "")
        if sku:
            index[sku] = prod.get("category_paths") or []

    _SKU_CATEGORY_PATHS_CACHE = index
    return index


def _build_search_query(entry: dict[str, Any]) -> str:
    """Build a search query string from a PI URL entry.

    Combines deslugified facet values + deslugified root slug, in that
    order so the most-specific terms come first.
    """
    parts: list[str] = []
    if entry["type"] == "facet":
        parts.append(_deslugify(entry["facetValue"]))
    elif entry["type"] == "compound-facet":
        parts.extend(_deslugify(f["value"]) for f in entry["facets"])
    else:
        # Modifiers shouldn't reach here, but be safe.
        return _deslugify(entry["rootSlug"])
    parts.append(_deslugify(entry["rootSlug"]))
    return " ".join(parts)


def _process_search_fallback(
    entry: dict[str, Any],
    root_category_path: str,
) -> tuple[str, list[str] | None, str | None]:
    """Worker variant: hit /search.json with deslugified URL keywords,
    then filter results to SKUs that belong to the PI root's Geiger category.
    """
    pi_url = entry["url"]
    try:
        client = _get_thread_client()
        query = _build_search_query(entry)
        params: list[tuple[str, Any]] = [
            ("siteId", SEARCHSPRING_SITE_ID),
            ("resultsFormat", "native"),
            ("perPage", SEARCHSPRING_PER_PAGE),
            ("page", 1),
            ("q", query),
        ]
        # Reuse the same paginate-and-collect helper. Search returns the
        # same `results` shape as category endpoint.
        skus_raw: list[str] = []
        seen: set[str] = set()
        page = 1
        while page <= MAX_PAGES_PER_URL:
            paginated = [(k, v) for k, v in params if k != "page"] + [("page", page)]
            response = client.get_json(SEARCHSPRING_SEARCH_URL, params=paginated)
            results = response.get("results") or []
            if not results:
                break
            for raw in results:
                sku = str(raw.get("sku") or "")
                if sku and sku not in seen:
                    seen.add(sku)
                    skus_raw.append(sku)
            pag = response.get("pagination", {})
            total_pages = int(pag.get("totalPages", page))
            if page >= total_pages:
                break
            page += 1

        # Filter: only keep SKUs whose products.json category_paths includes
        # the PI root's Geiger category path. Avoids semantic drift like
        # "stadium table" appearing under /cat/folding-chairs/theme/beach.
        sku_paths = _load_sku_category_paths()
        kept = [
            s for s in skus_raw
            if any(p.startswith(root_category_path) for p in sku_paths.get(s, []))
        ]
        return (pi_url, kept, None)
    except Exception as e:  # noqa: BLE001
        return (pi_url, None, f"{type(e).__name__}: {e}")


def _build_brand_fallback_params(
    geiger_brand_name: str,
) -> list[tuple[str, Any]]:
    """Searchspring params for a brand catalog-wide query.

    Drops `bgfilter.category_path` so we search the entire Geiger catalog by
    brand. This recovers PI brand URLs whose original (category × brand)
    combination returned zero — e.g. `/cat/office/brand/hanes` had no
    matches in Office, but Hanes apparel SKUs are still relevant for that
    page (better than empty).
    """
    return [
        ("siteId", SEARCHSPRING_SITE_ID),
        ("resultsFormat", "native"),
        ("perPage", SEARCHSPRING_PER_PAGE),
        ("page", 1),
        ("filter.brand", geiger_brand_name),
    ]


def _process_one_url(
    entry: dict[str, Any],
    category_path: str,
    use_slug_resolver: bool = False,
) -> tuple[str, list[str] | None, str | None]:
    """Worker function: fetch SKUs for one URL. Returns (url, skus, error_msg)."""
    pi_url = entry["url"]
    try:
        client = _get_thread_client()
        params = _build_request_params(entry, category_path, use_slug_resolver=use_slug_resolver)
        skus, _total = _fetch_skus(client, params)
        return (pi_url, skus, None)
    except Exception as e:  # noqa: BLE001
        return (pi_url, None, f"{type(e).__name__}: {e}")


def run(
    limit_urls: int | None = None,
    resume: bool = False,
    test_sample: bool = False,
    workers: int = 1,
) -> None:
    print("Phase C: Facet/modifier membership scrape starting...")
    if workers > 1:
        print(f"  Concurrency: {workers} workers (1 req/sec/worker)")

    if not MAPPINGS_FILE.exists():
        raise RuntimeError(
            f"Mapping file not found: {MAPPINGS_FILE}\n"
            "Run Phase D first: python -m scripts.scrapers.geiger.run --phase d"
        )

    mapping_data = orjson.loads(MAPPINGS_FILE.read_bytes())
    root_to_path: dict[str, str | None] = {
        slug: m.get("geigerCategoryPath") for slug, m in mapping_data["mappings"].items()
    }

    all_urls = list(_iter_non_root_urls())
    print(f"  Non-root PI URLs: {len(all_urls)}")

    # Test mode: small balanced sample across modifier types + a few facets.
    if test_sample:
        by_modifier: dict[str, list[dict[str, Any]]] = {}
        facets: list[dict[str, Any]] = []
        compound: list[dict[str, Any]] = []
        for u in all_urls:
            if u["type"] == "modifier":
                by_modifier.setdefault(u["modifier"], []).append(u)
            elif u["type"] == "compound-facet":
                compound.append(u)
            else:
                facets.append(u)
        sample: list[dict[str, Any]] = []
        for mod, items in by_modifier.items():
            sample.extend(items[:3])  # up to 3 per modifier type (6 types -> ~18)
        sample.extend(facets[:5])
        sample.extend(compound)
        all_urls = sample
        print(f"  Test sample: {len(all_urls)} URLs")

    if limit_urls is not None:
        all_urls = all_urls[:limit_urls]
        print(f"  Limited to first {len(all_urls)} URLs")

    checkpoint = CheckpointManager("c")
    memberships: dict[str, list[str]] = {}
    completed_urls: set[str] = set()
    urls_with_errors: list[str] = []
    urls_with_zero = 0

    if resume:
        state = checkpoint.load()
        if state:
            memberships = state.get("memberships", {})
            completed_urls = set(state.get("completed_urls", []))
            urls_with_errors = state.get("urlsWithErrors", [])
            urls_with_zero = int(state.get("urlsWithZero", 0))
            print(
                f"  Resumed: {len(completed_urls)} URLs already done, "
                f"{sum(len(v) for v in memberships.values())} total SKU memberships."
            )

    remaining = [u for u in all_urls if u["url"] not in completed_urls]
    print(f"  Remaining: {len(remaining)} of {len(all_urls)} URLs.")

    save_every = 100
    save_counter = 0
    state_lock = threading.Lock()

    def _record_result(
        pi_url: str, skus: list[str] | None, err: str | None
    ) -> None:
        """Thread-safe: merge one URL's result into the shared state."""
        nonlocal save_counter, urls_with_zero
        with state_lock:
            if err is not None:
                tqdm.write(f"  ERROR {pi_url}: {err}")
                urls_with_errors.append(pi_url)
            else:
                memberships[pi_url] = skus or []
                if not skus:
                    urls_with_zero += 1
                if test_sample:
                    tqdm.write(f"  {pi_url} -> {len(skus or [])} skus")
            completed_urls.add(pi_url)
            save_counter += 1
            if save_counter >= save_every:
                checkpoint.save(
                    {
                        "completed_urls": sorted(completed_urls),
                        "memberships": memberships,
                        "urlsWithErrors": urls_with_errors,
                        "urlsWithZero": urls_with_zero,
                    }
                )
                save_counter = 0

    # Pre-classify URLs as mapped (work) or unmapped (immediate skip).
    work_items: list[tuple[dict[str, Any], str]] = []
    for entry in remaining:
        cat_path = root_to_path.get(entry["rootSlug"])
        if not cat_path:
            with state_lock:
                urls_with_errors.append(entry["url"])
                completed_urls.add(entry["url"])
                save_counter += 1
        else:
            work_items.append((entry, cat_path))

    if workers <= 1:
        # Sequential path (preserves original single-thread semantics).
        for entry, cat_path in tqdm(work_items, desc="URLs", unit="url"):
            pi_url, skus, err = _process_one_url(entry, cat_path)
            _record_result(pi_url, skus, err)
    else:
        # Parallel path: N workers, each with their own ScraperClient + limiter.
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_process_one_url, entry, cat_path): entry["url"]
                for entry, cat_path in work_items
            }
            for fut in tqdm(
                as_completed(futures), total=len(futures), desc="URLs", unit="url"
            ):
                pi_url, skus, err = fut.result()
                _record_result(pi_url, skus, err)

    _save_output(memberships, urls_with_zero, urls_with_errors, len(all_urls))
    if not test_sample:
        checkpoint.clear()

    print("\nPhase C complete.")
    print(f"  URLs processed:        {len(all_urls)}")
    print(f"  With products:         {sum(1 for v in memberships.values() if v)}")
    print(f"  With zero products:    {urls_with_zero}")
    print(f"  With errors:           {len(urls_with_errors)}")
    print(f"  Output:                {OUTPUT_FILE}")


def _process_brand_fallback(
    entry: dict[str, Any],
    geiger_brand_name: str,
) -> tuple[str, list[str] | None, str | None]:
    """Worker variant: fetch SKUs for a PI brand URL via brand-only query."""
    pi_url = entry["url"]
    try:
        client = _get_thread_client()
        params = _build_brand_fallback_params(geiger_brand_name)
        skus, _total = _fetch_skus(client, params)
        return (pi_url, skus, None)
    except Exception as e:  # noqa: BLE001
        return (pi_url, None, f"{type(e).__name__}: {e}")


def run_retry_brands(workers: int = 1, limit: int | None = None) -> None:
    """Tier 1 fallback: for zero `/cat/<root>/brand/<brand>` URLs, re-query
    Geiger with `filter.brand=<Brand Name>` and no category filter. Recovers
    pages whose original (category × brand) combination had no matches but
    the brand itself exists in Geiger's catalog.
    """
    print("Phase C retry-brands (Tier 1): brand-only fallback for zero brand URLs...")

    if not OUTPUT_FILE.exists():
        raise RuntimeError(f"{OUTPUT_FILE} not found. Run Phase C first.")

    existing = orjson.loads(OUTPUT_FILE.read_bytes())
    memberships: dict[str, list[str]] = existing.get("memberships", {})
    urls_with_zero = int(existing.get("urlsWithZeroProducts", 0))
    error_urls: list[str] = existing.get("urlsWithErrors", [])
    total_processed = int(existing.get("totalUrlsProcessed", 0))

    pi_entries: dict[str, dict[str, Any]] = {
        e["url"]: e for e in orjson.loads(PI_URLS_FILE.read_bytes())["urls"]
    }

    work_items: list[tuple[dict[str, Any], str]] = []
    for pi_url, skus in memberships.items():
        if skus:
            continue
        entry = pi_entries.get(pi_url)
        if not entry:
            continue
        if entry.get("type") != "facet" or entry.get("facetType") != "brand":
            continue
        brand_name = _pi_slug_to_brand_name(entry["facetValue"])
        if brand_name is None:
            continue
        work_items.append((entry, brand_name))

    print(f"  Zero brand URLs with a known Geiger brand: {len(work_items)}")
    if limit is not None:
        work_items = work_items[:limit]
        print(f"  Limited to first {len(work_items)}")
    if not work_items:
        print("  Nothing to retry.")
        return

    if workers > 1:
        print(f"  Concurrency: {workers} workers")

    gained = 0
    still_zero = 0
    errors = 0
    new_zero_total = urls_with_zero
    lock = threading.Lock()

    def _on_result(pi_url: str, skus: list[str] | None, err: str | None) -> None:
        nonlocal gained, still_zero, errors, new_zero_total
        with lock:
            if err is not None:
                errors += 1
                return
            if skus:
                memberships[pi_url] = skus
                new_zero_total -= 1
                gained += 1
            else:
                still_zero += 1

    if workers <= 1:
        for entry, brand_name in tqdm(work_items, desc="Retry-brands", unit="url"):
            pi_url, skus, err = _process_brand_fallback(entry, brand_name)
            _on_result(pi_url, skus, err)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_process_brand_fallback, entry, brand_name): entry["url"]
                for entry, brand_name in work_items
            }
            for fut in tqdm(
                as_completed(futures), total=len(futures), desc="Retry-brands", unit="url"
            ):
                pi_url, skus, err = fut.result()
                _on_result(pi_url, skus, err)

    _save_output(memberships, new_zero_total, error_urls, total_processed)

    print("\nRetry-brands complete.")
    print(f"  URLs gained products: {gained}")
    print(f"  Still zero:           {still_zero}")
    print(f"  Errors:               {errors}")
    print(f"  Output:               {OUTPUT_FILE}")


def run_retry_search(workers: int = 1, limit: int | None = None) -> None:
    """Tier 2 fallback: for remaining zero facet/compound-facet URLs, query
    Searchspring's full-text search endpoint with deslugified URL terms.
    Filter results to SKUs that belong to the PI root's Geiger category
    (no semantic drift).
    """
    print("Phase C retry-search (Tier 2): full-text search fallback...")

    if not OUTPUT_FILE.exists():
        raise RuntimeError(f"{OUTPUT_FILE} not found. Run Phase C first.")
    if not MAPPINGS_FILE.exists():
        raise RuntimeError(f"Mapping file not found: {MAPPINGS_FILE}")

    existing = orjson.loads(OUTPUT_FILE.read_bytes())
    memberships: dict[str, list[str]] = existing.get("memberships", {})
    urls_with_zero = int(existing.get("urlsWithZeroProducts", 0))
    error_urls: list[str] = existing.get("urlsWithErrors", [])
    total_processed = int(existing.get("totalUrlsProcessed", 0))

    mapping_data = orjson.loads(MAPPINGS_FILE.read_bytes())
    root_to_path: dict[str, str | None] = {
        slug: m.get("geigerCategoryPath") for slug, m in mapping_data["mappings"].items()
    }

    pi_entries: dict[str, dict[str, Any]] = {
        e["url"]: e for e in orjson.loads(PI_URLS_FILE.read_bytes())["urls"]
    }

    work_items: list[tuple[dict[str, Any], str]] = []
    for pi_url, skus in memberships.items():
        if skus:
            continue
        entry = pi_entries.get(pi_url)
        if not entry:
            continue
        if entry.get("type") not in {"facet", "compound-facet"}:
            continue
        cat_path = root_to_path.get(entry["rootSlug"])
        if not cat_path:
            continue
        work_items.append((entry, cat_path))

    print(f"  Zero facet/compound-facet URLs to retry via search: {len(work_items)}")
    if limit is not None:
        work_items = work_items[:limit]
        print(f"  Limited to first {len(work_items)}")
    if not work_items:
        print("  Nothing to retry.")
        return

    if workers > 1:
        print(f"  Concurrency: {workers} workers")

    gained = 0
    still_zero = 0
    errors = 0
    new_zero_total = urls_with_zero
    lock = threading.Lock()
    save_every = 500
    save_counter = 0

    def _on_result(pi_url: str, skus: list[str] | None, err: str | None) -> None:
        nonlocal gained, still_zero, errors, new_zero_total, save_counter
        with lock:
            if err is not None:
                errors += 1
                return
            if skus:
                memberships[pi_url] = skus
                new_zero_total -= 1
                gained += 1
            else:
                still_zero += 1
            save_counter += 1
            if save_counter >= save_every:
                _save_output(memberships, new_zero_total, error_urls, total_processed)
                save_counter = 0

    if workers <= 1:
        for entry, cat_path in tqdm(work_items, desc="Retry-search", unit="url"):
            pi_url, skus, err = _process_search_fallback(entry, cat_path)
            _on_result(pi_url, skus, err)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_process_search_fallback, entry, cat_path): entry["url"]
                for entry, cat_path in work_items
            }
            for fut in tqdm(
                as_completed(futures), total=len(futures), desc="Retry-search", unit="url"
            ):
                pi_url, skus, err = fut.result()
                _on_result(pi_url, skus, err)

    _save_output(memberships, new_zero_total, error_urls, total_processed)

    print("\nRetry-search complete.")
    print(f"  URLs gained products: {gained}")
    print(f"  Still zero:           {still_zero}")
    print(f"  Errors:               {errors}")
    print(f"  Output:               {OUTPUT_FILE}")


def run_retry_zeros(
    workers: int = 1,
    limit: int | None = None,
) -> None:
    """Re-fetch URLs whose Phase C result was zero products, using the
    slug-based resolver to try dedicated Geiger category pages first.

    Only writes back URLs that GAIN products. URLs that come back zero again
    are left unchanged in facet-memberships.json. Errors are NOT promoted to
    the urlsWithErrors bucket (the original Phase C result still stands).
    """
    print("Phase C retry-zeros: re-fetching zero-product URLs with slug resolver...")

    if not OUTPUT_FILE.exists():
        raise RuntimeError(
            f"{OUTPUT_FILE} not found. Run Phase C first: "
            "python -m scripts.scrapers.geiger.run --phase c"
        )
    if not MAPPINGS_FILE.exists():
        raise RuntimeError(f"Mapping file not found: {MAPPINGS_FILE}")

    existing = orjson.loads(OUTPUT_FILE.read_bytes())
    memberships: dict[str, list[str]] = existing.get("memberships", {})
    urls_with_zero = int(existing.get("urlsWithZeroProducts", 0))
    error_urls: list[str] = existing.get("urlsWithErrors", [])
    total_processed = int(existing.get("totalUrlsProcessed", 0))

    zero_urls = [u for u, skus in memberships.items() if not skus]
    print(f"  Zero-result URLs in current output: {len(zero_urls)}")

    mapping_data = orjson.loads(MAPPINGS_FILE.read_bytes())
    root_to_path: dict[str, str | None] = {
        slug: m.get("geigerCategoryPath") for slug, m in mapping_data["mappings"].items()
    }

    pi_entries: dict[str, dict[str, Any]] = {
        e["url"]: e for e in orjson.loads(PI_URLS_FILE.read_bytes())["urls"]
    }

    # Filter to facet/compound-facet only (resolver doesn't apply to modifiers).
    work_items: list[tuple[dict[str, Any], str]] = []
    for pi_url in zero_urls:
        entry = pi_entries.get(pi_url)
        if entry is None:
            continue
        if entry.get("type") not in {"facet", "compound-facet"}:
            continue
        cat_path = root_to_path.get(entry["rootSlug"])
        if not cat_path:
            continue
        # Only retry if the slug resolver actually finds a candidate.
        if resolve_slug_match(entry, cat_path) is None:
            continue
        work_items.append((entry, cat_path))

    print(f"  URLs the resolver can re-target: {len(work_items)}")
    if limit is not None:
        work_items = work_items[:limit]
        print(f"  Limited to first {len(work_items)}")

    if not work_items:
        print("  Nothing to retry.")
        return

    if workers > 1:
        print(f"  Concurrency: {workers} workers")

    gained = 0
    still_zero = 0
    errors = 0
    new_zero_total = urls_with_zero
    lock = threading.Lock()

    def _on_result(pi_url: str, skus: list[str] | None, err: str | None) -> None:
        nonlocal gained, still_zero, errors, new_zero_total
        with lock:
            if err is not None:
                errors += 1
                return
            if skus:
                memberships[pi_url] = skus
                new_zero_total -= 1
                gained += 1
            else:
                still_zero += 1

    if workers <= 1:
        for entry, cat_path in tqdm(work_items, desc="Retry-zeros", unit="url"):
            pi_url, skus, err = _process_one_url(entry, cat_path, use_slug_resolver=True)
            _on_result(pi_url, skus, err)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_process_one_url, entry, cat_path, True): entry["url"]
                for entry, cat_path in work_items
            }
            for fut in tqdm(
                as_completed(futures), total=len(futures), desc="Retry-zeros", unit="url"
            ):
                pi_url, skus, err = fut.result()
                _on_result(pi_url, skus, err)

    _save_output(memberships, new_zero_total, error_urls, total_processed)

    print("\nRetry-zeros complete.")
    print(f"  URLs gained products: {gained}")
    print(f"  Still zero:           {still_zero}")
    print(f"  Errors (ignored):     {errors}")
    print(f"  Output:               {OUTPUT_FILE}")


def run_retry_errors() -> None:
    """Retry only the URLs in `urlsWithErrors` from a previous Phase C run.

    Uses the current `_build_request_params` (with numeric-facet handling).
    Merges results back into the existing facet-memberships.json — successful
    retries move from `urlsWithErrors` into `memberships`.
    """
    print("Phase C retry: re-fetching errored URLs...")

    if not OUTPUT_FILE.exists():
        raise RuntimeError(
            f"{OUTPUT_FILE} not found. Run Phase C first: "
            "python -m scripts.scrapers.geiger.run --phase c"
        )
    if not MAPPINGS_FILE.exists():
        raise RuntimeError(f"Mapping file not found: {MAPPINGS_FILE}")

    existing = orjson.loads(OUTPUT_FILE.read_bytes())
    memberships: dict[str, list[str]] = existing.get("memberships", {})
    error_urls: list[str] = existing.get("urlsWithErrors", [])
    urls_with_zero = int(existing.get("urlsWithZeroProducts", 0))
    total_processed = int(existing.get("totalUrlsProcessed", 0))

    if not error_urls:
        print("  No errored URLs to retry. Nothing to do.")
        return

    print(f"  Errored URLs to retry: {len(error_urls)}")

    mapping_data = orjson.loads(MAPPINGS_FILE.read_bytes())
    root_to_path: dict[str, str | None] = {
        slug: m.get("geigerCategoryPath") for slug, m in mapping_data["mappings"].items()
    }

    # Re-index the PI URL list to look up the structured entry per URL.
    pi_entries: dict[str, dict[str, Any]] = {
        e["url"]: e for e in orjson.loads(PI_URLS_FILE.read_bytes())["urls"]
    }

    new_errors: list[str] = []
    recovered = 0

    with ScraperClient() as client:
        for pi_url in tqdm(error_urls, desc="Retry", unit="url"):
            entry = pi_entries.get(pi_url)
            if entry is None:
                new_errors.append(pi_url)
                continue
            category_path = root_to_path.get(entry["rootSlug"])
            if not category_path:
                new_errors.append(pi_url)
                continue
            try:
                params = _build_request_params(entry, category_path)
                skus, _ = _fetch_skus(client, params)
                memberships[pi_url] = skus
                if not skus:
                    urls_with_zero += 1
                recovered += 1
            except Exception as e:  # noqa: BLE001
                tqdm.write(f"  STILL ERR {pi_url}: {type(e).__name__}: {e}")
                new_errors.append(pi_url)

    _save_output(memberships, urls_with_zero, new_errors, total_processed)

    print("\nRetry complete.")
    print(f"  Recovered URLs:     {recovered}")
    print(f"  Still erroring:     {len(new_errors)}")
    print(f"  Total memberships:  {len(memberships)}")
