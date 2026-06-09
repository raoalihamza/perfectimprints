"""Direct PI blog scraper via SeleniumBase UC mode (Cloudflare Turnstile bypass).

   python scripts/scrapers/blogs/scrape_sbase.py [--resume] [--limit N]

Prereqs:
   - System-wide VPN connected to US/EU (PI geo-blocks Pakistan)
   - SeleniumBase + uc_driver installed (`pip install seleniumbase`)

Outputs:
   - data/blogs/raw/<slug>.json — per-blog scrape with title, body HTML,
     iframe embeds, image URLs, inline links, publish date, og:image
   - data/blogs/.scrape-errors.log — per-URL failure log
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from seleniumbase import SB

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BLOG_URLS_FILE = PROJECT_ROOT / "data" / "pi-urls" / "blog-urls.json"
RAW_DIR = PROJECT_ROOT / "data" / "blogs" / "raw"
ERROR_LOG = PROJECT_ROOT / "data" / "blogs" / ".scrape-errors.log"

BASE_HOST = "https://www.perfectimprints.com"
RECONNECT_TIMEOUT = 6  # seconds for SB to reconnect through CF challenge
POST_LOAD_SLEEP = 1.5  # seconds for hydration after CF passes


def log_error(url: str, status: str | int, message: str) -> None:
    ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
    msg = re.sub(r"\s+", " ", message)[:300]
    with ERROR_LOG.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat()}\t{url}\tHTTP={status}\t{msg}\n")


def classify_embed(src: str) -> dict | None:
    if not src:
        return None
    yt = re.search(r"youtube\.com/embed/([\w-]+)|youtu\.be/([\w-]+)|youtube\.com/watch\?v=([\w-]+)", src)
    if yt:
        return {"type": "youtube", "url": src, "videoId": yt.group(1) or yt.group(2) or yt.group(3)}
    vm = re.search(r"vimeo\.com/(?:video/)?(\d+)", src)
    if vm:
        return {"type": "vimeo", "url": src, "videoId": vm.group(1)}
    return {"type": "iframe", "url": src}


def normalize_date(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except (ValueError, TypeError):
        pass
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S GMT",
        "%Y-%m-%d",
        "%m/%d/%Y",  # PI metaline format: 1/2/2019
        "%m/%d/%y",  # short year fallback
        "%B %d, %Y",  # "January 2, 2019"
        "%B %d %Y",
    ):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return raw


EXTRACT_JS = r"""
const metaContent = (sel) => {
  const el = document.querySelector(sel);
  return (el && el.content) ? el.content.trim() : null;
};

// Title: prefer the rendered H1 (what the user sees), fall back to og:title
// then document.title. og:title is the SEO-optimized variant and often differs
// from the visible H1.
const h1 = document.querySelector('.blog-post-content h1, article h1, main h1, h1');
const h1Text = h1 ? h1.textContent.trim() : '';
const ogTitle = metaContent('meta[name="og:title"]') || metaContent('meta[property="og:title"]');
const title = (h1Text || ogTitle || document.title || '')
  .replace(/\s*\|\s*Perfect Imprints.*$/i, '').trim();

const metaTitle = (ogTitle || document.title || '').replace(/\s*\|\s*Perfect Imprints.*$/i, '').trim();
const metaDescription = metaContent('meta[name="description"]') || metaContent('meta[name="og:description"]') || metaContent('meta[property="og:description"]');
const ogImage = metaContent('meta[name="og:image"]') || metaContent('meta[property="og:image"]');
const lastModifiedHeader = metaContent('meta[http-equiv="last-modified"]') || metaContent('meta[property="article:published_time"]');

// Pull the "Published: ... Updated: ... Author: ..." metaline that PI renders
// under the H1. Prefer this over meta tags because it carries the original
// publication date (meta tags often only have the most recent update).
const blogPostContent = document.querySelector('.blog-post-content') || document.querySelector('article');
let publishedText = null;
let updatedText = null;
let authorText = null;
if (blogPostContent) {
  const headText = blogPostContent.innerText.split(/\n\n/).slice(0, 5).join('\n');
  const pubMatch = headText.match(/Published:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}|[A-Z][a-z]+ [0-9]{1,2},?\s*[0-9]{4})/i);
  if (pubMatch) publishedText = pubMatch[1].trim();
  const updMatch = headText.match(/Updated:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}|[A-Z][a-z]+ [0-9]{1,2},?\s*[0-9]{4})/i);
  if (updMatch) updatedText = updMatch[1].trim();
  const authMatch = headText.match(/Author:\s*([^\n\r]{2,80}?)(?:\s{2,}|\s*$|\n)/i);
  if (authMatch) authorText = authMatch[1].trim();
}

const author = authorText
  || metaContent('meta[name="author"]')
  || metaContent('meta[property="article:author"]');

const body =
  document.querySelector('.blog-post-body') ||
  document.querySelector('article .entry-content') ||
  document.querySelector('article');

if (!body) return { title, metaTitle, metaDescription, ogImage, publishedText, updatedText, lastModifiedHeader, author, missing: true };

['.share-bar', '.social-share', '.related-posts', '.comments', 'nav', '.addthis_inline_share_toolbox_vertical'].forEach((sel) => {
  body.querySelectorAll(sel).forEach((n) => n.remove());
});

