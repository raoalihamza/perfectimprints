"""Phase D: PI to Geiger category mapping.

Maps each PI root category URL (type='root' in data/pi-urls/category-urls.json)
to the closest Geiger leaf category from data/geiger/categories.json.

Strategy (in order):
  1. Manual override file (scripts/scrapers/geiger/mapping_overrides.json)
  2. Exact slug match against any Geiger leaf
  3. Fuzzy match (rapidfuzz token_sort_ratio) against Geiger leaf names + slugs;
     threshold 80
  4. Unmapped — leave for human review or future DeepSeek fallback

Outputs:
  - data/mappings/pi-to-geiger.json
  - data/mappings/pi-to-geiger-review.csv (sorted weak-first)
"""

from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path
from typing import Any

import orjson
from rapidfuzz import fuzz

from .config import OUTPUT_DIR, PROJECT_ROOT

FUZZY_THRESHOLD = 85.0

MAPPINGS_DIR = PROJECT_ROOT / "data" / "mappings"
PI_URLS_FILE = PROJECT_ROOT / "data" / "pi-urls" / "category-urls.json"
CATEGORIES_FILE = OUTPUT_DIR / "categories.json"
OVERRIDES_FILE = Path(__file__).resolve().parent / "mapping_overrides.json"
OUTPUT_JSON = MAPPINGS_DIR / "pi-to-geiger.json"
OUTPUT_CSV = MAPPINGS_DIR / "pi-to-geiger-review.csv"


def _slug_to_words(slug: str) -> str:
    return slug.replace("-", " ").replace("_", " ").strip().lower()


