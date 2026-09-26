/**
 * AUTO-100: Search Console connection + the blog opportunity pool. READ ONLY.
 *
 *   pnpm auto:gsc-pool                                   # both properties, recommend, full report
 *   pnpm auto:gsc-pool -- --property sc-domain:perfectimprints.com
 *   pnpm auto:gsc-pool -- --property https://www.perfectimprints.com/ --days 90
 *   pnpm auto:gsc-pool -- --floor 10 --threshold 2 --top 50
 *   pnpm auto:gsc-pool -- --probe                        # Part 1 only: prove the connection
 *   pnpm auto:gsc-pool -- --skip-cannibalization         # faster re-run, no Sanity reads
 *   (= tsx scripts/blog-automation/gsc-opportunity-pool.ts ...)
 *
 * What it does, in order, every number from a real call:
 *   1. Decodes GSC_SERVICE_ACCOUNT_JSON_B64 (server-side only, NEVER printed,
 *      not even in an error), mints a service-account JWT with Node's own
 *      crypto (no Google client library is installed and none is added),
 *      exchanges it for a read-only Search Console token, and lists every
 *      property the account can see with its permission level.
 *   2. Runs one small Search Analytics query against each of the two known
 *      properties and STOPS if neither answers.
 *   3. Compares the two properties over the last `--days` (default 90) by
 *      query, and over 16 months by date, and recommends one by a stated rule
 *      (or uses `--property` when given). Reports the EXACT API string.
 *   4. Pulls every query row for the chosen property, paginating 25,000 at a
 *      time until an empty page (Google returns "top rows", not all rows, and
 *      says so; the report records how many pages were read and that the last
 *      one was empty).
 *   5. The striking-distance band (position 8 to 40, Patrick's 40), the count
 *      at several impressions floors, the chosen floor, and a deduplicated
 *      topic count (queries grouped by their sorted significant tokens, plural
 *      folded, generic promo words and filler removed).
 *   6. The top `--top` (default 50) by impressions with the page that ranks.
 *   7. Cannibalization: every pool query through the EXISTING detector,
 *      `suggestLinksForKind('blog', ...)` in lib/ai/internal-links.ts, which
 *      scores published blog posts by shared tokens and names the shared
 *      tokens in its reason string. Nothing is re-implemented; the query is
 *      pre-stripped of generic promo words and filler so "custom" and "for"
 *      cannot count as a match, which is what the related-products matcher
 *      already does on its own side. The reason string names at most three
 *      shared tokens, so scores are reported as 0, 1, 2 and 3+.
 *   8. Source 3, the catalogue gap: the 465 root categories with no published
 *      post, measured by `relatedCategorySlugs` AND by title+slug tokens.
 *   9. The volume arithmetic: usable topics today and how long two posts a day
 *      would last.
 *
 * Writes docs/blog-automation/AUTO-100-opportunity-pool.md (or `--report`).
 * Makes NO writes anywhere else: Search Console is read with a read-only
 * scope, Sanity is read anonymously through the published perspective, and no
 * AI route, DeepSeek, Gemini or paid keyword API is called. Exit 1 on any
 * failure it cannot work past.
 *
 * Env: GSC_SERVICE_ACCOUNT_JSON_B64 (base64 of the service-account JSON key),
 * NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET for the blog read.
 * Read from .env.local when not already in the environment.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DOMAIN_PROPERTY,
  GscError,
  RETENTION_DAYS,
  ROW_LIMIT,
  URL_PREFIX_PROPERTY,
  createGscClient,
  daysAgo,
  decodeServiceAccount,
  getAccessToken,
  mentionsKeyMaterial,
  type GscClient,
  type SaRequest,
  type SaRequestLog,
  type SaRow,
  type ServiceAccount,
} from '../../lib/blog-automation/gsc-client';
import { significantTokens, singularToken, topicKey } from '../../lib/blog-automation/topic-pool';
import { NEAR_GENERIC_WORDS } from '../../lib/ai/brand-voice';

// -- Flags -------------------------------------------------------------------

function flagValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(name);

const PROJECT_ROOT = resolve(__dirname, '../..');

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

const KNOWN_PROPERTIES = [URL_PREFIX_PROPERTY, DOMAIN_PROPERTY] as const;

const DAYS = Number(flagValue('--days') ?? 90);
const FLOOR = Number(flagValue('--floor') ?? 10);
const THRESHOLD = Number(flagValue('--threshold') ?? 2);
const TOP = Number(flagValue('--top') ?? 50);
const BAND_LOW = 8;
const BAND_HIGH = 40;
const PROBE_ONLY = hasFlag('--probe');
const SKIP_CANNIBALIZATION = hasFlag('--skip-cannibalization');
const PROPERTY_FLAG = flagValue('--property');
const REPORT_PATH = resolve(
  PROJECT_ROOT,
  flagValue('--report') ?? 'docs/blog-automation/AUTO-100-opportunity-pool.md',
);

// -- Output ------------------------------------------------------------------

const report: string[] = [];
function out(line = ''): void {
  console.log(line);
  report.push(line);
}
function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}
const pct = (n: number, d: number): string => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const fmt = (n: number): string => n.toLocaleString('en-US');

// -- Service account + token (the key is never printed) ----------------------
//
// AUTO-110 moved the connection into lib/blog-automation/gsc-client.ts so the
// Blog Topics route and this script share ONE client. The behaviour is the
// AUTO-100 behaviour: a GscError's hint is what fail() used to print.

function decodeServiceAccountOrFail(): ServiceAccount {
  try {
    return decodeServiceAccount(process.env.GSC_SERVICE_ACCOUNT_JSON_B64);
  } catch (e) {
    if (e instanceof GscError) fail(`${e.message} ${e.hint}`);
    throw e;
  }
}

// -- Search Console API ------------------------------------------------------

let token = '';
let gsc: GscClient | null = null;
const apiCalls: SaRequestLog[] = [];

function client(): GscClient {
  if (!gsc) fail('Search Console client used before the token was obtained.');
  return gsc;
}

async function listSites() {
  return client().listSites();
}

async function searchAnalytics(property: string, body: SaRequest): Promise<SaRow[]> {
  return client().searchAnalytics(property, body);
}

/** Every row for the dimensions, paginated until an EMPTY page. */
async function searchAnalyticsAll(
  property: string,
  base: Omit<SaRequest, 'rowLimit' | 'startRow'>,
): Promise<{ rows: SaRow[]; pages: number; lastPageRows: number }> {
  return client().searchAnalyticsAll(property, base);
}

