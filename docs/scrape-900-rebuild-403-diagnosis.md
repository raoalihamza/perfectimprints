# SCRAPE-900 — Why the Full Catalog Rebuild failed (diagnosis, no changes made)

**Date:** 2026-08-16
**Run:** Monthly rebuild run #3 in `pbnj53/perfectimprints`, manually triggered, failed in 1m 0s.
**Failing jobs:** Phase A+B (45s) and Phase E (48s), both on `httpx.HTTPStatusError: 403 for https://www.geiger.com/b/accessories`, raised from `scripts/scrapers/geiger/client.py:110` via `discover.py:190`.
**Scope of this document:** diagnosis only. No code, workflow, or data was changed. All statements below are from reading the production repo's code and history, plus live HTTP probes run from Ali's machine on 2026-08-16.

---

## 1. The immediate cause

**Cloudflare bot management on `www.geiger.com` is challenging the request, and from a GitHub-hosted runner the scraper cannot pass the challenge. The code, the URL, and the page are all still correct — the blocker is where the request comes from.**

The evidence, in order:

**The scraper's exact configuration works right now — from a normal machine.** I replayed the request from Ali's machine using byte-identical client settings (curl_cffi `impersonate="chrome131"`, the same nine headers from `config.py`/`client.py`):

| Probe (all against `/b/accessories`) | Status | Notes |
| --- | --- | --- |
| curl_cffi chrome131 + exact scraper headers | **200** | Full real page, 105 KB |
| curl_cffi chrome131, default headers | **200** | Cloudflare cache HIT |
| curl_cffi chrome136 (newest impersonation) | **200** | |
| Plain httpx + the same Chrome UA string, **no TLS impersonation** | **403** | `cf-mitigated: challenge` |
| Plain httpx, default python UA | **403** | `cf-mitigated: challenge`, "Just a moment…" interstitial |
| Searchspring API (`kfx28d.a.searchspring.io`), plain httpx, no impersonation at all | **200** | `totalResults: 8185` |
| `www.geiger.com/` homepage, exact scraper config | **200** | Whole host serves fine |

Two things fall out of that table:

- **The User-Agent string is irrelevant.** The 403 vs 200 line runs between "real Chrome TLS fingerprint" and "Python TLS fingerprint" — the same browser UA string got 403 without impersonation and 200 with it. The response header on the block is `cf-mitigated: challenge`: Cloudflare's managed JS challenge, which a non-browser client can never answer. This is a **bot challenge, not a rate limit** — there is no `Retry-After`, and Phase A's request is the *first request of the entire run*, so nothing could have tripped a rate limit before it.
- **The scraper's impersonation still defeats the challenge — from a residential IP.** Same curl_cffi version family the CI run would have installed (0.15.0 locally; `pyproject.toml` pins only `curl-cffi>=0.7`), same headers, 200 every time.

So the only variable left between "works from Ali's machine" and "403 from the runner" is the **source IP**. GitHub-hosted runners live in Azure datacenter ranges, and Cloudflare's bot scoring weighs IP/ASN reputation heavily — a datacenter IP gets challenged where a residential IP with the identical TLS fingerprint passes. This matches the run's shape exactly: two *independent* jobs (`scrape-ab` and `scrape-e`) on two different runners each made their very first request to the same URL and each got 403 on all five retry attempts (~30s of exponential backoff — waits of 2+4+8+16s — which is why both jobs died at the ~45s mark).

**The URL is still the right one and the page still parses.** I ran the production repo's own Phase A parser (`_find_mega_menu` → `_walk_menu` → `_unwrap_shop_by_product` → `_drop_non_product_branches`) over the live page fetched from here: mega menu found in a `<nav>`, **549 categories / 486 leaves** extracted (May baseline was 544/482), top-level departments unchanged (Apparel, Bags & Totes, Drinkware, …). Nothing about the page moved or renamed. Had the runner's request gone through, Phase A would have succeeded.

**Important context: this workflow has almost certainly never passed Phase A from GitHub Actions.** The user-visible framing "it worked on 21 May" is true but misleading about *where* it worked:

- `categories.json` (`scrapedAt: 2026-05-16`) and `products.json` (`2026-05-21`) were produced by **local runs on Ali's machine** — in both the production and staging repos, those files have never been refreshed since.
- There is **no `chore(data): monthly catalog rebuild` commit in either repo's entire history**. The rebuild has never completed anywhere.
- The only `github-actions[bot]` data commits are the weekly deals/new/rush snapshots — which hit **only Searchspring**, the endpoint the table above shows is completely unprotected.
- `brands.json` (June 5) and `catalogs.json` (July 14) were also committed by Ali from local runs.

