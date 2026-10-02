# AUTO-123: refreshing the search volumes

Written for Ali. The Blog Topics panel reads `data/blog-automation/search-volumes.json`, a committed file. This is how it is refreshed, and what the numbers in it mean. Patrick never does any of this; if it is never done, the panel says the figures are old or absent and works as before.

## What the file holds

- One entry per term: `v` (Google Ads Keyword Planner's average monthly searches in the United States, read through Patrick's Ubersuggest plan; `null` when Google returned no figure), `f` (the day it was looked up), `m` (the month Google's own 12-month series runs to, which differs per term).
- A `failed` list: terms whose lookup got no answer (refused or errored). The panel shows those as "not looked up", and `plan` skips them until `--retry-failed`.
- One term per line, sorted A to Z, so a refresh is a readable diff.

It never changes a topic's state, count or default order. It is a column.

## Why it is two commands with a Claude Code session in the middle

The volumes come from the Ubersuggest MCP connector, an HTTP server Claude Code holds the sign-in for. A script cannot call it, and no Ubersuggest key may ever be put in the repo or on the site. So the script does the deterministic parts (which terms, in what order, how many; then folding the answers into the file) and Claude Code makes the calls between them.

## The loop

Run from the production repo (it has the Search Console key in `.env.local`).

1. `pnpm auto:volumes plan`
   Builds today's pool from Search Console (about a minute), skips every term already in the file (unless it is older than 180 days) and every failed term, orders the rest by priority (usable topics first, then excluded, then blocked; the 90-day list before the topics the 16 months added; most impressions first), takes at most 250 (`--cap N` to change; the plan allows 300 reports a day and Patrick uses the account too), and writes `data/.local/search-volumes/batch.json`. Nothing else is written.
2. In a Claude Code session in the same repo, say:
   "Look up the terms in data/.local/search-volumes/batch.json with the Ubersuggest keyword_overview tool (locId 2840, language en), one call per term and no more calls than the file has terms, and write the answers to data/.local/search-volumes/results.json as { fetchedOn: today, results: { term: the whole answer, or { error } when a call is refused } }. Do not call DataForSEO."
   Do not retry a refused call; it is recorded as failed and can be retried another day with `--retry-failed`.
3. `pnpm auto:volumes merge`
   A dry run: prints added / updated / unchanged / failed / rejected and the first new figures. A figure that is not a whole number of 0 or more is rejected, never stored as 0.
4. `pnpm auto:volumes merge --commit`
   The only command that writes the committed file. It moves `results.json` aside so it cannot be merged twice.
5. Review the diff, commit, push. The next deploy carries the figures; the panel's dashed line will read "Figures for N of the topics ..." with the new dates.

Repeat daily until `plan` reports 0 remaining (a full pass over today's 4,413 topics at 250 a day is 18 runs). After that, two or three times a year, or whenever the panel's age line is more than six months old. `pnpm auto:volumes status` prints the file's coverage and ages without building the pool.

## Numbers from the first run (2026-10-02)

- 60 terms looked up (61 calls with the account check), none refused; file 4,381 bytes, 73 bytes a term.
- A full-pool file is about 385 KB (51 KB gzip).
- The panel's route reads the file in 12 to 27 ms; it is not in the cached snapshot and adds nothing to it.
- Sharpest disagreements with impressions: koozie 304 impressions against 49,500 searches a month; promotional footballs 1,683 against 90.

## If something looks wrong

- Panel says "No search volumes have been looked up yet" on production after a deploy that carried the file: the function did not get the file. Check the deployment includes `data/blog-automation/search-volumes.json` (the route reads it the way lib/categories.ts reads products.json).
- A term shows "for "..."" under its figure: the figure was fetched for another wording of the same topic (a different spacing, or the same words in another order). That is correct and labelled; looking the row's own wording up later replaces it.
- `merge` reports rejected terms: the results file carries a figure that is not a whole number. Fix the results file; nothing was stored for those.
