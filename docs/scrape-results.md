# Scrape results

First full end-to-end run of the Geiger data pipeline (Phases A–D + recovery tiers).
Generated: 2026-05-23.

## Phase A: Taxonomy discovery

- **Total categories:** 544
- **Leaf categories:** 482
- **Top-level branches:** Apparel, Bags & Totes, Drinkware, Health & Wellness,
  Home & Auto, Office & Technology, Shop By, Sports & Outdoor,
  Tradeshow & Events, Writing Instruments
- Mega-menu parser also surfaced 6 secondary top-level navigation items
  (All Products, New Products, Rush Products, Brand Names, Deals,
  Shop by Theme) — these are duplicate paths into the main tree.
- **File:** `data/geiger/categories.json` (146 KB)

## Phase B: Product catalog

- **Total unique SKUs:** 7,957 (full Geiger catalog per the Searchspring
  no-filter query; earlier "20–40k" estimate in CLAUDE.md was wrong)
- **Coverage:** per-leaf walk captured 7,135 SKUs; global no-filter top-up
  added 822 more (products reachable only via Shop By virtual collections)
- **File:** `data/geiger/products.json` (9.6 MB)

### Distribution by top-level Geiger branch (a SKU can belong to multiple)

| Branch | SKUs |
| --- | --- |
| Shop By | 4,021 |
| Office & Technology | 1,738 |
| Home & Auto | 1,412 |
| Bags & Totes | 1,015 |
| Tradeshow & Events | 1,014 |
| Sports & Outdoor | 967 |
| Apparel | 832 |
| Drinkware | 637 |
| Health & Wellness | 617 |
| Writing Instruments | 448 |

## Phase C: Facet & modifier memberships

Per-URL Searchspring queries for the 21,715 non-root PI URLs
(576 modifiers + 21,137 facets + 2 compound facets).

### Final state (after all recovery tiers)

| Bucket | Count | % |
| --- | --- | --- |
| **URLs with products** | **13,968** | **64.3%** |
| URLs with zero products | 7,518 | 34.6% |
| URLs with errors (timeouts) | 229 | 1.1% |
| **Total** | **21,715** | **100%** |

- **Avg SKUs per non-zero URL:** 187
- **Median SKUs per non-zero URL:** 24
- **Largest single membership:** 2,105 SKUs
- **File:** `data/geiger/facet-memberships.json` (44.5 MB)

### Recovery chain run history

| Pass | Tool | URLs touched | Result | Wall time |
| --- | --- | --- | --- | --- |
| Initial sequential | `--phase c` | 2,300 | Slow; switched to workers | ~3 hr |
| Parallel (8 workers) | `--phase c --resume --workers 8` | 19,415 | 10,374 with products, 393 errors | 2:55 hr |
| Retry transient errors | `--retry-errors` | 393 | +164 recovered, 229 still timing out | 24 min |
| Slug resolver | `--retry-zeros` | 47 | +47 recovered | < 1 min |
| **Tier 1 brand fallback** | `--retry-brands --workers 8` | 809 | **+809 recovered (100%)** | 1:42 min |
| **Tier 2 search-keyword fallback** | `--retry-search --workers 8` | 10,036 | **+2,625 recovered** | ~35 min |

**Net gain:** 10,374 → 13,968 URLs with products. **+3,594 URLs (16 percentage points)** moved out of the zero bucket.

### Why ~35% of URLs still return zero products

This is **not a bug.** PI's old site invented 21,715 SEO URLs by combining
every possible category × filter permutation. Geiger's catalog has only
7,957 unique products — many of PI's filter combinations don't have
matching items. Breakdown of the 7,518 remaining zero URLs:

- Brand × category mismatches where the brand isn't in Geiger's catalog at all
  (PI knows ~312 brands; Geiger carries ~200)
- `refine_by`-mapped facets (feature, activity, theme, special-feature,
  sun-protection) — Searchspring's `refine_by` vocabulary is limited to
  3 values: `Made in the USA`, `Eco Friendly`, `Deals`
- Color × narrow category combinations that genuinely have no Geiger products
- Supplier IDs from PI's vocabulary that Geiger doesn't recognise
- Compound facets where one side narrows to nothing

These 7,518 URLs still render on the new site for SEO — they hit the
**Module 3 Tier 3 / Tier 4 fallback** (see CLAUDE.md Section 16
"Empty-page handling").

## Phase D: PI-to-Geiger root mapping

- **Total PI roots:** 465
- **Exact slug matches:** 72
- **Fuzzy matches** (rapidfuzz WRatio + token_set_ratio ≥ 80): 224
- **Manual override matches:** 169
- **Unmapped:** 0 — every PI root resolves to a Geiger category
- **File:** `data/mappings/pi-to-geiger.json` (90 KB) +
  `data/mappings/pi-to-geiger-review.csv` for manual review

The manual override file (`scripts/scrapers/geiger/mapping_overrides.json`)
covers 169 entries where PI's vocabulary diverged from Geiger's (e.g.
PI `dog-toys` → Geiger `Home > Health & Wellness > Pet Products`).
Future PI roots can be added there without code changes.

## Module 3 empty-page fallback chain (Tier 3 + Tier 4)

For the 7,518 zero-result URLs plus the 229 timeout URLs (7,747 total ≈ 36% of non-root URLs), Module 3 must implement two more fallback tiers at render time:

- **Tier 3 — parent-root products.** Show the PI root's product grid with a header "We don't have exact matches — here are popular [Root Category] products". Each card still affiliate-links to its real Geiger page. Resolved at render time from `data/geiger/products.json` and `data/mappings/pi-to-geiger.json`, not baked into the memberships file.
- **Tier 4 — Geiger homepage CTA.** Last resort for the small subset where even the parent root has no products. Show only AI content + "Browse the full Geiger catalog → `https://patrickblack.geiger.com/`".

See `M3-301` and `M3-307` tickets in TASKS.md.

## Anomalies and follow-ups

- 229 timeout errors are concentrated under `/cat/office/supplier/<abbrev>`.
  These are PI's internal supplier IDs (`gbond`, `huff`, `mixie`, etc.)
  that trigger 30-second Searchspring timeouts. Treat as empty pages
  (Tier 3 fallback).
- Phase A captured `stainless-steel` (and similar generic facet-value slugs)
  with disambiguation suffixes (`stainless-steel-travel-mugs-and-tumblers`).
  This limited the slug resolver's reach to 47 matches; the bigger Tier 1+2
  passes more than made up for it.
- Geiger's `refine_by` field has only 3 valid values
  (Made in the USA, Eco Friendly, Deals). PI URLs that route to `refine_by`
  (`feature`, `activity`, `theme`, `special-feature`, `sun-protection`,
  ~3,500 URLs) will mostly be Tier 3 fallbacks. Hard limit of Searchspring's
  vocabulary — nothing we can scrape around.

## File sizes (final)

| File | Size |
| --- | --- |
| `data/geiger/categories.json` | 146 KB |
| `data/geiger/products.json` | 9.6 MB |
| `data/geiger/facet-memberships.json` | 44.5 MB |
| `data/mappings/pi-to-geiger.json` | 90 KB |
| `data/mappings/pi-to-geiger-review.csv` | ~30 KB |
