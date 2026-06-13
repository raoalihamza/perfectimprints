"""Weekly scrape of Geiger's Deals page.

Geiger's deals turn over fast (sale prices, closeouts move in/out within days),
so we can't rely on the monthly Phase B rebuild. This script hits Searchspring
directly for `Home > Shop By > Deals`, captures the products + the per-facet-
value SKU memberships, and writes `data/geiger/deals.json`.

Two API calls drive the data:
  1. meta.json — facet field labels (Color, Brand, Material, etc.)
  2. category.json with `bgfilter.category_path=Home > Shop By > Deals` — the
     deal product list + an embedded `facets` array with values & counts but
     NOT SKU lists.

To make the filter sidebar accurate, after step 2 we issue one filtered call
per facet value to capture the SKUs that belong to it (e.g.,
`filter.colors=Blue` returns the blue deal SKUs). With ~50 facet values across
~11 deals this is roughly 50 calls weekly — about a minute at 1 req/sec.

Output: data/geiger/deals.json.
Run:    python -m scripts.scrapers.geiger.scrape_deals
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import orjson
from tqdm import tqdm

from .client import ScraperClient
from .config import OUTPUT_DIR, SEARCHSPRING_BASE_URL, SEARCHSPRING_PER_PAGE, SEARCHSPRING_SITE_ID

META_URL = "https://kfx28d.a.searchspring.io/api/meta/meta.json"
DEALS_CATEGORY_PATH = "Home > Shop By > Deals"

# Facets we never want to ride along as user-facing filter sections. `refine_by`
# overlaps with category-derived sections, and `ss_category_hierarchy` is the
# raw hierarchy view we replace with a flat top-level Category section.
SKIP_FACET_FIELDS = {"ss_category_hierarchy"}


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

    # `category_path` in Searchspring is a flat list of "Home > X > Y" strings.
    raw_paths = raw.get("category_path") or []
    # Strip HTML entities introduced by Searchspring (&amp;, &gt;, etc.).
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
        "is_new_item": bool(raw.get("is_new_item")),
        "is_on_sale": bool(raw.get("is_on_sale")),
        "product_type_unigram": raw.get("product_type_unigram"),
        "geiger_url": raw.get("url"),
    }


def _fetch_meta(client: ScraperClient) -> dict[str, Any]:
    """Pull the per-facet labels map. Keys are field names, values are {label, ...}."""
    params = {"siteId": SEARCHSPRING_SITE_ID}
    response = client.get_json(META_URL, params=params)
    return response.get("facets") or {}


def _fetch_base_deals(client: ScraperClient) -> dict[str, Any]:
    """Paginate the deals category and return the merged products + facets."""
    page = 1
    all_results: list[dict[str, Any]] = []
    facets: list[dict[str, Any]] = []
    pagination_meta: dict[str, Any] = {}

    while True:
        params = {
            "siteId": SEARCHSPRING_SITE_ID,
            "bgfilter.category_path": DEALS_CATEGORY_PATH,
            "resultsFormat": "native",
            "perPage": SEARCHSPRING_PER_PAGE,
            "page": page,
        }
        response = client.get_json(SEARCHSPRING_BASE_URL, params=params)
        results = response.get("results") or []
        all_results.extend(results)
        if page == 1:
            facets = response.get("facets") or []
            pagination_meta = response.get("pagination") or {}

        pagination = response.get("pagination", {})
        total_pages = int(pagination.get("totalPages", page))
        if page >= total_pages or not results:
            break
        page += 1

    return {
        "results": all_results,
        "facets": facets,
        "pagination": pagination_meta,
    }


def _value_filter_params(field: str, raw_value: dict[str, Any]) -> list[tuple[str, str]]:
    """Build Searchspring filter params for one facet value entry.

    Returns a list of tuples so callers can preserve duplicate keys when needed.
    """
    vtype = raw_value.get("type")
    if vtype == "range":
        # Range syntax: filter.<field>.low / .high. Per CLAUDE.md.
        low = raw_value.get("low")
        high = raw_value.get("high")
        params: list[tuple[str, str]] = []
        if low is not None and low != "":
            params.append((f"filter.{field}.low", str(low)))
        if high is not None and high != "":
            params.append((f"filter.{field}.high", str(high)))
        return params
    # Default: single value match.
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
    client: ScraperClient, field: str, raw_value: dict[str, Any]
) -> list[str]:
    """For one facet value, return the deal SKUs that match it."""
    base_params: list[tuple[str, str]] = [
        ("siteId", SEARCHSPRING_SITE_ID),
        ("bgfilter.category_path", DEALS_CATEGORY_PATH),
        ("resultsFormat", "native"),
        ("perPage", str(SEARCHSPRING_PER_PAGE)),
        ("page", "1"),
    ]
    base_params.extend(_value_filter_params(field, raw_value))

    # curl_cffi accepts a list of tuples; ScraperClient.get_json passes through
    # to client.get with `params=`, which curl_cffi serializes correctly.
    skus: list[str] = []
    page = 1
    while True:
        page_params = [(k, v) for (k, v) in base_params if k != "page"]
        page_params.append(("page", str(page)))
        response = client.get_json(SEARCHSPRING_BASE_URL, params=page_params)
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
    """Strip Searchspring noise and bring the section into our internal shape.

    SKU lists are filled in by the caller after a follow-up filtered API call
    per value.
    """
    label = raw_facet.get("label") or meta_label or field
    ftype = raw_facet.get("type") or "list"  # "hierarchy" | "range" | None=list
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


def run() -> None:
    print(f"Scraping Geiger deals from {DEALS_CATEGORY_PATH!r}")

    with ScraperClient() as client:
        print("  Step 1/3: fetching meta.json for facet labels...")
        meta_facets = _fetch_meta(client)

        print("  Step 2/3: fetching base deals + facets...")
        base = _fetch_base_deals(client)
        raw_results = base["results"]
        raw_facets = base["facets"]

        normalized_products = []
        for r in raw_results:
            try:
                normalized_products.append(_normalize_product(r))
            except ValueError as e:
                tqdm.write(f"  Skipping malformed product: {e}")

        sections: list[dict[str, Any]] = []
        for raw_facet in raw_facets:
            field = raw_facet.get("field")
            if not field or field in SKIP_FACET_FIELDS:
                continue
            meta_label = (meta_facets.get(field) or {}).get("label")
            section = _normalize_facet_section(field, raw_facet, meta_label)
            if not section["values"]:
                continue
            sections.append(section)

        total_value_calls = sum(len(s["values"]) for s in sections)
        print(
            f"  Step 3/3: capturing SKU membership for {total_value_calls} facet values "
            f"across {len(sections)} sections..."
        )

        # Per-value filtered call. We need the raw Searchspring `value` shape
        # back, but we already dropped it after normalization. Easier: walk the
        # raw response again and zip with the normalized sections.
        raw_facet_by_field = {f.get("field"): f for f in raw_facets if f.get("field")}
        for section in tqdm(sections, desc="sections", unit="sec"):
            raw_section = raw_facet_by_field.get(section["field"], {})
            raw_values = raw_section.get("values") or []
            # Build a lookup from normalized id -> raw value entry.
            raw_by_id = {_value_id(section["field"], v): v for v in raw_values}
            for value_entry in section["values"]:
                raw_v = raw_by_id.get(value_entry["id"])
                if not raw_v:
                    continue
                try:
                    skus = _fetch_value_skus(client, section["field"], raw_v)
                except Exception as e:  # noqa: BLE001
                    tqdm.write(
                        f"  Warn: {section['field']}={value_entry['label']!r} call failed: {e}"
                    )
                    skus = []
                value_entry["skus"] = skus

    output = {
        "scrapedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalDeals": len(normalized_products),
        "products": normalized_products,
        "facets": sections,
    }

    output_path = OUTPUT_DIR / "deals.json"
    with open(output_path, "wb") as f:
        f.write(orjson.dumps(output, option=orjson.OPT_INDENT_2))
    print(f"\nWrote {len(normalized_products)} deals + {len(sections)} facet sections to {output_path}")


if __name__ == "__main__":
    run()
