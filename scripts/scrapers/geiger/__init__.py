"""Geiger data pipeline scraper.

Phases:
    A - Taxonomy discovery (parse Geiger mega menu HTML)
    B - Product catalog (paginate Searchspring per leaf category)
    C - Facet memberships (per-PI-facet filtered API calls)  [stub]
    D - PI-to-Geiger category mapping                          [stub]

Run via `python -m scripts.scrapers.geiger.run --phase <a|b|c|d|all>`.
"""
