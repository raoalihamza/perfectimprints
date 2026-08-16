# SCRAPE-901 — Every request a Full Catalog Rebuild makes, by host (counted, not estimated)

**Date:** 2026-08-16
**Scope:** Counting only. No scrape was run, no code or workflow changed, nothing committed. Every number below is derived from the production repo's code ([.github/workflows/monthly-rebuild.yml](../.github/workflows/monthly-rebuild.yml) + `scripts/scrapers/geiger/*.py`) and its committed data files. **Zero live requests were made to Geiger or Searchspring for this count.** (Three read-only `api.github.com` calls were attempted to list the workflow's run history; all were denied — see §5.4.)

---

## 1. What a full run actually executes

A `workflow_dispatch` with the default `phases: A,B,C,E` runs four jobs ([monthly-rebuild.yml](../.github/workflows/monthly-rebuild.yml)):

- **scrape-ab** — `--phase a` then `--phase b --resume`. Phase A is one HTML fetch; Phase B paginates Searchspring per leaf category.
- **scrape-e** — `--phase a` **again** (deliberately, so it can run in parallel with scrape-ab), then `--phase e` (one HTML fetch + logo downloads).
- **scrape-c** — `--phase c --workers 6 --resume`. One filtered Searchspring query per non-root PI URL, **paginated** at 60/page ([memberships.py:447-481](../scripts/scrapers/geiger/memberships.py)).
- **assemble** — DeepSeek for new categories, prune, expand-safe, summary, PR, email, merge.

Three things the workflow does **not** run, despite being part of how the committed data was originally produced: the Phase B global top-up (`--global-only`), and the Phase C recovery tiers (`--retry-brands`, `--retry-search`). None of them appear in any workflow YAML. This matters in §5.5.

All scraper HTTP goes through one client ([client.py](../scripts/scrapers/geiger/client.py)): curl_cffi `impersonate="chrome131"`, 1 req/sec throttle, tenacity retry up to **5 attempts** per failing request. The one exception is Phase E's logo downloader, which uses **plain httpx with no impersonation** ([brand_logos.py:250](../scripts/scrapers/geiger/brand_logos.py)).

## 2. Per-phase counts

### Phase A — taxonomy (runs TWICE per full rebuild)

- **Host:** `www.geiger.com` — one GET of the HTML page `/b/accessories` (`GEIGER_DISCOVERY_URL`, [config.py:12](../scripts/scrapers/geiger/config.py)). The mega menu is parsed from that single page; no follow-up requests.
- **Count: 2 requests** in a full run — once in scrape-ab, once in scrape-e (both jobs run the "Phase A" step; [monthly-rebuild.yml:117](../.github/workflows/monthly-rebuild.yml) and [:155](../.github/workflows/monthly-rebuild.yml)).
- On failure each becomes up to 5 attempts (~30s of backoff), then the **job dies** — Phase A raising is fatal to both scrape jobs.

### Phase B — product catalog

