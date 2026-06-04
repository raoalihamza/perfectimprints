# CTA Audit Report

Generated: 2026-06-04T22:08:31.077Z
Total category JSONs scanned: **22,180**

**7,836** pages render the EmptyStateCTA (35.3% of total).  
**14,344** pages render a product grid.

## Breakdown by detection rule

| Rule | Pages | Description |
| --- | ---: | --- |
| `empty-skus` | 7,766 | Zero SKUs in `productSkus` — Tier 3/4 fallback (no Geiger match). |
| `full-capped-60` | 65 | Slug-token filter failed; pipeline fell back to top-60 of parent department. Products likely off-topic. |
| `force-cta` | 5 | Manually flagged with `forceCTA: true` in the JSON. |
| `has-products` | 14,344 | Page renders the product grid (no CTA). |

## empty-skus (7,766)

Zero SKUs in `productSkus` — Tier 3/4 fallback (no Geiger match).

Breakdown by type:

- facet: 7,617
- modifier: 129
- root: 19
- compound-facet: 1

Sample URLs:

- `/cat/address-books/color/yellow` (facet, 0 SKUs)
- `/cat/apparel-accessories/activity/baseball` (facet, 0 SKUs)
- `/cat/apparel-accessories/activity/football` (facet, 0 SKUs)
- `/cat/apparel-accessories/activity/soccer` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/alleson-athletic` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/atlantis-headwear` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/augusta-sportswear` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/chef-designs` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/cherokee` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/devon-jones` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/heartsoul` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/koi` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/leeman` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/paragon` (facet, 0 SKUs)
- `/cat/apparel-accessories/brand/popl` (facet, 0 SKUs)

## full-capped-60 (65)

Slug-token filter failed; pipeline fell back to top-60 of parent department. Products likely off-topic.

Breakdown by type:

- root: 65

Sample URLs:

- `/cat/automotive` (root, 60 SKUs)
- `/cat/bags` (root, 60 SKUs)
- `/cat/banners-mats-signs` (root, 60 SKUs)
- `/cat/beach-balls-inflatables` (root, 60 SKUs)
- `/cat/beach-towels` (root, 60 SKUs)
- `/cat/belt-buckles` (root, 60 SKUs)
- `/cat/binoculars` (root, 60 SKUs)
- `/cat/calendars` (root, 60 SKUs)
- `/cat/champagne-glasses` (root, 60 SKUs)
- `/cat/chef-wear` (root, 60 SKUs)
- `/cat/cleaning-supplies` (root, 60 SKUs)
- `/cat/clipboards` (root, 28 SKUs)
- `/cat/coffee-tea-cocoa` (root, 60 SKUs)
- `/cat/collapsible-bottles` (root, 60 SKUs)
- `/cat/desk-organizers` (root, 60 SKUs)

## force-cta (5)

Manually flagged with `forceCTA: true` in the JSON.

Breakdown by type:

- root: 5

Sample URLs:

- `/cat/ash-trays` (root, 47 SKUs)
- `/cat/bistro-mugs` (root, 59 SKUs)
- `/cat/compasses` (root, 200 SKUs)
- `/cat/cooling-sport-towels` (root, 23 SKUs)
- `/cat/facial-rollers` (root, 200 SKUs)
