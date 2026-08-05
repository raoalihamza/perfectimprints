# Q-175: Automated verification of the freshness fixes

Run: 2026-08-05T06:27:56.288Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q175.ts (verification only, no app code touched). Mode: dry run.

Result: 34 passed, 0 failed.

## The gate

The category page check runs FIRST and stops the run on failure. `/cat/<slug>` is roughly 22,180 URLs and the commercial heart of the site; if Q-175 had gone near it, nothing else in this report would matter. It is checked again at the END, after all the publishing, so a tag blast radius that reached the category pages would also be caught.

## Singletons (real documents Patrick uses)

- `homePage.heroText` BEFORE: `(not read in this mode)`
- `homePage.heroText` AFTER:  `(not written in this mode)`
- `globalSettings.dealsPage` BEFORE: `(not read in this mode)`
- `globalSettings.dealsPage` AFTER:  `(not written in this mode)`

No write was made in this mode. The record-and-restore machinery is still in the script and is what `--apply` uses.

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| no CDN client read left on a converted module | 0 bare client.fetch across 7 modules | none | PASS |
| every converted module passes cache tags | no module uses cachedClient without a tags array (untagged = route goes dynamic) | all tagged | PASS |
| webhook busts every new cache tag | HOME_TAG, BLOG_LIST_TAG, CUSTOM_PRODUCTS_TAG, CUSTOM_CATEGORIES_TAG | all busted | PASS |
| webhook handles blogCategory at all | a `type === 'blogCategory'` branch exists (it was handled NOWHERE before) | present | PASS |
| dead preview client deleted | lib/sanity/client.ts exports neither previewClient nor getClient | both gone | PASS |
| no importer of the deleted exports | no previewClient import anywhere (getClientIp / context.getClient are unrelated) | none | PASS |
| category render path untouched | no Q-175 edit in any of the 6 category render-path files | untouched | PASS |
| existing revalidate intervals kept as a backstop | 604800 / 604800 / 604800 / 3600 / 604800 | all intact | PASS |
| GATE: category page responds | 200 | 200 | PASS |
| GATE: category page is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| GATE: category raw HTML carries its real content | h1 + product img + CollectionPage + ItemList JSON-LD | all present | PASS |
| GATE: category page is prerendered | x-nextjs-prerender: 1 | prerendered | PASS |
| real blog category used for route checks | (informational) | custom-drinkware | INFO |
| route home responds | 200 | 200 | PASS |
| route home raw HTML carries its content | <h1 + Min Qty: + <footer | all present | PASS |
| route home body was not swallowed by a bailout | content present and at most ONE scoped ssr:false boundary (a route-level bailout would replace the whole body) | 1 scoped boundary, full content still server-rendered | PASS |
| route home scoped bailout | (informational) | the TestimonialsLazy island (next/dynamic ssr:false, M5-508 Part 8) - below the fold and intentional | INFO |
| route home prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| route blog index responds | 200 | 200 | PASS |
| route blog index raw HTML carries its content | Perfect Imprints Blog + /blog/ | all present | PASS |
| route blog index is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route blog index prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| route blog index page 2 responds | 200 or 404 | 200 | PASS |
| route blog index page 2 raw HTML carries its content | /blog/ | all present | PASS |
| route blog index page 2 is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route blog index page 2 prerender header | (informational) | absent | INFO |
| route deals responds | 200 | 200 | PASS |
| route deals raw HTML carries its content | <h1 | all present | PASS |
| route deals is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route deals prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| route new products responds | 200 | 200 | PASS |
| route new products raw HTML carries its content | <h1 | all present | PASS |
| route new products is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route new products prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| route rush products responds | 200 | 200 | PASS |
| route rush products raw HTML carries its content | <h1 | all present | PASS |
| route rush products is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route rush products prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| route blog category responds | 200 | 200 | PASS |
| route blog category raw HTML carries its content | <h1 | all present | PASS |
| route blog category is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route blog category prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| route blog category page 2 responds | 200 or 404 | 404 | PASS |

## Notes / findings

- Dry run: nothing was published, so the freshness round trips (the actual point of this task) were not exercised. Re-run with --apply against the deployment.

## Manual step this run cannot do

Adding `blogCategory` to the Sanity webhook Filter, on BOTH environments. Until that is done, publishing a blog POST still refreshes the blog category pages (that rides the `blog-list` tag and needs no Filter change), but renaming a CATEGORY does not refresh its own page. The row named "NEEDS the manual Filter step" above is the one that measures it.

## What a script cannot prove (for Ali, after the single deploy)

1. **Open a category page and look at it.** The gate proves the HTML is intact; it cannot tell you the page looks right.
2. **The blog post that started this.** Confirm the deleted product strip is gone.
3. **Add a product strip to a post, publish, confirm it appears. Then delete it, publish, and confirm it disappears within seconds.** This is the test that failed before any of this work.
4. **Edit the home page hero, publish, and watch it change.** The timing above says it works; seeing it is still worth thirty seconds.
