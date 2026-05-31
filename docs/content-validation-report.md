# Content Validation Report

Generated: 2026-05-31T10:19:22.284909+00:00

## Coverage

- PI URLs in catalog: **22,180**
- JSON files on disk: **22,180**
- Missing files (URL with no JSON): **0**
- Extra files (JSON without matching URL): **0**

## Type breakdown

| type | files | expected |
|---|---:|---:|
| root | 465 | 465 |
| modifier | 576 | 576 |
| facet | 21,137 | 21137 |
| compound-facet | 2 | 2 |

## promptVersion distribution

- `facet-v1`: 21,139
- `modifier-v1`: 576
- `root-v2`: 465

## skuFilterMode distribution

- `full`: 309
- `full-capped-60`: 66
- `membership`: 21,715
- `slug-filtered`: 90

## Findings

- Schema errors: **0** files
- Length-cap violations (h1>80, metaTitle>60, metaDescription>155): **0** files
- Files with orphan SKU references: **98**

### Files with orphan SKU references (98)

- `apparel__brand__stanley.json`: 3 bad sample=['529553', '529554', '529555']
- `banner-display-accessories__search.json`: 1 bad sample=['529557']
- `bar-wine__brand__stanley.json`: 3 bad sample=['529553', '529554', '529555']
- `beanies__brand__under-armour.json`: 1 bad sample=['529262']
- `beer-mugs-steins__brand__stanley.json`: 3 bad sample=['529553', '529554', '529555']
- `caps__brand__under-armour.json`: 1 bad sample=['529262']
- `coolers__brand__under-armour.json`: 1 bad sample=['529262']
- `drinkware__brand__stanley.json`: 3 bad sample=['529553', '529554', '529555']
- `duffle-gym-bags__brand__under-armour.json`: 1 bad sample=['529262']
- `excluded-products__material__polyester.json`: 2 bad sample=['529554', '529555']
- `eyewear-accessories__supplier__pl.json`: 1 bad sample=['529557']
- `eyewear__brand__under-armour.json`: 1 bad sample=['529262']
- `fleece__brand__under-armour.json`: 1 bad sample=['529262']
- `gloves__gender__unisex.json`: 1 bad sample=['529557']
- `gloves__search.json`: 1 bad sample=['529557']
- `gloves__shape__heart.json`: 1 bad sample=['529557']
- `gloves__size__large.json`: 1 bad sample=['529557']
- `gloves__size__medium.json`: 1 bad sample=['529557']
- `gloves__supplier__al.json`: 1 bad sample=['529557']
- `gloves__supplier__azaleeinnovation.json`: 1 bad sample=['529557']
- `gloves__supplier__beacon.json`: 1 bad sample=['529557']
- `gloves__supplier__debco.json`: 1 bad sample=['529557']
- `gloves__supplier__gbond.json`: 1 bad sample=['529557']
- `gloves__supplier__gpromomart.json`: 1 bad sample=['529557']
- `gloves__supplier__hit.json`: 1 bad sample=['529557']
- `gloves__supplier__imprintid.json`: 1 bad sample=['529557']
- `gloves__supplier__pop.json`: 1 bad sample=['529557']
- `gloves__supplier__star.json`: 1 bad sample=['529557']
- `golf-gloves__size__2xlarge.json`: 1 bad sample=['529557']
- `golf-gloves__size__medium.json`: 1 bad sample=['529557']
- _(+68 more)_
