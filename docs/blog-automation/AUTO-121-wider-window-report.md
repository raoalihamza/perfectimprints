# AUTO-121: the 16 months the account already holds

Run: 2026-09-30T23:43:47.148Z (UTC). Read only: no Sanity write, no paid API, one embedding build. Built by the same code as the Blog Topics route, uncached.

## 1. The pull

- Property `https://www.perfectimprints.com/`; 90 days 2026-07-03 to 2026-09-30; 16 months 2025-06-08 to 2026-09-30 (480 days); band 8 to 40; floors 10 (90 days) and 55 (16 months); threshold 2.
- Query rows: 90 days 26,422 over 3 pages; 16 months 125,948 over 7 pages. Query x page rows, 90 days: 33,533 over 3 pages. Ranking pages for the added topics: 21 regex-filtered requests, 12,756 rows.
- Window 30 days: 12,576 query rows.
- Window 90 days: 26,422 query rows.
- Window 180 days: 58,939 query rows.
- Window 365 days: 102,835 query rows.
- Window 480 days: 125,948 query rows.
- Every paginated list reached its end: 6 lists, 6 empty final pages. 46 Search Analytics requests in all; build wall-clock 62,264 ms (62.3 s; script total 62.3 s including the guard).
- Pool: 3,567 searches from the 90 days; 4,782 in the band over 16 months at the floor of 55, of which 2,979 are not in the 90-day pool. Topics: 4,415 (2,361 seen in the last 90 days, 2,054 added by the 16 months).

## 2. What the wider window adds, by floor (band 8 to 40 over 16 months)

