# Q-170: Automated verification of the three batched improvements

Run: 2026-08-02T04:49:04.913Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q170.ts (verification only, no app code touched). Mode: dry run.

Result: 23 passed, 4 failed.

## What is being verified

1. The shared product strip SKU field is a search-and-pick dropdown on every surface, storing the same bare string it always did.
2. A Geiger SKU can be hidden from site search, on BOTH search read paths, without a rebuild, and without being hidden anywhere else.
3. The site search box sits beside the heading on the blog and video index pages, which stay statically generated.

## globalSettings (a real singleton Patrick uses)

- BEFORE: `(not read - preflight failed)`
- AFTER:  `(not written - preflight failed)`

No write was made in this mode. The record-and-restore machinery is still in the script and is what `--apply` uses.

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| test SKU | (informational) | 501032 (first productSkus entry of data/categories/water-bottles.json) | INFO |
| 1. shared strip SKU field uses the picker | components: { input: ProductSkuInput } on blogProduct.sku | attached | PASS |
| 1. stored field type unchanged (no migration) | blogProduct.sku is still type: 'string' | type: 'string' | PASS |
| 1. manual entry stays possible | ProductSkuInput offers a plain text fallback, auto-opened on a load failure | present | PASS |
| 2. read path A - client overlay + also-matching | lib/search/load-index.ts filters the merged set | filters | PASS |
| 2. read path B - server /search results + facets | lib/search/server-search.ts drops hidden SKUs and app/search passes the set | filters | PASS |
| 2. facets derive from the filtered list | buildSearchFacets is called with the filtered products | yes | PASS |
| 2. the list is transported without a rebuild | the live delta route emits hiddenProductSkus | emitted | PASS |
| 2. globalSettings publish refreshes the delta route | the globalSettings branch calls revalidatePath(SEARCH_INDEX_ROUTE) | wired | PASS |
| 2. search-only blast radius | no aggregator / sitemap / category module reads the list (checked 7 files) | none read it | PASS |
| 2. intended consumers | (informational) | lib/sanity/queries/global-settings.ts, lib/search/load-index.ts, lib/search/server-search.ts, lib/search/hidden-skus.ts, lib/search/hidden-skus.test.ts, lib/search/types.ts, app/search/page.tsx, app/api/search-index/route.ts, scripts/quick-quote/verify-q170.ts | INFO |
| 2. existing hide lists untouched | deals / new-products / rush hide lists still present | all three present | PASS |
| 3. no render-time useSearchParams under the index pages | none of the 7 client modules in the search island calls useSearchParams | absent | PASS |
| 3. box wired into both indexes and the paginated variant | blog index, blog page/[n], video index all render IndexHeadingWithSearch | all three | PASS |
| 3. index pages still declare force-static | both indexes keep their existing route config | unchanged | PASS |
| 3. one search component, not two | the index pages reuse components/forms/SearchBox | reused | PASS |
| 3. blog index responds | 200 | 200 | PASS |
| 3. blog index raw HTML carries its heading and listings | Perfect Imprints Blog + /blog/ | all present | PASS |
| 3. blog index raw HTML carries the search box | placeholder "Search the site..." in the served HTML | MISSING | FAIL |
| 3. blog index is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING marker | absent | PASS |
| 3. blog index page 2 responds | 200 | 200 | PASS |
| 3. blog index page 2 raw HTML carries its heading and listings | Perfect Imprints Blog + /blog/ | all present | PASS |
| 3. blog index page 2 raw HTML carries the search box | placeholder "Search the site..." in the served HTML | MISSING | FAIL |
| 3. blog index page 2 is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING marker | absent | PASS |
| 3. video index responds | 200 | 200 | PASS |
| 3. video index raw HTML carries its heading and listings | Videos + /videos/ | all present | PASS |
| 3. video index raw HTML carries the search box | placeholder "Search the site..." in the served HTML | MISSING | FAIL |
| 3. video index is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING marker | absent | PASS |
| preflight: the target deployment carries this code | /api/search-index exposes hiddenProductSkus AND /blog renders the index search box | delta field ABSENT, blog box ABSENT | FAIL |

## Notes / findings

- The run stopped at preflight: the target deployment does not carry this branch yet. Nothing was written to Sanity, and the live hide/restore round trip was not attempted, because on an old deployment it would have proved nothing while still altering a real singleton.
- The three "raw HTML carries the search box" rows above FAIL for the same single reason and are expected to before the deploy: the deployed pages predate improvement 3. Every source-level and read-only check that does not depend on the deploy passed. Re-run this script after the deploy.

## The complete list of search read paths, and how completeness was established

Established by grepping the repo for every importer of the two search entry points, not by reading one file:

| # | Read path | Serves | Filtered in |
| --- | --- | --- | --- |
| A | `lib/search/load-index.ts` `search()` | the header autocomplete overlay (`components/forms/SearchBox.tsx`) AND the "Also matching" strip (`components/search/SearchAlsoMatching.tsx`) | `recomputeItems()` filters the MERGED static + delta set |
| B | `lib/search/server-search.ts` `searchProducts()` | the `/search` results grid and its facet sidebar (`app/search/page.tsx`, its only importer) | `searchProducts` drops hidden SKUs; facets derive from the filtered list |
| C | `public/search-index.json` (static bulk) | the raw data behind A | not filtered at build, filtered at read time by A. This is deliberate: filtering it would need a redeploy per edit |

`app/api/search/route.ts` is a 501 stub and searches nothing. No other module imports either entry point.

## What a script cannot prove (for Ali, after the single deploy)

1. **Open the Studio** and confirm the SKU field offers search-and-pick on a blog post, a page with a product strip, and a video. Type a partial product name and check a result list appears.
2. **Look at the blog and video index on a phone.** The box should stack under the heading at full width, not squeeze beside it.
3. **Type into the index-page box.** The dropdown should open leftwards and be wide enough to read product rows, not clipped by the viewport.
4. **The overlay race.** The client applies the hide list as soon as the live delta lands. A search fired in the gap before it lands can briefly show a hidden product in the OVERLAY only; the results page is filtered server-side and never affected. Type a second character and it corrects itself.