- **Host:** `kfx28d.a.searchspring.io` (`/api/search/category.json`), and nothing else.
- **Structure:** 1 diagnostic request (first leaf, page 1; [products.py:293-317](../scripts/scrapers/geiger/products.py)) + per-leaf pagination: `ceil(products/60)` pages, minimum 1 per leaf.
- **Count: 624 requests.** Derivation: `categories.json` has **482 leaves** (walked the tree; matches the file's own `totalLeafCategories`). Counting each leaf's products in `products.json` (each product records the leaf paths it was found under) gives **623 page-requests** (68 empty leaves at 1 request each; biggest leaf `Home > Shop By > Made in the USA`, 428 products = 8 pages), +1 diagnostic.
- The workflow does **not** run `run_global_only()` (the no-filter full-catalog pass, ~134 more requests). See §5.5 for what that omission does to the output.

### Phase C — facet/modifier memberships (the long pole)

- **Host:** `kfx28d.a.searchspring.io` (`/api/search/category.json`), and nothing else. The `search.json` endpoint is used only by the `--retry-search` tier, which the workflow never invokes.
- **Input:** **21,715 non-root URLs** from `data/pi-urls/category-urls.json` (21,137 facet + 576 modifier + 2 compound-facet; file total 22,180 including 465 roots).
- **Structure:** one filtered query per URL, paginated at 60/page, capped at 50 pages/URL ([memberships.py:135,457](../scripts/scrapers/geiger/memberships.py)). A zero-result URL costs exactly 1 request.
- **Count: ~55,000–60,800 requests.** Derivation: for each of the 21,486 URLs present in `facet-memberships.json`, pages = `min(50, max(1, ceil(len(skus)/60)))`. That sums to **60,568 page-requests** (7,518 zero-result URLs at 1 each; 4,606 URLs need >1 page; 188 URLs need 36 pages; none hit the 50-page cap). The 229 `urlsWithErrors` cost ≥1 more each → **60,797 upper figure**. The honest lower bound: ~3,434 of the stored SKU lists came from the one-off Tier 1/2 recovery passes (809 brand + 2,625 search — CLAUDE.md §16) and a fresh main query would return them as zero (1 page each). Tier 1's inflation is provably tiny (all 2,703 brand-facet URLs together account for only 31 extra pages); Tier 2's can't be isolated from the file, hence the range. **The absolute floor is 21,715** (one request per URL) — and even the floor is thousands of requests, all to Searchspring.
- Split by group (pages from stored lists): plain facets 55,786 · brand facets 2,734 · `search` modifiers 1,490 · `no-minimum` 452 · `closeout` 90 · everything else 16.

### Phase E — brand logos

- **Index:** 1 GET of the HTML page `www.geiger.com/c/shop-by-brand` ([brand_logos.py:41,236](../scripts/scrapers/geiger/brand_logos.py)). All 205 brands and their logo `<img src>` URLs come from this single page.
- **Logo downloads: 0 in the steady state.** The downloader skips any logo already on disk ([brand_logos.py:265](../scripts/scrapers/geiger/brand_logos.py)), and the repo commits **191 logo files** in `data/geiger/brand-logos/` — exactly matching the 191 brands that have a logo URL (`brands.json`: 205 brands, 191 with logos). A checkout therefore satisfies every existing logo; only a **genuinely new brand** triggers a download.
- **Where a new logo would come from** (host split of the 191 recorded `logoSourceUrl`s): `geiger-public-hosted-files-dev.s3.amazonaws.com` 139 · **`imgsirv.geiger.com` 50** · `cdns.crestline.com` 2. These are asset (image) downloads, not data — the only asset downloads anywhere in the rebuild. Product images are never downloaded by any phase (hot-linked at render only).
- A failed logo download is **non-fatal** (3 attempts, then `logoPath: null`, run continues); a failed index fetch **kills the job**.
- `brands.json` itself is assembled locally (cross-referencing `products.json`) — no further requests.

### Assemble job

- **`api.deepseek.com`: 0 requests.** `generate_content.py --skip-existing` iterates the frozen PI URL list (`category-urls.json`, 22,180 URLs) and skips any URL whose output JSON exists — and **all 22,180 JSONs exist** in `data/categories/`. New *Geiger* categories do not create new *PI* URLs, so the workflow comment about "new categories getting fresh copy" is structurally a no-op. (Counted: 22,180 files on disk vs 22,180 URLs.)
- `prune-removed-skus.ts`, `expand-safe-capped-categories.ts`, `compute-summary.ts`: **no network** (grep of `scripts/monthly/` for http/fetch/httpx: zero matches).
- Control plane, small and constant: 1 SMTP session to `smtp.gmail.com`, a handful of `api.github.com`/`github.com` calls (PR create + merge), plus `pypi.org`/`registry.npmjs.org` for dependency installs and GitHub's own artifact/cache traffic.

## 3. The table

| Host | Phase | Requests |
| --- | --- | --- |
| `www.geiger.com` | A (scrape-ab job) | 1 |
| `www.geiger.com` | A again (scrape-e job) | 1 |
| `www.geiger.com` | E (brand index page) | 1 |
| `kfx28d.a.searchspring.io` | B (catalog, 482 leaves paginated) | 624 |
| `kfx28d.a.searchspring.io` | C (21,715 URLs paginated) | ~55,000–60,800 |
| `imgsirv.geiger.com` | E (new-brand logos only) | 0 steady-state |
| `geiger-public-hosted-files-dev.s3.amazonaws.com` | E (new-brand logos only) | 0 steady-state |
| `cdns.crestline.com` | E (new-brand logos only) | 0 steady-state |
| `api.deepseek.com` | assemble | 0 |
| `smtp.gmail.com`, `api.github.com`, pypi/npm | assemble + setup | small constant |

**Totals per host:**

| Host | Total |
| --- | --- |
| `kfx28d.a.searchspring.io` | **~55,600–61,400** (floor 22,339) |
| `www.geiger.com` | **3** |
| logo asset hosts (incl. `imgsirv.geiger.com`) | **0**, unless a new brand appears (then 1 per new logo) |
| `api.deepseek.com` | **0** |

So: **99.995% of the rebuild's scrape traffic goes to Searchspring; exactly 3 requests touch `www.geiger.com`** (SCRAPE-900 said 2 — it missed that the workflow runs Phase A twice). The documented "~21,700 requests" for Phase C is the one-per-URL floor; with pagination the real number is roughly **2.6–2.8× that**. At the workflow's 6 workers × 1 req/sec that is ~2.6–2.8h of Phase C wall-clock, still comfortably inside the job's 350-minute timeout.

## 4. If every `geiger.com` request failed and everything else succeeded

**No — as the workflow is written today, the rebuild produces nothing at all. Not a degraded result: zero output, zero Searchspring requests even attempted.**

The chain, from the workflow gates:

1. Phase A is the **first step of both scrape jobs**. Its `www.geiger.com` fetch failing (after 5 attempts) raises → **scrape-ab fails** and **scrape-e fails** (scrape-e dies at its own Phase A step, before even reaching the brand-index fetch).
2. **scrape-c is gated** on `needs.scrape-ab.result != 'failure'` → **skipped**. The ~60k Searchspring requests that would all have succeeded are never made.
3. **assemble is gated** on no requested job having failed → **skipped**. No PR, no email, no merge; `main` untouched.

This is exactly the shape of the observed run #3 (both scrape jobs dead at ~45s on the same 403 — SCRAPE-900).

**The dependency is orchestration, not data.** What the 3 geiger.com requests actually contribute, versus what's already committed:

- Phase B and Phase C need `categories.json` / `pi-to-geiger.json` / `pi-urls` as inputs — **all committed**, and both phases read them from disk. Neither phase touches `geiger.com` itself. The workflow even proves this: a dispatch with `phases: C` skips scrape-ab (skipped ≠ failed), runs Phase C against the committed files, and assembles a PR — **a path that makes zero `geiger.com` requests and works today**.
- If the two Phase A fetches failed but the run had continued on the committed `categories.json`: `products.json` would be rebuilt fresh from Searchspring against a 3-month-old category tree. Staleness measured against SCRAPE-900's local parse of the live page (549 categories / 486 leaves now, vs 544/482 committed): **~4 new leaves would be missed**, and any category Geiger *renamed or moved* since May would return 0 for its old path, dropping its products unless they're cross-listed elsewhere (the average product carries ~3.3 paths, so most survive). Catalog size at Geiger was 8,185 in SCRAPE-900's probe vs 7,957 committed, so a fresh-taxonomy run would also grow those counts slightly — pushing Phase B/C request counts marginally above the figures in §3.
- If the Phase E index fetch failed: `brands.json` and the logos would simply stay at their committed (June 5) state — new brands missing, existing 205 brands and 191 logos intact and correct.
- The 22,180 category pages themselves are untouched either way: their content JSONs are committed and `--skip-existing` never rewrites them.

**Bottom line for the decision:** the geiger.com surface is 3 HTML fetches (plus 0–a-few new-brand logo downloads, one of whose three hosts is a geiger subdomain). Every one of the ~61k data requests goes to Searchspring, which the weekly scrapes prove works from GitHub Actions. But the current job graph makes phases B, C, E **and** the entire assemble step hostage to those 3 fetches, so today the answer to "would it still produce a complete and correct result" is **no — it produces nothing**; and the *cost* of the geiger.com failure, if the orchestration tolerated it, would be **taxonomy/brand staleness only**, quantified above.

## 5. The specific questions

**5.1 Fallback to committed data.** Falling back happens only when a phase is **skipped** (not selected in `phases`), never when it **fails**: scrape-c and assemble download fresh artifacts gated on `result == 'success'` and otherwise use the checkout's committed files, but any *failed* requested job hard-blocks scrape-c and assemble entirely. Within phases: Phase A — no fallback, fatal. Phase B — the initial diagnostic is fatal, but per-leaf errors after it are recorded (`categoriesWithErrors`) and the run continues. Phase C — per-URL errors are recorded (`urlsWithErrors`) and the run continues; only total inability to start is fatal. Phase E — index fetch fatal; each logo falls back per-file to the committed copy (skip-if-exists) and a failed download is non-fatal.

**5.2 The "six hours" of Phase C.** It is ~21,715 filtered queries (paginating to ~55–61k requests) against `kfx28d.a.searchspring.io/api/search/category.json` — **the unblocked host**. It is not thousands of requests to `geiger.com`; not one Phase C request touches `geiger.com`. The 6h figure is the single-worker floor estimate (21,715 @ 1/sec ≈ 6h); the workflow's 6 workers put the paginated reality at ~2.6–2.8h.

**5.3 Brand logo files.** Fetched from `geiger-public-hosted-files-dev.s3.amazonaws.com` (139 of 191), `imgsirv.geiger.com` (50), `cdns.crestline.com` (2) — but only for brands whose file is not already committed, i.e. **0 downloads in the steady state**. Caveat for later fixing: new-brand downloads use plain httpx with **no Chrome impersonation** — the exact configuration SCRAPE-900 measured as 403 (`cf-mitigated: challenge`) on `www.geiger.com` — so a new logo hosted on `imgsirv.geiger.com` plausibly fails from a runner too. That failure is per-logo and non-fatal.

**5.4 Never run from GitHub Actions?** The full rebuild has been **attempted** (SCRAPE-900 documents run #3; runs #1–2 uninspected) and has **never passed Phase A from a runner** — so Phases B, C and E have *never executed from GitHub Actions at all*, not "run and failed": Phase A dies first and they are never reached. No `chore(data): monthly catalog rebuild` commit exists in the repo history, and all four outputs still carry their original local-scrape timestamps (`categories.json` 2026-05-16, `products.json` 2026-05-21, `facet-memberships.json` 2026-05-23, `brands.json` 2026-06-05). What **is** proven from GitHub Actions: Searchspring works — the weekly Searchspring-only scrapes ran and merged repeatedly (`deals.json` scraped 2026-07-05, `new-products.json` 2026-07-06, `rush-products.json` 2026-07-06, `catalogs.json` 2026-07-14, each with matching auto-merge commits). I could not read the production repo's Actions run list directly — the stored GitHub credential on this machine gets 404 from `api.github.com` for `pbnj53/perfectimprints` — so the count of attempts beyond run #3 comes from SCRAPE-900, not from me. (The 2026-07-14 catalogs run also *attempts* `patrickblack.geiger.com` fetches, but those are non-fatal-on-failure by design, so its merge does not prove that host works from a runner.)

**5.5 Found while counting — two ways a fully *successful* rebuild still would not reproduce today's data.** Reported because §4 defines "complete" as the full catalog + memberships; not blocking, but it changes what "the rebuild works" means:

- **The global top-up never runs.** 822 of the 7,957 committed products (10.3%) carry only the path `Home` — they were found *only* by the `--global-only` no-filter pass (run manually in May), which no workflow invokes. A fresh Phase B rebuilds `products.json` from scratch via the leaf walk and **loses all 822**; `prune-removed-skus` then strips them from the baked pages. Counted impact: **4,319 baked category JSONs** reference at least one of them (55,891 SKU references, 748 distinct SKUs) — those grids shrink, on a rebuild where every request succeeded.
- **The recovery tiers never run.** The committed `facet-memberships.json` includes ~3,434 URLs whose SKU lists came from the one-off `--retry-brands`/`--retry-search` passes. A fresh Phase C regenerates the file without them, so those URLs revert to zero in the new memberships file. (The baked pages' own `productSkus` are not regenerated, so page grids keep their committed lists minus pruning — the regression lands on everything that reads `facet-memberships.json`: the filter sidebar/overlay, facet counts, and the warmup ranking.)

## 6. Where each number came from

| Number | Source |
| --- | --- |
| 2× Phase A + 1× Phase E geiger.com fetches | [monthly-rebuild.yml](../.github/workflows/monthly-rebuild.yml) steps; `GEIGER_DISCOVERY_URL`/`SHOP_BY_BRAND_URL` in [config.py](../scripts/scrapers/geiger/config.py) / [brand_logos.py](../scripts/scrapers/geiger/brand_logos.py) |
| 482 leaves | `data/geiger/categories.json` (`totalLeafCategories`; independently re-walked) |
| 624 Phase B requests | per-leaf product counts from `data/geiger/products.json` (7,957 products) at 60/page, +1 diagnostic |
| 21,715 Phase C URLs | `data/pi-urls/category-urls.json` (22,180 total; 21,137 facet + 576 modifier + 2 compound) |
| 60,568 (+229) Phase C page-requests | per-URL SKU list lengths in `data/geiger/facet-memberships.json` at 60/page, 50-page cap; `urlsWithErrors: 229` |
| 205 brands / 191 logos / host split | `data/geiger/brands.json` (`logoSourceUrl` per brand); 191 files counted in `data/geiger/brand-logos/` |
| 0 DeepSeek calls | 22,180 files counted in `data/categories/` vs the 22,180-URL worklist `generate_content.py --skip-existing` iterates |
| 822 / 4,319 / 55,891 | products with `category_paths == ["Home"]` in `products.json`, cross-referenced against every baked `data/categories/*.json` `productSkus` array |
| "never merged" | `git log --all --grep` (no monthly-rebuild commit) + the four outputs' `scrapedAt` stamps |

**What could not be counted from the repo:** (a) the exact fresh-run Phase C page total (the recovery-tier share of the stored lists isn't labeled — hence the ~55–61k range; the floor 21,715 and the split by URL type are exact); (b) how much the counts grow with Geiger's current, slightly larger catalog (8,185 products / 486 leaves per SCRAPE-900's live probe — a few percent); (c) the production repo's full Actions attempt history (credential denied — the Actions tab of `pbnj53/perfectimprints` settles it in one look).

No recommendations in this document, per the task. Nothing was changed except adding this file.
