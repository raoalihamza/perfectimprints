# Perfect Imprints Blog Snapshot — 2026-06-10

Clean snapshot of all PI blog content scraped directly from
`perfectimprints.com/blog/*` using SeleniumBase UC mode (Cloudflare Turnstile
bypass) via a US-exit VPN. This is the source data behind the Sanity blogPost
migration completed on the same date.

## Counts

- **649 raw blogs** scraped successfully (89% coverage of 731 GA4-known URLs)
- **82 URLs verified deleted** on PI — see `.failed-slugs.txt` (also kept in repo at `data/blogs/.failed-slugs.txt` for delivery-time reference)
- **43 video embeds** (YouTube + Vimeo) preserved across 39 blogs
- **1592 inline images** referenced
- **33 unique authors** captured (Patrick Black 284, Perfect Imprints 138, Sarah Garcia 70, Laiba Siddiqui 56, Kiruthika Shantharam 42, Angelica Leti 40, etc.)

## Folder contents

| Path | What | Size |
|------|------|------|
| `raw/` | One JSON per blog — title, body HTML, images, embeds, author, publishDate, updatedDate, categories, inline links | ~14 MB |
| `images/` | Leftover from the older Wayback-era scrape (now superseded by Sanity asset uploads from MPower CDN). Kept for completeness. | ~14 MB |
| `.cdx-cache.json` | Wayback Machine CDX index used by the deprecated `scrape.py` Wayback path | ~3 MB |
| `migration-mapping-report.json` | Sanity relatedCategorySlugs coverage report from the latest import | tiny |
| `verification-report.json` | Sample-blog structural validation report from the final import | tiny |
| `failed-slugs.txt` | 82 deleted-on-PI URLs (Patrick-verified). Copy of repo's `data/blogs/.failed-slugs.txt`. | tiny |

## Schema of `raw/<slug>.json`

```jsonc
{
  "url": "/blog/<slug>",
  "slug": "<slug>",
  "title": "<H1 as visible on PI>",
  "metaTitle": "<SEO title from og:title — often longer/different>",
  "publishDate": "YYYY-MM-DD",        // from "Published: ..." metaline
  "updatedDate": "YYYY-MM-DD" | null,  // from "Updated: ..." metaline (52% have this)
  "author": "<Name from Author: ... line>",
  "headerImageUrl": "https://store-media.mpowerpromo.com/...",
  "bodyHtml": "<raw HTML from .blog-post-body>",
  "bodyText": "<plain text>",
  "embeds": [{ "type": "youtube", "url": "...", "videoId": "..." }],
  "images": ["https://store-media.mpowerpromo.com/...", ...],
  "inlineLinks": ["/cat/water-bottles", "/blog/...", ...],
  "categoryTags": ["..."],
  "metaDescription": "...",
  "scrapedAt": "<ISO timestamp>",
  "scrapeSource": "pi-direct-sbase"
}
```

## Why we kept this

- **Re-import after schema change** — if blogPost schema gains new fields, re-import without re-scraping.
- **Backup** — if Sanity is wiped accidentally, this restores everything.
- **Analysis** — content audits, SEO snapshots, author distribution, etc.
- **Future delete recovery** — if PI's site changes/breaks, our scraped copies remain.

## How to re-import (if ever needed)

```powershell
# 1. Move/copy raw/ back to repo's data/blogs/raw/
# 2. From repo root:
cd C:\Users\aliha\Documents\Github\perfectimprints
pnpm wipe-blog-posts --force        # CAREFUL: wipes Sanity
pnpm import-blogs                    # re-imports from data/blogs/raw/
pnpm publish-blog-drafts --exclude-stubs
pnpm verify-blog-drafts
```

## Provenance

- Scraper: `scripts/scrapers/blogs/scrape_sbase.py` (Python + SeleniumBase UC mode)
- VPN: Cloudflare WARP (US/EU exit) — PI geo-blocks Pakistan
- Date scraped: 2026-06-09 → 2026-06-10
- Patrick approved final published count: 649 (the 82 stubs were excluded from publish per his request)