const bodyHtml = body.innerHTML.trim();
const bodyText = body.innerText.trim();

const iframeSrcs = Array.from(body.querySelectorAll('iframe'))
  .map((i) => i.src || (i.dataset && i.dataset.src) || '')
  .filter(Boolean);

const imageUrls = Array.from(body.querySelectorAll('img'))
  .map((i) => i.src)
  .filter((s) => s && !s.startsWith('data:'));

const inlineLinks = Array.from(body.querySelectorAll('a'))
  .map((a) => a.getAttribute('href') || '')
  .filter((h) => h && (h.startsWith('/cat/') || h.startsWith('/blog/')));

const categoryTags = [];
document.querySelectorAll('.breadcrumb a, .breadcrumbs a, nav[aria-label="Breadcrumb"] a').forEach((a) => {
  const text = a.textContent ? a.textContent.trim() : '';
  if (text && !/^(home|blog|perfect imprints)$/i.test(text)) categoryTags.push(text);
});
document.querySelectorAll('meta[property="article:section"]').forEach((m) => {
  const v = m.content ? m.content.trim() : '';
  if (v) categoryTags.push(v);
});

return {
  title, metaTitle, metaDescription, ogImage,
  publishedText, updatedText, lastModifiedHeader, author,
  bodyHtml, bodyText,
  iframeSrcs, imageUrls, inlineLinks,
  categoryTags: Array.from(new Set(categoryTags)),
};
"""


def scrape_one(sb, entry: dict) -> dict | None:
    url = f"{BASE_HOST}{entry['url']}"
    try:
        # uc_open_with_reconnect: visits the URL, lets CF JS challenge solve,
        # then reconnects to driver. Handles managed challenge automatically.
        sb.uc_open_with_reconnect(url, RECONNECT_TIMEOUT)
        # If CF Turnstile checkbox is still showing, try to click it.
        sb.uc_gui_click_captcha()
        sb.sleep(POST_LOAD_SLEEP)

        # Bail early if still on CF page.
        title = sb.get_title() or ""
        if "Attention Required" in title or "Just a moment" in title or title.strip() == "":
            return {"_error": ("403", "CF challenge unsolved")}

        data = sb.execute_script(EXTRACT_JS)
        if not data or not data.get("title"):
            return {"_error": ("PARSE", "no title extracted")}
        if data.get("missing"):
            return {"_error": ("PARSE", "body container not found")}
    except Exception as e:
        return {"_error": ("EXC", str(e))}

    embeds_raw = [classify_embed(s) for s in (data.get("iframeSrcs") or [])]
    embeds = [e for e in embeds_raw if e is not None]

    publish_date = normalize_date(data.get("publishedText"))
    updated_date = normalize_date(data.get("updatedText"))
    # If neither inline date present, fall back to the last-modified meta
    # tag so we at least have something — but flag it so we know it's not
    # the original published date.
    if not publish_date:
        publish_date = normalize_date(data.get("lastModifiedHeader"))

    return {
        "url": entry["url"],
        "slug": entry["slug"],
        "title": data["title"],
        "metaTitle": data.get("metaTitle"),
        "publishDate": publish_date,
        "updatedDate": updated_date,
        "author": data.get("author"),
        "headerImageUrl": data.get("ogImage"),
        "bodyHtml": data.get("bodyHtml", ""),
        "bodyText": data.get("bodyText", ""),
        "embeds": embeds,
        "images": list(dict.fromkeys(data.get("imageUrls") or [])),
        "inlineLinks": data.get("inlineLinks") or [],
        "categoryTags": data.get("categoryTags") or [],
        "metaDescription": data.get("metaDescription"),
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "scrapeSource": "pi-direct-sbase",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="0 = no limit")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)

    entries = json.loads(BLOG_URLS_FILE.read_text(encoding="utf-8"))["urls"]
    if args.resume:
        before = len(entries)
        entries = [e for e in entries if not (RAW_DIR / f"{e['slug']}.json").exists()]
        print(f"Resume: {before - len(entries)} already done, {len(entries)} remaining")
    if args.limit:
        entries = entries[: args.limit]
        print(f"Limited to first {len(entries)}")

    ok = 0
    failed = 0
    started = time.time()

    with SB(uc=True, headless=False, locale="en") as sb:
        for i, entry in enumerate(entries):
            result = scrape_one(sb, entry)
            if result is None or "_error" in (result or {}):
                failed += 1
                err = (result or {}).get("_error", ("UNK", "unknown"))
                log_error(entry["url"], err[0], err[1])
            else:
                (RAW_DIR / f"{entry['slug']}.json").write_text(
                    json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
                )
                ok += 1

            if (i + 1) % 10 == 0 or i == len(entries) - 1:
                elapsed = int(time.time() - started)
                rate = (i + 1) / max(1, elapsed)
                eta = int((len(entries) - i - 1) / max(0.01, rate))
                print(
                    f"[{i+1}/{len(entries)}] ok={ok} failed={failed} "
                    f"({elapsed}s elapsed, ETA ~{eta}s)",
                    flush=True,
                )

    print(f"\nDone. ok={ok} failed={failed}")
    if failed:
        print(f"Failures logged to {ERROR_LOG}")


if __name__ == "__main__":
    main()
