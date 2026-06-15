"""Direct PI blog scraper via SeleniumBase UC mode (Cloudflare Turnstile bypass).

   python scripts/scrapers/blogs/scrape_sbase.py [--resume] [--limit N]

Prereqs:
   - System-wide VPN connected to US/EU (PI geo-blocks Pakistan)
   - SeleniumBase + uc_driver installed (`pip install seleniumbase`)

PI blog page structure (current MPower template):
   The page renders a stack of `<section class="fdb-block">` blocks with three
   `data-block-type` flavors:
     - "navigation" (~12 blocks at the top — the megamenu rendered as fdb-blocks)
     - "contents" (the actual article body, one block per heading/section)
     - "footer" (one block at the bottom)
   Some "contents" blocks are product-grid blocks rather than prose: short
   "Shop ..." heading + a `.row` of 3-4 `<a href="/products/...">` image cards.
   Per the 2026-06-10 spec we STRIP those grids — only prose survives into
   the imported body. Products will be added later as a separate Studio
   editing block, not from scrape data.

Lazy-load handling:
   The contents blocks lazy-load on scroll. Without scrolling, listicles
   truncate at the first product grid. We scroll to bottom in 800px steps,
   pausing ~0.6s each, until document.body.scrollHeight stops growing (with
   a hard 60s cap per page).

Outputs:
   - data/blogs/raw/<slug>.json — per-blog scrape with title, body HTML
     (contents-only, grids stripped), iframe embeds, image URLs, inline
     links, publish/updated date, og:image
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
# Reconnect after navigation so CF JS challenge can finish setting cookies
# without the WebDriver protocol revealing automation. Bumped from 6s → 10s
# on 2026-06-14 because Cloudflare WARP / similar VPNs add 1-3s of latency,
# and CF often hadn't finished the JS challenge in the previous 6s budget.
RECONNECT_TIMEOUT = 10
# After CF clears, give Vue / Nuxt SSR a moment to hydrate. Bumped 1.5s → 3s.
POST_LOAD_SLEEP = 3.0
# Wait up to this long for the blog body container to appear in the DOM.
BODY_READY_TIMEOUT_S = 25
# How long to keep trying to dismiss a Cloudflare Turnstile challenge.
# Patient settings 2026-06-15 for the retry-failed pass: more attempts on
# the stragglers that fast bulk-pass settings couldn't crack.
TURNSTILE_RETRY_BUDGET_S = 30
SCROLL_STEP_PX = 800
SCROLL_STEP_SLEEP = 0.8
SCROLL_MAX_TIME_S = 90
# 2 retries per blog for the patient retry-failed pass.
RETRY_PER_BLOG = 2
CONSECUTIVE_FAILURES_BREAKER = 15  # stops the run cleanly if VPN/CF dies
# Minimum body length we treat as a real article. Tuned down 2026-06-15 from
# 800 → 100 because some legitimate blogs are short (just a YouTube embed +
# heading + a few lines of text) and were being failed as THIN. 100 is still
# enough to catch a still-loading SPA shell (which renders ~empty markup).
MIN_BODY_LEN_OK = 100


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
        "%m/%d/%Y",
        "%m/%d/%y",
        "%B %d, %Y",
        "%B %d %Y",
    ):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return raw


SCROLL_JS = r"""
return (async () => {
  const stepPx = arguments[0];
  const stepSleep = arguments[1];
  const maxMs = arguments[2];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const started = Date.now();
  let prevHeight = 0;
  let stableCount = 0;
  let totalScrolls = 0;
  while (Date.now() - started < maxMs) {
    window.scrollBy(0, stepPx);
    await sleep(stepSleep);
    const h = document.body.scrollHeight;
    if (h === prevHeight) {
      stableCount += 1;
      if (stableCount >= 3) break;  // 3 consecutive stable readings = done
    } else {
      stableCount = 0;
    }
    prevHeight = h;
    totalScrolls += 1;
  }
  // Final pause for any in-flight lazy-load
  await sleep(800);
  return { totalScrolls, finalHeight: document.body.scrollHeight, elapsedMs: Date.now() - started };
})();
"""


# Identify and strip product-grid `.fdb-block` blocks, keep prose blocks.
# A grid block matches: 2+ direct anchors to `/products/`, each wrapping an
# `<img>`. We also strip the immediate "Shop ..." `<h4>` heading that
# precedes the grid since it's part of the same authored grid unit.
#
# This function MUTATES `root` in place. The caller is responsible for reading
# root.innerHTML afterwards. The function returns a count of stripped grids.
STRIP_PRODUCT_GRIDS_FUNC = r"""
function __stripProductGrids(root) {
  if (!root) return 0;
  let strippedGrids = 0;
  const sections = root.querySelectorAll('.fdb-block');
  sections.forEach((s) => {
    const productAnchors = s.querySelectorAll('a[href*="/products/"]');
    if (productAnchors.length < 2) return;
    let cardLinks = 0;
    productAnchors.forEach((a) => {
      if (a.querySelector('img')) cardLinks += 1;
    });
    if (cardLinks >= 2) {
      s.remove();
      strippedGrids += 1;
    }
  });
  // Also remove orphan "Shop ..." h4 containers that have no prose siblings.
  root.querySelectorAll('.container-max h4, .container h4').forEach((h) => {
    const text = (h.textContent || '').trim();
    if (!/^shop\b/i.test(text)) return;
    const container = h.closest('.container-max') || h.closest('.container');
    if (!container) return;
    const proseSiblings = container.querySelectorAll('p, ul, ol, h2, h3');
    if (proseSiblings.length === 0) container.remove();
  });
  return strippedGrids;
}
"""


EXTRACT_JS = r"""
const metaContent = (sel) => {
  const el = document.querySelector(sel);
  return (el && el.content) ? el.content.trim() : null;
};

