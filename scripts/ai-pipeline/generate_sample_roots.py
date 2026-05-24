"""Generate the top-35 root category sample for the Week 2 client demo.

Selects the top 35 PI root categories by Geiger product count (deduped by
mapped Geiger path so the demo shows 35 *distinct* category pages, not 17
identical ones backed by the same parent department), then renders the
root_category.txt prompt and writes the result to data/categories/<slug>.json.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import logging
import random
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import orjson

from deepseek_client import DeepSeekClient, DeepSeekError, GenerationResult

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
PROMPTS_DIR = Path(__file__).parent / "prompts"
OUTPUT_DIR = DATA_DIR / "categories"

URLS_PATH = DATA_DIR / "pi-urls" / "category-urls.json"
MAPPINGS_PATH = DATA_DIR / "mappings" / "pi-to-geiger.json"
PRODUCTS_PATH = DATA_DIR / "geiger" / "products.json"

PROMPT_VERSION = "root-v1"
TOP_N_DEFAULT = 35
TOP_PRODUCTS_PER_CATEGORY = 15
BUYER_PERSONA = (
    "marketing directors, HR directors, safety managers, business owners"
)

# Slugs Ali rejected after Pause Points 1 & 2: bad fuzzy mappings, PI admin
# artifacts, or filter-to-near-zero pages that would render an empty grid.
EXCLUDED_SLUGS: set[str] = {
    # Pause Point 1
    "tape-dispensers",
    "mylar-exit-barrier-bags",
    "arm-sleeves",
    "bath-body-gifts",
    "child-infant-products",
    # Pause Point 2
    "excluded-products",
    "banners-mats-signs",
    "binoculars",
    "health",
    "pens",
    "medical-healthcare-items",
}

# Filter rule (Pause Point 1 → Ali): when a PI root is mapped via override
# to a shallow Geiger department (depth < 3), the persisted productSkus drown
# in unrelated items. Filter by slug-token relevance: keep all SKUs scoring
# above the median, capped at SKU_FILTER_MAX.
SKU_FILTER_MAX = 200
SKU_FILTER_DEPTH_THRESHOLD = 3

# Floor rule (Pause Point 2 → Ali): if slug-token filtering yields fewer than
# this many SKUs, fall back to the raw set capped at SKU_FALLBACK_CAP so the
# page renders a visually full grid instead of a near-empty one.
SKU_FILTER_FLOOR = 30
SKU_FALLBACK_CAP = 60

OPENING_STYLE_INSTRUCTIONS = {
    "use_case": (
        "Open with two or three concrete buyer scenarios where this category fits "
        "(corporate events, trade show giveaways, employee onboarding kits, "
        "conference swag, customer thank-you gifts, safety programs, fundraisers). "
        "Lead with the scenario, then connect it to what's in the category."
    ),
    "buyer": (
        "Open by addressing one of the buyer personas directly and what they're "
        "trying to accomplish when they shop this category. Be concrete about the "
        "pain point or goal before describing the products."
    ),
    "material_quality": (
        "Open with the construction, materials, or durability angle. Talk about "
        "what these products are made from, why that matters for bulk orders, and "
        "how it affects decoration and longevity."
    ),
    "seasonal": (
        "Open with a timing or seasonal angle (rush gift orders, back-to-school "
        "kits, holiday giveaways, summer outdoor events, conference season, year-end "
        "appreciation). Connect the timing to product selection."
    ),
}

# Distribution: 30/30/30/10 across 35 items = 11/11/10/3 (= 35).
OPENING_STYLE_QUOTAS = {
    "use_case": 11,
    "buyer": 11,
    "material_quality": 10,
    "seasonal": 3,
}

logger = logging.getLogger("generate_sample_roots")


def _load_json(path: Path) -> Any:
    with path.open("rb") as f:
        return orjson.loads(f.read())


def title_case_from_slug(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.split("-"))


def build_path_to_skus(products: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Map Geiger category path -> SKU set, including all descendants of that path."""
    path_to_skus: dict[str, set[str]] = defaultdict(set)
    for p in products:
        sku = p.get("sku")
        if not sku:
            continue
        for cp in p.get("category_paths") or []:
            path_to_skus[cp].add(sku)
    return path_to_skus