So run #3's failure is very likely not a regression from a working CI state — it is the first (or one of the first) times the workflow's `www.geiger.com` fetch path has been exercised from a datacenter IP at all. (Runs #1 and #2 could not be inspected from this machine — see §4.)

**Nothing in the scraper changed since it last worked.** The production repo's scraper files are byte-identical to staging's, and the last commits touching `client.py`/`config.py`/`discover.py` predate the successful May 21 catalog scrape.

### How the client actually behaves (requested detail)

- **Transport:** curl_cffi `Session(impersonate="chrome131")` — real Chrome 131 TLS/JA3 fingerprint. This is what has been getting through Cloudflare since May.
- **Headers:** Chrome 131 UA + `Accept`/`Accept-Language`/`Accept-Encoding`/`Sec-Fetch-*`/`Upgrade-Insecure-Requests` — a coherent browser navigation header set.
- **Throttle:** `RateLimiter` enforcing ≥1.0s between calls, applied in `get()`. Phase A makes exactly **one** request, so throttle is irrelevant to this failure.
- **Timeout:** 30s per request.
- **Retry:** tenacity `stop_after_attempt(5)`, `wait_exponential(multiplier=2, min=1, max=30)`, `reraise=True`.
- **Status handling — two real defects found here:**
  1. **The "4xx not retryable" logic is dead code.** `_is_retryable_status()` (retry 5xx, not 4xx) exists, and `get()`'s comment says "4xx errors are not retryable — re-raise immediately", but the tenacity decorator on `_do_get` retries on the **exception type** (`httpx.HTTPStatusError`) regardless of status code, and both branches of `get()`'s `except` just `raise`. Net effect: a 403 is hammered **five times** with 30s of backoff before failing — pointless against a deterministic challenge, slower to fail, and it makes the client look *more* bot-like to Cloudflare, not less.
  2. **The error path destroys the evidence.** On any ≥400, `_do_get` builds a **synthetic, empty** `httpx.Response(status_code=...)` — the real response body and headers are discarded. That is why the run log could only say "403" and not "403 with `cf-mitigated: challenge` and a Cloudflare interstitial body," which would have made this diagnosis instant. The `Retry-After` question (§4 of the task) is unanswerable from the logs *because of this* — though the local probe shows no `Retry-After` is sent.

---

## 2. Why one bad page killed the entire run

**Phase A is a one-request phase with no error handling, no fallback, and two jobs depend on it independently.** The resilience the rest of the pipeline has simply does not exist at its entry point.

Per-phase failure behavior as the code stands today:

| Phase | What happens when ONE URL fails | Skip/record? | Checkpoint/resume? |
| --- | --- | --- | --- |
| **A** (taxonomy, 1 request) | Exception propagates out of `discover.run()`; `run.py` has no try/except → **process exits 1, job fails** | **No** | None (single fetch, nothing to checkpoint) |
| **B** (products, ~486 leaf categories) | Per-leaf `try/except` → recorded in `categoriesWithErrors`, **run continues**. *Exception:* the first-leaf "diagnostic" probe at startup is outside the try/except and is fatal if it fails. | Yes | Real: state saved every 5 leaves; `--resume` + Actions cache (`phase-b-<run_id>` with `phase-b-` restore-keys) genuinely resumes a re-run |
| **C** (memberships, ~21,715 URLs) | Per-URL `try/except` → `urlsWithErrors`, continues. Dedicated `--retry-errors` mode re-runs just the failures later; plus the 4-tier zero-result recovery | Yes, best in the pipeline | Real: every 100 URLs, `--resume`, cached |
| **E** (brand logos) | The **index fetch** (`/c/shop-by-brand`) is unguarded like Phase A → fatal. Individual **logo downloads** are per-logo try/except with 3 retries → recorded as `failed`, continues; resumable via file-exists check | Index: no. Logos: yes | Logos effectively resumable (skip files on disk); no state file |

So the answer to "does any phase already have skip-and-record?" is: **yes — B, C, and E's download loop all have exactly the mechanism that A and E's entry fetches lack.** Phase C even has the retry-the-failures-at-the-end pass the task description assumed existed everywhere. The newest scraper in the repo (Phase I, `scrape_catalogs.py`) goes further still: its geiger.com asset-metadata fetches are explicitly **non-fatal — on failure it keeps the previous run's values, warns, and continues**. The pattern the pipeline needed here already exists in the same directory; it was never applied backwards to A and E.

