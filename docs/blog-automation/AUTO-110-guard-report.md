# AUTO-110: the blog topic guard on today's pool

Run: 2026-09-24T05:04:28.057Z (UTC). Read only: no Sanity write, no AI call, no paid API. Built by the same code as the Blog Topics route, uncached.

## The pull

- Property: `https://www.perfectimprints.com/`; window 2026-06-27 to 2026-09-24 (90 days); band 8 to 40; floor 10 impressions; threshold 2 (the constant CANNIBALIZATION_THRESHOLD in lib/blog-automation/topic-pool.ts, currently 2).
- Query rows: 28,581 over 3 pages; in the pool: 3,576; query x page rows: 35,872 over 3 pages.
- Published posts the detector scored against: 658.
- Build wall-clock: 13,383 ms (the route's maxDuration is 120 s).
- Full snapshot JSON: 1,380,185 bytes (1.32 MB).
- Cached (compact) snapshot JSON, what the route stores: 922,493 bytes (0.88 MB; the data cache limit is about 2 MB).

## The guard, per topic (what the panel shows)

| State | Topics | Share |
| --- | --- | --- |
| Usable | 1,000 | 41.3% |
| Excluded, shares keywords with an existing post (rule one only) | 368 | 15.2% |
| Excluded, a blog post already ranks (rule two only) | 516 | 21.3% |
| Excluded, both rules | 539 | 22.2% |
| Excluded, total | 1,423 | 58.7% |
| Topics | 2,423 | 100% |

Rule one fires on 907 topics (37.4%); rule two on 1,055 (43.5%); rule two alone adds 516 the detector did not catch.

## The guard, per query (how AUTO-100 counted; its combined rule excluded 60.0%)

- Pool queries: 3,576.
- Rule one (shares 2+ significant tokens, near-generic words stripped): 1,393 (39.0%).
- Rule two (top page is already a /blog/ post): 1,449 (40.5%).
- Both: 748 (20.9%).
- Either, the combined rule: 2,094 (58.6%); surviving queries 1,482.

Top page per pool query, by section:

- /cat/: 1,626 (45.5%)
- /blog/: 1,456 (40.7%)
- /products/: 285 (8.0%)
- other: 85 (2.4%)
- /videos/: 76 (2.1%)
- home: 27 (0.8%)
- /brands/: 21 (0.6%)

## Ten example topics, as the panel shows them

| Search term | Impressions | Clicks | Avg. position | Page ranking now | Check | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| custom printed sunglasses (+19 similar) | 1,830 | 0 | 36.9 | /cat/sunglasses | Usable | Closest existing post shares only "sunglasses": 8 Steps to Organizing a Promotional Sunglasses Giveaway to Boost Your Brand |
| printed flying discs (+7 similar) | 1,158 | 1 | 25.1 | /cat/flying-discs | Usable |  |
| custom coolers (+9 similar) | 1,125 | 1 | 33.0 | /cat/coolers | Usable | Closest existing post shares only "coolers": 7 DIY Cooler Hacks You Need To Know |
| promotional balloons (+11 similar) | 1,097 | 0 | 31.8 | /cat/balloons | Usable | Closest existing post shares only "balloons": Liven Up Your Event With Custom Balloons |
| custom mini footballs (+16 similar) | 2,669 | 5 | 13.5 | /cat/sports-balls/size/mini | Excluded | Shares 2 keywords (mini, footballs) with the existing post "Mini Footballs Buying Guide". |
| santa hats bulk (+17 similar) | 1,592 | 3 | 13.2 | /cat/headwear/theme/christmas | Excluded | Shares 2 keywords (santa, hats) with the existing post "6 Best Selling Colorful Santa Hats in Bulk". |
| thunder sticks (+4 similar) | 4,595 | 12 | 10.6 | /blog/what-are-thunder-sticks-and-what-are-they-for | Excluded | Your post /blog/what-are-thunder-sticks-and-what-are-they-for already ranks for this search. |
| thundersticks (+2 similar) | 2,388 | 9 | 8.6 | /blog/what-are-thunder-sticks-and-what-are-they-for | Excluded | Your post /blog/what-are-thunder-sticks-and-what-are-they-for already ranks for this search. |
| cheap giveaways (+6 similar) | 1,663 | 0 | 16.0 | /blog/best-cheap-promotional-giveaways-for-small-businesses | Excluded | Your post /blog/best-cheap-promotional-giveaways-for-small-businesses already ranks for this search. Shares 2 keywords (cheap, giveaways) with the existing post "Best Cheap Promotional Giveaways for Small Businesses". |
| gifts for truck drivers (+9 similar) | 1,418 | 0 | 28.6 | /blog/8-great-gift-ideas-for-truck-driver-appreciation-week | Excluded | Your post /blog/8-great-gift-ideas-for-truck-driver-appreciation-week already ranks for this search. Shares 2 keywords (truck, drivers) with the existing post "5 Useful Gifts for Truck Drivers". |

## The usable list, top 30 by impressions

| Search term | Impressions | Clicks | Avg. position | Page ranking now | Check | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| custom printed sunglasses (+19 similar) | 1,830 | 0 | 36.9 | /cat/sunglasses | Usable | Closest existing post shares only "sunglasses": 8 Steps to Organizing a Promotional Sunglasses Giveaway to Boost Your Brand |
| printed flying discs (+7 similar) | 1,158 | 1 | 25.1 | /cat/flying-discs | Usable |  |
| custom coolers (+9 similar) | 1,125 | 1 | 33.0 | /cat/coolers | Usable | Closest existing post shares only "coolers": 7 DIY Cooler Hacks You Need To Know |
| promotional balloons (+11 similar) | 1,097 | 0 | 31.8 | /cat/balloons | Usable | Closest existing post shares only "balloons": Liven Up Your Event With Custom Balloons |
| promotional matches (+12 similar) | 975 | 5 | 16.9 | /cat/matches | Usable | Closest existing post shares only "matches": Spark New Consumer’s Interest With Custom Box Matches!&nbsp; |
| imprinted promotional products (+3 similar) | 856 | 0 | 37.6 | /blog | Usable |  |
| promotional footballs (+4 similar) | 826 | 0 | 22.8 | /cat/sports-balls/size/mini | Usable | Closest existing post shares only "footballs": Mini Footballs Buying Guide |
| custom matchbooks (+19 similar) | 802 | 7 | 21.6 | /cat/matches | Usable | Closest existing post shares only "matchbooks": 15 Ideas for Custom Matchbooks |
| custom wine openers (+13 similar) | 762 | 1 | 22.0 | /cat/wine-openers | Usable | Closest existing post shares only "openers": Get Creative With Custom Jar Openers |
| wholesale megaphones (+5 similar) | 756 | 2 | 14.5 | /cat/megaphones | Usable | Closest existing post shares only "megaphones": 10 Reasons to Use Custom Cheer Megaphones for Advertising |
| custom pedometers (+11 similar) | 747 | 0 | 17.8 | /cat/pedometers | Usable |  |
| promotional hand fans (+6 similar) | 699 | 1 | 25.9 | /cat/paper-hand-fans/supplier/salutepromos | Usable | Closest existing post shares only "hand": The 10 Most Popular Foam Hands and Their Meanings (Aside From the #1 Foam Fingers) |
| promotional coasters (+2 similar) | 680 | 0 | 30.1 | /cat/coasters | Usable | Closest existing post shares only "coasters": 10 Unique Ways to Use Custom Printed Coasters |
| custom bike bottles (+7 similar) | 620 | 2 | 11.7 | /cat/water-bottles/activity/biking | Usable | Closest existing post shares only "bottles": Choosing the Right Promotional Bottle Coozie |
| custom printed pens (+13 similar) | 556 | 0 | 23.2 | /videos/custom-logo-pens-for-signing-major-life-moments | Usable | Closest existing post shares only "pens": Custom Printed NFC Tap Pens: One Small Tap, Endless Possibilities |
| custom diner mugs (+5 similar) | 523 | 3 | 21.9 | /cat/diner-restaurant-mugs | Usable | Closest existing post shares only "mugs": 14 Unique Ways to Gift Campfire Mugs |
| custom acrylic tumblers (+2 similar) | 507 | 1 | 30.7 | /cat/tumblers-travel-mugs/material/acrylic | Usable | Closest existing post shares only "tumblers": From Sips to Sales: 10 Ways Personalized Tumblers Can Boost Your Brand |
| promotional tool kits (+8 similar) | 474 | 0 | 22.9 | /cat/tool-kits | Usable | Closest existing post shares only "tool": 10 Ideas for Using Halloween Trick or Treat Bags as a Marketing Tool |
| branded clipboards (+4 similar) | 409 | 1 | 21.3 | /cat/clipboards | Usable | Closest existing post shares only "clipboards": Custom Clipboards to Promote Your Business |
| personalized bag clips (+4 similar) | 388 | 0 | 32.9 | /cat/bag-clips | Usable | Closest existing post shares only "bag": 10 Fresh Custom Halloween Bag Designs |
| custom phone wallets (+3 similar) | 385 | 2 | 22.6 | /cat/phone-wallets | Usable | Closest existing post shares only "phone": 7 Reasons to Give Customized Phone Chargers |
| custom jump ropes (+3 similar) | 383 | 1 | 22.7 | /cat/jump-ropes | Usable |  |
| custom sunscreen (+3 similar) | 382 | 1 | 33.2 | /cat/sunscreen | Usable | Closest existing post shares only "sunscreen": Best Sun Bum Sunscreen Products (You Can Customize) |
| government promotional products (+3 similar) | 382 | 1 | 12.7 | /industry/government | Usable |  |
| custom imprint (+3 similar) | 378 | 0 | 22.2 | /videos/custom-promotional-products-for-consistent-brand-recognition | Usable | Closest existing post shares only "imprint": 2025 Perfect Imprints Promo Trend Report |
| rush promotional products (+1 similar) | 370 | 1 | 24.6 | /rush-products | Usable | Closest existing post shares only "rush": BamBams Thundersticks in a Rush |
| custom toothpicks (+3 similar) | 358 | 4 | 13.0 | /cat/toothpicks | Usable |  |
| promotional candles (+1 similar) | 354 | 1 | 15.7 | /cat/candles | Usable | Closest existing post shares only "candles": How to Use White Label Candles to Create the Best Christmas Decorations |
| moisture wicking hats (+4 similar) | 319 | 0 | 25.2 | /cat/headwear/feature/moisture-wicking | Usable | Closest existing post shares only "hats": 6 Best Selling Colorful Santa Hats in Bulk |
| promotional measuring cups (+2 similar) | 318 | 1 | 11.7 | /cat/measuring-cups | Usable | Closest existing post shares only "cups": Ditch The Red Solo Cups and Give Out These Branded Aluminum Cups Instead |

## Appendix: every Search Analytics request made

| Property | Body | Rows |
| --- | --- | --- |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 3581 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":28581}` | 0 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 10872 |
| https://www.perfectimprints.com/ | `{"startDate":"2026-06-27","endDate":"2026-09-24","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":35872}` | 0 |

Finished 2026-09-24T05:04:41.467Z; 6 Search Analytics requests, one Sanity read.