AUTO-120 reported 4,496 topic keys "that never appear in the 90 day data at all" and 1,261 "scaling the floor to the longer window". Measured here, three ways: keys absent from the entire 90-day query list (AUTO-120's first figure), keys not in the 90-day POOL (what the panel adds), and the topics those keys make after the spacing merge.

| Floor | Searches in band | Topic keys | Keys absent from all 90-day data | Keys not in the 90-day pool | Added topics |
| --- | --- | --- | --- | --- | --- |
| 10 | 12,829 | 9,053 | 4,572 | 6,926 | 6,880 |
| 20 | 8,799 | 6,179 | 2,833 | 4,396 | 4,374 |
| 25 | 7,745 | 5,434 | 2,402 | 3,759 | 3,740 |
| 30 | 6,984 | 4,900 | 2,101 | 3,324 | 3,306 |
| 40 | 5,800 | 4,058 | 1,650 | 2,642 | 2,628 |
| 50 | 5,053 | 3,527 | 1,359 | 2,211 | 2,199 |
| 53 | 4,900 | 3,425 | 1,299 | 2,124 | 2,114 |
| 55 (chosen) | 4,782 | 3,344 | 1,259 | 2,063 | 2,054 |
| 60 | 4,521 | 3,168 | 1,177 | 1,936 | 1,928 |
| 75 | 3,921 | 2,763 | 993 | 1,629 | 1,623 |
| 100 | 3,176 | 2,236 | 743 | 1,251 | 1,248 |
| 150 | 2,350 | 1,646 | 496 | 863 | 862 |
| 200 | 1,786 | 1,246 | 333 | 609 | 608 |

The chosen floor is 55: the 90-day floor of 10 at the same rate (10 per 90 days is 53.3 per 480 days), rounded up to the nearest five.

## 3. When the added topics were last seen

| Last seen | Topics | Share |
| --- | --- | --- |
| in the last 30 days | 320 | 15.6% |
| 1 to 3 months ago | 373 | 18.2% |
| 3 to 6 months ago | 632 | 30.8% |
| 6 to 12 months ago | 480 | 23.4% |
| over a year ago | 249 | 12.1% |
| Added topics | 2,054 | 100% |

Of the 2,979 added searches: 1,767 had no 90-day row at all, 948 had fewer than 10 impressions in 90 days, 61 rank better than 8 in the last 90 days (the top-7 hazard, below), 203 rank worse than 40 now.

## 4. The guard over the added topics

| State | Added topics | Share |
| --- | --- | --- |
| Usable | 1,302 | 63.4% |
| Excluded, shares keywords with an existing post (rule one only) | 373 | 18.2% |
| Excluded, a blog post already ranks (rule two only) | 164 | 8.0% |
| Excluded, both rules | 206 | 10.0% |
| Excluded, already ranks in the top 7 (the guard passed it) | 9 | 0.4% |
| Excluded, total | 752 | 36.6% |

For comparison, the 90-day topics: 2,361 topics, 949 usable (40.2%), 1,412 excluded, of which 2 by the top-7 check alone.

## 5. The top-7 check

- Searches ranking in the top 7 over the last 90 days: 3,968 of 26,422 (AUTO-120 counted 4,077); 430 of them with at least 10 impressions, which is what the check reads (a position seen once is not a rank). Over 16 months: 35,724 of 125,948.
- The rule: a topic whose own impressions-weighted average position over the last 90 days is under 8, with at least 10 impressions, is excluded ("already ranking"). A search with the topic's words in the top 7 (its own or a different wording) is named on the row and decides nothing.
- Today's 90-day topics that already rank in the top 7 on average: 3. A search in the 90-day pool is at position 8 to 40 by construction; these are topics into which the 16 months merged a same-words search that sits in the top 7 now, pulling the average under 8. 2 of them the guard had passed, and the top-7 rule alone excludes; the table below lists those.
- Added topics that already rank in the top 7 on average (the hazard AUTO-120 named: their 16-month average put them in the band): 32, excluded, of which 9 the guard had passed.
- Topics with a top-7 search named on the row but NOT excluded: 52 of the 90-day topics (15 usable) and 4 of the added ones (1 usable). The table below shows why they stay: the wording that ranks is usually the small one.

### Today's 90-day topics excluded by the top-7 rule alone

| Topic (90-day impressions, average position) | The top-7 search named (position, impressions, page) |
| --- | --- |
| custom measuring cups (907, 7.0) | custom measuring cups (4.2, 594, /cat/measuring-cups) |
| quality imprint (107, 7.6) | quality imprint (7.5, 81, /videos/custom-promotional-products-with-consistent-quality) |

### Today's usable topics with a top-7 search named on the row (shown, not excluded)

| Topic (90-day impressions, average position) | Top-7 search (position, impressions, page) | Own wording? | Its share of the combined impressions |
| --- | --- | --- | --- |
| promotional ornaments (969, 22.1) | ornament (1.0, 18, /blog/buying-guide-custom-christmas-ornaments) | no | 2% |
| custom toothpicks (525, 10.8) | branded toothpicks (7.1, 125, /cat/toothpicks) | yes | 24% |
| custom imprint (432, 19.3) | for imprint (2.4, 20, /) | yes | 5% |
| rush promotional products (374, 24.5) | rush products (6.6, 32, /rush-products) | no | 8% |
| government promotional items (324, 9.7) | branded items for government (7.7, 85, /industry/government) | yes | 26% |
| foam footballs (308, 11.8) | foam football (6.9, 284, /videos/promotional-foam-mini-footballs-brand-interaction) | no | 48% |
| custom ducks (201, 24.0) | duck ai (3.5, 11, /blog/10-facts-rubber-ducks) | no | 5% |
| branded merchandise for government (161, 10.1) | branded merchandise for government (7.0, 76, /industry/government) | yes | 47% |
| promotional corkscrews (68, 28.4) | custom corkscrews (6.6, 14, /cat/wine-openers) | yes | 21% |
| promotional magnetic calendars (45, 21.9) | custom magnetic calendars (7.9, 15, /cat/stick-on-magnetic-calendars) | no | 25% |
| customized pens cheap (41, 22.1) | cheap personalized pens in bulk (6.4, 11, /cat/pens) | no | 21% |
| custom matchbooks fast (34, 9.3) | fast custom matchbooks (7.9, 12, /cat/matches) | no | 26% |
| custom printed festival cups (31, 14.7) | custom festival cups (3.8, 15, /cat/disposable-cups) | no | 33% |
| rush imprint (30, 24.7) | rush imprints (7.8, 24, /rush-products) | no | 44% |
| branded event socks tampa (11, 16.3) | custom socks for events tampa (7.4, 13, /products/tampa-fl-local-city-custom-socks) | no | 54% |

Share of the topic's impressions carried by the top-7 search, quartiles: 8%, 25%, 44%; under 20% in 4 of 15. A rule on the wording would hide the larger wording because a smaller one ranks; the weighted average does not.

### Added topics excluded because they already rank in the top 7 on average

| Topic | 90 days: impressions / average position | 16 months: impressions / position | Best top-7 search (position, impressions, page) |
| --- | --- | --- | --- |
| usa made promotional items | 326 / 6.3 | 1,626 / 20.3 | made in usa promotional items (5.2, 89, /facets/special-feature/made-in-usa) |
| business card maker | 799 / 7.3 | 1,607 / 9.3 | business card maker (7.3, 799, /) |
| premyo ideas low budget showtime | 11 / 3.9 | 1,139 / 11.1 | premyo ideas low budget showtime (3.9, 11, /blog/20-best-experiential-tradeshow-giveaways) |
| value calendars | 233 / 6.0 | 969 / 14.5 | value calendars (6.0, 233, /cat/calendars/brand/good-value) |
| marketing giveaways hand therapy | 104 / 7.1 | 836 / 9.3 | marketing giveaways hand therapy (7.1, 104, /blog/national-physical-therapy-month-promotional-items) |
| wholesale reading glasses with logo printed cases | 163 / 5.7 | 771 / 10.0 | wholesale reading glasses with logo printed cases (5.7, 163, /cat/reading-glasses) |
| vacation giveaways for promotions | 38 / 7.3 | 664 / 10.6 | vacation giveaways for promotions (7.3, 38, /blog/the-best-free-promotional-giveaways-for-your-vacation-destination) |
| promotional gifts for young women | 74 / 6.8 | 561 / 13.8 | promotional gifts for young women (6.8, 74, /blog/what-women-want-promotional-products-edition) |
| personalized mini footballs cheap | 102 / 7.9 | 545 / 10.0 | personalized mini footballs cheap (7.9, 102, /cat/sports-balls/size/mini) |
| which promotional products provide the best roi? | 47 / 7.9 | 451 / 9.1 | which promotional products provide the best roi? (7.9, 47, /blog/20-facts-that-prove-fun-promotional-items-make-you-money) |
| imprinted solid colored standard flint cigarette lighters | 17 / 7.7 | 431 / 17.4 | imprinted solid colored standard flint cigarette lighters (7.7, 17, /products/l38-s-stopngo) |
| beach towel fundraiser | 53 / 7.4 | 361 / 8.1 | beach towel fundraiser (7.4, 53, /blog/10-ideas-use-custom-beach-towels-fundraising) |
| personalized acrylic crescent awards | 89 / 7.3 | 335 / 9.6 | personalized acrylic crescent awards (7.3, 89, /products/acc46g-pecksgraphics) |
| vaping prevention promotional lanyards | 56 / 5.0 | 304 / 11.7 | vaping prevention promotional lanyards (5.0, 56, /cat/vape-lanyards) |
| customized short sleeve isolation gown | 54 / 5.8 | 191 / 9.2 | customized short sleeve isolation gown (5.8, 54, /products/sm340-spectrumuniforms0) |
| thunderstick meaning | 14 / 7.6 | 182 / 9.8 | thunderstick meaning (7.6, 14, /blog/what-are-thunder-sticks-and-what-are-they-for) |
| custom rubber ducks minimum 500 | 96 / 6.2 | 169 / 9.5 | custom rubber ducks minimum 500 (6.2, 96, /cat/rubber-ducks) |
| american made promotional items | 60 / 7.0 | 143 / 15.8 | american made promotional items (7.0, 60, /facets/special-feature/made-in-usa) |
| commercial print digital print mailing fulfillment promotional items trends news august 2025 | 21 / 7.7 | 125 / 8.7 | commercial print digital print mailing fulfillment promotional items trends news august 2025 (7.7, 21, /blog/2025-promotional-products-trend-report) |
| pepper spray legality by state | 18 / 6.4 | 120 / 10.6 | pepper spray legality by state (6.4, 18, /blog/us-pepper-spray-laws) |
| best steel grade for water bottle | 11 / 7.0 | 111 / 10.4 | best steel grade for water bottle (7.0, 11, /blog/guide-understanding-stainless-steel-grades-tumblers-water-bottles) |
| facts about ems | 14 / 4.4 | 108 / 8.1 | facts about ems (4.4, 14, /blog/10-things-you-probably-do-not-know-about-ems-personnel) |
| pepper spray laws vary by state authoritative | 26 / 7.6 | 106 / 8.7 | pepper spray laws vary by state authoritative (7.6, 26, /blog/us-pepper-spray-laws) |
| matchbook designs | 90 / 4.7 | 100 / 10.1 | matchbook designs (4.7, 90, /blog/fire-it-up-13-custom-matchbook-designs-to-spark-an-interest-in-your-brand) |
| wine bottle koozie | 37 / 7.5 | 85 / 8.5 | wine bottle koozie (7.5, 37, /blog/the-15-coolest-bottle-koozies-ever-made) |
| most cost-effective promotional products for small business | 23 / 7.6 | 83 / 8.9 | most cost-effective promotional products for small business (7.6, 23, /blog/best-cheap-promotional-giveaways-for-small-businesses) |
| free drink chips | 17 / 6.8 | 73 / 11.7 | free drink chips (6.8, 17, /blog/free-drink-tokens) |
| screen printing fort walton beach | 10 / 6.8 | 68 / 10.3 | screen printing fort walton beach (6.8, 10, /screen-printing-shirts-fort-walton-beach) |
| custom scented pens | 28 / 7.4 | 64 / 9.8 | custom scented pens (7.4, 28, /products/psc101-srcg) |
| what types of promotional products are most effective for brand awareness? | 28 / 6.7 | 62 / 8.5 | what types of promotional products are most effective for brand awareness? (6.7, 28, /blog/promotional-items-for-brand-awareness) |
| printers in fort walton beach | 11 / 1.3 | 61 / 16.3 | printers in fort walton beach (1.3, 11, /) |
| creative fast aid | 54 / 7.9 | 58 / 8.3 | creative fast aid (7.9, 54, /blog/promotional-first-aid-kits-creative-ideas) |

## 6. The cache entry

- Full snapshot JSON (what the route answers before blocks): 3,300,835 bytes (3.15 MB).
- Compact shape (AUTO-110 to AUTO-119, what used to be cached): 2,124,969 bytes (2.03 MB).
- Packed shape (AUTO-121, what is cached now): 940,541 bytes (0.90 MB) against the budget of 1,600,000 (1.53 MB) and the data cache ceiling of 2 MB. Older topics the trim dropped to fit: 0.
- For scale, the 90-day pool alone packed: 566,849 bytes (0.54 MB).

## 7. The closest-wording figures at the new size

- Topics: 4,415; cap SIMILARITY_MAX_TOPICS = 3,000; embedded: every 90-day topic (2,361) plus the first 639 older topics by 16-month impressions; without figures: 1,415.
- Measured: 3,660 texts in 37 calls, 30,105 tokens, USD 0.0060, 113,734 ms wall-clock (114 s) including scoring; the deadline is 150 s and the route's limit 180 s. Cache entry (results only): 445,115 bytes.

## 8. The added topics, top 40 by 16-month impressions, as the panel shows them

| Search term | 90 days: impressions / position | 16 months: impressions / position | Last seen | Page ranking | Check | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| full service marketing (+2) | none | 9,900 / 38.2 | 180 d | /blog/guide-to-a-full-service-marketing-agency | Excluded | Your post /blog/guide-to-a-full-service-marketing-agency already ranks for this search. Shares 3 keywords (full, service, marketing) with the existing post "Full Service Marketing Agency: A Comprehensive Guide for What to Expect". |
| frisbees with logo (+5) | 265 / 47.4 | 5,674 / 34.4 | 30 d | /cat/flying-discs | Usable |  |
| custom christmas stockings (+9) | 5 / 11.6 | 3,673 / 34.4 | 30 d | /cat/stockings | Excluded | Shares 2 keywords (christmas, stockings) with the existing post "3 Creative Uses for Custom Christmas Stocking Ornaments". |
| winter promotional items | 311 / 71.3 | 3,500 / 18.5 | 30 d | /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter | Excluded | Your post /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter already ranks for this search. |
| jbl vibe buds 2 | none | 3,438 / 9.5 | 180 d | /products/jblvbuds2eb-imprintid | Usable |  |
| custom collapsible water bottle (+10) | 182 / 54.0 | 3,203 / 26.5 | 30 d | /cat/water-bottles/feature/folding | Excluded | Shares 2 keywords (water, bottle) with the existing post "Drink Up: Market Your Business Repeatedly with Branded Water Bottles". |
| custom dab tools (+1) | none | 3,015 / 8.1 | 180 d | /products/c-dtool4-cannabis | Usable |  |
| promotional sports items (+4) | 10 / 37.3 | 2,862 / 25.1 | 30 d | /cat/outdoor | Usable |  |
| is pepper spray legal in usa (+2) | 10 / 11.2 | 1,919 / 8.2 | 30 d | /blog/us-pepper-spray-laws | Excluded | Your post /blog/us-pepper-spray-laws already ranks for this search. Shares 2 keywords (pepper, spray) with the existing post "25 Ways to Use Custom Pepper Spray for Safety and Branding". |
| skullcandy earbuds (+2) | none | 1,847 / 39.1 | 365 d | /cat/earbuds/brand/skullcandy | Usable |  |
| winter promotional products | 27 / 69.6 | 1,685 / 19.4 | 30 d | /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter | Excluded | Your post /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter already ranks for this search. |
| usa made promotional items (+3) | 326 / 6.3 | 1,626 / 20.3 | 30 d | /facets/special-feature/made-in-usa | Excluded | Shares 2 keywords (usa, made) with the existing post "25 Benefits of Buying Made in the USA Promotional Products". You already rank in the top 7 for this topic (average position 6.3 over 326 impressions in the last 90 days, best for "made in usa promotional items" at 5.2 with /facets/special-feature/made-in-usa), so it is not an opportunity. |
| business card maker | 799 / 7.3 | 1,607 / 9.3 | 30 d | / | Excluded | You already rank in the top 7 for this topic (average position 7.3 over 799 impressions in the last 90 days, best for "business card maker" at 7.3 with /), so it is not an opportunity. |
| winter giveaways (+2) | 3 / 75.7 | 1,598 / 20.1 | 30 d | /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter | Excluded | Your post /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter already ranks for this search. |
| custom campfire mugs (+4) | 9 / 34.6 | 1,506 / 25.5 | 90 d | /products/mva-goldstar | Excluded | Shares 2 keywords (campfire, mugs) with the existing post "14 Unique Ways to Gift Campfire Mugs". |
| giveaway fitness (+3) | 103 / 44.0 | 1,468 / 25.5 | 30 d | /blog/shaping-up-14-cool-fitness-giveaway-products-anyone-will-love | Excluded | Your post /blog/shaping-up-14-cool-fitness-giveaway-products-anyone-will-love already ranks for this search. Shares 2 keywords (giveaway, fitness) with the existing post "Shaping Up: 14 Cool Fitness Giveaway Products Anyone Will Love". |
| vitruvi diffusers design firm (+1) | none | 1,447 / 15.2 | 180 d | /products/1414-02-pcna | Usable |  |
| bulk business card cases | none | 1,443 / 34.1 | 180 d | /cat/business-card-holders | Usable |  |
| rfid blocking sleeve (+2) | 16 / 29.6 | 1,436 / 32.1 | 90 d | /facets/feature/rfid-blocker | Usable |  |
| number of associations in promotional industry 2024 | 9 / 12.3 | 1,418 / 19.0 | 30 d | /blog/2025-promotional-products-trend-report | Excluded | Your post /blog/2025-promotional-products-trend-report already ranks for this search. |
| custom chip clips (+3) | 19 / 44.0 | 1,385 / 33.7 | 90 d | /products/4-chip-clip-kl600-mgroup | Usable |  |
| winter promotional gifts | 245 / 72.2 | 1,352 / 32.7 | 30 d | /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter | Excluded | Your post /blog/bringin-the-heat-top-10-cold-weather-promotional-products-to-give-away-this-winter already ranks for this search. |
| fun promotional items | 58 / 41.4 | 1,323 / 31.7 | 30 d | /blog/20-facts-that-prove-fun-promotional-items-make-you-money | Excluded | Your post /blog/20-facts-that-prove-fun-promotional-items-make-you-money already ranks for this search. |
| nurse scrubs | none | 1,287 / 36.1 | over a year | /cat/nursing-scrubs | Usable |  |
| jbl custom speaker (+4) | none | 1,280 / 10.5 | 180 d | / | Usable |  |
| personalized webcam cover (+6) | none | 1,262 / 27.8 | 180 d | /cat/webcam-covers | Excluded | Shares 2 keywords (webcam, cover) with the existing post "WEBCAM COVERS FOR THE WIN". |
| big foam finger sporting events shape (+2) | none | 1,229 / 12.4 | 365 d | /cat/spirit-hands-signs-sticks | Excluded | Shares 2 keywords (foam, finger) with the existing post "The 10 Most Popular Foam Hands and Their Meanings (Aside From the #1 Foam Fingers)". |
| pet promotional products (+2) | none | 1,227 / 30.8 | 365 d | /cat/pet-accessories | Usable |  |
| custom church fans (+3) | none | 1,212 / 33.9 | 180 d | /cat/paper-hand-fans | Usable |  |
| custom hard cooler (+4) | 15 / 43.9 | 1,199 / 26.8 | 90 d | /cat/coolers/type/hard-shell | Usable |  |
| valentines day promotional items (+1) | none | 1,171 / 19.0 | 180 d | /facets/theme/valentine-s-day | Usable |  |
| clear tote bags (+1) | none | 1,148 / 34.6 | over a year | /cat/tote-bags | Excluded | Shares 2 keywords (tote, bags) with the existing post "How to Use Promotional Tote Bags to Promote Your Brand". |
| tradeshow promotions (+1) | 21 / 57.9 | 1,139 / 12.4 | 30 d | /blog/20-best-experiential-tradeshow-giveaways | Excluded | Your post /blog/20-best-experiential-tradeshow-giveaways already ranks for this search. |
| premyo ideas low budget showtime | 11 / 3.9 | 1,139 / 11.1 | 30 d | /blog/best-cheap-promotional-giveaways-for-small-businesses | Excluded | Your post /blog/best-cheap-promotional-giveaways-for-small-businesses already ranks for this search. You already rank in the top 7 for this topic (average position 3.9 over 11 impressions in the last 90 days, best for "premyo ideas low budget showtime" at 3.9 with /blog/20-best-experiential-tradeshow-giveaways), so it is not an opportunity. |
| u.s. promotional products industry size 25 billion (+4) | 2 / 26.5 | 1,139 / 8.4 | 90 d | /blog/2025-promotional-products-trend-report | Excluded | Your post /blog/2025-promotional-products-trend-report already ranks for this search. |
| custom waterproof dry bags | 144 / 44.5 | 1,123 / 37.1 | 30 d | /cat/waterproof-dry-bags | Excluded | Shares 3 keywords (waterproof, dry, bags) with the existing post "Making a Splash: Creative Ways to Use Custom Waterproof Dry Bags for Your Business". |
| zippo lighter (+1) | none | 1,075 / 30.4 | 180 d | /cat/lighters/brand/zippo | Usable |  |
| promotional sling bags | none | 1,054 / 29.9 | 180 d | /cat/sling-backpacks/no-minimum | Usable |  |
| brumate (+3) | 7 / 9.9 | 1,034 / 30.7 | 90 d | /products/bru12slim-customengravingstudiollc | Usable |  |
| printed pilsner glasses (+3) | 1 / 12.0 | 1,034 / 24.5 | 90 d | /cat/barware/type/pilsner | Usable |  |

## 9. The usable added topics, top 40 by 16-month impressions

| Search term | 90 days: impressions / position | 16 months: impressions / position | Last seen | Page ranking | Check | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| frisbees with logo (+5) | 265 / 47.4 | 5,674 / 34.4 | 30 d | /cat/flying-discs | Usable |  |
| jbl vibe buds 2 | none | 3,438 / 9.5 | 180 d | /products/jblvbuds2eb-imprintid | Usable |  |
| custom dab tools (+1) | none | 3,015 / 8.1 | 180 d | /products/c-dtool4-cannabis | Usable |  |
| promotional sports items (+4) | 10 / 37.3 | 2,862 / 25.1 | 30 d | /cat/outdoor | Usable |  |
| skullcandy earbuds (+2) | none | 1,847 / 39.1 | 365 d | /cat/earbuds/brand/skullcandy | Usable |  |
| vitruvi diffusers design firm (+1) | none | 1,447 / 15.2 | 180 d | /products/1414-02-pcna | Usable |  |
| bulk business card cases | none | 1,443 / 34.1 | 180 d | /cat/business-card-holders | Usable |  |
| rfid blocking sleeve (+2) | 16 / 29.6 | 1,436 / 32.1 | 90 d | /facets/feature/rfid-blocker | Usable |  |
| custom chip clips (+3) | 19 / 44.0 | 1,385 / 33.7 | 90 d | /products/4-chip-clip-kl600-mgroup | Usable |  |
| nurse scrubs | none | 1,287 / 36.1 | over a year | /cat/nursing-scrubs | Usable |  |
| jbl custom speaker (+4) | none | 1,280 / 10.5 | 180 d | / | Usable |  |
| pet promotional products (+2) | none | 1,227 / 30.8 | 365 d | /cat/pet-accessories | Usable |  |
| custom church fans (+3) | none | 1,212 / 33.9 | 180 d | /cat/paper-hand-fans | Usable |  |
| custom hard cooler (+4) | 15 / 43.9 | 1,199 / 26.8 | 90 d | /cat/coolers/type/hard-shell | Usable |  |
| valentines day promotional items (+1) | none | 1,171 / 19.0 | 180 d | /facets/theme/valentine-s-day | Usable |  |
| zippo lighter (+1) | none | 1,075 / 30.4 | 180 d | /cat/lighters/brand/zippo | Usable |  |
| promotional sling bags | none | 1,054 / 29.9 | 180 d | /cat/sling-backpacks/no-minimum | Usable |  |
| brumate (+3) | 7 / 9.9 | 1,034 / 30.7 | 90 d | /products/bru12slim-customengravingstudiollc | Usable |  |
| printed pilsner glasses (+3) | 1 / 12.0 | 1,034 / 24.5 | 90 d | /cat/barware/type/pilsner | Usable |  |
| nurse uniforms | none | 968 / 39.7 | over a year | /cat/nursing-scrubs | Usable |  |
| promotional drawstring backpacks | 168 / 47.7 | 953 / 39.5 | 30 d | /cat/drawstring-backpacks | Usable |  |
| garbage can covers (+3) | 10 / 38.2 | 936 / 24.5 | 90 d | /cat/trash-bin-covers | Usable |  |
| logo plastic champagne flutes (+4) | 1 / 44.0 | 903 / 23.1 | 90 d | /cat/champagne-glasses | Usable |  |
| cheap printed frisbees | 164 / 44.1 | 897 / 38.6 | 30 d | /cat/flying-discs | Usable |  |
| fidget toys with logo (+2) | none | 841 / 25.7 | 180 d | /products/md0116-mygiftindustrialcorporation | Usable |  |
| custom screwdriver pens (+1) | none | 831 / 10.1 | 180 d | /cat/screwdrivers | Usable |  |
| custom printed stretch sleeves | 24 / 47.3 | 818 / 37.9 | 90 d | /cat/arm-sleeves/supplier/hclbr | Usable |  |
| church promotional items (+2) | 6 / 27.0 | 804 / 23.8 | 90 d | /industry/church-religious | Usable |  |
| printed silicone phone wallets (+1) | 4 / 23.8 | 750 / 23.3 | 90 d | /cat/phone-wallets | Usable |  |
| printed curvy diner mugs | 9 / 17.4 | 744 / 8.9 | 90 d | /cat/diner-restaurant-mugs | Usable |  |
| stress squeezers custom made | 2 / 15.5 | 744 / 15.1 | 90 d | /cat/stress-relievers-balls | Usable |  |
| imprint yard signs | none | 744 / 12.0 | 180 d | /products/ys2448-4cp-pepcopromotional | Usable |  |
| ariel promotional products | none | 733 / 13.9 | 180 d | /cat/school-spirit/supplier/ariel | Usable |  |
| bbq4d | none | 731 / 11.5 | 180 d | /cat/bbq-grilling/color/silver | Usable |  |
| white wall clock (+1) | none | 725 / 37.7 | over a year | /cat/wall-clocks/color/white | Usable |  |
| sports promo items | 1 / 49.0 | 711 / 18.6 | 90 d | /cat/outdoor | Usable |  |
| custom parade throws (+2) | 7 / 11.3 | 709 / 11.5 | 90 d | /holiday/mardi-gras | Usable |  |
| custom mints (+2) | none | 702 / 31.7 | 365 d | /cat/mints | Usable |  |
| vibe buds 2 | none | 691 / 9.0 | 180 d | /products/jblvbuds2eb-imprintid | Usable |  |
| 07530 engraving | none | 690 / 8.8 | 180 d | /products/07530-compass | Usable |  |

## Appendix: every Search Analytics request made

| Body | Rows |
| --- | --- |
| `{"startDate":"2026-09-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 12576 |
| `{"startDate":"2026-09-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":12576}` | 0 |
| `{"startDate":"2026-07-03","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| `{"startDate":"2026-04-04","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| `{"startDate":"2026-07-03","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| `{"startDate":"2026-07-03","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 1422 |
| `{"startDate":"2025-10-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| `{"startDate":"2026-07-03","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":26422}` | 0 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":0}` | 25000 |
| `{"startDate":"2026-07-03","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 8533 |
| `{"startDate":"2026-04-04","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 25000 |
| `{"startDate":"2026-07-03","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"startRow":33533}` | 0 |
| `{"startDate":"2026-04-04","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":50000}` | 8939 |
| `{"startDate":"2025-10-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 25000 |
| `{"startDate":"2026-04-04","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":58939}` | 0 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":25000}` | 25000 |
| `{"startDate":"2025-10-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":50000}` | 25000 |
| `{"startDate":"2025-10-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":75000}` | 25000 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":50000}` | 25000 |
| `{"startDate":"2025-10-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":100000}` | 2835 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":75000}` | 25000 |
| `{"startDate":"2025-10-01","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":102835}` | 0 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":100000}` | 25000 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":125000}` | 948 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query"],"dataState":"all","type":"web","rowLimit":25000,"startRow":125948}` | 0 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 549 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 559 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 710 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 578 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 573 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 718 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 851 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 900 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 1005 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 985 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 745 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 732 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 599 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 634 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 436 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 547 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 461 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 377 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 313 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 100 searches]"}` | 270 |
| `{"startDate":"2025-06-08","endDate":"2026-09-30","dimensions":["query","page"],"dataState":"all","type":"web","rowLimit":25000,"dimensionFilterGroups":"[regex over 63 searches]"}` | 214 |

Finished 2026-09-30T23:46:45.719Z; 46 Search Analytics requests, one Sanity read.
