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
        "--resume",
        action="store_true",
        help="(Phase B/C) Resume from last checkpoint if one exists",
    )
    args = parser.parse_args()

    if args.phase == "a":
        discover.run()
    elif args.phase == "b":
        products.run(limit_categories=args.limit_categories, resume=args.resume)
    elif args.phase == "c":
        memberships.run()
    elif args.phase == "d":
        mapping.run()
    elif args.phase == "all":
        discover.run()
        products.run(limit_categories=args.limit_categories, resume=args.resume)
        print(
            "\nPhases C and D are not yet implemented "
            "(Module 1 Week 2 deliverable - see TASKS.md M1-109 and M1-110)."
        )


if __name__ == "__main__":
    main()
