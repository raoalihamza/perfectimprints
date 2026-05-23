"""Geiger data pipeline entry point.

Usage:
    python -m scripts.scrapers.geiger.run --phase a
    python -m scripts.scrapers.geiger.run --phase b --limit-categories 5
    python -m scripts.scrapers.geiger.run --phase b --resume
    python -m scripts.scrapers.geiger.run --phase all
"""

from __future__ import annotations

import argparse

from . import discover, mapping, memberships, products


def main() -> None:
    parser = argparse.ArgumentParser(description="Geiger data pipeline scraper")
    parser.add_argument(
        "--phase",
        choices=["a", "b", "c", "d", "all"],
        required=True,
        help="Which phase to run",
    )
    parser.add_argument(
        "--limit-categories",
        type=int,
        default=None,
        help="(Phase B) Limit to first N leaf categories for testing",
    )
    parser.add_argument(
        "--global-only",
        action="store_true",
        help="(Phase B) Skip per-leaf scrape and only run the no-filter global "
        "pass to top up products.json with SKUs not reachable via leaf walking",
    )
    parser.add_argument(
        "--retry-errors",
        action="store_true",
        help="(Phase C) Re-run only URLs in `urlsWithErrors` from a previous "
        "Phase C run (uses updated numeric-facet handling). Merges into "
        "existing facet-memberships.json.",
    )
    parser.add_argument(
        "--retry-zeros",
        action="store_true",
        help="(Phase C) Re-run zero-product URLs using the slug resolver "
        "(tries dedicated Geiger category slugs). Only updates URLs that "
        "GAIN products; URLs that come back zero again are left unchanged.",
    )
    parser.add_argument(
        "--retry-brands",
        action="store_true",
        help="(Phase C Tier 1) Re-run zero `/cat/<root>/brand/<brand>` URLs "
        "with a brand-only Searchspring query (no category filter). Recovers "
        "URLs where the brand exists in Geiger but the (category x brand) "
        "combination returned zero.",
    )
    parser.add_argument(
        "--retry-search",
        action="store_true",
        help="(Phase C Tier 2) Re-run remaining zero facet URLs via "
        "Searchspring's full-text search endpoint. Results filtered to SKUs "
        "that belong to the PI root's Geiger category.",
    )
    parser.add_argument(
        "--limit-urls",
        type=int,
        default=None,
        help="(Phase C) Limit to first N PI URLs for testing",
    )
    parser.add_argument(
        "--test-sample",
        action="store_true",
        help="(Phase C) Run only a small balanced sample (a few per modifier "
        "type plus a few facets and compound facets)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="(Phase C) Parallel workers. Each runs at 1 req/sec independently "
        "per CLAUDE.md §16. Try 5-10. Default 1.",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="(Phase B/C) Resume from last checkpoint if one exists",
    )
    args = parser.parse_args()

    if args.phase == "a":
        discover.run()
    elif args.phase == "b":
        if args.global_only:
            products.run_global_only()
        else:
            products.run(limit_categories=args.limit_categories, resume=args.resume)
    elif args.phase == "c":
        if args.retry_errors:
            memberships.run_retry_errors()
        elif args.retry_brands:
            memberships.run_retry_brands(
                workers=args.workers,
                limit=args.limit_urls,
            )
        elif args.retry_search:
            memberships.run_retry_search(
                workers=args.workers,
                limit=args.limit_urls,
            )
        elif args.retry_zeros:
            memberships.run_retry_zeros(
                workers=args.workers,
                limit=args.limit_urls,
            )
        else:
            memberships.run(
                limit_urls=args.limit_urls,
                resume=args.resume,
                test_sample=args.test_sample,
                workers=args.workers,
            )
    elif args.phase == "d":
        mapping.run()
    elif args.phase == "all":
        discover.run()
        products.run(limit_categories=args.limit_categories, resume=args.resume)
        mapping.run()
        memberships.run(resume=args.resume)


if __name__ == "__main__":
    main()