**The missing fallback is sitting in the checkout.** `data/geiger/categories.json` — a complete, working taxonomy — is committed to the repo and present in every runner's working directory at the moment Phase A dies. Phase A does not fall back to it. If it had, Phase B would have proceeded — and Phase B talks **only to Searchspring, which works perfectly from GitHub runners** (the weekly scrapes prove this every week, and the live probe confirmed it plainly, with no impersonation needed). Phase C likewise is Searchspring-only. In other words: **~99.99% of the rebuild's requests go to an endpoint CI can reach; the run died on the one URL that goes somewhere else.**

**Phase E's duplicate Phase A is unnecessary — the workflow comment justifying it is factually wrong.** `scrape-e` runs its own "Phase A — taxonomy (for Phase E inputs)" step, with a comment saying "Phase E reads categories.json; regenerate it cheaply." **`brand_logos.py` never reads `categories.json`.** It reads `products.json` (for product counts, with a graceful warning-and-zero-counts path if missing) and fetches the shop-by-brand index live. The step exists on a false premise and doubled the blast radius of the block. Removing it would not have saved this run — Phase E's own fetch of `www.geiger.com/c/shop-by-brand` would presumably have hit the same 403 a minute later — but it is pure waste either way.

**Workflow-level propagation behaved correctly.** `scrape-c` is gated on `needs.scrape-ab.result != 'failure'` and the `assemble` job requires no requested job hard-failed, so Phase C never started, no PR was opened, nothing merged, nothing deployed. The fail-safe did its job; a rebuild from bad data would have been far worse.

**Resume reality:** the checkpoints are real (B and C write actual state files, the Actions cache restore-keys let a re-run of the same workflow pick up a prior partial run), but checkpoints only help a run that got *past* its first request. A run blocked at request #1 has nothing to resume.

---

## 3. Options for fixing it (not implemented — the choice is Ali's/Patrick's)

**Option 0 — Unblock now, zero code: run the rebuild locally, like every successful run to date.**
`python -m scripts.scrapers.geiger.run --phase all` from Ali's machine (~7h, mostly Phase C), then push the data as a PR. This is exactly how all the current data was produced.
*Trade-off:* manual, ties up a machine, and the Site Refresh button stays broken. Fine as a stopgap; not a fix. (Worth doing soon regardless of the fix chosen — see §5: the catalog has drifted ~200+ SKUs since May.)

**Option 1 — Quick code fix, big resilience win: make the geiger.com HTML fetches degrade instead of kill.**
Four small, independent changes:
1. Phase A falls back to the committed `categories.json` on fetch failure — loud warning, and a "taxonomy is stale (from <date>)" flag carried into the change summary/PR body/email so it can never rot silently.
2. Delete the pointless Phase A step from `scrape-e`.
3. Make Phase E's index fetch non-fatal: on failure keep the committed `brands.json` + logos (the Phase I `scrape_catalogs.py` precedent, already written and proven in this repo).
4. In `client.py`: wire `_is_retryable_status` into the retry predicate (stop retrying 4xx five times) and stop discarding the response body/headers on error — log status + `cf-mitigated` + a body snippet so the next block is diagnosable from the run log alone.
*Result:* the rebuild completes from CI on Searchspring data alone (fresh products + memberships — the bulk of the value); taxonomy and brand logos refresh opportunistically whenever geiger.com is reachable.
*Trade-off:* while geiger.com stays blocked from CI, new Geiger *categories* and new *brand logos* won't refresh (the frozen PI URL set means new categories mostly don't create pages anyway, so the practical cost is small). This option is worth doing **no matter what else is chosen** — a scraper of 21,716 URLs should never be killable by one.

