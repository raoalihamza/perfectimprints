# Monthly rebuild scripts (M6-606)

Helpers for the full-catalog monthly refresh driven by
[`.github/workflows/monthly-rebuild.yml`](../../.github/workflows/monthly-rebuild.yml).
They run in the workflow's `assemble` job, after the scrape jobs have refreshed
`data/geiger/*`.

| Script | pnpm alias | What it does |
| --- | --- | --- |
| `prune-removed-skus.ts` | `pnpm monthly:prune-skus` | Drops SKUs no longer in `products.json` from every baked `data/categories/*.json` `productSkus[]`. Render-time already skips missing SKUs (`resolveProducts`), so this only keeps the committed data accurate + the PR diff explicit. Removal-only, idempotent. |
| `compute-summary.ts` | `pnpm monthly:summary` | Diffs the fresh data vs `HEAD` (products added/removed/price-changed, brands, brand logos, new/updated category pages). Writes `.artifacts/summary.json` + `.artifacts/pr-body.md`, and `changed=<bool>` to `$GITHUB_OUTPUT`. Read-only on tracked files. |
| `send-summary-email.ts` | `pnpm monthly:email` | Emails Patrick the summary via Gmail SMTP (same transport as the lead form). No-ops with a warning if `GMAIL_USER`/`GMAIL_APP_PASSWORD` are absent. Reads `MONTHLY_PR_URL` for the PR link. |

`.artifacts/` is gitignored (intermediate summary/body/report files).

## The 6-hour split

GitHub-hosted runners cap a job at 6h and Phase C (facet memberships) is ~6h at
1 req/sec, so the workflow splits the scrape across jobs joined by artifacts —
`scrape-ab` (Phase A→B), `scrape-e` (Phase E, parallel), `scrape-c` (Phase C with
`--workers 6` + `--resume` + cached checkpoint), then `assemble`. See the header
comment in the workflow file and the "Monthly auto-rebuild" section of
`CLAUDE.md` for the full rationale.

## Required secrets

Set on both repos (`raoalihamza/perfectimprints` staging + `pbnj53/perfectimprints`
production), in Settings → Secrets and variables → Actions:

- `DEEPSEEK_API_KEY` — AI content for new categories
- `GMAIL_USER` + `GMAIL_APP_PASSWORD` — summary email
- optional `LEAD_EMAIL_TO` / `LEAD_EMAIL_FROM` (default `patrick@perfectimprints.com`)

No Sanity secrets — content is written to `data/categories/*.json` only.
