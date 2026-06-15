# Perfect Imprints Blog Snapshot — 2026-06-15

Second clean snapshot of all PI blog content. Supersedes the
2026-06-10 archive (which captured only the first content block per blog
because the scraper didn't scroll, truncating every multi-section listicle).

## What changed since the 2026-06-10 snapshot

- **Scroll-to-load** added to the scraper so all lazy-loaded `.fdb-block`
  sections are in the DOM before extraction. Listicles like
  `paramedic-shares-ems-appreciation-gifts-ems-week` now capture 16 content
  blocks instead of 2.
- **Product-grid stripping**: contents blocks whose signature is "2+
  anchors to `/products/` each wrapping an `<img>`" are removed. The
  product display will be reintroduced via a separate Studio editing block
  later, not from scrape data.
- **Filter to `data-block-type="contents"`**: the top megamenu (12 fdb-blocks
  of type `navigation`) and bottom footer fdb-block are excluded.

## Counts

- **645 raw blogs** scraped successfully (88% of 731 GA4-known URLs)
- **78 confirmed-deleted** URLs skipped during retry-failed pass — see
  `failed-slugs.txt` (copy of the repo's `data/blogs/.failed-slugs.txt`)
- **8 newly-failed** URLs that couldn't be recovered even with patient
  retry settings (Cloudflare Turnstile escalations the scraper couldn't
  pass)
- Final Sanity state: 645 published + 86 hidden stubs (78 deleted + 8
  unrecoverable)

## Folder contents

| Path | What | Size |
|------|------|------|
| `raw/` | 645 per-blog JSONs (title, body HTML, embeds, images, author, dates, categories, inline links). Includes new fields: `contentBlockCount`, `strippedGridCount`. | ~16 MB |
| `rescrape-report.md` | Programmatic verification report from the import (spot-checks, short-body list, failed slugs) | tiny |
| `migration-mapping-report.json` | Sanity relatedCategorySlugs coverage from import | tiny |
| `verification-report.json` | Sample-blog structural validation | tiny |
| `failed-slugs.txt` | 82 deleted-on-PI URLs (Patrick-verified). Same copy lives at `data/blogs/.failed-slugs.txt` in the repo. | tiny |
| `scrape-errors.log*` | Per-attempt failure logs (pre-tune, pre-network-change, prev-run, final) | small |

## Schema of `raw/<slug>.json`

Same as the 2026-06-10 archive plus two new fields:

```jsonc
{
  // ... existing fields ...
  "contentBlockCount": 16,       // # of fdb-block data-block-type=contents
  "strippedGridCount": 4         // # of product-grid blocks removed before
                                 // portable text conversion
}
```

## How to re-import (if ever needed)

```powershell
# 1. Move/copy raw/ back to repo's data/blogs/raw/
# 2. From repo root:
cd C:\Users\aliha\Documents\Github\perfectimprints
pnpm wipe-blog-posts --force                # CAREFUL: wipes Sanity
pnpm import-blogs                            # re-imports from data/blogs/raw/
pnpm publish-blog-drafts --exclude-stubs     # 86 stubs stay hidden
pnpm verify-blog-drafts
```

## Provenance

- Scraper: `scripts/scrapers/blogs/scrape_sbase.py` (Python + SeleniumBase
  UC mode + scroll-to-load + product-grid strip)
- VPN: Cloudflare WARP (US/EU exit) — PI geo-blocks Pakistan
- Date scraped: 2026-06-14 → 2026-06-15
- Bulk pass settings: Turnstile 10s budget, 1 retry per blog, MIN_BODY 100
- Retry-failed pass settings: Turnstile 30s budget, 2 retries per blog
