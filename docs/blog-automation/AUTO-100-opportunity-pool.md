# AUTO-100: Search Console connection and the blog opportunity pool

Run: 2026-09-24T00:04:06.378Z (UTC). Read only: no Sanity write, no AI call, no paid API.
Arguments: days=90 floor=10 threshold=2 top=50 band=8-40 property=(recommend)

## Part 1: the connection

Key variable: GSC_SERVICE_ACCOUNT_JSON_B64 (decoded, service account search-console-reader@steadfast-tesla-478917-b2.iam.gserviceaccount.com).
Token: obtained with scope https://www.googleapis.com/auth/webmasters.readonly.

sites.list (GET https://www.googleapis.com/webmasters/v3/sites): 2 properties visible.

| Property | Permission |
| --- | --- |
| https://www.perfectimprints.com/ | siteFullUser |
| sc-domain:perfectimprints.com | siteFullUser |


Smoke test (one query row per property, last 7 days, dataState all):

- https://www.perfectimprints.com/: OK (1 row returned, e.g. "perfect imprints" 13 impressions)
- sc-domain:perfectimprints.com: OK (1 row returned, e.g. "perfect imprints" 13 impressions)

## Part 2: which property, with the numbers

Window: 2026-06-27 to 2026-09-24 (90 days inclusive, dataState all so the freshest days count).

### https://www.perfectimprints.com/

- 90 days by query: 28,564 rows (3 pages of 25,000, last page 0 rows), 710 clicks, 361,209 impressions.
- 90 days by date: data on 89 of 90 days, earliest 2026-06-27, latest 2026-09-23.
- 16 months by date (2025-05-17 to 2026-09-24, the API's retention limit): first date with data 2025-05-17, 495 days with data, 34,979 clicks, 9,294,019 impressions in total.

| Month | Days | Clicks | Impressions |
| --- | --- | --- | --- |
| 2025-05 | 15 | 1,279 | 548,565 |
| 2025-06 | 30 | 3,148 | 1,171,909 |
| 2025-07 | 31 | 2,806 | 1,114,363 |
| 2025-08 | 31 | 2,742 | 980,547 |
| 2025-09 | 30 | 2,529 | 565,389 |
| 2025-10 | 31 | 2,292 | 304,316 |
| 2025-11 | 30 | 2,049 | 328,001 |
| 2025-12 | 31 | 1,582 | 403,227 |
| 2026-01 | 31 | 1,938 | 434,622 |
| 2026-02 | 28 | 2,094 | 822,267 |
| 2026-03 | 31 | 2,264 | 481,933 |
| 2026-04 | 30 | 2,298 | 524,083 |
| 2026-05 | 31 | 2,164 | 541,406 |
| 2026-06 | 30 | 1,818 | 423,185 |
| 2026-07 | 31 | 1,726 | 259,922 |
| 2026-08 | 31 | 1,366 | 235,003 |
| 2026-09 | 23 | 884 | 155,281 |

### sc-domain:perfectimprints.com

- 90 days by query: 32,921 rows (3 pages of 25,000, last page 0 rows), 751 clicks, 448,017 impressions.
- 90 days by date: data on 89 of 90 days, earliest 2026-06-27, latest 2026-09-23.
- 16 months by date (2025-05-17 to 2026-09-24, the API's retention limit): first date with data 2025-05-17, 495 days with data, 35,297 clicks, 9,651,874 impressions in total.

| Month | Days | Clicks | Impressions |
| --- | --- | --- | --- |
| 2025-05 | 15 | 1,279 | 548,678 |
| 2025-06 | 30 | 3,150 | 1,173,575 |
| 2025-07 | 31 | 2,807 | 1,116,411 |
| 2025-08 | 31 | 2,745 | 981,479 |
| 2025-09 | 30 | 2,530 | 565,789 |
| 2025-10 | 31 | 2,292 | 304,395 |
| 2025-11 | 30 | 2,050 | 328,097 |
| 2025-12 | 31 | 1,584 | 403,511 |
| 2026-01 | 31 | 1,940 | 434,839 |
| 2026-02 | 28 | 2,094 | 822,462 |
| 2026-03 | 31 | 2,265 | 482,078 |
| 2026-04 | 30 | 2,304 | 537,951 |
| 2026-05 | 31 | 2,185 | 591,943 |
| 2026-06 | 30 | 1,891 | 599,281 |
| 2026-07 | 31 | 1,797 | 297,847 |
| 2026-08 | 31 | 1,445 | 278,298 |
| 2026-09 | 23 | 939 | 185,240 |

### Overlap

- Queries in both: 28,558. Only in the URL-prefix property: 6. Only in the domain property: 4,363.
- Impressions on the shared queries: 361,203 (URL-prefix) vs 369,802 (domain).
- Domain property pages by origin (22,320 page rows, 90 days):

| Origin | Pages | Clicks | Impressions |
| --- | --- | --- | --- |
| https://www.perfectimprints.com | 20,804 | 4,240 | 719,650 |
| https://feeds.perfectimprints.com | 116 | 182 | 114,144 |
| https://dev.perfectimprints.com | 1,386 | 39 | 11,519 |
| https://hire.perfectimprints.com | 4 | 3 | 385 |
| http://perfectimprints.com | 2 | 0 | 82 |
| https://perfectimprints.com | 3 | 1 | 43 |
| https://seishirts2026.perfectimprints.com | 5 | 0 | 25 |

### Chosen property: `https://www.perfectimprints.com/`

Why: it holds only www pages (the site the blog lives on), its history starts 2025-05-17, no later than the domain property's 2025-05-17, and the domain property's surplus is other hosts (see the per-origin table).
Exact API string: `https://www.perfectimprints.com/` (URL-encoded in the path as `https%3A%2F%2Fwww.perfectimprints.com%2F`).
A URL-prefix property is addressed by its full URL with the trailing slash; a domain property by `sc-domain:` plus the bare domain. The wrong string returns HTTP 403 "User does not have sufficient permission", not an empty result, on this account (verified by the sites.list above: only these exact strings exist).

## Part 3: the opportunity pool

All query rows, 90 days: 28,564 (paginated to an empty page, see Part 2).
Striking distance band, average position 8 to 40: 12,987 queries (45.5% of all).
- 8 to 20: 5,632
- 21 to 30: 3,732
- 31 to 40: 3,623
For scale, outside the band: position under 8: 4,325; over 40: 11,252.

Impressions floors on the band:

| Floor (impressions in window) | Queries in band | Distinct topics |
| --- | --- | --- |
| 1 | 12,987 | 8,874 |
| 3 | 7,621 | 5,144 |
| 5 | 5,632 | 3,814 |
| 10 | 3,565 | 2,417 |
| 20 | 2,088 | 1,438 |
| 30 | 1,483 | 1,037 |
| 50 | 934 | 653 |
| 100 | 384 | 272 |
| 200 | 123 | 93 |

Chosen floor: 10 impressions in 90 days (about one search a week that showed the site at all). Pool: 3,565 queries.
Deduplicated topics: 2,417 (grouping: lower-case, tokens of 3+ letters, generic promo words and filler removed, plurals folded, tokens sorted; 472 topics hold more than one query, largest 20).

### Top 50 by impressions

(query x page pull: 35,844 rows over 3 pages)

| # | Query | Clicks | Impr. | Pos. | Page ranking |
| --- | --- | --- | --- | --- | --- |
| 1 | thunder sticks | 9 | 3326 | 10.4 | /blog/what-are-thunder-sticks-and-what-are-they-for |
| 2 | thundersticks | 8 | 2317 | 8.5 | /blog/what-are-thunder-sticks-and-what-are-they-for |
| 3 | thunder stick | 1 | 958 | 11.2 | /blog/what-are-thunder-sticks-and-what-are-they-for |
| 4 | cheap promotional items | 0 | 895 | 23.0 | /blog/best-cheap-promotional-giveaways-for-small-businesses |
| 5 | trending promotional products | 0 | 706 | 25.9 | /blog/top-10-promotional-products-trends |
| 6 | cheap giveaways | 0 | 703 | 14.4 | /blog/best-cheap-promotional-giveaways-for-small-businesses |
| 7 | drink tokens | 0 | 700 | 12.7 | /blog/free-drink-tokens |
| 8 | cheap promotional giveaways | 0 | 659 | 17.5 | /blog/best-cheap-promotional-giveaways-for-small-businesses |
| 9 | cheer cone | 0 | 639 | 9.8 | /blog/best-cheerleading-megaphones-for-boosting-team-spirit |
| 10 | corporate swag ideas | 0 | 635 | 18.0 | /blog/best-corporate-swag-ideas-that-boost-brand-visibility |
| 11 | imprinted promotional products | 0 | 625 | 39.7 | /blog |
| 12 | halloween promotional products | 0 | 622 | 12.1 | /blog/top-7-halloween-promo-items-to-pair-with-halloween-bags |
| 13 | custom mini footballs | 5 | 617 | 10.6 | /cat/sports-balls/size/mini |
| 14 | tritan water bottle | 0 | 601 | 27.8 | /cat/water-bottles/brand/tritan |
| 15 | custom beer bucket | 0 | 543 | 14.8 | /blog/increase-your-business-with-custom-metal-beer-buckets |
| 16 | football noise makers | 3 | 527 | 11.1 | /blog/top-5-football-noisemakers |
| 17 | gifts for truck drivers | 0 | 518 | 28.8 | /blog/8-great-gift-ideas-for-truck-driver-appreciation-week |
| 18 | trending promos | 0 | 513 | 13.0 | /blog/top-10-promotional-products-trends |
| 19 | promotional matches | 3 | 508 | 8.1 | /cat/matches |
| 20 | why can't i order pepper spray in dc | 0 | 478 | 10.9 | /blog/us-pepper-spray-laws |
| 21 | top branded merchandise companies | 0 | 448 | 36.5 | /blog/the-top-10-buyers-of-promotional-products |
| 22 | personalized mini footballs | 0 | 428 | 9.8 | /cat/sports-balls/size/mini |
| 23 | gift ideas for employees on a budget | 1 | 421 | 14.7 | /blog/12-employee-appreciation-gift-ideas-for-every-budget |
| 24 | custom rubber ducks | 0 | 421 | 25.0 | /cat/rubber-ducks |
| 25 | promotional ornaments | 0 | 419 | 13.7 | /blog/top-15-recommended-custom-christmas-ornaments |
| 26 | promotional products industry | 0 | 416 | 22.9 | /blog/top-17-industries-that-buy-promotional-products |
| 27 | noise makers for football games | 2 | 406 | 10.2 | /blog/top-5-football-noisemakers |
| 28 | how many beers come in a bucket | 0 | 392 | 9.3 | /blog/beer-bucket-not-the-same |
| 29 | promotional coasters | 0 | 390 | 28.2 | /cat/coasters |
| 30 | santa hats bulk | 1 | 385 | 9.7 | /cat/headwear/theme/christmas |
| 31 | best promotional items | 0 | 382 | 33.9 | /blog/5-promotional-products-people-actuall-keep-and-use |
| 32 | beach promotional items | 0 | 381 | 18.1 | /blog/top-10-essential-beach-promotional-items |
| 33 | promotional footballs | 0 | 378 | 21.2 | /cat/sports-balls/size/mini |
| 34 | drink tokens for bars | 1 | 375 | 11.0 | /blog/free-drink-tokens |
| 35 | trade show banner ideas | 1 | 373 | 21.0 | /blog/best-tradeshow-banner-ideas-for-your-next-event |
| 36 | custom diner mugs | 2 | 366 | 23.7 | /cat/diner-restaurant-mugs |
| 37 | custom coolers | 1 | 366 | 30.9 | /cat/coolers |
| 38 | mini footballs | 0 | 366 | 16.6 | /cat/sports-balls/size/mini |
| 39 | bulk santa hats | 1 | 363 | 11.7 | /cat/headwear/theme/christmas |
| 40 | gift for truck driver | 0 | 360 | 28.5 | /blog/8-great-gift-ideas-for-truck-driver-appreciation-week |
| 41 | sports marketing promotion ideas | 0 | 352 | 28.3 | /blog/sports-marketing-examples |
| 42 | employee appreciation gift ideas | 0 | 351 | 12.8 | /blog/12-employee-appreciation-gift-ideas-for-every-budget |
| 43 | promotional hand fans | 1 | 350 | 25.7 | /cat/paper-hand-fans/supplier/salutepromos |
| 44 | inexpensive promotional giveaways | 0 | 347 | 14.3 | /blog/best-cheap-promotional-giveaways-for-small-businesses |
| 45 | beachbody resistance bands | 2 | 344 | 11.6 | /blog/beachbody-resistance-bands |
| 46 | wholesale megaphones | 0 | 344 | 15.4 | /cat/megaphones |
| 47 | promotional pizza cutters | 0 | 341 | 12.8 | /blog/pizza-restaurants-custom-pizza-cutters |
| 48 | custom ducks for jeeps | 2 | 340 | 11.5 | /cat/rubber-ducks |
| 49 | usa made promotional products | 1 | 340 | 12.3 | /facets/special-feature/made-in-usa |
| 50 | trade show giveaway | 0 | 340 | 38.9 | /blog/best-trade-show-giveaways |

Which section of the site ranks for the pool queries (top page per query):

- /cat/: 1,625 (45.6%)
- /blog/: 1,451 (40.7%)
- /products/: 285 (8.0%)
- other: 85 (2.4%)
- /videos/: 71 (2.0%)
- home: 27 (0.8%)
- /brands/: 21 (0.6%)

## Part 4: cannibalization, measured with the existing detector

Published blog posts read (anonymous, published perspective): 658.
Detector: `suggestLinksForKind('blog', [query without generic/filler words], 3)` from lib/ai/internal-links.ts; score = shared tokens named in the best suggestion's reason (capped at 3 by the reason format, so reported as 3+).

Score distribution (best-matching published post per pool query):

| Shared significant tokens | Queries | Share |
| --- | --- | --- |
| 0 | 322 | 9.0% |
| 1 | 1,571 | 44.1% |
| 2 | 1,282 | 36.0% |
| 3+ | 390 | 10.9% |

Queries with at least one post sharing 1+ tokens: 3,243 (91.0%); 2+: 1,672 (46.9%); 3+: 390 (10.9%).
Independent check from Search Console itself: 1,451 pool queries (40.7%) already rank with a /blog/ page as their top page.

### 20 examples across the range

| Score | Query (impr.) | Shared tokens | Best-matching post |
| --- | --- | --- | --- |
| 3+ | gifts for truck drivers (518) | gifts, truck, drivers | 5 Useful Gifts for Truck Drivers (/blog/5-useful-gifts-for-truck-drivers) |
| 3+ | gift ideas for employees on a budget (421) | gift, employees, budget | 12 Employee Appreciation Gift Ideas for Every Budget (/blog/12-employee-appreciation-gift-ideas-for-every-budget) |
| 3+ | gift for truck driver (360) | gift, truck, driver | 5 Useful Gifts for Truck Drivers (/blog/5-useful-gifts-for-truck-drivers) |
| 3+ | employee appreciation gift ideas (351) | employee, appreciation, gift | 12 Employee Appreciation Gift Ideas for Every Budget (/blog/12-employee-appreciation-gift-ideas-for-every-budget) |
| 3+ | beachbody resistance bands (344) | beachbody, resistance, bands | Beachbody Resistance Bands for Effective Full-Body Workouts (/blog/beachbody-resistance-bands) |
| 3+ | usa made promotional products (340) | usa, made, products | 25 Benefits of Buying Made in the USA Promotional Products (/blog/25-benefits-buying-made-in-usa-promotional-products) |
| 3+ | trade show giveaway (340) | trade, show, giveaway | 20 Best Trade Show Promotional Giveaways With An Experience (/blog/20-best-experiential-tradeshow-giveaways) |
| 2 | trending promotional products (706) | trending, products | Hot & Trending Promotional Products From PPAI Expo 2018 (/blog/hot-trending-promotional-products-ppai-expo-2018) |
| 2 | cheap giveaways (703) | cheap, giveaways | Best Cheap Promotional Giveaways for Small Businesses (/blog/best-cheap-promotional-giveaways-for-small-businesses) |
| 2 | drink tokens (700) | drink, tokens | Free Drink Tokens (/blog/free-drink-tokens) |
| 2 | cheap promotional giveaways (659) | cheap, giveaways | Best Cheap Promotional Giveaways for Small Businesses (/blog/best-cheap-promotional-giveaways-for-small-businesses) |
| 2 | corporate swag ideas (635) | corporate, swag | 10 Best Corporate Swag Ideas That Boost Brand Visibility (/blog/best-corporate-swag-ideas-that-boost-brand-visibility) |
| 2 | custom mini footballs (617) | mini, footballs | Mini Footballs Buying Guide (/blog/buying-guide-for-mini-footballs) |
| 2 | tritan water bottle (601) | water, bottle | Drink Up: Market Your Business Repeatedly with Branded Water Bottles (/blog/drink-up-market-your-business-repeatedly-with-branded-water-bottles) |
| 1 | thunder sticks (3326) | thunder | Feel the Thunder: How You Can Use Promotional ThunderSticks for Your Organization (/blog/feel-the-thunder-how-you-can-use-promotional-thundersticks-for-your-organization) |
| 1 | thundersticks (2317) | thundersticks | 4 Creative Ways to Use Custom Thundersticks at Your Next Event (/blog/4-creative-ways-to-use-custom-thundersticks-at-your-next-event) |
| 1 | thunder stick (958) | thunder | Feel the Thunder: How You Can Use Promotional ThunderSticks for Your Organization (/blog/feel-the-thunder-how-you-can-use-promotional-thundersticks-for-your-organization) |
| 1 | cheap promotional items (895) | items | These promotional items aren't available at this link. (/blog/10-benefits-of-drinking-from-stainless-steel-drinkware) |
| 1 | cheer cone (639) | cheer | 10 Reasons to Use Custom Cheer Megaphones for Advertising (/blog/10-reasons-to-use-custom-cheer-megaphones-for-advertising) |
| 1 | imprinted promotional products (625) | products | 10 Types of Emotions Promotional Products Can Evoke (/blog/10-types-of-emotions-promotional-products-can-evoke) |

Threshold 2: excludes 1,672 of 3,565 pool queries (46.9%). At 1 it would exclude 3,243; at 3+ 390.
Sensitivity: ignoring the near-generic tokens product, products, item, items, gift, gifts, business, businesses, company, companies, 1,357 queries (38.1%) still reach threshold 2; the difference is matches that lean on one of those words.
Combined rule (detector score >= 2 OR the query already ranks with a /blog/ page): excludes 2,140 (60.0%); the ranking-page rule alone adds 468 the detector missed (e.g. a one-word query the tokenizer splits differently from the title, "thunder sticks" vs "thundersticks").

## Part 5: Source 3, the catalogue gap

Root categories on disk (data/categories, no `__` in the name): 465.
- By `relatedCategorySlugs` (a manual field, set on 335 of 658 posts): 76 roots covered, 389 uncovered.
- By title + slug tokens (a root is covered when one post's title or slug carries every significant token of the root slug, plurals folded): 88 roots covered, 377 uncovered.
- Uncovered by BOTH methods: 374.
- Loose variant (ANY significant root token in some post title or slug): 294 covered, 171 uncovered. Too loose to trust ("bags" alone covers bag-clips and carry-on-bags); shown to reproduce the lower AUTO-000 figure.
- Posts with a publishDate in the last 30 days: 6; most recent publishDate: 2026-09-05T19:55:24.482Z.
- At two posts a day drawing only on the token-method gap (377 roots): 26.9 weeks. On the BOTH-methods gap (374): 26.7 weeks.

Uncovered by both methods (first 60 of 374): address-books, apparel-accessories, arm-sleeves, ash-trays, awards, awards-recognition, babies-toddlers, badge-id-holders, badge-reels, badges, bag-clips, bandages, bandanas, banner-display-accessories, banners-mats-signs, bar-wine, bar-wine-gift-sets, barware, bath-body-gifts, bath-hand-towels, bbq-grilling, beach-mats, beer-accessories, beer-glasses, beer-mugs-steins, belt-buckles, belts, beverage-glasses, binoculars, bistro-mugs, blenders-shakers, blue-light-computer-glasses, bluetooth-keyboards, bobbleheads, bookmarks, bottle-openers, bottled-water, bowls-plates-trays, briefcases, brochures, buckets-pails, bumper-stickers, business-card-holders, buttons, buttons-stickers-patches, cables-cords, cafe-mugs, calculators, camping-mugs, camping-outdoor, cannabis, canopy-tents, caps, car-emergency-kits, car-organizers, carabiners, cards, carpenter-pencils, carry-on-bags, champagne-glasses

## Part 6: volume, the honest arithmetic

- Source 1 with the detector threshold alone: 1,893 queries = 1,304 topics.
- Source 1 with the combined rule (threshold 2 OR already ranking with a /blog/ page), the figure used below: 1,425 queries = 963 topics, of which 1,058 queries currently rank with a /cat/ page (a supporting post is the intended funnel, not cannibalization, so they stay in).
- Source 3 (token-method gap 377 roots, minus 125 already present as a Source 1 topic): 252.
- Source 2 (paid keyword API): not bought, contributes 0 today.
- Usable topics today: 1,215.
- At two posts a day (14 a week): 86.8 weeks, 20.0 months. At one a day: 40.0 months. At three a week: 93.1 months.

## Appendix: every Search Analytics request made

| Property | Body | Rows |
| --- | --- | --- |
| https://www.perfectimprints.com/ | `{"startDate":"2026-09-17","endDate":"2026-09-24","dimensions":["query"],"rowLimit":1,"dataState":"all"}` | 1 |
| sc-domain:perfectimprints.com | `{"startDate":"2026-09-17","endDate":"2026-09-24","dimensions":["query"],"rowLimit":1,"dataState":"all"}` | 1 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 3564 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":28564}` | 0 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["date"],"rowLimit":25000,"dataState":"all","type":"web"}` | 89 |
| https://www.perfectimprints.com/ | `{"startDate":"2025-05-17","endDate":"2026-09-24","dimensions":["date"],"rowLimit":25000,"dataState":"all","type":"web"}` | 495 |
| sc-domain:perfectimprints.com | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| sc-domain:perfectimprints.com | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 7921 |
| sc-domain:perfectimprints.com | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":32921}` | 0 |
| sc-domain:perfectimprints.com | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["date"],"rowLimit":25000,"dataState":"all","type":"web"}` | 89 |
| sc-domain:perfectimprints.com | `{"startDate":"2025-05-17","endDate":"2026-09-24","dimensions":["date"],"rowLimit":25000,"dataState":"all","type":"web"}` | 495 |
| sc-domain:perfectimprints.com | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 22320 |
| sc-domain:perfectimprints.com | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":22320}` | 0 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 10844 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":35844}` | 0 |

Finished 2026-09-24T00:04:36.761Z; 17 Search Analytics requests plus one sites.list.
