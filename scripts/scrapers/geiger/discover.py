"""Phase A: Taxonomy discovery.

Parses the Geiger mega menu HTML from one category page using BeautifulSoup,
recursively walks the menu, and writes the full category tree to
`data/geiger/categories.json` with Searchspring-compatible category_path strings
for each leaf.

SCRAPE-910 fallback: `www.geiger.com` challenges requests from datacenter IPs
(GitHub-hosted runners), so this one HTML fetch used to kill the entire
rebuild while the ~60,000 Searchspring requests downstream would all have
succeeded (SCRAPE-900/901). When the fetch or parse fails, Phase A now falls
back to the committed `categories.json` already in the checkout, logs loudly,
records the fallback in `data/geiger/taxonomy-fetch-status.json` (read by the
monthly summary so Patrick's email says so), and lets the rebuild continue.
The cost of a fallback run: a brand-new Geiger category is missed until a run
from an unblocked machine refreshes the taxonomy; renamed/moved Geiger
categories keep their old path, which returns zero from Searchspring, so
their products drop unless cross-listed (the data-loss guard in the assemble
job catches a large drop). The status file is written on every run (fresh or
fallback) and is deliberately NOT committed by the rebuild PR.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

import orjson
from bs4 import BeautifulSoup, Tag

from .client import ScraperClient
from .config import GEIGER_BASE_URL, GEIGER_DISCOVERY_URL, OUTPUT_DIR


def _slugify_from_href(href: str) -> str:
    """Pull the last path segment from a Geiger category URL."""
    cleaned = href.split("?")[0].rstrip("/")
    segments = [s for s in cleaned.split("/") if s]
    return segments[-1] if segments else ""


def _slugify_from_text(name: str) -> str:
    slug = name.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def _find_mega_menu(soup: BeautifulSoup) -> Tag | None:
    """Locate the mega menu container.

    Strategy: prefer <nav> elements whose class list mentions menu/nav and that
    contain the largest number of nested category anchors. Fall back to a
    header element if no nav match is found.
    """
    candidates: list[tuple[int, Tag]] = []
    for nav in soup.find_all(["nav", "header", "div"]):
        if not isinstance(nav, Tag):
            continue
        cls = " ".join(nav.get("class", [])).lower()
        looks_menu_like = (
            "menu" in cls
            or "nav" in cls
            or "mega" in cls
            or nav.name == "nav"
        )
        if not looks_menu_like:
            continue
        category_links = [
            a
            for a in nav.find_all("a", href=True)
            if isinstance(a, Tag) and ("/b/" in a["href"] or "/c/" in a["href"])
        ]
        if category_links:
            candidates.append((len(category_links), nav))

    if not candidates:
        return None

    candidates.sort(key=lambda c: c[0], reverse=True)
    return candidates[0][1]


def _walk_menu(
    container: Tag, parent_path_segments: list[str]
) -> list[dict[str, Any]]:
    """Recursively walk a nested <ul><li>... structure into our tree shape."""
    nodes: list[dict[str, Any]] = []

    direct_items = container.find_all("li", recursive=False)
    if not direct_items:
        direct_items = container.find_all("li")

    for li in direct_items:
        if not isinstance(li, Tag):
            continue
        anchor = li.find("a", recursive=False) or li.find("a")
        if not isinstance(anchor, Tag):
            continue

        href = anchor.get("href", "").strip()
        name = anchor.get_text(strip=True)
        if not name or not href:
            continue

        slug = _slugify_from_href(href) or _slugify_from_text(name)
        if not slug:
            continue

        category_path_segments = [*parent_path_segments, name]
        category_path = " > ".join(["Home", *category_path_segments])

        # Look for nested submenu under this <li>
        child_container = li.find(["ul", "ol"])
        children: list[dict[str, Any]] = []
        if isinstance(child_container, Tag):
            children = _walk_menu(child_container, category_path_segments)

        nodes.append(
            {
                "name": name,
                "slug": slug,
                "href": href if href.startswith("http") else f"{GEIGER_BASE_URL}{href}",
                "categoryPath": category_path,
                "children": children,
            }
        )

    return nodes


def _strip_path_prefix(node: dict, prefix: str) -> dict:
    """Recursively remove `prefix` from every categoryPath in the subtree."""
    if "categoryPath" in node and prefix in node["categoryPath"]:
        node["categoryPath"] = node["categoryPath"].replace(prefix, "", 1)
    for child in node.get("children", []):
        _strip_path_prefix(child, prefix)
    return node


def _unwrap_shop_by_product(tree: list[dict]) -> list[dict]:
    """Promote children of the 'Shop by Product' wrapper to top-level and
    strip 'Shop by Product > ' from all descendant categoryPath strings.

    'Shop by Product' is a mega menu UI grouping label, not a real taxonomy
    node in Geiger's Searchspring index. Products are indexed under paths
    like 'Home > Apparel > ...' not 'Home > Shop by Product > Apparel > ...'.
    """
    new_tree = []
    for node in tree:
        if node.get("slug") == "p" or node.get("name") == "Shop by Product":
            for child in node.get("children", []):
                new_tree.append(_strip_path_prefix(child, "Shop by Product > "))
        else:
            new_tree.append(node)
    return new_tree


def _drop_non_product_branches(tree: list[dict]) -> list[dict]:
    """Remove top-level branches that are not product categories.

    'Our Services' contains service descriptions, not products, and would
    always return 0 results from Searchspring.
    """
    NON_PRODUCT_SLUGS = {"program-capabilities"}
    return [node for node in tree if node.get("slug") not in NON_PRODUCT_SLUGS]


def _count_nodes(tree: list[dict[str, Any]]) -> tuple[int, int]:
    """Return (total, leaves)."""
    total = 0
    leaves = 0
    for node in tree:
        total += 1
        if not node["children"]:
            leaves += 1
        else:
            sub_total, sub_leaves = _count_nodes(node["children"])
            total += sub_total
            leaves += sub_leaves
    return total, leaves


def _collect_sample_leaves(tree: list[dict[str, Any]], limit: int = 5) -> list[str]:
    samples: list[str] = []

    def _walk(nodes: list[dict[str, Any]]):
        for node in nodes:
            if not node["children"]:
                if len(samples) < limit:
                    samples.append(node["categoryPath"])
            else:
                _walk(node["children"])

    _walk(tree)
    return samples


# Written on every Phase A run. mode is "fresh" (live taxonomy scraped) or
# "fallback-committed" (fetch/parse failed; the committed categories.json was
# kept). compute-summary.ts reads it so the PR body and Patrick's email lead
# with the fallback when one happened. Gitignored; never part of the PR.
TAXONOMY_STATUS_FILE = OUTPUT_DIR / "taxonomy-fetch-status.json"


def _write_taxonomy_status(mode: str, error: str | None = None) -> None:
    status: dict[str, Any] = {
        "phase": "a",
        "mode": mode,
        "at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": GEIGER_DISCOVERY_URL,
    }
    if error:
        status["error"] = error
    committed = OUTPUT_DIR / "categories.json"
    if mode == "fallback-committed" and committed.exists():
        try:
            kept = orjson.loads(committed.read_bytes())
            status["keptScrapedAt"] = kept.get("scrapedAt")
            status["keptLeafCategories"] = kept.get("totalLeafCategories")
        except Exception:  # noqa: BLE001 - status is best-effort metadata
            pass
    with open(TAXONOMY_STATUS_FILE, "wb") as f:
        f.write(orjson.dumps(status, option=orjson.OPT_INDENT_2))


def _scrape_taxonomy() -> dict[str, Any]:
    """Fetch + parse the live mega menu. Raises on any fetch or parse failure."""
    with ScraperClient() as client:
        response = client.get(GEIGER_DISCOVERY_URL)

    soup = BeautifulSoup(response.text, "lxml")
    menu = _find_mega_menu(soup)

    if menu is None:
        raise RuntimeError(
            "Mega menu not found on the discovery page.\n"
            f"  URL fetched: {GEIGER_DISCOVERY_URL}\n"
            "  Expected: a <nav> or <header> element containing category links "
            "matching /b/ or /c/.\n"
            "  Action: inspect the page HTML and update _find_mega_menu() in "
            "scripts/scrapers/geiger/discover.py."
        )

    print(f"  Mega menu candidate found: <{menu.name}> with "
          f"{len(menu.get_text(strip=True))} chars of text content")

    container_for_walk = menu.find(["ul", "ol"]) or menu
    if not isinstance(container_for_walk, Tag):
        raise RuntimeError("Mega menu container had no <ul>/<ol> child.")

    tree = _walk_menu(container_for_walk, parent_path_segments=[])
    if not tree:
        raise RuntimeError("Mega menu parse produced zero categories.")

    tree = _unwrap_shop_by_product(tree)
    tree = _drop_non_product_branches(tree)

    total, leaves = _count_nodes(tree)

    return {
        "scrapedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalCategories": total,
        "totalLeafCategories": leaves,
        "tree": tree,
    }


def run() -> None:
    print("Phase A: Taxonomy discovery starting...")
    print(f"  Fetching: {GEIGER_DISCOVERY_URL}")

    output_path = OUTPUT_DIR / "categories.json"

    try:
        payload = _scrape_taxonomy()
    except Exception as e:  # noqa: BLE001 - any fetch/parse failure falls back
        if not output_path.exists():
            # Nothing to fall back to; this is a genuine hard failure.
            raise
        # SCRAPE-910: survive the blocked/broken fetch. The committed
        # categories.json in the checkout stays authoritative for this run.
        reason = f"{type(e).__name__}: {e}"
        _write_taxonomy_status("fallback-committed", error=reason)
        print("::warning::Phase A taxonomy fetch FAILED - falling back to the "
              "committed categories.json. New Geiger categories will be missed "
              "until a run from an unblocked machine succeeds.")
        print("\n" + "!" * 72)
        print("PHASE A FALLBACK: live taxonomy fetch failed; keeping the")
        print("committed data/geiger/categories.json for this rebuild.")
        print(f"  Reason: {reason}")
        try:
            kept = orjson.loads(output_path.read_bytes())
            print(f"  Kept taxonomy scrapedAt: {kept.get('scrapedAt')} "
                  f"({kept.get('totalLeafCategories')} leaves)")
        except Exception:  # noqa: BLE001
            pass
        print("  Consequence: brand-new Geiger categories are missed this run;")
        print("  a renamed/moved Geiger category keeps its old path and its")
        print("  products may drop (the assemble job's data-loss guard fails")
        print("  the run if that drop is large).")
        print("!" * 72 + "\n")
        return

    with open(output_path, "wb") as f:
        f.write(orjson.dumps(payload, option=orjson.OPT_INDENT_2))
    _write_taxonomy_status("fresh")

    sample_leaves = _collect_sample_leaves(payload["tree"], limit=5)

    print(f"\nPhase A complete.")
    print(f"  Total categories: {payload['totalCategories']}")
    print(f"  Leaf categories:  {payload['totalLeafCategories']}")
    print(f"  Output:           {output_path}")
    print(f"  Sample leaves:")
    for s in sample_leaves:
        print(f"    - {s}")