**Option 2 — Make the geiger.com fetch actually work from CI.**
Either (a) route *only* the `www.geiger.com` requests through a residential/ISP proxy (an env-var-driven proxy in `ScraperClient`, credential as an Actions secret), or (b) run the two HTML-fetching steps on a machine with a clean IP (self-hosted runner, or a small scheduled job on Ali's machine that commits `categories.json`/`brands.json` artifacts for CI to consume).
*Trade-off:* (a) recurring proxy cost, a new secret, a third-party dependency, and it's an arms race — Cloudflare tuning can re-break it; (b) reintroduces a dependency on a personal machine being on. Patrick is an authorized Geiger distributor scraping data he's entitled to use, so this is etiquette/robustness territory rather than a legitimacy problem — but Option 3 is the honest version of the same goal.

**Option 3 — The durable one: ask Geiger.**
Patrick is an authorized distributor. Geiger can add a Cloudflare WAF skip/allowlist rule (by token header, or for a declared IP) for this scraper, or provide the taxonomy/brand list as a feed. Searchspring — their own product API — is already wide open, so the ask is small: two HTML pages.
*Trade-off:* depends on Geiger's responsiveness (the `patrickblack.geiger.com` activation has been pending since May, which is not encouraging), and it needs Patrick to make the ask.

**Recommended shape, if asked:** Option 1 immediately (it is correct in every future world), Option 0 once now so Patrick gets current data, Option 3 in parallel as the durable path, Option 2(a) only if Option 3 stalls.

---

## 4. What could not be determined from this machine, and what would settle it

- **The actual run logs.** No `gh` CLI is installed locally and no GitHub token with access to `pbnj53/perfectimprints` exists in the local env files, so I could not read runs #1–#3. Settles: whether runs #1/#2 failed identically (confirming "never worked from CI") or passed Phase A at some point (which would mean Cloudflare's posture changed recently); the exact step timings; and the literal text of the Node warnings. *To settle: open the Actions tab, or install `gh` and `gh run view --log-failed` the three runs.*
- **Whether the block from GitHub's IP range is deterministic or probabilistic.** The local probe proves the fingerprint passes from a residential IP and fails without impersonation; it cannot prove what Cloudflare does to an Azure IP *with* the impersonated fingerprint. The two-jobs-both-403-five-times pattern strongly suggests deterministic, but only a probe run from a GitHub runner settles it (a trivial throwaway workflow that fetches the URL and prints status + headers — one manual dispatch, no data changes; needs Ali's go-ahead since it costs a run).
- **The exact curl_cffi version the failed run resolved** (`pip install -e .` takes the latest satisfying `>=0.7`). The run log's pip output would show it. Local 0.15.0 passes from a residential IP, so version drift is unlikely to be the differentiator — but it is unconfirmed for the runner.
- **My probes exited via a Singapore Cloudflare edge** (`cf-ray …-SIN`); the runner exits via US Azure. Cloudflare rules can vary by geography, so the 200s here are strong but not airtight proof the *content* of the block is identical — the fingerprint-vs-IP conclusion doesn't depend on it, but exactness does.

**The Node.js deprecation warnings: noise.** The failing code path is pure Python (`setup-python` → `pip install` → `python -m …`); no Node executes in those jobs' failing steps. Deprecation warnings in Actions runs come from the JavaScript-based actions themselves (checkout/cache/upload-artifact running on the runner's Node), are appearing across the industry as GitHub deprecates older Node runtimes, and cannot produce an HTTP 403 from Cloudflare. They can be ignored for this incident.

---

## 5. Surprises worth recording

1. **The pipeline's data is three months stale and the catalog has genuinely moved.** Searchspring reports **8,185** products today vs 7,971 in May (~200+ new SKUs not on the site), and the live taxonomy shows 549 categories vs the baked 544. The rebuild this run was supposed to do is genuinely overdue — one more reason to run Option 0 soon.
2. **No monthly rebuild has ever completed, in either repo.** The workflow shipped ~June 30; all Geiger HTML data on the site still traces to Ali's local May/June/July runs. The "Full Catalog Rebuild" button has plausibly never had a green path from end to end.
3. **The intended 4xx fast-fail was never wired in.** `_is_retryable_status` exists, is commented as the policy, and is dead code — a 403 gets retried five times.
4. **The error handler throws away the response** (synthetic empty `httpx.Response`), which is precisely why the run log couldn't name Cloudflare. One log line of body/headers would have cut this diagnosis to minutes.
5. **`scrape-e`'s own Phase A step is justified by a comment that is wrong** — `brand_logos.py` never reads `categories.json`.
6. **The resilience pattern the run needed already exists twice in the same directory** — Phase C's `urlsWithErrors` + `--retry-errors`, and Phase I's keep-previous-on-failure — it just was never applied to the two single-fetch entry points.
7. **The one hard dependency on `www.geiger.com` HTML is two pages** (`/b/accessories`, `/c/shop-by-brand`). Everything else — products, memberships, deals, new, rush — is Searchspring, which is open even to a plain unimpersonated Python client.

---

*Probes run 2026-08-16 from Ali's machine (7 GET requests total, ≥1.5s apart). No repo file other than this report was created or modified. No workflow was re-run.*
