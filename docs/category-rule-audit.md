# Category CTA Audit (post-revert)

Generated: 2026-06-22T22:35:28.931Z
Total category JSONs scanned: **22,180**

The exact-match-only Geiger-menu gate was **reverted** (it was too aggressive — it flipped ~10,694 categories to CTA, including genuine ones like binoculars / tote-bags / pens). CTA is again decided ONLY by the original three rules: `empty-skus`, `full-capped-60`, and manual `forceCTA`. Off-topic edge categories are fixed by targeted `categoryOverride` docs, not a site-wide rule.

**7,836** pages render the EmptyStateCTA (35.3% of total).  
**14,344** pages render a product grid.

## Breakdown by detection rule

| Rule | Pages |
| --- | ---: |
| `empty-skus` | 7,766 |
| `full-capped-60` | 65 |
| `force-cta` | 5 |
| `has-products` (grid) | 14,344 |

## Totals by type

| Type | Total | Products | CTA |
| --- | ---: | ---: | ---: |
| root | 465 | 376 | 89 |
| modifier | 576 | 447 | 129 |
| facet | 21,137 | 13,520 | 7,617 |
| compound-facet | 2 | 1 | 1 |

## Spot-checks

`expected` = the outcome the revert prompt wants. `actual` = what the restored automatic rules do. Mismatches are resolved with a `categoryOverride` (see Notes).

| Slug | Expected | Actual | Rule | Match | Fix if mismatch |
| --- | --- | --- | --- | :---: | --- |
| `binoculars` | products | cta | `full-capped-60` | ⚠️ | set `forceProducts` (CTA via `full-capped-60`) |
| `tote-bags` | products | products | `has-products` | ✅ | — |
| `pens` | products | cta | `full-capped-60` | ⚠️ | set `forceProducts` (CTA via `full-capped-60`) |
| `apparel-accessories` | products | products | `has-products` | ✅ | — |
| `water-bottles` | products | products | `has-products` | ✅ | — |
| `backpacks` | products | products | `has-products` | ✅ | — |
| `golf` | products | products | `has-products` | ✅ | — |
| `dog-tags` | cta | products | `has-products` | ⚠️ | set `forceCTA` |
| `personal-protection-equipment` | cta | products | `has-products` | ⚠️ | set `forceCTA` |

### Notes

- `binoculars` and `pens` are CTA via the pre-existing `full-capped-60` rule (their slug-token filter failed, so the grid would be the top-60 of a broad parent department — likely off-topic), **not** the reverted Geiger-menu gate. Show products by setting `forceProducts` on a `categoryOverride`, or by relaxing the `full-capped-60` rule globally (affects ~65 roots — separate decision).
- `dog-tags` and `personal-protection-equipment` have real matched SKUs, so they now render products. Make them CTA with a `forceCTA` override (expected, per the revert plan), or prune the off-topic SKUs with `hiddenSkus`.
