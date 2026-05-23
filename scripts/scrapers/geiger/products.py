"""Phase B: Product catalog.

Paginates the Searchspring API for each Geiger leaf category, deduplicates by
SKU, and writes the merged catalog to `data/geiger/products.json`. Uses
checkpointing so partial runs can resume.
"""

from __future__ import annotations

import datetime as dt
import json as _json
from collections.abc import Iterator
from typing import Any

import orjson
from tqdm import tqdm

from .checkpoint import CheckpointManager
from .client import ScraperClient
from .config import (
    OUTPUT_DIR,
    SEARCHSPRING_BASE_URL,
    SEARCHSPRING_PER_PAGE,
    SEARCHSPRING_SITE_ID,
)


def extract_leaf_categories(tree: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Flatten the Phase A tree to a list of leaves with name/slug/categoryPath."""
    leaves: list[dict[str, str]] = []

    def _walk(nodes: list[dict[str, Any]]):
        for node in nodes:
            if not node.get("children"):
                leaves.append(
                    {
                        "name": node["name"],
                        "slug": node["slug"],
                        "categoryPath": node["categoryPath"],
                    }
                )
            else:
                _walk(node["children"])

    _walk(tree)
    return leaves


def fetch_global_products(client: ScraperClient) -> Iterator[dict[str, Any]]:
    """Paginate Searchspring with NO category filter.

    Catches products that exist in the catalog but aren't reachable via any
    leaf category we walked (e.g., products tagged only in "Shop By" virtual
    collections like Brand Names or Deals).
    """
    page = 1
    while True:
        params = {
            "siteId": SEARCHSPRING_SITE_ID,
            "resultsFormat": "native",
            "perPage": SEARCHSPRING_PER_PAGE,
            "page": page,
        }
        response = client.get_json(SEARCHSPRING_BASE_URL, params=params)
        results = response.get("results") or []
        if not results:
            return
        for raw in results:
            yield raw
        pagination = response.get("pagination", {})
        total_pages = int(pagination.get("totalPages", page))
        if page >= total_pages:
            return
        page += 1


def fetch_category_products(
    client: ScraperClient, category_path: str
) -> Iterator[dict[str, Any]]:
    """Yield each product dict from Searchspring for a single category path."""
    page = 1
    total_yielded = 0

    while True:
        params = {
            "siteId": SEARCHSPRING_SITE_ID,
            "bgfilter.category_path": category_path,
            "resultsFormat": "native",
            "perPage": SEARCHSPRING_PER_PAGE,
            "page": page,
        }
        response = client.get_json(SEARCHSPRING_BASE_URL, params=params)

        results = response.get("results")
        if results is None:
            print(
                f"    Unexpected response shape for {category_path!r} "
                f"on page {page}: missing 'results' key. Stopping pagination."
            )
            return

        if not results:
            return

        for raw in results:
            yield raw
            total_yielded += 1

        pagination = response.get("pagination", {})
        total_pages = int(pagination.get("totalPages", page))
        if page >= total_pages:
            return
        page += 1

    # Unreachable; informational
    _ = total_yielded


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


def normalize_product(raw: dict[str, Any], source_category_path: str) -> dict[str, Any]:
    """Map a raw Searchspring product to our internal shape."""
    sku = raw.get("sku")
    if not sku:
        raise ValueError(f"Product is missing sku. Raw payload: {raw!r}")

    badges = raw.get("badges")
    if not isinstance(badges, list):
        badges = []

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
        "category_paths": [source_category_path],
        "badges": badges,
        "is_new_item": bool(raw.get("is_new_item", False)),
        "is_on_sale": bool(raw.get("is_on_sale", False)),
        "product_type_unigram": raw.get("product_type_unigram"),
        "geiger_url": raw.get("url"),
    }


def merge_product(
    existing: dict[str, Any], new_record: dict[str, Any]
) -> dict[str, Any]:
    """Union category_paths; keep existing values for every other field."""
    merged = dict(existing)
    paths = list(existing.get("category_paths", []))
    for path in new_record.get("category_paths", []):
        if path not in paths:
            paths.append(path)
    merged["category_paths"] = paths
    return merged


def _save_products(products: dict[str, dict[str, Any]], categories_with_errors: list[str]) -> None:
    sorted_products = sorted(products.values(), key=lambda p: p["sku"])
    payload = {
        "scrapedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalProducts": len(sorted_products),
        "totalCategoriesScraped": len(
            {path for p in sorted_products for path in p["category_paths"]}
        ),
        "categoriesWithErrors": categories_with_errors,
        "products": sorted_products,
    }
    output_path = OUTPUT_DIR / "products.json"
    with open(output_path, "wb") as f:
        f.write(orjson.dumps(payload, option=orjson.OPT_INDENT_2))
    print(f"  Wrote {len(sorted_products)} products to {output_path}")


def run_global_only() -> None:
    """Top-up pass: append SKUs from the global no-filter query to an existing
    products.json. Skips re-walking the 482 leaf categories."""
    print("Phase B (global top-up): no-filter Searchspring pass starting...")

    output_path = OUTPUT_DIR / "products.json"
    if not output_path.exists():
        raise RuntimeError(
            f"{output_path} not found. Run the full Phase B first: "
            "python -m scripts.scrapers.geiger.run --phase b"
        )

    with open(output_path, "rb") as f:
        existing = orjson.loads(f.read())

    products: dict[str, dict[str, Any]] = {p["sku"]: p for p in existing["products"]}
    categories_with_errors: list[str] = existing.get("categoriesWithErrors", [])
    print(f"  Existing SKUs in products.json: {len(products)}")

    new_count = 0
    seen_count = 0

    with ScraperClient() as client:
        for raw in tqdm(fetch_global_products(client), desc="Global", unit="prod"):
            try:
                normalized = normalize_product(raw, "Home")
            except ValueError as e:
                tqdm.write(f"  Skipping product: {e}")
                continue
            sku = normalized["sku"]
            if sku in products:
                products[sku] = merge_product(products[sku], normalized)
                seen_count += 1
            else:
                products[sku] = normalized
                new_count += 1

    _save_products(products, categories_with_errors)

    print("\nGlobal top-up complete.")
    print(f"  New SKUs added:        {new_count}")
    print(f"  Already-seen SKUs:     {seen_count}")
    print(f"  Total unique SKUs now: {len(products)}")


def run(
    limit_categories: int | None = None,
    resume: bool = False,
) -> None:
    print("Phase B: Product catalog scrape starting...")

    categories_path = OUTPUT_DIR / "categories.json"
    if not categories_path.exists():
        raise RuntimeError(
            f"Categories file not found: {categories_path}\n"
            "Run Phase A first: python -m scripts.scrapers.geiger.run --phase a"
        )

    with open(categories_path, "rb") as f:
        categories_data = orjson.loads(f.read())

    leaves = extract_leaf_categories(categories_data.get("tree", []))
    print(f"  Total leaf categories from Phase A: {len(leaves)}")

    if limit_categories is not None:
        leaves = leaves[:limit_categories]
        print(f"  Test mode: limited to {len(leaves)} categories")

    checkpoint = CheckpointManager("b")
    products: dict[str, dict[str, Any]] = {}
    completed_categories: set[str] = set()
    categories_with_errors: list[str] = []

    if resume:
        state = checkpoint.load()
        if state:
            products = state.get("products", {})
            completed_categories = set(state.get("completed_categories", []))
            categories_with_errors = state.get("categoriesWithErrors", [])
            print(
                f"  Resumed checkpoint: {len(completed_categories)} categories "
                f"already done, {len(products)} unique SKUs."
            )
        else:
            print("  No checkpoint found - starting fresh.")

    remaining = [
        leaf for leaf in leaves if leaf["categoryPath"] not in completed_categories
    ]
    print(f"  Remaining: {len(remaining)} of {len(leaves)} categories.")

    save_every = 5
    save_counter = 0

    with ScraperClient() as client:
        # Phase B diagnostic: hit the first leaf in isolation to fail fast if the
        # filter is wrong. Prevents silent 30-minute runs that produce nothing.
        if remaining:
            first = remaining[0]
            print(f"  Diagnostic: testing first leaf {first['categoryPath']!r}...")
            test_params = {
                "siteId": SEARCHSPRING_SITE_ID,
                "bgfilter.category_path": first["categoryPath"],
                "resultsFormat": "native",
                "perPage": SEARCHSPRING_PER_PAGE,
                "page": 1,
            }
            test_response = client.get_json(SEARCHSPRING_BASE_URL, params=test_params)
            total = int(test_response.get("pagination", {}).get("totalResults", 0))
            if total == 0:
                raise RuntimeError(
                    "Phase B diagnostic failed: first leaf returned 0 products.\n"
                    f"  categoryPath sent: {first['categoryPath']!r}\n"
                    f"  Endpoint: {SEARCHSPRING_BASE_URL}\n"
                    f"  Params: {test_params}\n"
                    f"  Response (truncated to 2000 chars):\n"
                    f"{_json.dumps(test_response, indent=2)[:2000]}\n\n"
                    "Likely causes: wrong filter param name, wrong path format,\n"
                    "or unexpected wrapper still present in path. Open a real\n"
                    "Geiger category page in DevTools Network tab and compare."
                )
            print(f"  Diagnostic OK: {total} products for first leaf. Proceeding.")

        for leaf in tqdm(remaining, desc="Categories", unit="cat"):
            category_path = leaf["categoryPath"]
            try:
                fetched = 0
                for raw in fetch_category_products(client, category_path):
                    normalized = normalize_product(raw, category_path)
                    sku = normalized["sku"]
                    if sku in products:
                        products[sku] = merge_product(products[sku], normalized)
                    else:
                        products[sku] = normalized
                    fetched += 1
                tqdm.write(f"  {category_path}: {fetched} products")
                completed_categories.add(category_path)
            except Exception as e:
                tqdm.write(
                    f"  ERROR for {category_path}: {type(e).__name__}: {e}"
                )
                categories_with_errors.append(category_path)

            save_counter += 1
            if save_counter >= save_every:
                checkpoint.save(
                    {
                        "completed_categories": sorted(completed_categories),
                        "products": products,
                        "categoriesWithErrors": categories_with_errors,
                    }
                )
                save_counter = 0

    _save_products(products, categories_with_errors)
    checkpoint.clear()

    print("\nPhase B complete.")
    print(f"  Unique SKUs:               {len(products)}")
    print(f"  Categories scraped:        {len(completed_categories)}")
    print(f"  Categories with errors:    {len(categories_with_errors)}")
    sample = sorted(products.keys())[:5]
    if sample:
        print(f"  Sample SKUs: {', '.join(sample)}")