// -- Tokens (query normalisation for grouping + detector pre-processing) -----
//
// AUTO-110: the tokenizer, the plural fold and the grouping key now live in
// lib/blog-automation/topic-pool.ts, which reads the ONE shared
// non-significant list from lib/ai/brand-voice.ts; this script kept a hand
// copy of that list until then. The detector input here stays what AUTO-100
// measured (generic promo words and filler removed, near-generic words NOT
// removed), so the report's numbers remain comparable with the guard's,
// which additionally strips the near-generic words.

const significant = significantTokens;
const singular = singularToken;

// -- Main --------------------------------------------------------------------

interface PropertyStats {
  property: string;
  ok: boolean;
  error?: string;
  queryRows: number;
  clicks: number;
  impressions: number;
  earliestDateInWindow: string | null;
  latestDateInWindow: string | null;
  daysWithDataInWindow: number;
  firstDateEver: string | null;
  daysWithDataEver: number;
  clicksEver: number;
  impressionsEver: number;
  months: [string, { days: number; clicks: number; impressions: number }][];
  queries: Map<string, SaRow>;
}

async function main(): Promise<void> {
  const startedAt = new Date();
  out('# AUTO-100: Search Console connection and the blog opportunity pool');
  out();
  out(`Run: ${startedAt.toISOString()} (UTC). Read only: no Sanity write, no AI call, no paid API.`);
  out(`Arguments: days=${DAYS} floor=${FLOOR} threshold=${THRESHOLD} top=${TOP} band=${BAND_LOW}-${BAND_HIGH}` +
    (PROPERTY_FLAG ? ` property=${PROPERTY_FLAG}` : ' property=(recommend)'));
  out();

  // ---- Part 1: prove the connection ----------------------------------------
  out('## Part 1: the connection');
  out();
  const sa = decodeServiceAccountOrFail();
  out(`Key variable: GSC_SERVICE_ACCOUNT_JSON_B64 (decoded, service account ${sa.client_email}).`);
  token = await getAccessToken(sa);
  gsc = createGscClient(token, { onRequest: (entry) => apiCalls.push(entry) });
  out('Token: obtained with scope https://www.googleapis.com/auth/webmasters.readonly.');
  out();
  const sites = await listSites();
  out(`sites.list (GET https://www.googleapis.com/webmasters/v3/sites): ${sites.length} propert${sites.length === 1 ? 'y' : 'ies'} visible.`);
  out();
  out('| Property | Permission |');
  out('| --- | --- |');
  for (const s of sites) out(`| ${s.siteUrl} | ${s.permissionLevel} |`);
  out();
  const visible = new Set(sites.map((s) => s.siteUrl));
  for (const p of KNOWN_PROPERTIES) {
    if (!visible.has(p)) {
      out(`MISSING: ${p} is not in the list. Ali: Search Console > select that property > Settings > Users and permissions > Add user > ${sa.client_email}, permission Full. Then re-run.`);
    }
  }
  out();

  const stats = new Map<string, PropertyStats>();
  out('Smoke test (one query row per property, last 7 days, dataState all):');
  out();
  for (const property of KNOWN_PROPERTIES) {
    const s: PropertyStats = {
      property, ok: false, queryRows: 0, clicks: 0, impressions: 0, earliestDateInWindow: null,
      latestDateInWindow: null, daysWithDataInWindow: 0, firstDateEver: null, daysWithDataEver: 0,
      clicksEver: 0, impressionsEver: 0, months: [], queries: new Map(),
    };
    stats.set(property, s);
    if (!visible.has(property)) {
      s.error = 'not visible to the service account';
      out(`- ${property}: SKIPPED (${s.error})`);
      continue;
    }
    try {
      const rows = await searchAnalytics(property, {
        startDate: daysAgo(7), endDate: daysAgo(0), dimensions: ['query'], rowLimit: 1, dataState: 'all',
      });
      s.ok = true;
      out(`- ${property}: OK (${rows.length} row returned${rows[0] ? `, e.g. "${rows[0].keys[0]}" ${rows[0].impressions} impressions` : ''})`);
    } catch (e) {
      s.error = (e as Error).message;
      out(`- ${property}: FAILED: ${s.error}`);
    }
  }
  out();
  const answering = KNOWN_PROPERTIES.filter((p) => stats.get(p)!.ok);
  if (answering.length === 0) fail('Neither property answered a Search Analytics query. Nothing to measure.');
  if (answering.length === 1) out(`WARNING: only ${answering[0]} answered. Continuing with that one alone.`);
  if (PROBE_ONLY) {
    writeReport();
    return;
  }

  // ---- Part 2: which property ---------------------------------------------
  out('## Part 2: which property, with the numbers');
  out();
  const start = daysAgo(DAYS - 1); // inclusive window of exactly DAYS days
  const end = daysAgo(0);
  out(`Window: ${start} to ${end} (${DAYS} days inclusive, dataState all so the freshest days count).`);
  out();
  for (const property of answering) {
    const s = stats.get(property)!;
    const byQuery = await searchAnalyticsAll(property, {
      startDate: start, endDate: end, dimensions: ['query'], dataState: 'all', type: 'web',
    });
    for (const r of byQuery.rows) s.queries.set(r.keys[0], r);
    s.queryRows = byQuery.rows.length;
    s.clicks = byQuery.rows.reduce((a, r) => a + r.clicks, 0);
    s.impressions = byQuery.rows.reduce((a, r) => a + r.impressions, 0);
    const byDate = await searchAnalytics(property, {
      startDate: start, endDate: end, dimensions: ['date'], rowLimit: ROW_LIMIT, dataState: 'all', type: 'web',
    });
    const dates = byDate.filter((r) => r.impressions > 0).map((r) => r.keys[0]).sort();
    s.earliestDateInWindow = dates[0] ?? null;
    s.latestDateInWindow = dates[dates.length - 1] ?? null;
    s.daysWithDataInWindow = dates.length;
    const ever = await searchAnalytics(property, {
      startDate: daysAgo(RETENTION_DAYS - 1), endDate: end, dimensions: ['date'], rowLimit: ROW_LIMIT, dataState: 'all', type: 'web',
    });
    const everDates = ever.filter((r) => r.impressions > 0).map((r) => r.keys[0]).sort();
    s.firstDateEver = everDates[0] ?? null;
    s.daysWithDataEver = everDates.length;
    s.clicksEver = ever.reduce((a, r) => a + r.clicks, 0);
    s.impressionsEver = ever.reduce((a, r) => a + r.impressions, 0);
    const months = new Map<string, { days: number; clicks: number; impressions: number }>();
    for (const r of ever) {
      const m = r.keys[0].slice(0, 7);
      const cur = months.get(m) ?? { days: 0, clicks: 0, impressions: 0 };
      cur.days += 1;
      cur.clicks += r.clicks;
      cur.impressions += r.impressions;
      months.set(m, cur);
    }
    s.months = [...months.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    out(`### ${property}`);
    out();
    out(`- ${DAYS} days by query: ${fmt(s.queryRows)} rows (${byQuery.pages} pages of ${fmt(ROW_LIMIT)}, last page ${byQuery.lastPageRows} rows), ${fmt(s.clicks)} clicks, ${fmt(s.impressions)} impressions.`);
    out(`- ${DAYS} days by date: data on ${s.daysWithDataInWindow} of ${DAYS} days, earliest ${s.earliestDateInWindow ?? 'none'}, latest ${s.latestDateInWindow ?? 'none'}.`);
    out(`- 16 months by date (${daysAgo(RETENTION_DAYS - 1)} to ${end}, the API's retention limit): first date with data ${s.firstDateEver ?? 'none'}, ${s.daysWithDataEver} days with data, ${fmt(s.clicksEver)} clicks, ${fmt(s.impressionsEver)} impressions in total.`);
    out();
    out('| Month | Days | Clicks | Impressions |');
    out('| --- | --- | --- | --- |');
    for (const [m, v] of s.months) out(`| ${m} | ${v.days} | ${fmt(v.clicks)} | ${fmt(v.impressions)} |`);
    out();
  }

  if (answering.length === 2) {
    const a = stats.get(URL_PREFIX_PROPERTY)!;
    const b = stats.get(DOMAIN_PROPERTY)!;
    const shared = [...a.queries.keys()].filter((q) => b.queries.has(q));
    const onlyA = a.queryRows - shared.length;
    const onlyB = b.queryRows - shared.length;
    const sharedImprA = shared.reduce((n, q) => n + a.queries.get(q)!.impressions, 0);
    const sharedImprB = shared.reduce((n, q) => n + b.queries.get(q)!.impressions, 0);
    out('### Overlap');
    out();
    out(`- Queries in both: ${fmt(shared.length)}. Only in the URL-prefix property: ${fmt(onlyA)}. Only in the domain property: ${fmt(onlyB)}.`);
    out(`- Impressions on the shared queries: ${fmt(sharedImprA)} (URL-prefix) vs ${fmt(sharedImprB)} (domain).`);
    // What the domain property holds beyond www/https: group its pages by scheme+host.
    const domainPages = await searchAnalyticsAll(DOMAIN_PROPERTY, {
      startDate: start, endDate: end, dimensions: ['page'], dataState: 'all', type: 'web',
    });
    const hosts = new Map<string, { pages: number; clicks: number; impressions: number }>();
    for (const r of domainPages.rows) {
      let origin = 'unparseable';
      try {
        const u = new URL(r.keys[0]);
        origin = `${u.protocol}//${u.host}`;
      } catch {
        /* keep */
      }
      const h = hosts.get(origin) ?? { pages: 0, clicks: 0, impressions: 0 };
      h.pages += 1;
      h.clicks += r.clicks;
      h.impressions += r.impressions;
      hosts.set(origin, h);
    }
    out(`- Domain property pages by origin (${fmt(domainPages.rows.length)} page rows, ${DAYS} days):`);
    out();
    out('| Origin | Pages | Clicks | Impressions |');
    out('| --- | --- | --- | --- |');
    for (const [origin, h] of [...hosts.entries()].sort((x, y) => y[1].impressions - x[1].impressions)) {
      out(`| ${origin} | ${fmt(h.pages)} | ${fmt(h.clicks)} | ${fmt(h.impressions)} |`);
    }
    out();
  }

  // Recommendation rule. A domain property is a superset by definition, and
  // the per-origin table above shows what the surplus IS: other hosts
  // (feeds., dev., hire.), which are other sites and must not feed a blog
  // topic pool for www. So the URL-prefix property is preferred whenever it
  // answers and its history starts no later than the domain property's; the
  // domain property is the fallback, and `--property` overrides everything.
  let chosen: string;
  let why: string;
  if (PROPERTY_FLAG) {
    if (!answering.includes(PROPERTY_FLAG as (typeof KNOWN_PROPERTIES)[number])) {
      fail(`--property ${PROPERTY_FLAG} is not one of the answering properties: ${answering.join(', ')}`);
    }
    chosen = PROPERTY_FLAG;
    why = 'chosen by --property';
  } else if (answering.length === 1) {
    chosen = answering[0];
    why = 'the only property that answered';
  } else {
    const a = stats.get(URL_PREFIX_PROPERTY)!;
    const b = stats.get(DOMAIN_PROPERTY)!;
    const aFirst = a.firstDateEver ?? '9999';
    const bFirst = b.firstDateEver ?? '9999';
    if (aFirst <= bFirst) {
      chosen = URL_PREFIX_PROPERTY;
      why = `it holds only www pages (the site the blog lives on), its history starts ${aFirst}, no later than the domain property's ${bFirst}, and the domain property's surplus is other hosts (see the per-origin table)`;
    } else {
      chosen = DOMAIN_PROPERTY;
      why = `the URL-prefix property's history starts ${aFirst}, later than the domain property's ${bFirst}; filter by page to www when using it`;
    }
  }
  out(`### Chosen property: \`${chosen}\``);
  out();
  out(`Why: ${why}.`);
  out(`Exact API string: \`${chosen}\` (URL-encoded in the path as \`${encodeURIComponent(chosen)}\`).`);
  out('A URL-prefix property is addressed by its full URL with the trailing slash; a domain property by `sc-domain:` plus the bare domain. The wrong string returns HTTP 403 "User does not have sufficient permission", not an empty result, on this account (verified by the sites.list above: only these exact strings exist).');
  out();

  // ---- Part 3: the pool ----------------------------------------------------
  out('## Part 3: the opportunity pool');
  out();
  const chosenStats = stats.get(chosen)!;
  const all = [...chosenStats.queries.values()];
  out(`All query rows, ${DAYS} days: ${fmt(all.length)} (paginated to an empty page, see Part 2).`);
  const band = all.filter((r) => r.position >= BAND_LOW && r.position <= BAND_HIGH);
  const bandDist = {
    '8-20': band.filter((r) => r.position <= 20).length,
    '21-30': band.filter((r) => r.position > 20 && r.position <= 30).length,
    '31-40': band.filter((r) => r.position > 30).length,
  };
  out(`Striking distance band, average position ${BAND_LOW} to ${BAND_HIGH}: ${fmt(band.length)} queries (${pct(band.length, all.length)} of all).`);
  out(`- 8 to 20: ${fmt(bandDist['8-20'])}`);
  out(`- 21 to 30: ${fmt(bandDist['21-30'])}`);
  out(`- 31 to 40: ${fmt(bandDist['31-40'])}`);
  out(`For scale, outside the band: position under 8: ${fmt(all.filter((r) => r.position < BAND_LOW).length)}; over 40: ${fmt(all.filter((r) => r.position > BAND_HIGH).length)}.`);
  out();
  out('Impressions floors on the band:');
  out();
  out('| Floor (impressions in window) | Queries in band | Distinct topics |');
  out('| --- | --- | --- |');
  for (const f of [1, 3, 5, 10, 20, 30, 50, 100, 200]) {
    const kept = band.filter((r) => r.impressions >= f);
    const topics = new Set(kept.map((r) => topicKey(r.keys[0]) || r.keys[0]));
    out(`| ${f} | ${fmt(kept.length)} | ${fmt(topics.size)} |`);
  }
  out();
  const pool = band.filter((r) => r.impressions >= FLOOR).sort((x, y) => y.impressions - x.impressions);
  out(`Chosen floor: ${FLOOR} impressions in ${DAYS} days (about one search a ${DAYS > 60 ? 'week' : 'few days'} that showed the site at all). Pool: ${fmt(pool.length)} queries.`);
  const topics = new Map<string, SaRow[]>();
  for (const r of pool) {
    const k = topicKey(r.keys[0]) || r.keys[0];
    const list = topics.get(k) ?? [];
    list.push(r);
    topics.set(k, list);
  }
  const multi = [...topics.values()].filter((l) => l.length > 1).length;
  out(`Deduplicated topics: ${fmt(topics.size)} (grouping: lower-case, tokens of 3+ letters, generic promo words and filler removed, plurals folded, tokens sorted; ${fmt(multi)} topics hold more than one query, largest ${Math.max(0, ...[...topics.values()].map((l) => l.length))}).`);
  out();

  // Page currently ranking: query x page for the window, top page per query.
  const byQueryPage = await searchAnalyticsAll(chosen, {
    startDate: start, endDate: end, dimensions: ['query', 'page'], dataState: 'all', type: 'web',
  });
  const topPage = new Map<string, SaRow>();
  for (const r of byQueryPage.rows) {
    const cur = topPage.get(r.keys[0]);
    if (!cur || r.clicks > cur.clicks || (r.clicks === cur.clicks && r.impressions > cur.impressions)) topPage.set(r.keys[0], r);
  }
  const pathOf = (url: string | undefined): string => {
    if (!url) return '(none)';
    try {
      const u = new URL(url);
      return u.host === 'www.perfectimprints.com' ? u.pathname : url;
    } catch {
      return url;
    }
  };
  out(`### Top ${TOP} by impressions`);
  out();
  out(`(query x page pull: ${fmt(byQueryPage.rows.length)} rows over ${byQueryPage.pages} pages)`);
  out();
  out('| # | Query | Clicks | Impr. | Pos. | Page ranking |');
  out('| --- | --- | --- | --- | --- | --- |');
  pool.slice(0, TOP).forEach((r, i) => {
    out(`| ${i + 1} | ${r.keys[0]} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} | ${pathOf(topPage.get(r.keys[0])?.keys[1])} |`);
  });
  out();
  const sectionOf = (url: string | undefined): string => {
    const p = pathOf(url);
    if (p === '(none)') return 'none';
    if (p === '/') return 'home';
    const seg = p.split('/')[1];
    return ['cat', 'blog', 'products', 'brands', 'videos', 'services', 'shop-by-theme'].includes(seg) ? `/${seg}/` : 'other';
  };
  const bySection = new Map<string, number>();
  for (const r of pool) bySection.set(sectionOf(topPage.get(r.keys[0])?.keys[1]), (bySection.get(sectionOf(topPage.get(r.keys[0])?.keys[1])) ?? 0) + 1);
  out('Which section of the site ranks for the pool queries (top page per query):');
  out();
  for (const [sec, n] of [...bySection.entries()].sort((x, y) => y[1] - x[1])) out(`- ${sec}: ${fmt(n)} (${pct(n, pool.length)})`);
  out();

  // ---- Part 4: cannibalization ---------------------------------------------
  out('## Part 4: cannibalization, measured with the existing detector');
  out();
  type Scored = { row: SaRow; score: number; matched: string[]; label: string; href: string };
  const scored: Scored[] = [];
  let publishedPosts: { title: string; slug: string; relatedCategorySlugs?: string[]; publishDate?: string }[] = [];
  if (SKIP_CANNIBALIZATION) {
    out('Skipped (--skip-cannibalization).');
    out();
  } else {
    // Env is loaded above, so the Sanity client picks up the real project id.
    const [{ cachedClient }, { suggestLinksForKind }] = await Promise.all([
      import('../../lib/sanity/client'),
      import('../../lib/ai/internal-links'),
    ]);
    // The detector reads the blog list once per call; memoise the client's
    // fetch so thousands of queries cost one Sanity read, not thousands.
    const origFetch = cachedClient.fetch.bind(cachedClient);
    const memo = new Map<string, Promise<unknown>>();
    (cachedClient as unknown as { fetch: unknown }).fetch = (q: string, p?: unknown, o?: unknown) => {
      const k = `${q}::${JSON.stringify(p ?? {})}`;
      if (!memo.has(k)) memo.set(k, origFetch(q, p as never, o as never));
      return memo.get(k);
    };
    publishedPosts = (await origFetch(
      `*[_type == "blogPost" && !(_id in path("drafts.**")) && defined(slug.current)] | order(publishDate desc){ title, "slug": slug.current, relatedCategorySlugs, publishDate }`,
    )) as typeof publishedPosts;
    out(`Published blog posts read (anonymous, published perspective): ${fmt(publishedPosts.length)}.`);
    out(`Detector: \`suggestLinksForKind('blog', [query without generic/filler words], 3)\` from lib/ai/internal-links.ts; score = shared tokens named in the best suggestion's reason (capped at 3 by the reason format, so reported as 3+).`);
    out();
    for (const row of pool) {
      const q = significant(row.keys[0]).join(' ');
      if (!q) {
        scored.push({ row, score: 0, matched: [], label: '', href: '' });
        continue;
      }
      const hits = await suggestLinksForKind('blog', [q], 3);
      const best = hits[0];
      const matched = best ? (best.reason.split(': ')[1] ?? '').split(', ').filter(Boolean) : [];
      scored.push({ row, score: matched.length, matched, label: best?.label ?? '', href: best?.href ?? '' });
    }
    const dist = [0, 1, 2, 3].map((s) => scored.filter((x) => x.score === s).length);
    out('Score distribution (best-matching published post per pool query):');
    out();
    out('| Shared significant tokens | Queries | Share |');
    out('| --- | --- | --- |');
    dist.forEach((n, s) => out(`| ${s === 3 ? '3+' : s} | ${fmt(n)} | ${pct(n, scored.length)} |`));
    out();
    const atLeast = (s: number) => scored.filter((x) => x.score >= s).length;
    out(`Queries with at least one post sharing 1+ tokens: ${fmt(atLeast(1))} (${pct(atLeast(1), scored.length)}); 2+: ${fmt(atLeast(2))} (${pct(atLeast(2), scored.length)}); 3+: ${fmt(atLeast(3))} (${pct(atLeast(3), scored.length)}).`);
    const rankedByBlog = scored.filter((x) => sectionOf(topPage.get(x.row.keys[0])?.keys[1]) === '/blog/').length;
    out(`Independent check from Search Console itself: ${fmt(rankedByBlog)} pool queries (${pct(rankedByBlog, scored.length)}) already rank with a /blog/ page as their top page.`);
    out();
    out('### 20 examples across the range');
    out();
    out('| Score | Query (impr.) | Shared tokens | Best-matching post |');
    out('| --- | --- | --- | --- |');
    const byImpr = (a: Scored, b: Scored) => b.row.impressions - a.row.impressions;
    const pick = (s: number, n: number) => scored.filter((x) => x.score === s).sort(byImpr).slice(0, n);
    for (const x of [...pick(3, 7), ...pick(2, 7), ...pick(1, 6)]) {
      out(`| ${x.score === 3 ? '3+' : x.score} | ${x.row.keys[0]} (${x.row.impressions}) | ${x.matched.join(', ') || '(none)'} | ${x.label ? `${x.label} (${x.href})` : '(none)'} |`);
    }
    out();
    out(`Threshold ${THRESHOLD}: excludes ${fmt(atLeast(THRESHOLD))} of ${fmt(scored.length)} pool queries (${pct(atLeast(THRESHOLD), scored.length)}). At 1 it would exclude ${fmt(atLeast(1))}; at 3+ ${fmt(atLeast(3))}.`);
    // Sensitivity: tokens that are near-generic on THIS site ("products",
    // "items", "gift") can carry a score-2 match on their own. Count the
    // score>=threshold matches that still clear it without them.
    const nearGeneric = new Set<string>(NEAR_GENERIC_WORDS);
    const strict = scored.filter((x) => x.matched.filter((t) => !nearGeneric.has(t)).length >= THRESHOLD).length;
    out(`Sensitivity: ignoring the near-generic tokens ${[...nearGeneric].join(', ')}, ${fmt(strict)} queries (${pct(strict, scored.length)}) still reach threshold ${THRESHOLD}; the difference is matches that lean on one of those words.`);
    const rankedByBlogSet = new Set(scored.filter((x) => sectionOf(topPage.get(x.row.keys[0])?.keys[1]) === '/blog/').map((x) => x.row.keys[0]));
    const union = scored.filter((x) => x.score >= THRESHOLD || rankedByBlogSet.has(x.row.keys[0])).length;
    out(`Combined rule (detector score >= ${THRESHOLD} OR the query already ranks with a /blog/ page): excludes ${fmt(union)} (${pct(union, scored.length)}); the ranking-page rule alone adds ${fmt(union - atLeast(THRESHOLD))} the detector missed (e.g. a one-word query the tokenizer splits differently from the title, "thunder sticks" vs "thundersticks").`);
    out();
  }

  // ---- Part 5: source 3 ----------------------------------------------------
  out('## Part 5: Source 3, the catalogue gap');
  out();
  const { getAllGeneratedRootSlugs } = await import('../../lib/categories');
  const roots = getAllGeneratedRootSlugs();
  out(`Root categories on disk (data/categories, no \`__\` in the name): ${fmt(roots.length)}.`);
  let uncoveredA: string[] = [];
  let uncoveredB: string[] = [];
  let uncoveredBoth: string[] = [];
  if (publishedPosts.length === 0) {
    out('Source 3 needs the blog list; skipped because cannibalization was skipped.');
    out();
  } else {
    const rootSet = new Set(roots);
    const coveredA = new Set<string>();
    let withField = 0;
    for (const p of publishedPosts) {
      const slugs = p.relatedCategorySlugs ?? [];
      if (slugs.length) withField += 1;
      for (const s of slugs) {
        const root = s.replace(/^\/?cat\//, '').split('/')[0];
        if (rootSet.has(root)) coveredA.add(root);
      }
    }
    uncoveredA = roots.filter((r) => !coveredA.has(r)).sort();
    const postTokenSets = publishedPosts.map((p) => new Set(significant(`${p.title} ${p.slug.split('-').join(' ')}`).map(singular)));
    const coveredB = new Set<string>();
    for (const r of roots) {
      const need = significant(r.split('-').join(' ')).map(singular);
      if (need.length === 0) continue;
      if (postTokenSets.some((set) => need.every((t) => set.has(t)))) coveredB.add(r);
    }
    uncoveredB = roots.filter((r) => !coveredB.has(r)).sort();
    uncoveredBoth = uncoveredA.filter((r) => !coveredB.has(r));
    // Loose variant: a root counts as covered when ANY significant token of its
    // slug appears in some post; reported only to reproduce AUTO-000's lower
    // figure. It is too loose to trust ("bags" covers bag-clips and carry-on-bags).
    const coveredLoose = new Set<string>();
    for (const r of roots) {
      const need = significant(r.split('-').join(' ')).map(singular);
      if (need.some((t) => postTokenSets.some((set) => set.has(t)))) coveredLoose.add(r);
    }
    const uncoveredLoose = roots.length - coveredLoose.size;
    out(`- By \`relatedCategorySlugs\` (a manual field, set on ${fmt(withField)} of ${fmt(publishedPosts.length)} posts): ${fmt(coveredA.size)} roots covered, ${fmt(uncoveredA.length)} uncovered.`);
    out(`- By title + slug tokens (a root is covered when one post's title or slug carries every significant token of the root slug, plurals folded): ${fmt(coveredB.size)} roots covered, ${fmt(uncoveredB.length)} uncovered.`);
    out(`- Uncovered by BOTH methods: ${fmt(uncoveredBoth.length)}.`);
    out(`- Loose variant (ANY significant root token in some post title or slug): ${fmt(coveredLoose.size)} covered, ${fmt(uncoveredLoose)} uncovered. Too loose to trust ("bags" alone covers bag-clips and carry-on-bags); shown to reproduce the lower AUTO-000 figure.`);
    const recent = publishedPosts.filter((p) => (p.publishDate ?? '') >= daysAgo(30)).length;
    out(`- Posts with a publishDate in the last 30 days: ${fmt(recent)}; most recent publishDate: ${publishedPosts[0]?.publishDate ?? 'unknown'}.`);
    out(`- At two posts a day drawing only on the token-method gap (${fmt(uncoveredB.length)} roots): ${(uncoveredB.length / 14).toFixed(1)} weeks. On the BOTH-methods gap (${fmt(uncoveredBoth.length)}): ${(uncoveredBoth.length / 14).toFixed(1)} weeks.`);
    out();
    out(`Uncovered by both methods (first 60 of ${uncoveredBoth.length}): ${uncoveredBoth.slice(0, 60).join(', ')}`);
    out();
  }

  // ---- Part 6: volume ------------------------------------------------------
  out('## Part 6: volume, the honest arithmetic');
  out();
  if (scored.length) {
    const rankedByBlog2 = new Set(scored.filter((x) => sectionOf(topPage.get(x.row.keys[0])?.keys[1]) === '/blog/').map((x) => x.row.keys[0]));
    const thresholdOnly = scored.filter((x) => x.score < THRESHOLD);
    const thresholdOnlyTopics = new Set(thresholdOnly.map((x) => topicKey(x.row.keys[0]) || x.row.keys[0]));
    const survivors = thresholdOnly.filter((x) => !rankedByBlog2.has(x.row.keys[0]));
    const survivorTopics = new Set(survivors.map((x) => topicKey(x.row.keys[0]) || x.row.keys[0]));
    const catRanked = survivors.filter((x) => sectionOf(topPage.get(x.row.keys[0])?.keys[1]) === '/cat/').length;
    out(`- Source 1 with the detector threshold alone: ${fmt(thresholdOnly.length)} queries = ${fmt(thresholdOnlyTopics.size)} topics.`);
    // A root category already present as a pool topic is not counted twice.
    const topicTokenSets = [...survivorTopics].map((k) => new Set(k.split(' ')));
    const gapNotInPool = uncoveredB.filter((r) => {
      const need = significant(r.split('-').join(' ')).map(singular);
      return !topicTokenSets.some((set) => need.every((t) => set.has(t)));
    });
    const total = survivorTopics.size + gapNotInPool.length;
    out(`- Source 1 with the combined rule (threshold ${THRESHOLD} OR already ranking with a /blog/ page), the figure used below: ${fmt(survivors.length)} queries = ${fmt(survivorTopics.size)} topics, of which ${fmt(catRanked)} queries currently rank with a /cat/ page (a supporting post is the intended funnel, not cannibalization, so they stay in).`);
    out(`- Source 3 (token-method gap ${fmt(uncoveredB.length)} roots, minus ${fmt(uncoveredB.length - gapNotInPool.length)} already present as a Source 1 topic): ${fmt(gapNotInPool.length)}.`);
    out(`- Source 2 (paid keyword API): not bought, contributes 0 today.`);
    out(`- Usable topics today: ${fmt(total)}.`);
    out(`- At two posts a day (14 a week): ${(total / 14).toFixed(1)} weeks, ${(total / 60.8).toFixed(1)} months. At one a day: ${(total / 30.4).toFixed(1)} months. At three a week: ${(total / 3 / 4.35).toFixed(1)} months.`);
    out();
  } else {
    out('Needs the cannibalization pass; run without --skip-cannibalization.');
    out();
  }

  // ---- Appendix: every request made ----------------------------------------
  out('## Appendix: every Search Analytics request made');
  out();
  out('| Property | Body | Rows |');
  out('| --- | --- | --- |');
  for (const c of apiCalls) out(`| ${c.property} | \`${JSON.stringify(c.body)}\` | ${c.rows} |`);
  out();
  out(`Finished ${new Date().toISOString()}; ${apiCalls.length} Search Analytics requests plus one sites.list.`);
  writeReport();
}

function writeReport(): void {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${report.join('\n')}\n`, 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

main().catch((e) => {
  const msg = e instanceof GscError ? `${e.message} ${e.hint}` : e instanceof Error ? e.message : String(e);
  fail(mentionsKeyMaterial(msg) ? 'an error mentioning key material was suppressed' : msg);
});