const h1 = document.querySelector('.blog-post-content h1, article h1, main h1, h1');
const h1Text = h1 ? h1.textContent.trim() : '';
const ogTitle = metaContent('meta[name="og:title"]') || metaContent('meta[property="og:title"]');
const title = (h1Text || ogTitle || document.title || '')
  .replace(/\s*\|\s*Perfect Imprints.*$/i, '').trim();

const metaTitle = (ogTitle || document.title || '').replace(/\s*\|\s*Perfect Imprints.*$/i, '').trim();
const metaDescription = metaContent('meta[name="description"]') || metaContent('meta[name="og:description"]') || metaContent('meta[property="og:description"]');
const ogImage = metaContent('meta[name="og:image"]') || metaContent('meta[property="og:image"]');
const lastModifiedHeader = metaContent('meta[http-equiv="last-modified"]') || metaContent('meta[property="article:published_time"]');

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

// Pick the largest container holding the fdb-block stack. Article tag wraps
// the contents reliably on the current MPower template.
const bodySrc = document.querySelector('article') || document.querySelector('main') || document.body;
if (!bodySrc) {
  return { title, metaTitle, metaDescription, ogImage, publishedText, updatedText, lastModifiedHeader, author, missing: true };
}

// Build a clean container with ONLY data-block-type="contents" sections.
const cleanRoot = document.createElement('div');
const allBlocks = bodySrc.querySelectorAll('.fdb-block');
let contentBlocks = 0;
allBlocks.forEach((b) => {
  const t = b.getAttribute('data-block-type');
  if (t === 'contents') {
    cleanRoot.appendChild(b.cloneNode(true));
    contentBlocks += 1;
  }
});

// Fallback: if no fdb-block found (older template?), fall back to the
// historical body selectors so we don't lose those posts entirely.
let fallbackUsed = false;
if (contentBlocks === 0) {
  const legacyBody =
    document.querySelector('.blog-post-body') ||
    document.querySelector('article .entry-content');
  if (legacyBody) {
    cleanRoot.appendChild(legacyBody.cloneNode(true));
    fallbackUsed = true;
  }
}

// Strip share-bar / related / comments / nav widgets if any survived.
['.share-bar', '.social-share', '.related-posts', '.comments', 'nav',
 '.addthis_inline_share_toolbox_vertical', '.sharedaddy', '.jp-relatedposts'
].forEach((sel) => {
  cleanRoot.querySelectorAll(sel).forEach((n) => n.remove());
});

