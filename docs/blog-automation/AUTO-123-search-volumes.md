# Refreshing the search volumes (AUTO-123, rewritten for AUTO-124)

Written for Ali. The Blog Topics panel reads `data/blog-automation/search-volumes.json`, a committed file. This is how it is refreshed, what it costs, and what the numbers in it mean. Patrick never does any of this; if it is never done, the panel says the figures are old or absent and works as before.

**The refresh is one command since AUTO-124 (2026-10-03).** The earlier loop (`plan`, a Claude Code session calling Ubersuggest, `merge`) no longer exists; `pnpm auto:volumes plan` and `pnpm auto:volumes merge` now print a message saying so and do nothing. Ubersuggest is no longer the source.

## What the file holds

- One entry per term: `v` (Google Ads Keyword Planner's average monthly searches in the United States, read through Patrick's DataForSEO account; `null` when Google returned no figure), `f` (the day it was looked up, UTC), `m` (the month Google's own 12-month series runs to).
- A `failed` list: terms whose lookup got no answer. The panel shows those as "not looked up", and the refresh skips them until `--retry-failed`.
- One term per line, sorted A to Z, so a refresh is a readable diff.

It never changes a topic's state, count or default order. It is a column.

## Where the figures come from, and what a refresh costs

- DataForSEO, endpoint `keywords_data/google_ads/search_volume/live`, location code 2840 (United States), language `en`. Up to 1,000 terms in one task.
- **9 cents a task** on Patrick's account, whatever the number of terms in it. A rejected task costs nothing.
- Today's pool (2026-10-03, 4,420 topics): the usable topics are 2,227 terms, **3 tasks, 27 cents**. With `--include-excluded` it is 4,279 terms, 5 tasks, 45 cents. A refresh takes about two minutes, most of it reading Search Console.
- The credentials are `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` in `.env.local` of the repo the command is run from. **They are never added in Vercel**: the site reads the committed file and calls no keyword API. The script never prints them.

## The steps

Run from a repo whose `.env.local` has the Search Console key and the two DataForSEO variables.

1. `pnpm auto:volumes`
   The dry run. Builds today's pool from Search Console (about a minute), says how many terms would be looked up, in how many tasks, for how much, what the balance is and what the cap still allows today. **Spends nothing, writes nothing.**
2. `pnpm auto:volumes --commit`
   Looks the terms up and writes the committed file. This is the only flag that spends money or writes the file. It prints the balance before, after each task, and at the end.
3. Review the diff of `data/blog-automation/search-volumes.json`, commit, push. The next deploy carries the figures; the panel's dashed line will read "Figures for N of the topics ..." with the new date.

That is the whole refresh. Do it two or three times a year, or when the panel's age line is more than six months old.

### Flags

| Flag | What it does |
|---|---|
| `--commit` | Look up and write. Without it nothing is spent or written. `--dry-run` wins over it. |
| `--include-excluded` | Also look up the topics the tab excludes and the ones Patrick blocked. Default: usable topics only. |
| `--refresh-after N` | Also re-look-up figures older than N days, oldest first. Default 180. |
| `--retry-failed` | Also retry terms whose last lookup got no answer. |
| `--max-cents N` | The cap on what this machine may spend in one UTC day. Default 60. |

### Other commands

- `pnpm auto:volumes status`: offline. Coverage and age of the file, and what this machine spent today.
- `pnpm auto:volumes check`: free calls only. The balance, the task price, the month Google's figures run to, and that location 2840 is the United States and `en` is English, read from DataForSEO's own lists.
- `pnpm auto:volumes compare`: what a comparison would send (free). `pnpm auto:volumes compare --pay` sends ONE task (9 cents) for the terms already in the file and prints which figures have changed. It never writes the file. Use it to decide whether a refresh is worth doing.

## The cap, and what it cannot do

- Before every paid call the script reserves one task's price in `data/.local/search-volumes/spend.json` (gitignored) and refuses the call if the day's total would pass the cap. The reservation is on disk before the call leaves, and a call whose answer never arrives stays reserved. The cap counts every run on this machine in the same UTC day, so starting the script again and again cannot pass it.
- Default 60 cents a day: a full pass over every topic is 45 cents, so the default never gets in the way and no bug in the script can spend more than 60 cents a day.
- **A cap inside the script cannot protect against a bug in the script, or against the credentials being used somewhere else.** In the DataForSEO panel, lower the account's own daily spending limit from the $1,000 it is today to the smallest amount the panel accepts (a dollar or two is plenty), and turn on the low-balance email if there is one. Do not add a card or enable auto top-up: with a prepaid balance the most that can ever be lost is the balance.

## Stopping and resuming

The committed file is the checkpoint and it is written after every task. If a run stops (the cap, a failed call, a closed laptop), everything answered so far is already in the file; run the same command again and it looks up only what is missing.

## What the first DataForSEO run will change (measured 2026-10-03)

The 60 figures already in the file came from Ubersuggest on 2026-10-02. The same 60 terms were looked up through DataForSEO:

- 40 are identical.
- 18 differ by one or two steps on Google's ladder (17 lower, 1 higher: "business pens" 1,600 to 1,000, "custom matchbooks" 9,900 to 12,100, "custom stress toys" 3,600 to 2,900). Ubersuggest serves older snapshots for some terms: all five terms whose Ubersuggest series ended in December 2025 differ, and all five whose series ended in September 2026 agree. DataForSEO's series ends in August 2026 for every term.
- 2 that Ubersuggest stored as **0** come back with **no figure** ("custom flashlight keychains in bulk", "promotional pens plymouth logo printing"). Google returned nothing for them; Ubersuggest printed that as 0. After the first refresh those rows read "no figure from Google Ads".

So the first `--commit` run looks all 60 up again before anything else and the file is one source afterwards (its `source` line changes when the last earlier figure is replaced).

## Terms that cannot be sent

Google Ads refuses a keyword with `, ? ( ) ! % ; @ * =` or typographic characters, more than 10 words, or more than 80 characters, and one such keyword rejects the whole task. The script checks every term first. For a row whose own wording cannot be sent it sends a member wording, or the wording with the refused characters removed when that is still the same topic ("... in melbourne, fl" as "... in melbourne fl"); the panel then says which wording the figure is for. A row with no sendable wording (3 of the 2,229 usable topics today, all questions of more than 10 words) is listed in the dry run and stays "not looked up". If DataForSEO still rejects a term the script did not expect, it records that term as failed and sends the task again without it; rejections cost nothing.

## If something looks wrong

- Dry run says the balance cannot be read: the two variables are missing from this repo's `.env.local`, or wrong (DataForSEO answers 40100).
- `--commit` stops with "the cap": expected when the day's cap is reached. Run again tomorrow, or raise `--max-cents`.
- Panel says "No search volumes have been looked up yet" on production after a deploy that carried the file: the function did not get the file. Check the deployment includes `data/blog-automation/search-volumes.json` (the route reads it the way lib/categories.ts reads products.json).
- A term shows "for "..."" under its figure: the figure was fetched for another wording of the same topic. That is correct and labelled.
- `pnpm auto:volumes check` reports a PROBLEM: the location or language code no longer means what the file says. Do not run `--commit` until that is understood.
