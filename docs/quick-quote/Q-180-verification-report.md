# Q-180: Automated verification of the last three improvements

Run: 2026-08-06T20:34:19.422Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q180.ts (verification only, no app code touched). Mode: dry run.

Result: 29 passed, 2 failed.

## The gate

The category page check runs FIRST and stops the run on failure. Improvement 2 deliberately changes code on the `/cat` path (roughly 22,180 URLs), so if the raw HTML is not intact and static, nothing else in this report matters and nothing is written. It runs again at the END, after all publishing.

## Existing documents

No write was made in this mode.

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
| route blog index carries the priority-group wiring | the serialized SearchBox props include priorityType (proves this deployment has Q-180) | ABSENT (pre-Q-180 deployment?) | FAIL |
| route video index responds | 200 | 200 | PASS |
| route video index raw HTML carries its content | Videos | all present | PASS |
| route video index is not client-side rendered | no BAILOUT_TO_CLIENT_SIDE_RENDERING | absent | PASS |
| route video index carries the priority-group wiring | the serialized SearchBox props include priorityType (proves this deployment has Q-180) | ABSENT (pre-Q-180 deployment?) | FAIL |

## Notes / findings

- The "blog index carries the priority-group wiring" failure means the target deployment predates this branch (Q-180 is not deployed yet), not that the wiring is wrong - the source-level wiring checks above all pass. Expected until the single deploy; --apply would refuse to write for the same reason.
- The "video index carries the priority-group wiring" failure means the target deployment predates this branch (Q-180 is not deployed yet), not that the wiring is wrong - the source-level wiring checks above all pass. Expected until the single deploy; --apply would refuse to write for the same reason.
- Dry run: nothing was published, so the pin round trip and the multi-category video round trip were not exercised. Re-run with --apply against the deployment.

## What a script cannot prove (for Ali, after the single deploy)

1. **Open a category page first** and confirm it looks normal, and that its raw HTML has no bailout marker.
2. **Pin two products in Studio** (Category Override, Pinned SKUs), publish, and watch them lead the grid within seconds. Then apply a filter and a sort and confirm the behavior matches the report: a non-matching pin disappears, a chosen sort wins.
3. **Put a video in two categories** and confirm it shows under both chips on /videos and only once with the filter cleared.
4. **Type into the blog index search box** and confirm the Blogs group leads the dropdown; same on /videos for Videos. The dropdown is client-side, so a script can only prove the wiring, not the pixels.
