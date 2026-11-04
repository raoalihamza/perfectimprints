/**
 * SEC-100: is the site whole? Run straight after the Sanity dataset is set to
 * Private (and before, with --before-flip, to see it pass first).
 *
 *   pnpm sec:verify-site                                   production (www)
 *   pnpm sec:verify-site -- --site https://dev.perfectimprints.com
 *   pnpm sec:verify-site -- --before-flip                  dataset still public is expected
 *   pnpm sec:verify-site -- --watch-quote                  the webhook proof (see below)
 *
 * QUOTE_CHECK_TOKEN: the private-link token of a TEST quote (one Ali makes for
 * this, never a customer's), set in the shell for the run. Read from the
 * environment only, never printed, never written anywhere. Without it the
 * quote check counts as a problem, so a green run always means the quote
 * link was really opened.
 *
 * Prints ONE line, in the AUTO-204 form, preceded by one line per problem:
 *
 *   SEC-100 site check, https://www.perfectimprints.com: 482 checked, 0 with a problem (...)
 *
 * What it checks, all read only, no token of any kind sent to Sanity:
 *  - Sanity refuses an anonymous read (count(*) is 0): the dataset is private.
 *  - /api/health/sanity on the host: the deployment's read token reads the
 *    dataset LIVE. Every page below is served from cache, so this is the one
 *    check that proves the token works now, not when the page was built.
 *  - the home page: 200, the header menu has items, the footer has a phone
 *    link and a postal address.
 *  - the sitemap (production only; staging's is empty by design, FIX-890):
 *    blog posts, product pages and videos are all listed.
 *  - a blog post (the first in the sitemap): 200, an h1, its body text.
 *  - a Sanity image from that post: 200 and an image.
 *  - a product page: 200, an h1, its Product structured data.
 *  - /portfolio, /contact and the four service pages: 200 and an h1.
 *  - the quote link: 200 and the quotation itself.
 *  - all 465 root category pages, the AUTO-204 criteria: 200,
 *    X-Nextjs-Prerender: 1, no `no-store`, an h1, no client-side-rendering
 *    bailout, and no X-Robots-Tag on production (staging must carry its
 *    noindex one).
 *
 * --watch-quote: the webhook proof. Loads the test quote, then waits up to
 * --timeout seconds (default 180) for its page to change. Publish an edit to
 * that quote in the Studio (for example its expiry date) while it waits. A
 * change proves the webhook fired AND the re-render read the private dataset
 * with the token.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isIndexableSiteUrl } from '../../lib/seo/indexing-policy';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

const SITE = (flag('--site') ?? 'https://www.perfectimprints.com').replace(/\/+$/, '');
const BEFORE_FLIP = process.argv.includes('--before-flip');
const WATCH_QUOTE = process.argv.includes('--watch-quote');
const TIMEOUT_S = Number(flag('--timeout') ?? 180);
const PROJECT = 'ii96lcy9';
const DATASET = 'production';
/** Where URLs are discovered: production's sitemap (staging's is empty by design). */
const DISCOVERY_ORIGIN = 'https://www.perfectimprints.com';
const SERVICE_PAGES = ['/services/kitting', '/services/company-stores', '/services/popup-stores', '/services/custom-products'];
const UA = 'Mozilla/5.0 (SEC-100 site check)';
const QUOTE_TOKEN = (process.env.QUOTE_CHECK_TOKEN ?? '').trim();

const problems: string[] = [];
let checked = 0;
function check(label: string, problem: string | null): void {
  checked++;
  if (problem) problems.push(`PROBLEM ${label}: ${problem}`);
}

async function get(url: string, timeoutMs = 60_000): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

const hasH1 = (html: string) => /<h1\b/i.test(html);
const BAILOUT = 'BAILOUT_TO_CLIENT_SIDE_RENDERING';
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');