def skus_for_subtree(target_path: str, path_to_skus: dict[str, set[str]]) -> set[str]:
    """Union SKUs across the target path and any path nested below it."""
    prefix = target_path + " > "
    result: set[str] = set()
    for path, skus in path_to_skus.items():
        if path == target_path or path.startswith(prefix):
            result.update(skus)
    return result


def match_type_rank(mt: str) -> int:
    return {"exact": 0, "fuzzy": 1, "override": 2}.get(mt, 3)


def select_top_roots(
    roots: list[dict[str, Any]],
    mappings: dict[str, dict[str, Any]],
    products: list[dict[str, Any]],
    top_n: int,
    excluded: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Pick top_n PI root categories by Geiger product count, deduped by Geiger path.

    `excluded` slugs are skipped; we then take the next-ranked candidates to
    backfill so the result is still top_n entries.
    """
    excluded = excluded or set()
    path_to_skus = build_path_to_skus(products)
    # path -> list of (rank, slug) candidates
    path_candidates: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
    for r in roots:
        slug = r["rootSlug"]
        mp = mappings.get(slug)
        if not mp:
            continue
        path = mp["geigerCategoryPath"]
        # Prefer slugs whose own slug matches the geigerSlug exactly.
        slug_match_rank = 0 if slug == mp.get("geigerSlug") else 1
        path_candidates[path].append((match_type_rank(mp["matchType"]), slug_match_rank, slug))

    selected: list[dict[str, Any]] = []
    for path, cands in path_candidates.items():
        # First valid (non-excluded) candidate by match-type rank, slug-match, alpha.
        cands.sort()
        best_slug = next((c[2] for c in cands if c[2] not in excluded), None)
        if best_slug is None:
            continue
        sku_set = skus_for_subtree(path, path_to_skus)
        selected.append(
            {
                "rootSlug": best_slug,
                "geigerCategoryPath": path,
                "matchType": mappings[best_slug]["matchType"],
                "productCount": len(sku_set),
                "skus": sorted(sku_set),
            }
        )

    selected.sort(key=lambda s: (-s["productCount"], s["rootSlug"]))
    return selected[:top_n]


def assign_opening_styles(slugs: list[str], quotas: dict[str, int]) -> dict[str, str]:
    """Deterministically assign opening styles to slugs using a seeded shuffle."""
    pool: list[str] = []
    for style, count in quotas.items():
        pool.extend([style] * count)
    if len(pool) != len(slugs):
        # If top_n differs from 35, distribute proportionally and pad with use_case.
        scale = len(slugs) / sum(quotas.values())
        pool = []
        for style, count in quotas.items():
            pool.extend([style] * max(1, round(count * scale)))
        while len(pool) < len(slugs):
            pool.append("use_case")
        pool = pool[: len(slugs)]

    seed_int = int(hashlib.sha256(b"pi-sample-roots-v1").hexdigest(), 16) % (2**32)
    rng = random.Random(seed_int)
    rng.shuffle(pool)
    return dict(zip(sorted(slugs), pool))


def render_prompt(template: str, variables: dict[str, str]) -> tuple[str, str]:
    """Split SYSTEM:/USER: sections and substitute {{ var }} placeholders."""
    out = template
    for key, value in variables.items():
        out = out.replace("{{ " + key + " }}", value)

    # Split into system and user sections.
    m = re.search(r"(?ms)^SYSTEM:\s*(.+?)^USER:\s*(.+)$", out)
    if not m:
        raise ValueError("Prompt template missing SYSTEM:/USER: markers")
    system_prompt = m.group(1).strip()
    user_prompt = m.group(2).strip()
    return system_prompt, user_prompt


_STOPWORDS = {"and", "or", "the", "for", "with", "of", "in", "a", "an"}


def _slug_tokens(slug: str) -> set[str]:
    """Tokenize a slug into meaningful lowercase words for relevance scoring."""
    raw = re.split(r"[\s\-_/&]+", slug.lower())
    return {t for t in raw if t and t not in _STOPWORDS and len(t) > 1}


def geiger_path_depth(path: str) -> int:
    """Depth = number of ' > ' separators. 'Home > A' → 1, 'Home > A > B' → 2."""
    return path.count(" > ")


def should_filter_skus(entry: dict[str, Any]) -> bool:
    """Apply slug-relevance filtering only when the mapping is an override into
    a shallow Geiger department (depth < SKU_FILTER_DEPTH_THRESHOLD).
    Exact and fuzzy matches are trusted as-is.
    """
    return (
        entry["matchType"] == "override"
        and geiger_path_depth(entry["geigerCategoryPath"]) < SKU_FILTER_DEPTH_THRESHOLD
    )


def filter_skus_by_slug_relevance(
    category_slug: str,
    candidate_skus: list[str],
    products_by_sku: dict[str, dict[str, Any]],
    max_keep: int = SKU_FILTER_MAX,
) -> list[str]:
    """Score each SKU by slug-token overlap with the product name, keep all
    SKUs scoring above the median, cap to max_keep.
    """
    slug_tokens = _slug_tokens(category_slug)
    if not slug_tokens:
        return candidate_skus[:max_keep]

    scored: list[tuple[int, int, str]] = []  # (-score, length, sku)
    for sku in candidate_skus:
        prod = products_by_sku.get(sku)
        if not prod:
            continue
        name = html.unescape((prod.get("name") or "")).lower()
        score = sum(1 for t in slug_tokens if t in name)
        scored.append((-score, len(name), sku))

    if not scored:
        return []

    # Median of raw scores (not negated). With many irrelevant SKUs the median
    # is often 0, so "above median" effectively means "any token match".
    raw_scores = sorted(-s[0] for s in scored)
    mid = raw_scores[len(raw_scores) // 2]
    above = [s for s in scored if -s[0] > mid]

    # If every SKU shares the same score (e.g. all 0 or all 1), "above median"
    # filters everything out. Fall back to keeping top-scored SKUs (which is
    # still useful — it sorts by name length asc as a stability tiebreaker).
    if not above:
        above = scored

    above.sort()
    return [s[2] for s in above[:max_keep]]


def apply_sku_filter(
    entries: list[dict[str, Any]],
    products_by_sku: dict[str, dict[str, Any]],
) -> None:
    """Decorate each entry with rawSkuCount, filteredSkus, filteredSkuCount,
    skuFilterMode.

    Modes:
    - "full": no filtering applied (matchType != override OR Geiger path deep)
    - "slug-filtered": slug-token relevance filter kept >= SKU_FILTER_FLOOR
    - "full-capped-60": filter would have left < SKU_FILTER_FLOOR; we fall back
      to the raw set capped at SKU_FALLBACK_CAP so the page renders a full grid
    """
    for entry in entries:
        raw = entry["skus"]
        entry["rawSkuCount"] = len(raw)
        if not should_filter_skus(entry):
            entry["filteredSkus"] = raw
            entry["filteredSkuCount"] = len(raw)
            entry["skuFilterMode"] = "full"
            continue
        filtered = filter_skus_by_slug_relevance(
            entry["rootSlug"], raw, products_by_sku
        )
        if len(filtered) >= SKU_FILTER_FLOOR:
            entry["filteredSkus"] = filtered
            entry["filteredSkuCount"] = len(filtered)
            entry["skuFilterMode"] = "slug-filtered"
        else:
            capped = raw[:SKU_FALLBACK_CAP]
            entry["filteredSkus"] = capped
            entry["filteredSkuCount"] = len(capped)
            entry["skuFilterMode"] = "full-capped-60"


def top_product_names(
    category_slug: str,
    selected_skus: list[str],
    products_by_sku: dict[str, dict[str, Any]],
    n: int = TOP_PRODUCTS_PER_CATEGORY,
) -> list[str]:
    """Pick representative product names, scored by relevance to the category slug.

    PI-to-Geiger mappings often point root slugs at broad parent departments
    (e.g. `business-card-holders` → `Home > Office & Technology`), so a naive
    "first 15" pull surfaces unrelated SKUs. We score each candidate by the
    number of slug tokens that appear in the product name and prefer matches.
    """
    slug_tokens = _slug_tokens(category_slug)
    scored: list[tuple[int, int, str]] = []  # (-score, length, name)
    seen: set[str] = set()
    for sku in selected_skus:
        prod = products_by_sku.get(sku)
        if not prod:
            continue
        name = html.unescape((prod.get("name") or "").strip())
        if not name or name in seen:
            continue
        seen.add(name)
        name_lower = name.lower()
        score = sum(1 for t in slug_tokens if t in name_lower)
        scored.append((-score, len(name), name))

    scored.sort()
    relevant = [s[2] for s in scored if s[0] < 0]
    if len(relevant) >= 3:
        return relevant[:n]
    # Fallback: not enough name-matches — return shortest names from the pool.
    return [s[2] for s in scored][:n]


def build_context(
    entry: dict[str, Any],
    opening_style: str,
    products_by_sku: dict[str, dict[str, Any]],
) -> dict[str, str]:
    title = title_case_from_slug(entry["rootSlug"])
    # Pull names from the filtered SKU list when filtering is active — that
    # subset is the most on-topic anchor for the AI prompt.
    name_source_skus = entry.get("filteredSkus") or entry["skus"]
    return {
        "category_title": title,
        "category_slug": entry["rootSlug"],
        "target_keyword_plural": f"custom {title.lower()}",
        "top_product_names": "\n".join(
            f"- {n}"
            for n in top_product_names(entry["rootSlug"], name_source_skus, products_by_sku)
        ),
        "buyer_persona": BUYER_PERSONA,
        "opening_style": opening_style,
        "opening_style_instruction": OPENING_STYLE_INSTRUCTIONS[opening_style],
    }


def _safe_truncate(s: str, limit: int) -> str:
    """Trim to <= limit at the last word boundary. Used for meta fields where
    the model occasionally overshoots SEO caps by a few characters."""
    if len(s) <= limit:
        return s
    cut = s[:limit].rstrip()
    sp = cut.rfind(" ")
    if sp > limit - 20:
        cut = cut[:sp].rstrip()
    # Drop trailing punctuation that looks orphaned after the cut.
    return cut.rstrip(",;:-")


def post_process_lengths(content: dict[str, Any]) -> list[str]:
    """Mutate metaTitle/metaDescription to fit SEO caps. Returns list of
    fields that were truncated for audit logging."""
    fixed: list[str] = []
    if isinstance(content.get("metaTitle"), str) and len(content["metaTitle"]) > 60:
        content["metaTitle"] = _safe_truncate(content["metaTitle"], 60)
        fixed.append("metaTitle")
    if (
        isinstance(content.get("metaDescription"), str)
        and len(content["metaDescription"]) > 155
    ):
        content["metaDescription"] = _safe_truncate(content["metaDescription"], 155)
        fixed.append("metaDescription")
    return fixed


def validate_output(content: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = ["h1", "metaTitle", "metaDescription", "introHtml", "faqs", "heroAltText"]
    for key in required:
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
    return errors


def write_output(
    entry: dict[str, Any],
    content: dict[str, Any],
    opening_style: str,
) -> Path:
    out_path = OUTPUT_DIR / f"{entry['rootSlug']}.json"
    persisted_skus = sorted(entry["filteredSkus"])
    doc = {
        "url": f"/cat/{entry['rootSlug']}",
        "type": "root",
        "h1": content["h1"],
        "metaTitle": content["metaTitle"],
        "metaDescription": content["metaDescription"],
        "introHtml": content["introHtml"],
        "faqs": content["faqs"],
        "heroAltText": content["heroAltText"],
        "productSkus": persisted_skus,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "deepseek-chat",
        "promptVersion": PROMPT_VERSION,
        "openingStyle": opening_style,
        "skuFilterMode": entry["skuFilterMode"],
        "rawSkuCount": entry["rawSkuCount"],
        "filteredSkuCount": entry["filteredSkuCount"],
    }
    out_path.write_bytes(orjson.dumps(doc, option=orjson.OPT_INDENT_2))
    return out_path


def print_selection_table(selected: list[dict[str, Any]]) -> None:
    print(f"\nSelected top {len(selected)} root categories (deduped by Geiger path):")
    print(
        f"{'rank':>4}  {'slug':<28}  {'raw':>5}  {'kept':>5}  "
        f"{'mode':<14}  {'match':<8}  geiger_path"
    )
    print("-" * 130)
    for i, e in enumerate(selected, 1):
        print(
            f"{i:>4}  {e['rootSlug']:<28}  {e['rawSkuCount']:>5}  "
            f"{e['filteredSkuCount']:>5}  {e['skuFilterMode']:<14}  "
            f"{e['matchType']:<8}  {e['geigerCategoryPath']}"
        )
    print()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="No API calls; print prompts.")
    parser.add_argument(
        "--limit", type=int, default=None, help="Only generate first N (after selection)."
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip slugs that already have a JSON file in data/categories/.",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=TOP_N_DEFAULT,
        help=f"Number of root categories to select (default {TOP_N_DEFAULT}).",
    )
    parser.add_argument(
        "--show-prompts",
        type=int,
        default=0,
        help="In dry-run, print N rendered prompts (default 0).",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Loading data files...")
    urls = _load_json(URLS_PATH)["urls"]
    mappings = _load_json(MAPPINGS_PATH)["mappings"]
    products = _load_json(PRODUCTS_PATH)["products"]
    products_by_sku = {p["sku"]: p for p in products if p.get("sku")}

    roots = [u for u in urls if u.get("type") == "root"]
    logger.info(
        "Loaded %d roots, %d mappings, %d products", len(roots), len(mappings), len(products)
    )

    selected = select_top_roots(
        roots, mappings, products, args.top_n, excluded=EXCLUDED_SLUGS
    )
    apply_sku_filter(selected, products_by_sku)
    print_selection_table(selected)
    if EXCLUDED_SLUGS:
        print(f"Excluded slugs (backfilled with next-ranked): {sorted(EXCLUDED_SLUGS)}\n")

    if args.limit:
        selected = selected[: args.limit]
        print(f"--limit {args.limit} -> generating first {len(selected)}.\n")

    template = (PROMPTS_DIR / "root_category.txt").read_text(encoding="utf-8")
    style_by_slug = assign_opening_styles(
        [e["rootSlug"] for e in selected], OPENING_STYLE_QUOTAS
    )

    # Optionally print a few rendered prompts in dry-run.
    if args.dry_run and args.show_prompts > 0:
        for entry in selected[: args.show_prompts]:
            style = style_by_slug[entry["rootSlug"]]
            ctx = build_context(entry, style, products_by_sku)
            sys_p, usr_p = render_prompt(template, ctx)
            print("\n" + "=" * 80)
            print(f"PROMPT FOR /cat/{entry['rootSlug']} (style={style})")
            print("=" * 80)
            print("---- SYSTEM ----")
            print(sys_p)
            print("---- USER ----")
            print(usr_p)
            print()

    if args.dry_run:
        logger.info("dry-run: no API calls made.")
        return 0

    total_in = 0
    total_out = 0
    total_cents = 0.0
    calls = 0
    failures: list[tuple[str, str]] = []
    wall_start = time.perf_counter()

    with DeepSeekClient() as client:
        for entry in selected:
            slug = entry["rootSlug"]
            out_path = OUTPUT_DIR / f"{slug}.json"
            if args.resume and out_path.exists():
                logger.info("[skip] %s (already exists)", slug)
                continue

            style = style_by_slug[slug]
            ctx = build_context(entry, style, products_by_sku)
            sys_p, usr_p = render_prompt(template, ctx)

            try:
                result: GenerationResult = client.generate(sys_p, usr_p)
            except DeepSeekError as exc:
                logger.error("[fail] %s: %s", slug, exc)
                failures.append((slug, str(exc)))
                continue

            truncated = post_process_lengths(result.content)
            if truncated:
                logger.info("[truncated] %s: %s", slug, ",".join(truncated))
            errors = validate_output(result.content)
            if errors:
                logger.warning("[validation] %s: %s", slug, "; ".join(errors))

            written = write_output(entry, result.content, style)
            calls += 1
            total_in += result.tokens_in
            total_out += result.tokens_out
            total_cents += result.cost_cents
            logger.info(
                "[ok %d/%d] %s (style=%s) -> %s | %dms in=%d out=%d $%.4f",
                calls,
                len(selected),
                slug,
                style,
                written.name,
                result.duration_ms,
                result.tokens_in,
                result.tokens_out,
                result.cost_cents / 100,
            )

    wall = time.perf_counter() - wall_start
    print("\n" + "=" * 60)
    print("RUN SUMMARY")
    print("=" * 60)
    print(f"Calls:            {calls}")
    print(f"Failures:         {len(failures)}")
    print(f"Total tokens in:  {total_in:,}")
    print(f"Total tokens out: {total_out:,}")
    print(f"Total cost:       ${total_cents / 100:.4f}")
    print(f"Avg per page:     ${(total_cents / 100 / calls):.5f}" if calls else "n/a")
    print(f"Wall time:        {wall:.1f}s")
    if failures:
        print("\nFailures:")
        for slug, err in failures:
            print(f"  {slug}: {err[:120]}")

    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