const bodyHtml = cleanRoot.innerHTML.trim();
const bodyText = cleanRoot.innerText ? cleanRoot.innerText.trim() : '';

const iframeSrcs = Array.from(cleanRoot.querySelectorAll('iframe'))
  .map((i) => i.src || (i.dataset && i.dataset.src) || '')
  .filter(Boolean);

const imageUrls = Array.from(cleanRoot.querySelectorAll('img'))
  .map((i) => i.src)
  .filter((s) => s && !s.startsWith('data:'));

const inlineLinks = Array.from(cleanRoot.querySelectorAll('a'))
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
  contentBlocks, fallbackUsed,
  categoryTags: Array.from(new Set(categoryTags)),
};
"""


def _is_challenge_page(sb) -> bool:
    """Returns True if the current page looks like a Cloudflare challenge
    (Turnstile checkbox, "Just a moment...", "Attention Required", etc.)."""
    try:
        title = sb.get_title() or ""
    except Exception:
        return True
    if "Attention Required" in title:
        return True
    if "Just a moment" in title:
        return True
    if title.strip() == "" or title.strip().startswith("www."):
        return True
    return False


def _wait_for_body_ready(sb, max_wait_s: float) -> str:
    """Polls until the blog body container exists in the DOM with non-trivial
    text, or until the timeout. Returns 'ok', 'cf_challenge', or 'timeout'."""
    started = time.time()
    while time.time() - started < max_wait_s:
        if _is_challenge_page(sb):
            return "cf_challenge"
        try:
            ready = sb.execute_script(
                """
                const body = document.querySelector('.blog-post-body, .blog-post-content, article');
                if (!body) return false;
                const txt = (body.innerText || '').trim();
                if (txt.length < 100) return false;
                // Also wait for at least one fdb-block contents section if any exist
                const fdbReady = document.querySelector('.fdb-block[data-block-type="contents"]');
                const looksReady = !!fdbReady || txt.length > 800;
                return looksReady;
                """
            )
            if ready:
                return "ok"
        except Exception:
            pass
        time.sleep(0.5)
    return "timeout"


def _dismiss_turnstile(sb, budget_s: float) -> bool:
    """Attempt to dismiss a Cloudflare Turnstile challenge by repeatedly
    invoking SeleniumBase's UC checkbox clicker. Returns True if the page
    has cleared, False if still on the challenge after the budget."""
    started = time.time()
    attempt = 0
    while time.time() - started < budget_s:
        attempt += 1
        try:
            sb.uc_gui_click_captcha()
        except Exception:
            pass
        # Give the click + CF JS time to settle
        sb.sleep(2.5)
        if not _is_challenge_page(sb):
            return True
        # Backoff between attempts
        sb.sleep(min(2.0 + attempt * 0.5, 4.0))
    return not _is_challenge_page(sb)


def scrape_one_attempt(sb, entry: dict) -> dict | None:
    """One attempt at scraping a single URL. Returns dict with {_error: (code, msg)}
    on failure, otherwise the structured blog record."""
    url = f"{BASE_HOST}{entry['url']}"
    try:
        sb.uc_open_with_reconnect(url, RECONNECT_TIMEOUT)
        # First Turnstile pass — single click + short settle.
        try:
            sb.uc_gui_click_captcha()
        except Exception:
            pass
        sb.sleep(POST_LOAD_SLEEP)

        # If still on a CF challenge page, keep trying the checkbox click for
        # up to TURNSTILE_RETRY_BUDGET_S. Previously we gave up after a single
        # click which left a lot of CF-challenge "moved on too fast" failures.
        if _is_challenge_page(sb):
            cleared = _dismiss_turnstile(sb, TURNSTILE_RETRY_BUDGET_S)
            if not cleared:
                return {"_error": ("403", "CF Turnstile not solved after retry budget")}

        # Wait for the blog body to actually appear. On a slow VPN we used to
        # start scrolling/extracting on a still-hydrating Vue shell which
        # produced empty bodies.
        body_status = _wait_for_body_ready(sb, BODY_READY_TIMEOUT_S)
        if body_status == "cf_challenge":
            cleared = _dismiss_turnstile(sb, TURNSTILE_RETRY_BUDGET_S)
            if not cleared:
                return {"_error": ("403", "CF Turnstile re-escalated mid-load")}
            # Re-wait once after dismissing
            body_status = _wait_for_body_ready(sb, BODY_READY_TIMEOUT_S)
        if body_status == "timeout":
            return {"_error": ("TIMEOUT", "body container never reached ready state")}

        title = sb.get_title() or ""
        if "Attention Required" in title or "Just a moment" in title or title.strip() == "":
            return {"_error": ("403", "CF challenge present after body wait")}

        # Scroll to load all fdb-block sections (listicles lazy-load on scroll).
        # We always use the sync Python-driven scroll because the async JS
        # wrapper has been flaky on slow VPNs (returns before stability).
        t0 = time.time()
        prev_h = 0
        stable = 0
        while time.time() - t0 < SCROLL_MAX_TIME_S:
            sb.execute_script(f"window.scrollBy(0, {SCROLL_STEP_PX});")
            sb.sleep(SCROLL_STEP_SLEEP)
            try:
                h = sb.execute_script("return document.body.scrollHeight;")
            except Exception:
                h = prev_h
            if h == prev_h:
                stable += 1
                # 4 consecutive stable readings before we believe lazy-load is done
                if stable >= 4:
                    break
            else:
                stable = 0
            prev_h = h
        # Extra settle for any in-flight async fetches that fire on the last scroll
        sb.sleep(1.5)

        # Now extract. Note: we run extraction AFTER scroll so that all
        # contents blocks are in the DOM.
        data = sb.execute_script(EXTRACT_JS)
        if not data or not data.get("title"):
            return {"_error": ("PARSE", "no title extracted")}
        if data.get("missing"):
            return {"_error": ("PARSE", "body container not found")}

        # Strip product-grid subtrees in browser context for HTML fidelity.
        strip_result = sb.execute_script(
            STRIP_PRODUCT_GRIDS_FUNC + """
            const html = arguments[0];
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const strippedGrids = __stripProductGrids(tmp);
            return { html: tmp.innerHTML, strippedGrids: strippedGrids };
            """,
            data["bodyHtml"],
        )
        stripped_grids = (strip_result or {}).get("strippedGrids", 0)
        body_html_clean = (strip_result or {}).get("html") or data["bodyHtml"]

        # Sanity check: body must not be too small after stripping. Anything
        # under MIN_BODY_LEN_OK is probably a still-loading SPA shell that
        # snuck past _wait_for_body_ready — the retry pass should reload.
        if not body_html_clean or len(body_html_clean.strip()) < MIN_BODY_LEN_OK:
            return {
                "_error": (
                    "THIN",
                    f"body only {len(body_html_clean.strip()) if body_html_clean else 0} chars after grid strip",
                )
            }

        embeds_raw = [classify_embed(s) for s in (data.get("iframeSrcs") or [])]
        embeds = [e for e in embeds_raw if e is not None]

        publish_date = normalize_date(data.get("publishedText"))
        updated_date = normalize_date(data.get("updatedText"))
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
            "bodyHtml": body_html_clean,
            "bodyText": data.get("bodyText", ""),
            "embeds": embeds,
            "images": list(dict.fromkeys(data.get("imageUrls") or [])),
            "inlineLinks": data.get("inlineLinks") or [],
            "categoryTags": data.get("categoryTags") or [],
            "metaDescription": data.get("metaDescription"),
            "contentBlockCount": data.get("contentBlocks", 0),
            "strippedGridCount": stripped_grids,
            "usedLegacyFallback": bool(data.get("fallbackUsed")),
            "scrapedAt": datetime.now(timezone.utc).isoformat(),
            "scrapeSource": "pi-direct-sbase-v2",
        }
    except Exception as e:
        return {"_error": ("EXC", str(e))}


def scrape_one(sb, entry: dict) -> dict:
    """Wraps scrape_one_attempt with per-blog retry. Backoff escalates between
    attempts so the VPN/CF have time to settle if they're flaking."""
    last_err: tuple[str, str] = ("UNK", "no attempts ran")
    backoffs = [3.0, 6.0, 10.0]  # one entry per gap between attempts
    for attempt in range(RETRY_PER_BLOG + 1):
        result = scrape_one_attempt(sb, entry)
        if result and "_error" not in result:
            return result
        last_err = (result or {}).get("_error", ("UNK", "unknown"))
        if attempt < RETRY_PER_BLOG:
            time.sleep(backoffs[min(attempt, len(backoffs) - 1)])
    return {"_error": last_err}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="0 = no limit")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="Re-scrape only slugs currently logged in .scrape-errors.log (preserves successful raw JSONs).",
    )
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)

    entries = json.loads(BLOG_URLS_FILE.read_text(encoding="utf-8"))["urls"]

    if args.retry_failed and ERROR_LOG.exists():
        failed_slugs = set()
        for line in ERROR_LOG.read_text(encoding="utf-8").splitlines():
            parts = line.split("\t")
            if len(parts) >= 2:
                m = re.search(r"/blog/([^\t]+)$", parts[1])
                if m:
                    failed_slugs.add(m.group(1).lower())
        # Skip slugs that Patrick has already verified as deleted on PI.
        # Those are recorded in data/blogs/.failed-slugs.txt and will never
        # succeed no matter how many times we retry.
        known_deleted: set[str] = set()
        deleted_list = PROJECT_ROOT / "data" / "blogs" / ".failed-slugs.txt"
        if deleted_list.exists():
            for line in deleted_list.read_text(encoding="utf-8").splitlines():
                m = re.search(r"/blog/([^\s]+)$", line.strip())
                if m:
                    known_deleted.add(m.group(1).lower())
        retryable = failed_slugs - known_deleted
        skipped = failed_slugs & known_deleted
        entries = [e for e in entries if e["slug"].lower() in retryable]
        # Clear the log so the retry pass writes a fresh failures list.
        ERROR_LOG.write_text("", encoding="utf-8")
        print(
            f"Retry-failed mode: {len(entries)} slugs (skipped {len(skipped)} known-deleted)"
        )

    if args.resume:
        before = len(entries)
        entries = [e for e in entries if not (RAW_DIR / f"{e['slug']}.json").exists()]
        print(f"Resume: {before - len(entries)} already done, {len(entries)} remaining")

    if args.limit:
        entries = entries[: args.limit]
        print(f"Limited to first {len(entries)}")

    ok = 0
    failed = 0
    consecutive_fail = 0
    started = time.time()

    with SB(uc=True, headless=False, locale="en") as sb:
        for i, entry in enumerate(entries):
            result = scrape_one(sb, entry)
            if result is None or "_error" in (result or {}):
                failed += 1
                consecutive_fail += 1
                err = (result or {}).get("_error", ("UNK", "unknown"))
                log_error(entry["url"], err[0], err[1])
                if consecutive_fail >= CONSECUTIVE_FAILURES_BREAKER:
                    print(
                        f"\nCIRCUIT BREAKER: {consecutive_fail} consecutive failures — "
                        f"VPN/Cloudflare likely down. Stopping cleanly.",
                        flush=True,
                    )
                    break
            else:
                (RAW_DIR / f"{entry['slug']}.json").write_text(
                    json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
                )
                ok += 1
                consecutive_fail = 0

            if (i + 1) % 10 == 0 or i == len(entries) - 1:
                elapsed = int(time.time() - started)
                rate = (i + 1) / max(1, elapsed)
                eta = int((len(entries) - i - 1) / max(0.01, rate))
                print(
                    f"[{i+1}/{len(entries)}] ok={ok} failed={failed} "
                    f"(consecutiveFail={consecutive_fail}, {elapsed}s elapsed, ETA ~{eta}s)",
                    flush=True,
                )

    print(f"\nDone. ok={ok} failed={failed}")
    if failed:
        print(f"Failures logged to {ERROR_LOG}")


if __name__ == "__main__":
    main()