/** A page that must be whole: 200, an h1 (unless told otherwise), no bailout. Returns the body when fine. */
async function pageCheck(
  label: string,
  url: string,
  extra?: (html: string) => string | null,
  requireH1 = true,
  allowLazyIslands = false,
): Promise<string | null> {
  try {
    const r = await get(url);
    const why =
      r.status !== 200
        ? `HTTP ${r.status}`
        : requireH1 && !hasH1(r.body)
          ? 'no h1 (empty or not-found page)'
          : !allowLazyIslands && r.body.includes(BAILOUT)
            ? 'client-side-rendering bailout marker'
            : (extra?.(r.body) ?? null);
    check(label, why);
    return why ? null : r.body;
  } catch (err) {
    check(label, `request failed (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

async function anonymousRefused(): Promise<void> {
  try {
    const q = encodeURIComponent('count(*)');
    const r = await fetch(`https://${PROJECT}.api.sanity.io/v2024-10-01/data/query/${DATASET}?query=${q}`);
    const n = ((await r.json()) as { result?: unknown }).result;
    if (BEFORE_FLIP) check('anonymous Sanity read', null);
    else check('anonymous Sanity read', n === 0 ? null : `still answered: ${String(n)} documents are publicly readable (is the dataset set to Private?)`);
  } catch (err) {
    check('anonymous Sanity read', `could not ask Sanity (${err instanceof Error ? err.message : String(err)})`);
  }
}

async function healthCheck(): Promise<void> {
  try {
    const r = await get(`${SITE}/api/health/sanity`);
    const h = JSON.parse(r.body) as { readToken?: string; dataset?: string; message?: string };
    const datasetOk = BEFORE_FLIP ? true : h.dataset === 'private';
    check('live token read (/api/health/sanity)', h.readToken === 'ok' && datasetOk ? null : `${h.readToken ?? `HTTP ${r.status}`} / dataset ${h.dataset ?? 'unknown'}: ${h.message ?? ''}`.trim());
  } catch (err) {
    check('live token read (/api/health/sanity)', `no answer (${err instanceof Error ? err.message : String(err)}); is this deployment the SEC-100 code?`);
  }
}

async function main(): Promise<void> {
  if (WATCH_QUOTE) return watchQuote();
  const started = Date.now();
  const onProduction = isIndexableSiteUrl(SITE);

  await anonymousRefused();
  await healthCheck();

  await pageCheck('home page', `${SITE}/`, (html) => {
    const nav = html.match(/<nav aria-label="Primary">([\s\S]*?)<\/nav>/);
    const items = nav ? (nav[1].match(/<(a|button)\b/g) ?? []).length : 0;
    if (items === 0) return 'the header menu has no items (the mega menu read came back empty)';
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    if (!/href="tel:/.test(footer)) return 'the footer has no phone link (Global Settings came back empty)';
    const address = footer.match(/<address[\s\S]*?<\/address>/)?.[0] ?? '';
    if (!/\b[A-Z]{2}\s+\d{5}\b/.test(text(address))) return 'the footer has no postal address';
    return null;
    // The home page's two carousels are deliberately client-only (next/dynamic
    // ssr:false, M5-508) and Next marks each such island with the bailout
    // template, so the bailout test is off here; the h1, menu and footer
    // above are what prove the page is whole.
  }, true, true);

  // Discovery from production's sitemap; on production the counts are a check too.
  let locs: string[] = [];
  try {
    const sm = await get(`${DISCOVERY_ORIGIN}/sitemap.xml`, 120_000);
    locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  } catch {
    /* reported below */
  }
  const paths = locs.map((u) => u.replace(DISCOVERY_ORIGIN, ''));
  const posts = paths.filter((p) => /^\/blog\/[^/]+$/.test(p));
  const products = paths.filter((p) => /^\/products\/[^/]+$/.test(p));
  const videos = paths.filter((p) => /^\/videos\/[^/]+$/.test(p));
  if (onProduction) {
    check('sitemap', posts.length && products.length && videos.length ? null : `lists ${posts.length} blog posts, ${products.length} product pages, ${videos.length} videos`);
  }

  let imageUrl: string | null = null;
  if (posts[0]) {
    const body = await pageCheck('a blog post', `${SITE}${posts[0]}`, (html) => {
      const article = html.match(/<article\b[\s\S]*?<\/article>/)?.[0] ?? '';
      const words = text(article).split(/\s+/).filter(Boolean).length;
      return words >= 150 ? null : `the post body has ${words} words`;
    });
    imageUrl = body?.match(/https:\/\/cdn\.sanity\.io\/images\/[^"\s?)]+/)?.[0] ?? null;
  } else check('a blog post', 'no blog post found in the sitemap to test');

  if (imageUrl) {
    try {
      const r = await fetch(imageUrl, { headers: { 'user-agent': UA } });
      const type = r.headers.get('content-type') ?? '';
      await r.arrayBuffer();
      check('a Sanity image', r.status === 200 && type.startsWith('image/') ? null : `HTTP ${r.status} ${type}`);
    } catch (err) {
      check('a Sanity image', `request failed (${err instanceof Error ? err.message : String(err)})`);
    }
  } else check('a Sanity image', 'no Sanity image found on the blog post');

  if (products[0]) {
    await pageCheck('a product page', `${SITE}${products[0]}`, (html) =>
      /"@type":"Product"/.test(html) || /"@type": "Product"/.test(html) ? null : 'no Product structured data',
    );
  } else check('a product page', 'no product page found in the sitemap to test');

  await pageCheck('/portfolio', `${SITE}/portfolio`);
  await pageCheck('/contact', `${SITE}/contact`);
  for (const p of SERVICE_PAGES) await pageCheck(p, `${SITE}${p}`);

  if (/^[0-9a-f]{32}$/.test(QUOTE_TOKEN)) {
    // The quote is laid out as a document (no h1): the quotation itself is the marker.
    await pageCheck(
      'the quote link',
      `${SITE}/quote/${QUOTE_TOKEN}`,
      (html) => (/Quotation/.test(html) && /Quote date:/.test(html) ? null : 'the page has no quotation on it'),
      false,
    );
  } else {
    check('the quote link', 'not checked: set QUOTE_CHECK_TOKEN to the 32-character token of a TEST quote');
  }

  // The AUTO-204 root-page check, over all 465 roots (no Sanity read needed).
  const urlFile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data/pi-urls/category-urls.json'), 'utf8')) as {
    urls: { url: string; type: string }[];
  };
  const roots = urlFile.urls.filter((u) => u.type === 'root').map((u) => u.url);
  let blogsRow = 0;
  const rootProblems: string[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < roots.length) {
      const url = roots[next++];
      try {
        const r = await get(`${SITE}${url}`);
        const p: string[] = [];
        if (r.status !== 200) p.push(`status ${r.status}`);
        if (r.headers.get('x-nextjs-prerender') !== '1') p.push('not prerendered');
        if ((r.headers.get('cache-control') ?? '').includes('no-store')) p.push('Cache-Control says no-store (dynamic)');
        if (!hasH1(r.body)) p.push('no h1');
        if (r.body.includes(BAILOUT)) p.push('bailout marker');
        const robots = r.headers.get('x-robots-tag');
        if (onProduction && robots) p.push(`X-Robots-Tag ${robots}`);
        if (!onProduction && !(robots ?? '').includes('noindex')) p.push('staging page without its noindex header');
        if (r.body.includes('Related Blogs About')) blogsRow++;
        checked++;
        if (p.length) rootProblems.push(`PROBLEM ${url}: ${p.join('; ')}`);
      } catch (err) {
        checked++;
        rootProblems.push(`PROBLEM ${url}: request failed (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 10 }, worker));
  problems.push(...rootProblems.sort());
  if (blogsRow === 0) {
    checked++;
    problems.push('PROBLEM root category pages: not one carries its Related Blogs row (the related-blogs read came back empty)');
  }

  for (const p of problems) console.log(p);
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `SEC-100 site check, ${SITE}${BEFORE_FLIP ? ' (before the flip)' : ''}: ${checked} checked, ${problems.length} with a problem ` +
      `(${roots.length} root category pages; Related Blogs row on ${blogsRow}; ${secs}s)`,
  );
  if (problems.length) process.exitCode = 1;
}

async function watchQuote(): Promise<void> {
  if (!/^[0-9a-f]{32}$/.test(QUOTE_TOKEN)) {
    console.log('SEC-100 webhook proof: not run. Set QUOTE_CHECK_TOKEN to the 32-character token of a TEST quote.');
    process.exitCode = 1;
    return;
  }
  const url = `${SITE}/quote/${QUOTE_TOKEN}`;
  const fingerprint = (html: string) => createHash('sha256').update(text(html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? html).replace(/\s+/g, ' ')).digest('hex');
  const first = await get(url);
  if (first.status !== 200 || !/Quotation/.test(first.body)) {
    console.log(`SEC-100 webhook proof: the test quote did not load (HTTP ${first.status}).`);
    process.exitCode = 1;
    return;
  }
  const baseline = fingerprint(first.body);
  console.log(`Waiting up to ${TIMEOUT_S}s. Publish an edit to the TEST quote in the Studio now (its expiry date is the simplest).`);
  const start = Date.now();
  while ((Date.now() - start) / 1000 < TIMEOUT_S) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const r = await get(url);
      if (r.status === 200 && /Quotation/.test(r.body) && fingerprint(r.body) !== baseline) {
        console.log(`SEC-100 webhook proof, ${SITE}: the quote page changed ${Math.round((Date.now() - start) / 1000)}s after the wait began. The webhook fired and the re-render read the private dataset with the token.`);
        return;
      }
    } catch {
      /* keep waiting */
    }
  }
  console.log(`SEC-100 webhook proof, ${SITE}: NO change in ${TIMEOUT_S}s. Either nothing was published, or the webhook did not fire, or the re-render could not read Sanity. Check the Sanity webhook log and /api/health/sanity.`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.log(`SEC-100 site check: the check itself crashed (${err instanceof Error ? err.message : String(err)}).`);
  process.exitCode = 1;
});