def _extract_nodes(tree: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten the Phase A tree to ALL nodes (leaves + non-leaves).

    Non-leaves are valid Searchspring targets because the API filters by
    category_path prefix, returning products from the parent and all children.
    Leaves are still preferred via the `isLeaf` flag.
    """
    nodes: list[dict[str, Any]] = []

    def walk(items: list[dict[str, Any]]) -> None:
        for node in items:
            children = node.get("children") or []
            nodes.append(
                {
                    "name": node["name"],
                    "slug": node["slug"],
                    "categoryPath": node["categoryPath"],
                    "isLeaf": not children,
                }
            )
            if children:
                walk(children)

    walk(tree)
    return nodes


def _load_overrides() -> dict[str, str]:
    """Load manual overrides: PI slug -> Geiger categoryPath. Create empty file if missing.

    Keys starting with `_` are treated as comments and skipped.
    """
    if not OVERRIDES_FILE.exists():
        OVERRIDES_FILE.write_text("{}\n", encoding="utf-8")
        return {}
    raw = orjson.loads(OVERRIDES_FILE.read_bytes())
    if not isinstance(raw, dict):
        raise ValueError(f"{OVERRIDES_FILE} must contain a JSON object")
    return {str(k): str(v) for k, v in raw.items() if not str(k).startswith("_")}


def _build_match_index(nodes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_slug: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        by_slug.setdefault(node["slug"], []).append(node)
    return by_slug


def _fuzzy_best(
    query: str,
    choices: list[str],
    choice_to_node: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], float] | None:
    """Score every choice with WRatio and token_set_ratio, return best node above threshold.

    Leaves are preferred over non-leaves at equal score (small leaf bonus).
    """
    if not choices:
        return None

    best_node: dict[str, Any] | None = None
    best_score = 0.0
    for choice in choices:
        # WRatio is rapidfuzz's smart weighted scorer; handles substrings well.
        # token_set_ratio handles word-order differences and extra words.
        score = max(
            fuzz.WRatio(query, choice),
            fuzz.token_set_ratio(query, choice),
        )
        node = choice_to_node[choice]
        # Tie-break: prefer leaves at the same score.
        adjusted = score + (0.5 if node["isLeaf"] else 0.0)
        if adjusted > best_score:
            best_score = adjusted
            best_node = node

    if best_node is None or best_score < FUZZY_THRESHOLD:
        return None
    # Strip the leaf bonus from the reported confidence.
    return best_node, min(100.0, best_score - (0.5 if best_node["isLeaf"] else 0.0))


def map_pi_to_geiger(
    pi_roots: list[dict[str, Any]],
    nodes: list[dict[str, Any]],
    overrides: dict[str, str],
) -> dict[str, dict[str, Any]]:
    """Resolve each PI root slug to a Geiger node via override → exact → fuzzy."""
    by_slug = _build_match_index(nodes)
    by_path = {node["categoryPath"]: node for node in nodes}

    # Fuzzy candidates: leaf names lowercased + slug-as-words for every node.
    fuzzy_choices: list[str] = []
    fuzzy_choice_to_node: dict[str, dict[str, Any]] = {}
    for node in nodes:
        for variant in {node["name"].lower(), _slug_to_words(node["slug"])}:
            if variant and variant not in fuzzy_choice_to_node:
                fuzzy_choices.append(variant)
                fuzzy_choice_to_node[variant] = node

    mappings: dict[str, dict[str, Any]] = {}

    for entry in pi_roots:
        pi_slug = entry["rootSlug"]

        # 1. Override
        if pi_slug in overrides:
            override_path = overrides[pi_slug]
            node = by_path.get(override_path)
            if node is None:
                # Override points at a path we don't recognise — still record it
                mappings[pi_slug] = {
                    "geigerCategoryPath": override_path,
                    "geigerSlug": override_path.split(" > ")[-1].lower().replace(" ", "-"),
                    "matchType": "override",
                    "confidence": 1.0,
                }
            else:
                mappings[pi_slug] = {
                    "geigerCategoryPath": node["categoryPath"],
                    "geigerSlug": node["slug"],
                    "matchType": "override",
                    "confidence": 1.0,
                }
            continue

        # 2. Exact slug match. When multiple nodes share a slug, prefer the
        # parent over an "All Foo" aggregator leaf — those leaves have 0
        # products in Phase B because they just summarise their children.
        exact = by_slug.get(pi_slug)
        if exact:
            def _is_all_aggregator(n: dict[str, Any]) -> bool:
                return n["isLeaf"] and n["name"].lower().startswith("all ")

            non_aggregator_leaf = next(
                (n for n in exact if n["isLeaf"] and not _is_all_aggregator(n)), None
            )
            non_leaf = next((n for n in exact if not n["isLeaf"]), None)
            node = non_aggregator_leaf or non_leaf or exact[0]
            mappings[pi_slug] = {
                "geigerCategoryPath": node["categoryPath"],
                "geigerSlug": node["slug"],
                "matchType": "exact",
                "confidence": 1.0,
            }
            continue

        # 3. Fuzzy match
        query = _slug_to_words(pi_slug)
        best = _fuzzy_best(query, fuzzy_choices, fuzzy_choice_to_node)
        if best is not None:
            node, score = best
            mappings[pi_slug] = {
                "geigerCategoryPath": node["categoryPath"],
                "geigerSlug": node["slug"],
                "matchType": "fuzzy",
                "confidence": round(score / 100.0, 4),
            }
            continue

        # 4. Unmapped
        mappings[pi_slug] = {
            "geigerCategoryPath": None,
            "geigerSlug": None,
            "matchType": "unmapped",
            "confidence": 0.0,
        }

    return mappings


def _write_csv(mappings: dict[str, dict[str, Any]]) -> None:
    rows = [
        {
            "pi_slug": slug,
            "geiger_path": data["geigerCategoryPath"] or "",
            "match_type": data["matchType"],
            "confidence": data["confidence"],
        }
        for slug, data in mappings.items()
    ]
    rows.sort(key=lambda r: (r["confidence"], r["pi_slug"]))
    MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["pi_slug", "geiger_path", "match_type", "confidence"])
        writer.writeheader()
        writer.writerows(rows)


def run(*_args: Any, **_kwargs: Any) -> None:
    print("Phase D: PI-to-Geiger root mapping starting...")

    if not PI_URLS_FILE.exists():
        raise RuntimeError(f"PI URLs file not found: {PI_URLS_FILE}")
    if not CATEGORIES_FILE.exists():
        raise RuntimeError(
            f"Geiger categories file not found: {CATEGORIES_FILE}\n"
            "Run Phase A first: python -m scripts.scrapers.geiger.run --phase a"
        )

    pi_data = orjson.loads(PI_URLS_FILE.read_bytes())
    pi_roots = [u for u in pi_data["urls"] if u.get("type") == "root"]
    print(f"  PI root URLs: {len(pi_roots)}")

    cat_data = orjson.loads(CATEGORIES_FILE.read_bytes())
    nodes = _extract_nodes(cat_data.get("tree", []))
    leaf_count = sum(1 for n in nodes if n["isLeaf"])
    print(f"  Geiger nodes (leaves + parents): {len(nodes)} ({leaf_count} leaves)")

    overrides = _load_overrides()
    print(f"  Manual overrides loaded: {len(overrides)}")

    mappings = map_pi_to_geiger(pi_roots, nodes, overrides)

    counts = {"exact": 0, "fuzzy": 0, "override": 0, "unmapped": 0}
    for data in mappings.values():
        counts[data["matchType"]] += 1

    payload = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalPiRoots": len(pi_roots),
        "exactMatches": counts["exact"],
        "fuzzyMatches": counts["fuzzy"],
        "overrideMatches": counts["override"],
        "unmapped": counts["unmapped"],
        "mappings": mappings,
    }

    MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "wb") as f:
        f.write(orjson.dumps(payload, option=orjson.OPT_INDENT_2))

    _write_csv(mappings)

    print("\nPhase D complete.")
    print(f"  Exact matches:    {counts['exact']}")
    print(f"  Fuzzy matches:    {counts['fuzzy']}")
    print(f"  Override matches: {counts['override']}")
    print(f"  Unmapped:         {counts['unmapped']}")
    print(f"  Output:           {OUTPUT_JSON}")
    print(f"  Review CSV:       {OUTPUT_CSV}")
