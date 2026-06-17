"""Weekly scrape of Geiger's 24 Hour Rush Products page (Phase H).

Geiger's "24 Hour Rush Products" collection turns over as items move in/out of
rush availability, so it isn't part of the monthly Phase B catalog dump. This
script hits Searchspring directly for `Home > Shop By > 24 Hour Rush Products`,
captures the products + the per-facet-value SKU memberships, and writes
`data/geiger/rush-products.json`.

Two API calls drive the data:
  1. meta.json — facet field labels (Color, Brand, Material, etc.)
  2. category.json with `bgfilter.category_path=Home > Shop By > 24 Hour Rush
     Products` — the rush product list + an embedded `facets` array with values
     & counts but NOT SKU lists.

To make the filter sidebar accurate, after step 2 we issue one filtered call per
facet value to capture the SKUs that belong to it (e.g., `filter.colors=Blue`
returns the blue rush SKUs).

Mirrors `scrape_new_products.py` field-for-field; the only differences are the
source category path, the output filename, and a facet-hygiene pass that drops
degenerate single-value facets (e.g. `production_time` is the single value "1"
covering 100% of the rush collection — no use as a filter).

Notes specific to the rush feed:
  - Results carry no `badges` array (no NEW/SALE/CLOSEOUT ribbons here).
  - Geiger sends `is_new_item` as the string "Yes" on this feed (vs boolean on
    other endpoints) — coerced to a real bool in `_normalize_product`.
  - At least one SKU contains a space (e.g. "501622 1BC"). The sku string is
    preserved as-is to match the live Geiger product URL lookup.

Output: data/geiger/rush-products.json.
Run:    python -m scripts.scrapers.geiger.scrape_rush_products
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import orjson
from tqdm import tqdm

from .client import ScraperClient
from .config import OUTPUT_DIR, SEARCHSPRING_BASE_URL, SEARCHSPRING_PER_PAGE, SEARCHSPRING_SITE_ID

META_URL = "https://kfx28d.a.searchspring.io/api/meta/meta.json"
RUSH_CATEGORY_PATH = "Home > Shop By > 24 Hour Rush Products"

# Facets we never want to ride along as user-facing filter sections.
# `ss_category_hierarchy` is the raw hierarchy view we replace with a flat
# top-level Category section.
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

    # Geiger sends is_new_item as the string "Yes" on this feed (vs boolean true
    # on other category endpoints). Coerce to a real bool so the downstream
    # GeigerProduct contract stays clean.
    is_new_raw = raw.get("is_new_item")
    if isinstance(is_new_raw, str):
        is_new = is_new_raw.strip().lower() in {"yes", "true", "1"}
    else:
        is_new = bool(is_new_raw)

    is_sale_raw = raw.get("is_on_sale")
    if isinstance(is_sale_raw, str):
        is_sale = is_sale_raw.strip().lower() in {"yes", "true", "1"}
    else:
        is_sale = bool(is_sale_raw)

    # Preserve the sku string exactly as Geiger returns it — some rush SKUs carry
    # a trailing variant token with a space (e.g. "501622 1BC").
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
        "is_new_item": is_new,
        "is_on_sale": is_sale,
        "product_type_unigram": raw.get("product_type_unigram"),
        "geiger_url": raw.get("url"),
    }


def _fetch_meta(client: ScraperClient) -> dict[str, Any]:
    params = {"siteId": SEARCHSPRING_SITE_ID}
    response = client.get_json(META_URL, params=params)
    return response.get("facets") or {}


def _fetch_base_rush_products(client: ScraperClient) -> dict[str, Any]:
    page = 1
    all_results: list[dict[str, Any]] = []
    facets: list[dict[str, Any]] = []
    pagination_meta: dict[str, Any] = {}

    while True:
        params = {
            "siteId": SEARCHSPRING_SITE_ID,
            "bgfilter.category_path": RUSH_CATEGORY_PATH,
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
    if raw_value.get("type") == "range":
        low = raw_value.get("low") or ""
        high = raw_value.get("high") or ""
        return f"{low}-{high}"
    return str(raw_value.get("value") or "").strip()


def _fetch_value_skus(
    client: ScraperClient, field: str, raw_value: dict[str, Any]
) -> list[str]:
    base_params: list[tuple[str, str]] = [
        ("siteId", SEARCHSPRING_SITE_ID),
        ("bgfilter.category_path", RUSH_CATEGORY_PATH),
        ("resultsFormat", "native"),
        ("perPage", str(SEARCHSPRING_PER_PAGE)),
        ("page", "1"),
    ]
    base_params.extend(_value_filter_params(field, raw_value))

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
                "skus": [],
            }
        )
    return {
        "field": field,
        "label": label,
        "type": ftype,
        "values": values,
    }


def _is_degenerate_section(section: dict[str, Any], total_products: int) -> bool:
    """A facet section is useless as a filter when it can't actually partition
    the result set. Drop it when:
      - it has fewer than 2 values, OR
      - a single value covers 100% of the products (selecting it changes nothing).

    For the rush collection this drops `production_time` (single value "1" with
    count == total). The same rule generalizes to any future single-bucket facet.
    """
    values = section.get("values") or []
    if len(values) < 2:
        return True
    if total_products > 0:
        for v in values:
            if int(v.get("count") or 0) >= total_products:
                return True
    return False


def run() -> None:
    print(f"Scraping Geiger rush products from {RUSH_CATEGORY_PATH!r}")

    with ScraperClient() as client:
        print("  Step 1/3: fetching meta.json for facet labels...")
        meta_facets = _fetch_meta(client)

        print("  Step 2/3: fetching base rush-products + facets...")
        base = _fetch_base_rush_products(client)
        raw_results = base["results"]
        raw_facets = base["facets"]

        normalized_products = []
        for r in raw_results:
            try:
                normalized_products.append(_normalize_product(r))
            except ValueError as e:
                tqdm.write(f"  Skipping malformed product: {e}")

        total_products = len(normalized_products)

        sections: list[dict[str, Any]] = []
        for raw_facet in raw_facets:
            field = raw_facet.get("field")
            if not field or field in SKIP_FACET_FIELDS:
                continue
            meta_label = (meta_facets.get(field) or {}).get("label")
            section = _normalize_facet_section(field, raw_facet, meta_label)
            if not section["values"]:
                continue
            if _is_degenerate_section(section, total_products):
                tqdm.write(
                    f"  Dropping degenerate facet '{section['field']}' "
                    f"({len(section['values'])} value(s))"
                )
                continue
            sections.append(section)

        total_value_calls = sum(len(s["values"]) for s in sections)
        print(
            f"  Step 3/3: capturing SKU membership for {total_value_calls} facet values "
            f"across {len(sections)} sections..."
        )

        raw_facet_by_field = {f.get("field"): f for f in raw_facets if f.get("field")}
        for section in tqdm(sections, desc="sections", unit="sec"):
            raw_section = raw_facet_by_field.get(section["field"], {})
            raw_values = raw_section.get("values") or []
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
        "totalRushProducts": len(normalized_products),
        "products": normalized_products,
        "facets": sections,
    }

    output_path = OUTPUT_DIR / "rush-products.json"
    with open(output_path, "wb") as f:
        f.write(orjson.dumps(output, option=orjson.OPT_INDENT_2))
    print(
        f"\nWrote {len(normalized_products)} rush products + {len(sections)} facet sections to {output_path}"
    )


if __name__ == "__main__":
    run()
