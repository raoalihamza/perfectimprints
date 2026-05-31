"""Generic AI content generation pipeline for all 22,180 PI category URLs.

Reads the PI URL list, selects the appropriate prompt template per URL type
(root, modifier, facet, compound-facet), pulls Geiger product context, calls
DeepSeek, validates output, and writes one JSON per URL to data/categories/.

Resumable via --skip-existing. Failures are appended to .failures.log and can
be retried with --retry-failures.

Usage:
  python scripts/ai-pipeline/generate_content.py --types root --skip-existing
  python scripts/ai-pipeline/generate_content.py --types modifier,facet,compound-facet --skip-existing
  python scripts/ai-pipeline/generate_content.py --types facet --limit 5 --dry-run --show-prompts 2
  python scripts/ai-pipeline/generate_content.py --retry-failures
"""

from __future__ import annotations

import argparse
import hashlib
import html
import logging
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import orjson

from deepseek_client import DeepSeekClient, DeepSeekError, GenerationResult
from generate_sample_roots import (
    OPENING_STYLE_INSTRUCTIONS,
    OPENING_STYLE_QUOTAS,
    apply_sku_filter,
    build_context as build_root_prompt_context,
    build_path_to_skus,
    count_keyword_derivatives,
    post_process_lengths,
    render_prompt,
    skus_for_subtree,
    title_case_from_slug,
    top_product_names,
    _load_json,
    _word_count,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
PROMPTS_DIR = Path(__file__).parent / "prompts"
OUTPUT_DIR = DATA_DIR / "categories"

URLS_PATH = DATA_DIR / "pi-urls" / "category-urls.json"
MAPPINGS_PATH = DATA_DIR / "mappings" / "pi-to-geiger.json"
PRODUCTS_PATH = DATA_DIR / "geiger" / "products.json"
MEMBERSHIPS_PATH = DATA_DIR / "geiger" / "facet-memberships.json"

FAILURES_LOG = OUTPUT_DIR / ".failures.log"

PROMPT_VERSION_ROOT = "root-v2"
PROMPT_VERSION_MODIFIER = "modifier-v1"
PROMPT_VERSION_FACET = "facet-v1"
PROMPT_VERSION_COMPOUND = "facet-v1"

BUYER_PERSONA = (
    "marketing directors, HR directors, safety managers, business owners"
)

# How many top-products to include in the prompt context.
TOP_PRODUCTS_FOR_NONROOT = 12

# Cap raw SKU lists persisted on non-root pages. Membership lists for popular
# facets can run into the thousands; the page only renders ~60 per page anyway
# (and we re-derive product order at render time), so persisting a few hundred
# keeps the JSON files manageable without losing variety.
NONROOT_SKU_PERSIST_CAP = 300

logger = logging.getLogger("generate_content")


# ---------------------------------------------------------------------------
# Modifier-intent instructions injected into modifier_category.txt
# ---------------------------------------------------------------------------

MODIFIER_INSTRUCTIONS: dict[str, str] = {
    "search": (
        "This is a SEARCH-landing variant of the root category. Keep the angle "
        "close to general root copy: this is the page someone hits after typing "
        "the category as a search query. Emphasize breadth of options and an easy "
        "starting point for buyers exploring the category. Do not invent special "
        "filtering criteria — there are none."
    ),
    "no-minimum": (
        "This is a NO-MINIMUM (small-order) page. Buyers who land here need small "
        "quantities (under 25) and don't want the typical bulk minimums. Emphasize: "
        "low MOQ flexibility, fit for small businesses, startups, small teams, "
        "one-off events, sample-style orders, and per-unit pricing realities at low "
        "volumes. The intro must make the small-order angle obvious in the first "
        "sentence."
    ),
    "closeout": (
        "This is a CLOSEOUT / SALE page. Buyers landing here want a deal: clearance "
        "pricing, limited stock, last-call items. Emphasize: time-sensitivity, "
        "limited availability, value pricing, and that selection changes as stock "
        "moves. Keep tone factual, not hype. Do not invent specific percentages off. "
        "The intro must make the sale/closeout angle obvious in the first sentence."
    ),
    "production-time": (
        "This is a RUSH PRODUCTION page. Buyers landing here have a tight deadline "
        "and need decorated product in roughly 1-5 business days. Emphasize: fast "
        "turnaround, rush-eligible decoration methods, the kind of events/deadlines "
        "this fits (trade shows in a week, last-minute giveaways, urgent client "
        "thank-yous), and that lead times still depend on artwork approval. The "
        "intro must make the rush/fast-production angle obvious in the first sentence."
    ),
    "eco-friendly": (
        "This is an ECO-FRIENDLY page. Buyers landing here are sustainability-focused "
        "and want products made from recycled, renewable, or otherwise responsibly "
        "sourced materials. Emphasize: recycled content, plant-based or biodegradable "
        "materials, durability that extends product life, and the corporate "
        "sustainability story bulk-printed items can carry. Do not invent specific "
        "certifications. The intro must make the eco angle obvious in the first sentence."
    ),
    "material": (
        "This is a MATERIAL-as-modifier landing variant of the root. Treat it as a "
        "general material-themed entry point into the root category. Emphasize "
        "material selection and what that choice means for buyers."
    ),
}


# ---------------------------------------------------------------------------
# URL → output-filename encoding
# ---------------------------------------------------------------------------

def url_to_filename(url: str) -> str:
    """`/cat/water-bottles/material/stainless-steel` → `water-bottles__material__stainless-steel.json`."""
    s = url
    if s.startswith("/cat/"):
        s = s[len("/cat/"):]
    return s.replace("/", "__") + ".json"


# ---------------------------------------------------------------------------
# Value cleanup helpers (used for keyword + facet description)
# ---------------------------------------------------------------------------

_NUMERIC_UNIT_RE = re.compile(r"^(\d+(?:[.,]\d+)?)[\-_ ]?([a-zA-Z]+)$")

_UNIT_CASING = {
    "oz": "oz",
    "ml": "mL",
    "l": "L",
    "mah": "mAh",
    "in": "in",
    "ft": "ft",
    "cm": "cm",
    "mm": "mm",
    "lbs": "lbs",
    "lb": "lb",
}


def natural_value(raw: str) -> str:
    """Turn a slug-cased facet value into a human-readable phrase.

    Examples:
      stainless-steel  → "Stainless Steel"
      with-carabiner   → "with Carabiner"  (lowercase first if it's a connector)
      26-oz            → "26 oz"
      1500-mah         → "1500 mAh"
      vineyard-vines   → "Vineyard Vines"
      hi-vis           → "Hi Vis"
    """
    if not raw:
        return raw
    m = _NUMERIC_UNIT_RE.match(raw)
    if m:
        num, unit = m.group(1), m.group(2).lower()
        unit_out = _UNIT_CASING.get(unit, unit)
        return f"{num} {unit_out}"

    parts = raw.split("-")
    out: list[str] = []
    connectors = {"with", "for", "and", "or", "the", "of", "a", "an", "to", "in"}
    for i, part in enumerate(parts):
        lower = part.lower()
        # Composite numeric-unit token like "26oz" → split.
        m2 = _NUMERIC_UNIT_RE.match(part)
        if m2:
            num, unit = m2.group(1), m2.group(2).lower()
            out.append(f"{num} {_UNIT_CASING.get(unit, unit)}")
            continue
        if i > 0 and lower in connectors:
            out.append(lower)
        else:
            out.append(part.capitalize() if part else part)
    return " ".join(out)


def natural_root_title(root_slug: str) -> str:
    """Title-Cased root category name from slug."""
    return title_case_from_slug(root_slug)


# ---------------------------------------------------------------------------
# Keyword construction per URL type
# ---------------------------------------------------------------------------

def facet_target_keyword(root_slug: str, facet_type: str, facet_value: str) -> str:
    root_natural = natural_root_title(root_slug).lower()
    value_natural = natural_value(facet_value).lower() if facet_type != "brand" else natural_value(facet_value)
    if facet_type == "brand":
        return f"custom {value_natural} {root_natural}"
    return f"custom {value_natural} {root_natural}"


def compound_target_keyword(root_slug: str, facets: list[dict[str, str]]) -> str:
    root_natural = natural_root_title(root_slug).lower()
    values = [natural_value(f["value"]).lower() for f in facets]
    return f"custom {' '.join(values)} {root_natural}"


def modifier_target_keyword(root_slug: str, modifier: str) -> str:
    root_natural = natural_root_title(root_slug).lower()
    mod_keyword = {
        "no-minimum": "no-minimum custom",
        "closeout": "closeout custom",
        "production-time": "rush custom",
        "eco-friendly": "eco-friendly custom",
        "search": "custom",
        "material": "custom",
    }.get(modifier, "custom")
    return f"{mod_keyword} {root_natural}"


# ---------------------------------------------------------------------------
# Facet description string for the prompt (human-readable)
# ---------------------------------------------------------------------------

def facet_description(facet_type: str, facet_value: str) -> str:
    """E.g. ('material', 'stainless-steel') → 'material = Stainless Steel'."""
    return f"{facet_type.replace('-', ' ')} = {natural_value(facet_value)}"


def compound_facet_description(facets: list[dict[str, str]]) -> str:
    return "; ".join(facet_description(f["type"], f["value"]) for f in facets)


# ---------------------------------------------------------------------------
# SKU lookup for non-root pages (memberships lookup with fallback)
# ---------------------------------------------------------------------------

def membership_skus(url: str, memberships: dict[str, list[str]]) -> list[str]:
    return memberships.get(url, []) or []


def nonroot_top_product_names(
    root_slug: str,
    skus: list[str],
    products_by_sku: dict[str, dict[str, Any]],
    n: int = TOP_PRODUCTS_FOR_NONROOT,
) -> list[str]:
    """Use the existing slug-relevance scorer to surface representative names."""
    return top_product_names(root_slug, skus, products_by_sku, n=n)


# ---------------------------------------------------------------------------
# Validators (one per page type)
# ---------------------------------------------------------------------------

ROOT_REQUIRED = [
    "h1",
    "metaTitle",
    "metaDescription",
    "introHtml",
    "buyingGuideHtml",
    "buyingGuideH2",
    "faqs",
    "heroAltText",
]

NONROOT_REQUIRED = ["h1", "metaTitle", "metaDescription", "introHtml", "heroAltText"]


def validate_root(content: dict[str, Any]) -> list[str]:
    """Same validation as generate_sample_roots.validate_output but inlined to
    keep generate_content self-contained against future drift."""
    errors: list[str] = []
    for key in ROOT_REQUIRED:
        if key not in content:
            errors.append(f"missing key: {key}")
    if errors:
        return errors

    if not 30 <= len(content["h1"]) <= 80:
        errors.append(f"h1 length {len(content['h1'])} out of 30-80")
    if len(content["metaTitle"]) > 60:
        errors.append(f"metaTitle {len(content['metaTitle'])} > 60")
    if len(content["metaDescription"]) > 155:
        errors.append(f"metaDescription {len(content['metaDescription'])} > 155")
    if not isinstance(content["faqs"], list) or len(content["faqs"]) != 5:
        errors.append(f"faqs count {len(content.get('faqs', []))} != 5")
    else:
        for i, faq in enumerate(content["faqs"]):
            if "q" not in faq or "a" not in faq:
                errors.append(f"faq {i} missing q/a")
    if "<p>" not in content["introHtml"]:
        errors.append("introHtml missing <p> tags")

    intro_words = _word_count(content["introHtml"])
    if not 130 <= intro_words <= 280:
        errors.append(f"introHtml word count {intro_words} out of 150-250 (with margin)")

    if "<p>" not in content["buyingGuideHtml"]:
        errors.append("buyingGuideHtml missing <p> tags")
    guide_words = _word_count(content["buyingGuideHtml"])
    if not 370 <= guide_words <= 650:
        errors.append(f"buyingGuideHtml word count {guide_words} out of 400-600 (with margin)")

    kw_hits = count_keyword_derivatives(content["buyingGuideHtml"])
    if kw_hits < 5:
        errors.append(f"buyingGuideHtml keyword derivatives {kw_hits} < 5")

    if not isinstance(content.get("buyingGuideH2"), str) or not content["buyingGuideH2"].strip():
        errors.append("buyingGuideH2 empty")
    return errors


def validate_nonroot(content: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in NONROOT_REQUIRED:
        if key not in content:
            errors.append(f"missing key: {key}")
    if errors:
        return errors

    if not 30 <= len(content["h1"]) <= 80:
        errors.append(f"h1 length {len(content['h1'])} out of 30-80")
    if len(content["metaTitle"]) > 60:
        errors.append(f"metaTitle {len(content['metaTitle'])} > 60")
    if len(content["metaDescription"]) > 155:
        errors.append(f"metaDescription {len(content['metaDescription'])} > 155")
    if "<p>" not in content["introHtml"]:
        errors.append("introHtml missing <p> tags")
    intro_words = _word_count(content["introHtml"])
    if not 40 <= intro_words <= 110:
        errors.append(f"introHtml word count {intro_words} out of 60-80 (with margin)")
    if not 40 <= len(content["heroAltText"]) <= 140:
        errors.append(f"heroAltText length {len(content['heroAltText'])} out of 60-120 (with margin)")
    return errors


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

def write_root_output(
    entry: dict[str, Any],
    content: dict[str, Any],
    opening_style: str,
) -> Path:
    out_path = OUTPUT_DIR / url_to_filename(entry["url"])
    persisted_skus = sorted(entry["filteredSkus"])
    doc = {
        "url": entry["url"],
        "type": "root",
        "h1": content["h1"],
        "metaTitle": content["metaTitle"],
        "metaDescription": content["metaDescription"],
        "introHtml": content["introHtml"],
        "buyingGuideHtml": content.get("buyingGuideHtml"),
        "buyingGuideH2": content.get("buyingGuideH2"),
        "faqs": content["faqs"],
        "heroAltText": content["heroAltText"],
        "productSkus": persisted_skus,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "deepseek-chat",
        "promptVersion": PROMPT_VERSION_ROOT,
        "openingStyle": opening_style,
        "skuFilterMode": entry["skuFilterMode"],
        "rawSkuCount": entry["rawSkuCount"],
        "filteredSkuCount": entry["filteredSkuCount"],
    }
    out_path.write_bytes(orjson.dumps(doc, option=orjson.OPT_INDENT_2))
    return out_path


def write_nonroot_output(
    url: str,
    page_type: str,
    content: dict[str, Any],
    raw_skus: list[str],
    persisted_skus: list[str],
    prompt_version: str,
) -> Path:
    out_path = OUTPUT_DIR / url_to_filename(url)
    doc = {
        "url": url,
        "type": page_type,
        "h1": content["h1"],
        "metaTitle": content["metaTitle"],
        "metaDescription": content["metaDescription"],
        "introHtml": content["introHtml"],
        "buyingGuideHtml": None,
        "buyingGuideH2": None,
        "faqs": [],
        "heroAltText": content["heroAltText"],
        "productSkus": persisted_skus,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "deepseek-chat",
        "promptVersion": prompt_version,
        "skuFilterMode": "membership",
        "rawSkuCount": len(raw_skus),
        "filteredSkuCount": len(persisted_skus),
    }
    out_path.write_bytes(orjson.dumps(doc, option=orjson.OPT_INDENT_2))
    return out_path


# ---------------------------------------------------------------------------
# Root entry builder (covers all 465 roots)
# ---------------------------------------------------------------------------

def build_root_entries(
    urls: list[dict[str, Any]],
    mappings: dict[str, dict[str, Any]],
    products: list[dict[str, Any]],
    products_by_sku: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build a list of root entries shaped like generate_sample_roots' selected list.

    Unlike the sample script we keep ALL roots (no dedupe by Geiger path) so the
    full 465-page set covers every URL. apply_sku_filter decorates each entry
    with filteredSkus/filteredSkuCount/skuFilterMode."""
    path_to_skus = build_path_to_skus(products)
    entries: list[dict[str, Any]] = []
    for u in urls:
        if u.get("type") != "root":
            continue
        slug = u["rootSlug"]
        mp = mappings.get(slug)
        if not mp:
            logger.warning("root %s has no mapping; using empty SKU set", slug)
            entries.append({
                "url": u["url"],
                "rootSlug": slug,
                "geigerCategoryPath": "",
                "matchType": "none",
                "productCount": 0,
                "skus": [],
            })
            continue
        path = mp["geigerCategoryPath"]
        sku_set = skus_for_subtree(path, path_to_skus)
        entries.append({
            "url": u["url"],
            "rootSlug": slug,
            "geigerCategoryPath": path,
            "matchType": mp["matchType"],
            "productCount": len(sku_set),
            "skus": sorted(sku_set),
        })
    apply_sku_filter(entries, products_by_sku)
    return entries


def assign_opening_styles_all(slugs: list[str]) -> dict[str, str]:
    """Spread the 30/30/30/10 opening-style quotas across the full root set."""
    n = len(slugs)
    quotas = OPENING_STYLE_QUOTAS
    total = sum(quotas.values())
    pool: list[str] = []
    for style, count in quotas.items():
        share = round(count / total * n)
        pool.extend([style] * share)
    while len(pool) < n:
        pool.append("use_case")
    pool = pool[:n]
    seed_int = int(hashlib.sha256(b"pi-roots-full").hexdigest(), 16) % (2**32)
    rng = random.Random(seed_int)
    rng.shuffle(pool)
    return dict(zip(sorted(slugs), pool))


# ---------------------------------------------------------------------------
# Prompt context builders for non-root URLs
# ---------------------------------------------------------------------------

def build_facet_context(
    url: dict[str, Any],
    skus: list[str],
    products_by_sku: dict[str, dict[str, Any]],
) -> dict[str, str]:
    root_slug = url["rootSlug"]
    if url["type"] == "compound-facet":
        facets = url["facets"]
        desc = compound_facet_description(facets)
        keyword = compound_target_keyword(root_slug, facets)
    else:
        desc = facet_description(url["facetType"], url["facetValue"])
        keyword = facet_target_keyword(root_slug, url["facetType"], url["facetValue"])

    return {
        "url": url["url"],
        "root_category_title": natural_root_title(root_slug),
        "facet_description": desc,
        "target_keyword": keyword,
        "buyer_persona": BUYER_PERSONA,
        "top_product_names": "\n".join(
            f"- {n}"
            for n in nonroot_top_product_names(root_slug, skus, products_by_sku)
        ),
    }


def build_modifier_context(
    url: dict[str, Any],
    skus: list[str],
    products_by_sku: dict[str, dict[str, Any]],
) -> dict[str, str]:
    root_slug = url["rootSlug"]
    modifier = url["modifier"]
    instruction = MODIFIER_INSTRUCTIONS.get(modifier, MODIFIER_INSTRUCTIONS["search"])
    return {
        "url": url["url"],
        "root_category_title": natural_root_title(root_slug),
        "modifier_type": modifier,
        "modifier_instruction": instruction,
        "target_keyword": modifier_target_keyword(root_slug, modifier),
        "buyer_persona": BUYER_PERSONA,
        "top_product_names": "\n".join(
            f"- {n}"
            for n in nonroot_top_product_names(root_slug, skus, products_by_sku)
        ),
    }


# ---------------------------------------------------------------------------
# Failure log
# ---------------------------------------------------------------------------

def append_failure(url: str, reason: str) -> None:
    FAILURES_LOG.parent.mkdir(parents=True, exist_ok=True)
    with FAILURES_LOG.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat()}\t{url}\t{reason[:300]}\n")


def read_failure_urls() -> set[str]:
    if not FAILURES_LOG.exists():
        return set()
    urls: set[str] = set()
    with FAILURES_LOG.open("r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                urls.add(parts[1])
    return urls


# ---------------------------------------------------------------------------
# Main driver
# ---------------------------------------------------------------------------

def filter_by_type(urls: list[dict[str, Any]], types: set[str]) -> list[dict[str, Any]]:
    return [u for u in urls if u.get("type") in types]


def process_root(
    entry: dict[str, Any],
    template: str,
    style: str,
    products_by_sku: dict[str, dict[str, Any]],
    client: DeepSeekClient | None,
    dry_run: bool,
    show_prompt: bool,
) -> tuple[str, GenerationResult | None, list[str]]:
    """Returns (status, result, errors). status is 'ok' | 'fail' | 'dry'."""
    ctx = build_root_prompt_context(entry, style, products_by_sku)
    sys_p, usr_p = render_prompt(template, ctx)
    if show_prompt:
        _print_prompt(entry["url"], f"root style={style}", sys_p, usr_p)
    if dry_run:
        return "dry", None, []

    try:
        result = client.generate(sys_p, usr_p, temperature=0.65)
    except DeepSeekError as exc:
        return "fail", None, [str(exc)]

    post_process_lengths(result.content)
    errors = validate_root(result.content)
    write_root_output(entry, result.content, style)
    return "ok", result, errors


def process_nonroot(
    url: dict[str, Any],
    template: str,
    memberships: dict[str, list[str]],
    products_by_sku: dict[str, dict[str, Any]],
    client: DeepSeekClient | None,
    dry_run: bool,
    show_prompt: bool,
) -> tuple[str, GenerationResult | None, list[str]]:
    raw_skus = membership_skus(url["url"], memberships)
    if url["type"] in ("facet", "compound-facet"):
        ctx = build_facet_context(url, raw_skus, products_by_sku)
        prompt_version = PROMPT_VERSION_FACET if url["type"] == "facet" else PROMPT_VERSION_COMPOUND
        page_type = url["type"]
    elif url["type"] == "modifier":
        ctx = build_modifier_context(url, raw_skus, products_by_sku)
        prompt_version = PROMPT_VERSION_MODIFIER
        page_type = "modifier"
    else:
        return "fail", None, [f"unknown type {url['type']}"]

    sys_p, usr_p = render_prompt(template, ctx)
    if show_prompt:
        _print_prompt(url["url"], page_type, sys_p, usr_p)
    if dry_run:
        return "dry", None, []

    try:
        result = client.generate(sys_p, usr_p, temperature=0.7, max_tokens=900)
    except DeepSeekError as exc:
        return "fail", None, [str(exc)]

    post_process_lengths(result.content)
    errors = validate_nonroot(result.content)

    persisted_skus = sorted(raw_skus)[:NONROOT_SKU_PERSIST_CAP]
    write_nonroot_output(
        url["url"], page_type, result.content, raw_skus, persisted_skus, prompt_version
    )
    return "ok", result, errors


def _print_prompt(url: str, label: str, sys_p: str, usr_p: str) -> None:
    print("\n" + "=" * 80)
    print(f"PROMPT FOR {url} ({label})")
    print("=" * 80)
    print("---- SYSTEM ----")
    print(sys_p)
    print("---- USER ----")
    print(usr_p)
    print()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--types",
        default="root,modifier,facet,compound-facet",
        help="Comma-separated URL types to process (default: all).",
    )
    parser.add_argument("--dry-run", action="store_true", help="No API calls.")
    parser.add_argument("--limit", type=int, default=None, help="Cap pages processed.")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip URLs whose output JSON already exists.",
    )
    parser.add_argument(
        "--show-prompts",
        type=int,
        default=0,
        help="Print first N rendered prompts (uses dry-run-style preview).",
    )
    parser.add_argument(
        "--retry-failures",
        action="store_true",
        help="Process only URLs listed in .failures.log; clears the log on start.",
    )
    parser.add_argument(
        "--cost-report-every",
        type=int,
        default=100,
        help="Print a cumulative cost report every N successful calls.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Parallel API requests. DeepSeek tolerates ~8 comfortably; default 1.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    types = {t.strip() for t in args.types.split(",") if t.strip()}
    valid_types = {"root", "modifier", "facet", "compound-facet"}
    invalid = types - valid_types
    if invalid:
        parser.error(f"unknown types: {invalid}")

    logger.info("Loading data...")
    urls_doc = _load_json(URLS_PATH)
    urls = urls_doc["urls"]
    mappings = _load_json(MAPPINGS_PATH)["mappings"]
    products = _load_json(PRODUCTS_PATH)["products"]
    products_by_sku = {p["sku"]: p for p in products if p.get("sku")}
    memberships = _load_json(MEMBERSHIPS_PATH)["memberships"]
    logger.info(
        "Loaded urls=%d mappings=%d products=%d memberships=%d",
        len(urls), len(mappings), len(products), len(memberships),
    )

    if args.retry_failures:
        failure_urls = read_failure_urls()
        if not failure_urls:
            logger.info("No failures to retry.")
            return 0
        urls = [u for u in urls if u["url"] in failure_urls]
        logger.info("Retrying %d failed URLs from .failures.log", len(urls))
        # Wipe the log so we can rewrite only what still fails.
        FAILURES_LOG.unlink(missing_ok=True)
    else:
        urls = filter_by_type(urls, types)

    if args.skip_existing:
        before = len(urls)
        urls = [u for u in urls if not (OUTPUT_DIR / url_to_filename(u["url"])).exists()]
        logger.info("Skipped %d existing outputs; %d remain", before - len(urls), len(urls))

    if args.limit:
        urls = urls[: args.limit]
        logger.info("--limit %d -> processing first %d", args.limit, len(urls))

    if not urls:
        logger.info("Nothing to do.")
        return 0

    # Load templates lazily.
    root_template = (PROMPTS_DIR / "root_category.txt").read_text(encoding="utf-8")
    modifier_template = (PROMPTS_DIR / "modifier_category.txt").read_text(encoding="utf-8")
    facet_template = (PROMPTS_DIR / "facet_category.txt").read_text(encoding="utf-8")

    # Build root entries up front; we need apply_sku_filter context.
    root_urls = [u for u in urls if u["type"] == "root"]
    root_entries_all = (
        build_root_entries(urls_doc["urls"], mappings, products, products_by_sku)
        if root_urls else []
    )
    root_entries_by_slug = {e["rootSlug"]: e for e in root_entries_all}

    # Assign opening styles across the FULL root set deterministically.
    style_by_slug = assign_opening_styles_all(list(root_entries_by_slug.keys()))

    # Run.
    calls = 0
    failures = 0
    validation_warnings = 0
    total_in = 0
    total_out = 0
    total_cents = 0.0
    wall_start = time.perf_counter()
    show_remaining = args.show_prompts

    client_ctx = DeepSeekClient(dry_run=args.dry_run) if not args.dry_run else None
    state_lock = threading.Lock()

    def _do_one(idx: int, url: dict[str, Any], show: bool):
        try:
            if url["type"] == "root":
                entry = root_entries_by_slug.get(url["rootSlug"])
                if entry is None:
                    return "fail", None, ["no root entry built"]
                style = style_by_slug.get(url["rootSlug"], "use_case")
                return process_root(
                    entry, root_template, style, products_by_sku,
                    client_ctx, args.dry_run, show,
                )
            template = modifier_template if url["type"] == "modifier" else facet_template
            return process_nonroot(
                url, template, memberships, products_by_sku,
                client_ctx, args.dry_run, show,
            )
        except Exception as exc:  # noqa: BLE001 — keep batch running
            logger.exception("[fail] %s: unexpected", url["url"])
            return "fail", None, [f"unexpected: {exc}"]

    def _record(idx: int, url: dict[str, Any], status: str, result, errors):
        nonlocal calls, failures, validation_warnings, total_in, total_out, total_cents
        if status == "fail":
            msg = "; ".join(errors) or "unknown"
            logger.error("[fail %d/%d] %s: %s", idx, len(urls), url["url"], msg[:200])
            append_failure(url["url"], msg)
            failures += 1
            return
        if status == "dry":
            return
        calls += 1
        total_in += result.tokens_in
        total_out += result.tokens_out
        total_cents += result.cost_cents
        if errors:
            validation_warnings += 1
            logger.warning("[validation] %s: %s", url["url"], "; ".join(errors))
        logger.info(
            "[ok %d/%d] %s | %dms in=%d out=%d $%.4f",
            idx, len(urls), url["url"], result.duration_ms,
            result.tokens_in, result.tokens_out, result.cost_cents / 100,
        )
        if args.cost_report_every and calls % args.cost_report_every == 0:
            elapsed = time.perf_counter() - wall_start
            logger.info(
                "--- progress: %d ok, %d fail, %d warn | $%.4f | %.1fs ---",
                calls, failures, validation_warnings, total_cents / 100, elapsed,
            )

    try:
        if client_ctx:
            client_ctx.__enter__()

        if args.concurrency <= 1:
            for i, url in enumerate(urls, 1):
                show = show_remaining > 0
                if show:
                    show_remaining -= 1
                status, result, errors = _do_one(i, url, show)
                _record(i, url, status, result, errors)
        else:
            with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                # show_prompts is incompatible with parallelism (interleaved output);
                # disable it under concurrency.
                if show_remaining > 0:
                    logger.warning("--show-prompts ignored under --concurrency > 1")

                future_to_meta = {
                    pool.submit(_do_one, i, url, False): (i, url)
                    for i, url in enumerate(urls, 1)
                }
                for fut in as_completed(future_to_meta):
                    i, url = future_to_meta[fut]
                    try:
                        status, result, errors = fut.result()
                    except Exception as exc:  # noqa: BLE001
                        status, result, errors = "fail", None, [f"future exc: {exc}"]
                    with state_lock:
                        _record(i, url, status, result, errors)
    finally:
        if client_ctx:
            client_ctx.__exit__(None, None, None)

    wall = time.perf_counter() - wall_start
    print("\n" + "=" * 60)
    print("RUN SUMMARY")
    print("=" * 60)
    print(f"Processed:        {len(urls)}")
    print(f"Calls:            {calls}")
    print(f"Failures:         {failures}")
    print(f"Validation warns: {validation_warnings}")
    print(f"Total tokens in:  {total_in:,}")
    print(f"Total tokens out: {total_out:,}")
    print(f"Total cost:       ${total_cents / 100:.4f}")
    if calls:
        print(f"Avg per page:     ${(total_cents / 100 / calls):.5f}")
    print(f"Wall time:        {wall:.1f}s")
    if failures:
        print(f"\nFailures appended to {FAILURES_LOG}; retry with --retry-failures.")

    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
