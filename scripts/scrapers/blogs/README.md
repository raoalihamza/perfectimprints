# Blog scraper

Scrapes blog posts directly from `perfectimprints.com/blog/*` using
SeleniumBase UC mode to pass Cloudflare's Turnstile challenge.

## Prereqs

1. **System-wide VPN** with US or EU exit. PI geo-blocks Pakistan (and likely
   other regions) at the Cloudflare WAF — direct requests from a PK IP return
   HTTP 403 regardless of the client. Cloudflare WARP works, ProtonVPN works.
   A browser-only VPN extension does **not** — the scraper's network traffic
   must route through the tunnel.
2. **Chrome installed** (system browser). SeleniumBase's UC mode uses a real
   Chromium build (not headless-shell) with anti-detection patches.
3. Python 3.11+ and `seleniumbase` (`pip install seleniumbase`).

## Run

```powershell
# From repo root:
python scripts/scrapers/blogs/scrape_sbase.py            # full 731 URLs
python scripts/scrapers/blogs/scrape_sbase.py --resume   # skip slugs already in data/blogs/raw/
python scripts/scrapers/blogs/scrape_sbase.py --limit=5  # smoke test
```

A visible Chrome window will open. **Don't close it.** Each URL takes ~16
seconds (Cloudflare challenge solve + page load + extract).

## Output

- `data/blogs/raw/<slug>.json` — per-blog scrape (title, body HTML, embeds,
  images, links, dates, author, categories, meta description)
- `data/blogs/.scrape-errors.log` — per-failure log

## Schema

See [`data/blogs/raw/*.json`](../../../data/blogs/raw/) (or the archive
README at `Documents/perfectimprints-archive/blogs-snapshot-YYYY-MM-DD/`)
for the full field list. Key fields:

- `title` — the visible H1 (not og:title, which is the SEO-optimized variant)
- `metaTitle` — the SEO-tuned og:title (used as Sanity's `metaTitle`)
- `publishDate` — from PI's "Published: M/D/YYYY" inline metaline
- `updatedDate` — from "Updated: ..." inline metaline (~52% of blogs have it)
- `author` — from "Author: ..." inline metaline (100% of blogs have it)
- `embeds` — iframe sources classified as `{ type: 'youtube'|'vimeo'|'iframe', url, videoId? }`
- `headerImageUrl` — og:image (direct MPower CDN URL, fetchable without CF)

## Why this approach

Cloudflare Turnstile escalates to interactive (checkbox) challenge on rapid
sequential requests from automation. Tried and failed:

- `curl_cffi` chrome131 — passes TLS fingerprint, fails JS challenge
- `cloudscraper` — fails JS challenge under Turnstile escalation
- Playwright with `chromium-headless-shell` — easily detected
- Playwright with real Chrome channel + stealth tricks — passes first URL,
  rate-limited on second

SeleniumBase UC mode (`uc=True` + `uc_open_with_reconnect` + `uc_gui_click_captcha`)
uses an undetected ChromeDriver patch set that's specifically engineered to
pass Turnstile. ~89% success rate on 731 URLs (failures are blogs that were
deleted on PI's side).
