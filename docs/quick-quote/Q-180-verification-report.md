# Q-180: Automated verification of the last three improvements

Run: 2026-08-06T21:16:54.339Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q180.ts (verification only, no app code touched). Mode: apply.

Result: 52 passed, 0 failed.

## The gate

The category page check runs FIRST and stops the run on failure. Improvement 2 deliberately changes code on the `/cat` path (roughly 22,180 URLs), so if the raw HTML is not intact and static, nothing else in this report matters and nothing is written. It runs again at the END, after all publishing.

## Existing documents

This run creates ONLY new `zz-test-q180-*` documents and writes to NO existing document and NO singleton, so there was nothing to record and restore. The fixtures (one category override, two video categories, two videos) are deleted in a `finally` that survives a crash, each under a guard re-checked against the stored document at the moment of deletion. The one visible side effect while the run was live: the fixture category briefly showed two pinned products first, and /videos briefly listed two clearly-labelled ZZ Test videos. The dataset is shared between staging and production, so both were visible on production for that window.

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| pin: applyPinnedOrder called from mergeCategoryProducts | category-overrides.ts imports and calls applyPinnedOrder | imported + called | PASS |
| pin: projection selects pinnedSkus | the categoryOverride GROQ projection carries pinnedSkus | selected | PASS |
| pin: neither render path has its own pin logic | no pinnedSkus/applyPinnedOrder reference in the page or the API route (both inherit it from the shared merge) | both inherit from mergeCategoryProducts | PASS |
| pin: schema field with the SKU picker | pinnedSkus array with components: { input: ProductSkuPicker } | present | PASS |
| pin: freshness rides the existing categoryOverride webhook branch | type === 'categoryOverride' busts CATEGORY_CONTROL_TAG + categoryTag(slug) (no new tag needed) | present | PASS |
| pin: /cat page still never reads searchParams | no `await searchParams` / searchParams destructure in the page body | does not read it | PASS |
| pin: no render-time useSearchParams under /cat | none of the 5 client modules calls useSearchParams | none | PASS |
| video: projection carries BOTH category shapes | categories[]-> plus the legacy category-> (as legacyCategory) | both projected | PASS |
| video: related ranking is the pure shared rule | getRelatedVideos uses rankRelatedVideos + videoCategoriesOf | shared rule | PASS |
| video: no consumer still reads the single legacy field directly | card-data / VideosBrowser / VideoCard / detail page all use the normalized list | all normalized | PASS |
| video: schema has the list + retains the legacy field | a categories array of blogCategory refs, and the old category field kept (readOnly) for unmigrated docs | both present | PASS |
| video: search entry stays ONE per video | getAllVideoSearchEntries joins category titles into the single category key | joined | PASS |
| video: migration is a separate idempotent script with a dry run | scripts/migrations/migrate-video-categories.ts exists, supports --dry-run, is not part of the build | present | PASS |
| search: group ordering is the pure shared rule | orderedSearchGroups lifts the priority group, default order otherwise | present | PASS |
| search: SearchBox uses the shared rule | imports orderedSearchGroups from '@/lib/search/group-order' | wired | PASS |
| search: both indexes pass their priority type | blog index passes blog, blog pagination passes blog, video index passes video | all wired | PASS |
| search: the header box is untouched | Header.tsx passes no priorityType (its dropdown order is byte-identical) | no priorityType | PASS |
| search: index and ranking untouched | no Q-180 edit in load-index.ts / server-search.ts / build-index.ts | untouched | PASS |
| guardrail: quote module untouched | no Q-180 edit in any quote file | untouched | PASS |
| guardrail: freshness work intact (tagged non-CDN reads) | no touched query module uses cachedClient without a tags array | all tagged | PASS |
| GATE: category page responds | 200 | 200 | PASS |
| GATE: category page is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| GATE: category raw HTML carries its products | h1 + Item # lines + CollectionPage + ItemList JSON-LD | all present | PASS |
| GATE: prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| route blog index responds | 200 | 200 | PASS |
| route blog index raw HTML carries its content | Perfect Imprints Blog + /blog/ | all present | PASS |
| route blog index is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route blog index carries the priority-group wiring | the serialized SearchBox props include priorityType (proves this deployment has Q-180) | present | PASS |
| route video index responds | 200 | 200 | PASS |
| route video index raw HTML carries its content | Videos | all present | PASS |
| route video index is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route video index carries the priority-group wiring | the serialized SearchBox props include priorityType (proves this deployment has Q-180) | present | PASS |
| PREFLIGHT: deployment carries Q-180 | priorityType in the blog index HTML | present | PASS |
| pin fixture category | (informational) | lanyards (pins [505277 1AZ, 503552], hidden-pin 508158, alien 501032) | INFO |
| existing documents touched | (informational) | NONE - this run creates only zz-test-q180-* documents; no singleton or existing document is written, so there is nothing to record and restore | INFO |
| pin baseline | (informational) | 80 products via API, 60 Item # lines on page 1, 32 facet options | INFO |
| pins lead the static page, in the arranged order | raw HTML of /cat/lanyards lists 505277 1AZ then 503552 first within 120s | after 2.4s | PASS |
| pins are on page 1 | both pinned SKUs render on the first (clean-URL) page | both on page 1 | PASS |
| page still static after pinning | no BAILOUT_TO_CLIENT_SIDE_RENDERING, content intact | absent, content intact | PASS |
| both render paths agree on the default order | the API list (no filters) starts with exactly the page-1 order of the static page | identical order | PASS |
| pinning changed presentation only: total + membership | totalProducts still 80, SKU set identical (facet counts derive from this set) | unchanged | PASS |
| pinning changed presentation only: filter options + facet counts | the rendered sidebar options and their counts are identical before and after | identical (32 options, counts match) | PASS |
| an alien pinned SKU breaks nothing | 501032 (not in this category) is pinned but never rendered or added | ignored | PASS |
| filter: non-matching pin dropped, matching pin stays first | price-max=2.41 keeps 503552 first and drops 505277 1AZ | as specified | PASS |
| sort: an explicit visitor sort wins over the pins | sort=price-asc returns a strictly price-ordered list (pins not forced first) | price-ordered | PASS |
| a pinned SKU that is also hidden stays hidden | 508158 pinned AND hidden renders on neither path | hidden on both paths | PASS |
| deleting the override restores the original order | page 1 leads with 502387 again within 120s | after 2.4s | PASS |
| video index picks up the fixtures | ZZ Test Q180 Video A appears on /videos within 120s | after 3.1s | PASS |
| index filter offers BOTH of the video's categories | both ZZ category chip titles render on /videos (the chips derive from the videos' category lists) | both chips present | PASS |
| a multi-category video renders ONCE with no filter | exactly one card on the unfiltered index | 1 card(s) | PASS |
| video detail shows every category badge | both ZZ category titles on the video page | both present | PASS |
| related videos work across a shared category | ZZ Test Q180 Video B (shares Cat One) appears in Related Videos | related listed | PASS |
| search index: ONE entry for a multi-category video | exactly one delta entry, its category key joining both titles | 1 entry, category: ZZ Test Q180 Cat One, ZZ Test Q180 Cat Two | PASS |
| GATE re-check after all publishing: category page responds | 200 | 200 | PASS |
| GATE re-check after all publishing: category page is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| GATE re-check after all publishing: category raw HTML carries its products | h1 + Item # lines + CollectionPage + ItemList JSON-LD | all present | PASS |
| GATE re-check after all publishing: prerender header | (informational) | x-nextjs-prerender: 1 | INFO |
| cleanup: fixture documents | (informational) | zz-test-q180-override; drafts.zz-test-q180-override; zz-test-q180-video-a; drafts.zz-test-q180-video-a; zz-test-q180-video-b; drafts.zz-test-q180-video-b; zz-test-q180-video-cat-1; drafts.zz-test-q180-video-cat-1; zz-test-q180-video-cat-2; drafts.zz-test-q180-video-cat-2 | INFO |

## Timings (publish to visible)

- pin publish to visible on the static page: 2.4s
- override delete to original order: 2.4s
- video publish to /videos: 3.1s

## What a script cannot prove (for Ali, after the single deploy)

1. **Open a category page first** and confirm it looks normal, and that its raw HTML has no bailout marker.
2. **Pin two products in Studio** (Category Override, Pinned SKUs), publish, and watch them lead the grid within seconds. Then apply a filter and a sort and confirm the behavior matches the report: a non-matching pin disappears, a chosen sort wins.
3. **Put a video in two categories** and confirm it shows under both chips on /videos and only once with the filter cleared.
4. **Type into the blog index search box** and confirm the Blogs group leads the dropdown; same on /videos for Videos. The dropdown is client-side, so a script can only prove the wiring, not the pixels.
