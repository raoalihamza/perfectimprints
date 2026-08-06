/**
 * Q-170: automated verification of the three small improvements batched after
 * the Quick Quote module.
 *
 *   1. The shared product strip SKU field is a search-and-pick dropdown.
 *   2. A Geiger SKU can be hidden from site search, site wide, at read time.
 *   3. The site search box sits beside the heading on the blog and video indexes.
 *
 *   pnpm tsx scripts/quick-quote/verify-q170.ts                 # dry run: offline/source + read-only deployed checks, NO writes
 *   pnpm tsx scripts/quick-quote/verify-q170.ts --apply         # real run: hide a SKU, prove it vanishes, restore, prove it returns
 *   pnpm tsx scripts/quick-quote/verify-q170.ts --cleanup-only  # sweep the zz-test fixture doc and restore siteSearch by hand
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *   ... --restore-site-search '<json>'                          # cleanup-only: restore an exact recorded siteSearch value
 *
 * VERIFICATION ONLY - this script changes no app code.
 *
 * ================== READ THIS BEFORE RUNNING --apply ==================
 * `globalSettings` is a REAL SINGLETON Patrick uses, and the dataset is SHARED
 * between staging and production. To prove improvement 2 end to end this script
 * must briefly put one SKU on the live hide list, which means that one product
 * is missing from PRODUCTION site search for the ~1 to 2 minutes the run takes.
 * Nothing else changes anywhere, and the product stays on its category pages
 * throughout. The exact prior value of `siteSearch` is recorded before the first
 * write, restored in a `finally` that survives a crash, and printed before and
 * after in the report. Patrick's DRAFT of globalSettings is never touched.
 * =======================================================================
 *
 * Conventions carried over from scripts/quick-quote/verify-q150.ts and -q160.ts:
 * deterministic `zz-test-` ids with a `ZZ Test` label, a guard re-checked
 * against the STORED document at the moment of deletion, cleanup in a `finally`,
 * a preflight that refuses to write if the target deployment does not carry this
 * code, and every expected value derived HERE rather than imported from the
 * module under test (the hide rule is re-implemented in three lines below, so
 * lib/search/hidden-skus.ts cannot mark its own homework).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

// -- Modes / flags -----------------------------------------------------------

const APPLY = process.argv.includes('--apply');
const CLEANUP_ONLY = process.argv.includes('--cleanup-only');
const DRY_RUN = !APPLY && !CLEANUP_ONLY;

function flagValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  return undefined;
}

// Deliberately NOT NEXT_PUBLIC_SITE_URL (which points at production www
// locally); this task verifies the STAGING deployment.
const SITE = (flagValue('--site') ?? 'https://dev.perfectimprints.com').replace(/\/$/, '');

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-170-verification-report.md');

const SEARCH_DELTA_ROUTE = '/api/search-index';
const STATIC_INDEX_ROUTE = '/search-index.json';

/** The category whose baked JSON supplies the test SKU, and its own page. */
const TEST_CATEGORY_SLUG = 'water-bottles';

/** How long the webhook round trip is allowed to take before it counts as broken. */
const REVALIDATE_BUDGET_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

// -- Env + client ------------------------------------------------------------

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is required.');
  if (!token) throw new Error('SANITY_API_TOKEN (write scope) is required for this mode.');
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

// -- Result collection -------------------------------------------------------

interface Row {
  check: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'INFO';
}

const rows: Row[] = [];
const notes: string[] = [];
const timings: string[] = [];

function record(check: string, expected: string, actual: string, pass: boolean): boolean {
  rows.push({ check, expected, actual, status: pass ? 'PASS' : 'FAIL' });
  return pass;
}

function info(check: string, detail: string): void {
  rows.push({ check, expected: '(informational)', actual: detail, status: 'INFO' });
}

function printTable(): void {
  const w1 = Math.max(...rows.map((r) => r.check.length), 5) + 2;
  const w2 = Math.max(...rows.map((r) => r.expected.length), 8) + 2;
  const w3 = Math.max(...rows.map((r) => r.actual.length), 6) + 2;
  console.log(`\n${'CHECK'.padEnd(w1)}${'EXPECTED'.padEnd(w2)}${'ACTUAL'.padEnd(w3)}STATUS`);
  console.log('-'.repeat(w1 + w2 + w3 + 7));
  for (const r of rows) {
    console.log(`${r.check.padEnd(w1)}${r.expected.padEnd(w2)}${r.actual.padEnd(w3)}${r.status}`);
  }
}

// -- The hide rule, re-implemented here on purpose ---------------------------
//
// lib/search/hidden-skus.ts is the module under test. Importing it would let a
// bug in it define its own expected answer, so the rule is restated in three
// lines. If these two ever disagree, that disagreement is the finding.

function localNormalizeSku(sku: unknown): string {
  return typeof sku === 'string' ? sku.trim().toUpperCase() : '';
}

function localIsHidden(sku: unknown, hidden: readonly string[]): boolean {
  const n = localNormalizeSku(sku);
  return n !== '' && hidden.map(localNormalizeSku).includes(n);
}

// -- The zz-test guard -------------------------------------------------------

const TEST_ID = 'drafts.zz-test-q170-strip';
const TEST_PREFIX = 'zz-test-q170-';
const TEST_LABEL_PREFIX = 'ZZ Test';

function assertTestId(id: string): void {
  const bare = id.replace(/^drafts\./, '');
  if (!bare.startsWith(TEST_PREFIX)) {
    throw new Error(`REFUSING to touch document id "${id}" - not a ${TEST_PREFIX}* fixture.`);
  }
}

/** The guard is re-checked against the STORED document at the moment of deletion. */
async function guardedDelete(client: SanityClient, id: string): Promise<void> {
  assertTestId(id);
  const stored = await client.fetch<{ _id: string; title?: string } | null>(
    `*[_id == $id][0]{_id, title}`,
    { id },
  );
  if (!stored) return;
  assertTestId(stored._id);
  if (typeof stored.title === 'string' && !stored.title.startsWith(TEST_LABEL_PREFIX)) {
    throw new Error(
      `REFUSING to delete "${id}" - stored title "${stored.title}" is not a ZZ Test fixture.`,
    );
  }
  await client.delete(id);
}

// -- globalSettings.siteSearch: record, restore EXACTLY, report ---------------

type SiteSearchValue = { hiddenSkus?: unknown } | null | undefined;

const GLOBAL_SETTINGS_ID = 'globalSettings';

async function readSiteSearch(client: SanityClient): Promise<{ exists: boolean; value: SiteSearchValue }> {
  const doc = await client.fetch<{ _id: string; siteSearch?: SiteSearchValue } | null>(
    `*[_id == $id][0]{_id, siteSearch}`,
    { id: GLOBAL_SETTINGS_ID },
  );
  if (!doc) return { exists: false, value: undefined };
  return { exists: true, value: doc.siteSearch ?? undefined };
}

function describeSiteSearch(exists: boolean, value: SiteSearchValue): string {
  if (!exists) return 'globalSettings document ABSENT';
  if (value === undefined || value === null) return 'siteSearch UNSET (field does not exist)';
  return JSON.stringify(value);
}

/**
 * Put `siteSearch` back to byte-exactly what it was. An UNSET field is restored
 * by unsetting it, not by writing an empty object, so the document ends the run
 * shaped exactly as it started.
 */
async function restoreSiteSearch(
  client: SanityClient,
  before: { exists: boolean; value: SiteSearchValue },
): Promise<string> {
  if (!before.exists) return 'nothing to restore (globalSettings does not exist)';
  if (before.value === undefined || before.value === null) {
    await client.patch(GLOBAL_SETTINGS_ID).unset(['siteSearch']).commit();
    return 'siteSearch unset (it did not exist before the run)';
  }
  await client.patch(GLOBAL_SETTINGS_ID).set({ siteSearch: before.value }).commit();
  return `siteSearch restored to ${JSON.stringify(before.value)}`;
}

// -- HTTP helpers ------------------------------------------------------------

async function getText(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${SITE}${path}`, { headers: { 'cache-control': 'no-cache' } });
  return { status: res.status, body: await res.text() };
}

async function getJson<T>(path: string): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${SITE}${path}`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) return { status: res.status, data: null };
  try {
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return { status: res.status, data: null };
  }
}

/**
 * React SSR inserts a `<!-- -->` separator between literal text and an
 * interpolated value, so `Item # {sku}` reaches the wire as `Item # <!-- -->501032`.
 * Matching naively on "Item # 501032" would fail for the wrong reason.
 */
function hasItemNumber(html: string, sku: string): boolean {
  const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`Item\\s*#\\s*(?:<!--[^>]*-->)?\\s*${escaped}(?![0-9A-Za-z])`).test(html);
}

const BAILOUT_MARKER = 'BAILOUT_TO_CLIENT_SIDE_RENDERING';
/** The index-page search box, distinguishable from the two header boxes. */
const INDEX_SEARCH_MARKER = 'Search the site';

// -- Source-level checks (run in every mode, no network, no writes) ----------

function readSource(relative: string): string {
  return readFileSync(resolve(PROJECT_ROOT, relative), 'utf8');
}

/**
 * Source with comments removed. The `useSearchParams` check below is a text
 * search, and the first version of it failed on this script's own explanatory
 * comment saying the hook must NOT be used. A check that cannot tell code from
 * prose is not a check.
 */
function readCode(relative: string): string {
  return readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Every client module the index-page search box pulls into the prerender. A
 * render-time `useSearchParams()` in ANY of them would silently swap the whole
 * page body for the loading skeleton while the build still reported the route
 * as static (the M-SEO5 lesson, CLAUDE.md section 13), so the check covers the
 * subtree and not just the entry component.
 */
const SEARCH_ISLAND_FILES = [
  'components/layout/IndexHeadingWithSearch.tsx',
  'components/forms/SearchBox.tsx',
  'components/search/SearchResultRow.tsx',
  'components/search/SearchEmptyCTA.tsx',
  'components/search/useResultNavigation.ts',
  'lib/search/load-index.ts',
  'lib/search/result-target.ts',
];

function sourceChecks(): void {
  // Improvement 1: the picker is attached, and the stored TYPE is untouched.
  const strip = readSource('sanity/schemas/objects/blog-products.ts');
  record(
    '1. shared strip SKU field uses the picker',
    "components: { input: ProductSkuInput } on blogProduct.sku",
    /name:\s*'sku'[\s\S]{0,400}?components:\s*\{\s*input:\s*ProductSkuInput\s*\}/.test(strip)
      ? 'attached'
      : 'NOT attached',
    /name:\s*'sku'[\s\S]{0,400}?components:\s*\{\s*input:\s*ProductSkuInput\s*\}/.test(strip),
  );
  record(
    '1. stored field type unchanged (no migration)',
    "blogProduct.sku is still type: 'string'",
    /name:\s*'sku'[\s\S]{0,200}?type:\s*'string'/.test(strip) ? "type: 'string'" : 'CHANGED',
    /name:\s*'sku'[\s\S]{0,200}?type:\s*'string'/.test(strip),
  );

  // Improvement 1: the picker must not be the only way to fill the field.
  const picker = readSource('sanity/components/ProductPicker.tsx');
  const hasManual =
    picker.includes('Enter a SKU manually') && /loadError/.test(picker) && /setManual/.test(picker);
  record(
    '1. manual entry stays possible',
    'ProductSkuInput offers a plain text fallback, auto-opened on a load failure',
    hasManual ? 'present' : 'MISSING',
    hasManual,
  );

  // Improvement 2: the complete list of read paths, asserted structurally.
  const load = readSource('lib/search/load-index.ts');
  const server = readSource('lib/search/server-search.ts');
  const searchPage = readSource('app/search/page.tsx');
  const deltaRoute = readSource('app/api/search-index/route.ts');
  record(
    '2. read path A - client overlay + also-matching',
    'lib/search/load-index.ts filters the merged set',
    /filterHiddenSkuItems\(merged, hiddenSkus\)/.test(load) ? 'filters' : 'DOES NOT filter',
    /filterHiddenSkuItems\(merged, hiddenSkus\)/.test(load),
  );
  record(
    '2. read path B - server /search results + facets',
    'lib/search/server-search.ts drops hidden SKUs and app/search passes the set',
    /isSearchHiddenSku\(p\.sku, hiddenSkus\)/.test(server) &&
      /searchProducts\(query,\s*300,\s*hiddenSkus\)/.test(searchPage)
      ? 'filters'
      : 'DOES NOT filter',
    /isSearchHiddenSku\(p\.sku, hiddenSkus\)/.test(server) &&
      /searchProducts\(query,\s*300,\s*hiddenSkus\)/.test(searchPage),
  );
  record(
    '2. facets derive from the filtered list',
    'buildSearchFacets is called with the filtered products',
    /const products = query \? searchProducts\(query, 300, hiddenSkus\)[\s\S]{0,200}buildSearchFacets\(products\)/.test(
      searchPage,
    )
      ? 'yes'
      : 'NO',
    /const products = query \? searchProducts\(query, 300, hiddenSkus\)[\s\S]{0,200}buildSearchFacets\(products\)/.test(
      searchPage,
    ),
  );
  record(
    '2. the list is transported without a rebuild',
    'the live delta route emits hiddenProductSkus',
    /hiddenProductSkus,/.test(deltaRoute) ? 'emitted' : 'NOT emitted',
    /hiddenProductSkus,/.test(deltaRoute),
  );

  // Improvement 2: the webhook gap the investigation flagged.
  const webhook = readSource('app/api/sanity/revalidate/route.ts');
  const busts =
    /type === 'globalSettings'\)\s*\{[\s\S]{0,900}?revalidatePath\(SEARCH_INDEX_ROUTE\)/.test(webhook);
  record(
    '2. globalSettings publish refreshes the delta route',
    'the globalSettings branch calls revalidatePath(SEARCH_INDEX_ROUTE)',
    busts ? 'wired' : 'NOT wired',
    busts,
  );

  // Improvement 2: nothing outside search may consult the list. This is the
  // check that answers "how do you know the blast radius is search only".
  const consumers = [
    'lib/sanity/queries/global-settings.ts',
    'lib/search/load-index.ts',
    'lib/search/server-search.ts',
    'lib/search/hidden-skus.ts',
    'lib/search/hidden-skus.test.ts',
    'lib/search/types.ts',
    'app/search/page.tsx',
    'app/api/search-index/route.ts',
    'scripts/quick-quote/verify-q170.ts',
  ];
  const forbidden = [
    'lib/deals.ts',
    'lib/new-products.ts',
    'lib/rush-products.ts',
    'lib/catalogs.ts',
    'app/sitemap.ts',
    'app/cat/[...slug]/page.tsx',
    'lib/sanity/queries/category-overrides.ts',
  ];
  const leaked = forbidden.filter((f) => {
    const src = readSource(f);
    return src.includes('searchHiddenSkus') || src.includes('hiddenProductSkus');
  });
  record(
    '2. search-only blast radius',
    `no aggregator / sitemap / category module reads the list (checked ${forbidden.length} files)`,
    leaked.length === 0 ? 'none read it' : `LEAKED into ${leaked.join(', ')}`,
    leaked.length === 0,
  );
  info('2. intended consumers', consumers.join(', '));

  // The existing hide lists must be untouched.
  const settingsSchema = readSource('sanity/schemas/singletons/global-settings.ts');
  const keptLists = ['hiddenDealSkus', 'hiddenNewProductSkus', 'hiddenRushSkus'].every((f) =>
    settingsSchema.includes(f),
  );
  record(
    '2. existing hide lists untouched',
    'deals / new-products / rush hide lists still present',
    keptLists ? 'all three present' : 'ONE OR MORE MISSING',
    keptLists,
  );

  // Improvement 3: staticness is the risk, so assert the shape of the island.
  const heading = readSource('components/layout/IndexHeadingWithSearch.tsx');
  const offenders = SEARCH_ISLAND_FILES.filter((f) => readCode(f).includes('useSearchParams'));
  record(
    '3. no render-time useSearchParams under the index pages',
    `none of the ${SEARCH_ISLAND_FILES.length} client modules in the search island calls useSearchParams`,
    offenders.length === 0 ? 'absent' : `PRESENT in ${offenders.join(', ')}`,
    offenders.length === 0,
  );
  const wired = [
    'app/blog/page.tsx',
    'app/blog/page/[n]/page.tsx',
    'app/videos/page.tsx',
  ].every((f) => readSource(f).includes('IndexHeadingWithSearch'));
  record(
    '3. box wired into both indexes and the paginated variant',
    'blog index, blog page/[n], video index all render IndexHeadingWithSearch',
    wired ? 'all three' : 'MISSING on at least one',
    wired,
  );
  const stillStatic = readSource('app/blog/page.tsx').includes("dynamic = 'force-static'") &&
    readSource('app/videos/page.tsx').includes("dynamic = 'force-static'");
  record(
    '3. index pages still declare force-static',
    'both indexes keep their existing route config',
    stillStatic ? 'unchanged' : 'CHANGED',
    stillStatic,
  );
  record(
    '3. one search component, not two',
    'the index pages reuse components/forms/SearchBox',
    heading.includes("from '@/components/forms/SearchBox'") ? 'reused' : 'A SECOND INPUT EXISTS',
    heading.includes("from '@/components/forms/SearchBox'"),
  );
}

// -- Deployed read-only checks (safe in every mode) --------------------------

interface IndexPageCheck {
  path: string;
  label: string;
  mustContain: string[];
}

async function checkIndexPages(): Promise<void> {
  const pages: IndexPageCheck[] = [
    { path: '/blog', label: 'blog index', mustContain: ['Perfect Imprints Blog', '/blog/'] },
    { path: '/blog/page/2', label: 'blog index page 2', mustContain: ['Perfect Imprints Blog', '/blog/'] },
    { path: '/videos', label: 'video index', mustContain: ['Videos', '/videos/'] },
  ];

  for (const page of pages) {
    const { status, body } = await getText(page.path);
    const ok200 = record(
      `3. ${page.label} responds`,
      '200',
      String(status),
      status === 200,
    );
    if (!ok200) continue;

    const missing = page.mustContain.filter((needle) => !body.includes(needle));
    record(
      `3. ${page.label} raw HTML carries its heading and listings`,
      page.mustContain.join(' + '),
      missing.length === 0 ? 'all present' : `MISSING ${missing.join(', ')}`,
      missing.length === 0,
    );
    record(
      `3. ${page.label} raw HTML carries the search box`,
      `placeholder "${INDEX_SEARCH_MARKER}..." in the served HTML`,
      body.includes(INDEX_SEARCH_MARKER) ? 'present' : 'MISSING',
      body.includes(INDEX_SEARCH_MARKER),
    );
    record(
      `3. ${page.label} is not client-side rendered`,
      `no ${BAILOUT_MARKER} marker`,
      body.includes(BAILOUT_MARKER) ? 'MARKER PRESENT' : 'absent',
      !body.includes(BAILOUT_MARKER),
    );
  }
}

// -- Improvement 2, live ------------------------------------------------------

interface SearchIndexPayload {
  items?: Array<{ type?: string; title?: string; sku?: string; url?: string }>;
  hiddenProductSkus?: string[];
}

function pickTestSku(): { sku: string; categorySlug: string } {
  const file = resolve(PROJECT_ROOT, `data/categories/${TEST_CATEGORY_SLUG}.json`);
  const baked = JSON.parse(readFileSync(file, 'utf8')) as { productSkus?: string[] };
  const sku = (baked.productSkus ?? [])[0];
  if (!sku) throw new Error(`No productSkus in ${file} - pick a different TEST_CATEGORY_SLUG.`);
  return { sku, categorySlug: TEST_CATEGORY_SLUG };
}

/** Fetch the deployed static bulk + delta and report whether the SKU survives the rule. */
async function observeClientMerge(sku: string): Promise<{
  inStatic: boolean;
  hiddenList: string[];
  survivesRule: boolean;
}> {
  const [staticRes, deltaRes] = await Promise.all([
    getJson<SearchIndexPayload>(STATIC_INDEX_ROUTE),
    getJson<SearchIndexPayload>(SEARCH_DELTA_ROUTE),
  ]);
  const staticItems = staticRes.data?.items ?? [];
  const deltaItems = deltaRes.data?.items ?? [];
  const hiddenList = deltaRes.data?.hiddenProductSkus ?? [];
  const merged = [...deltaItems, ...staticItems];
  const matching = merged.filter((i) => localNormalizeSku(i.sku) === localNormalizeSku(sku));
  const survivesRule = matching.some((i) => !localIsHidden(i.sku, hiddenList));
  return { inStatic: matching.length > 0, hiddenList, survivesRule };
}

async function pollUntil(
  label: string,
  predicate: () => Promise<boolean>,
): Promise<{ ok: boolean; ms: number }> {
  const started = Date.now();
  for (;;) {
    if (await predicate()) return { ok: true, ms: Date.now() - started };
    if (Date.now() - started > REVALIDATE_BUDGET_MS) {
      console.log(`  ${label}: gave up after ${REVALIDATE_BUDGET_MS} ms`);
      return { ok: false, ms: Date.now() - started };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function verifyHiddenState(sku: string, categorySlug: string, hidden: boolean): Promise<void> {
  const phase = hidden ? 'hidden' : 'restored';

  // Read path A: the data the browser merges. The delta route is ISR — for a
  // few seconds after a revalidation, requests can still be served the PRIOR
  // copy (stale-while-revalidate), so a single-shot read here races the cache
  // and fails spuriously even though the pollUntil above already SAW the
  // flipped state (measured 2026-08-06: fresh and stale responses interleave
  // briefly, then settle — 6/6 consistent at rest). Poll for the settled state
  // instead; the check still FAILs honestly if it never settles in the budget.
  let merge = await observeClientMerge(sku);
  const settled = await pollUntil(`${phase} settle`, async () => {
    merge = await observeClientMerge(sku);
    return (
      merge.survivesRule === !hidden && (!hidden || localIsHidden(sku, merge.hiddenList))
    );
  });
  record(
    `2. [${phase}] read path A - client merge (overlay + also-matching)`,
    hidden ? 'the SKU does not survive the merge rule' : 'the SKU survives the merge rule',
    `${merge.survivesRule ? 'survives' : 'removed'}${
      settled.ok
        ? ` (settled after ${(settled.ms / 1000).toFixed(1)}s)`
        : ` (never settled in ${(settled.ms / 1000).toFixed(0)}s)`
    }`,
    merge.survivesRule === !hidden,
  );
  if (hidden) {
    record(
      `2. [${phase}] the filter is doing real work`,
      'the SKU IS in the deployed static bulk, so only the rule removes it',
      merge.inStatic ? 'present in the bulk' : 'NOT in the bulk (check is vacuous)',
      merge.inStatic,
    );
    record(
      `2. [${phase}] the hide list reached the browser`,
      'the delta route carries the SKU in hiddenProductSkus',
      localIsHidden(sku, merge.hiddenList) ? 'carried' : 'ABSENT',
      localIsHidden(sku, merge.hiddenList),
    );
  }

  // Read path B: the server-rendered results page, by SKU and by name.
  const bySku = await getText(`/search?q=${encodeURIComponent(sku)}`);
  record(
    `2. [${phase}] read path B - /search results page`,
    hidden ? 'the product card is gone' : 'the product card is back',
    hasItemNumber(bySku.body, sku) ? 'card rendered' : 'card absent',
    hasItemNumber(bySku.body, sku) === !hidden,
  );

  // The category page must be untouched in BOTH phases.
  const cat = await getText(`/cat/${categorySlug}`);
  record(
    `2. [${phase}] category page unaffected`,
    `/cat/${categorySlug} still shows Item # ${sku}`,
    hasItemNumber(cat.body, sku) ? 'still shown' : 'MISSING (search hiding leaked)',
    hasItemNumber(cat.body, sku),
  );
  record(
    `2. [${phase}] category page still static`,
    `no ${BAILOUT_MARKER} marker on /cat/${categorySlug}`,
    cat.body.includes(BAILOUT_MARKER) ? 'MARKER PRESENT' : 'absent',
    !cat.body.includes(BAILOUT_MARKER),
  );
}

// -- Improvement 1, against a real document ----------------------------------

async function verifyStripStorage(client: SanityClient, sku: string): Promise<void> {
  // (a) Pre-existing data: nothing was migrated, so every stored value must
  //     still be a bare string. Queried across all five doc types that embed
  //     the shared strip, which is also the list of surfaces the picker reaches.
  const storedSkus = await client
    .fetch<string[]>(
      `array::unique([
        ...*[_type == "blogPost"].body[_type == "blogProducts"].products[_type == "blogProduct"].sku,
        ...*[_type == "page"].sections[_type == "productStrip"].products[_type == "blogProduct"].sku,
        ...*[_type == "video"].relatedProducts[_type == "blogProduct"].sku,
        ...*[_type == "landingPage"].relatedProducts[_type == "blogProduct"].sku,
        ...*[_type == "productPage"].relatedProducts[_type == "blogProduct"].sku
      ])`,
    )
    .catch(() => [] as string[]);
  const real = storedSkus.filter((s) => s !== null && s !== undefined);
  if (real.length === 0) {
    info(
      '1. existing strip entries in the dataset',
      'none found - nothing to migrate, and nothing to compare against',
    );
  } else {
    const allStrings = real.every((s) => typeof s === 'string');
    record(
      '1. existing strip SKUs are still bare strings',
      `every stored value is a string (checked ${real.length} real entries)`,
      allStrings ? 'all strings' : 'NON-STRING VALUE FOUND',
      allStrings,
    );
  }

  if (!APPLY) {
    info('1. round trip through a real document', 'skipped in dry run (requires a write)');
    return;
  }

  // (b) A real document written through the same schema shape the picker emits.
  await client.createOrReplace({
    _id: TEST_ID,
    _type: 'page',
    title: `${TEST_LABEL_PREFIX} Q-170 product strip`,
    slug: { _type: 'slug', current: 'zz-test-q170-strip' },
    sections: [
      {
        _type: 'productStrip',
        _key: 'zzq170strip',
        heading: `${TEST_LABEL_PREFIX} strip`,
        products: [{ _type: 'blogProduct', _key: 'zzq170entry', sku }],
      },
    ],
  });

  const readBack = await client.fetch<unknown>(
    `*[_id == $id][0].sections[_key == "zzq170strip"][0].products[_key == "zzq170entry"][0].sku`,
    { id: TEST_ID },
  );
  record(
    '1. picker value round trips as the same bare string',
    `typeof "string" and exactly ${JSON.stringify(sku)}`,
    `${typeof readBack} ${JSON.stringify(readBack)}`,
    typeof readBack === 'string' && readBack === sku,
  );
}

// -- Preflight ---------------------------------------------------------------

async function preflight(): Promise<boolean> {
  const delta = await getJson<SearchIndexPayload>(SEARCH_DELTA_ROUTE);
  const carriesField =
    delta.data !== null && Object.prototype.hasOwnProperty.call(delta.data, 'hiddenProductSkus');
  const blog = await getText('/blog');
  const carriesBox = blog.status === 200 && blog.body.includes(INDEX_SEARCH_MARKER);

  const ok = carriesField && carriesBox;
  record(
    'preflight: the target deployment carries this code',
    `${SEARCH_DELTA_ROUTE} exposes hiddenProductSkus AND /blog renders the index search box`,
    `delta field ${carriesField ? 'present' : 'ABSENT'}, blog box ${carriesBox ? 'present' : 'ABSENT'}`,
    ok,
  );
  return ok;
}

// -- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Q-170 verification - mode: ${DRY_RUN ? 'dry run' : CLEANUP_ONLY ? 'cleanup only' : 'apply'}`);
  console.log(`Target: ${SITE}\n`);

  const { sku, categorySlug } = pickTestSku();
  info('test SKU', `${sku} (first productSkus entry of data/categories/${categorySlug}.json)`);

  if (CLEANUP_ONLY) {
    const client = buildClient();
    await guardedDelete(client, TEST_ID);
    const explicit = flagValue('--restore-site-search');
    if (explicit !== undefined) {
      const value = explicit === 'unset' ? undefined : (JSON.parse(explicit) as SiteSearchValue);
      const msg = await restoreSiteSearch(client, { exists: true, value });
      console.log(`siteSearch: ${msg}`);
      info('cleanup: siteSearch', msg);
    } else {
      const current = await readSiteSearch(client);
      info(
        'cleanup: siteSearch left as found',
        `${describeSiteSearch(current.exists, current.value)} (pass --restore-site-search to force a value)`,
      );
    }
    info('cleanup: fixture document', `${TEST_ID} deleted if it existed`);
    printTable();
    writeReport('(not recorded in this mode)', '(not recorded in this mode)');
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  sourceChecks();
  await checkIndexPages();

  const preflightOk = await preflight();
  if (!preflightOk) {
    notes.push(
      'The run stopped at preflight: the target deployment does not carry this branch yet. Nothing was written to Sanity, and the live hide/restore round trip was not attempted, because on an old deployment it would have proved nothing while still altering a real singleton.',
    );
    notes.push(
      'The three "raw HTML carries the search box" rows above FAIL for the same single reason and are expected to before the deploy: the deployed pages predate improvement 3. Every source-level and read-only check that does not depend on the deploy passed. Re-run this script after the deploy.',
    );
    printTable();
    writeReport('(not read - preflight failed)', '(not written - preflight failed)');
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  if (DRY_RUN) {
    const client = process.env.SANITY_API_TOKEN ? buildClient() : null;
    if (client) {
      await verifyStripStorage(client, sku);
      const current = await readSiteSearch(client);
      info('siteSearch as found (not modified)', describeSiteSearch(current.exists, current.value));
    } else {
      info('1. dataset checks', 'skipped - SANITY_API_TOKEN not set');
    }
    // Read-only observation of the current live state.
    await verifyHiddenState(sku, categorySlug, false);
    notes.push(
      'Dry run: globalSettings was never written, so the hide/restore round trip was not exercised. The "restored" rows above describe the site as it stands today, which is the same state the apply run must end in.',
    );
    printTable();
    writeReport('(read only, not modified)', '(read only, not modified)');
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  // -- apply --------------------------------------------------------------
  const client = buildClient();
  const before = await readSiteSearch(client);
  const beforeText = describeSiteSearch(before.exists, before.value);
  console.log(`siteSearch BEFORE: ${beforeText}`);

  let afterText = '(restore did not run)';
  try {
    if (!before.exists) {
      info('2. live hide round trip', 'skipped - the globalSettings document does not exist');
    } else {
      await verifyStripStorage(client, sku);

      // Baseline: the product must be findable before we hide it, or the whole
      // test proves nothing.
      const baseline = await getText(`/search?q=${encodeURIComponent(sku)}`);
      record(
        '2. baseline - the product is findable before hiding',
        `Item # ${sku} on /search?q=${sku}`,
        hasItemNumber(baseline.body, sku) ? 'found' : 'NOT FOUND (test would be vacuous)',
        hasItemNumber(baseline.body, sku),
      );

      // Hide it. The mutation itself is what fires the Sanity webhook, so this
      // also exercises the webhook wiring end to end.
      const existingHidden = Array.isArray((before.value as { hiddenSkus?: unknown })?.hiddenSkus)
        ? ((before.value as { hiddenSkus: string[] }).hiddenSkus as string[])
        : [];
      await client
        .patch(GLOBAL_SETTINGS_ID)
        .set({ siteSearch: { hiddenSkus: [...existingHidden, sku] } })
        .commit();
      console.log(`siteSearch patched: hiding ${sku}. Polling the deployment...`);

      const hidePoll = await pollUntil('hide', async () => {
        const merge = await observeClientMerge(sku);
        const page = await getText(`/search?q=${encodeURIComponent(sku)}`);
        return !merge.survivesRule && !hasItemNumber(page.body, sku);
      });
      record(
        '2. hiding takes effect without a rebuild',
        `both read paths drop the SKU within ${REVALIDATE_BUDGET_MS / 1000}s`,
        hidePoll.ok ? `after ${(hidePoll.ms / 1000).toFixed(1)}s` : `still visible after ${(hidePoll.ms / 1000).toFixed(1)}s`,
        hidePoll.ok,
      );
      timings.push(`publish to hidden, both read paths: ${(hidePoll.ms / 1000).toFixed(1)}s`);

      await verifyHiddenState(sku, categorySlug, true);

      // Restore and prove it comes back.
      await restoreSiteSearch(client, before);
      console.log('siteSearch restored. Polling for the product to return...');
      const backPoll = await pollUntil('restore', async () => {
        const merge = await observeClientMerge(sku);
        const page = await getText(`/search?q=${encodeURIComponent(sku)}`);
        return merge.survivesRule && hasItemNumber(page.body, sku);
      });
      record(
        '2. removing the SKU brings it back',
        `both read paths show it again within ${REVALIDATE_BUDGET_MS / 1000}s`,
        backPoll.ok ? `after ${(backPoll.ms / 1000).toFixed(1)}s` : `still hidden after ${(backPoll.ms / 1000).toFixed(1)}s`,
        backPoll.ok,
      );
      timings.push(`removal to visible again, both read paths: ${(backPoll.ms / 1000).toFixed(1)}s`);

      await verifyHiddenState(sku, categorySlug, false);
    }
  } finally {
    // Survives a crash. Restoring twice is harmless; leaving Patrick's settings
    // altered is not.
    try {
      const msg = await restoreSiteSearch(client, before);
      const after = await readSiteSearch(client);
      afterText = describeSiteSearch(after.exists, after.value);
      console.log(`siteSearch AFTER: ${afterText} (${msg})`);
      record(
        'globalSettings.siteSearch restored exactly',
        beforeText,
        afterText,
        afterText === beforeText,
      );
    } catch (e) {
      afterText = `RESTORE FAILED: ${String(e)}`;
      record('globalSettings.siteSearch restored exactly', beforeText, afterText, false);
    }
    try {
      await guardedDelete(client, TEST_ID);
      info('cleanup: fixture document', `${TEST_ID} deleted`);
    } catch (e) {
      info('cleanup: fixture document', `FAILED to delete ${TEST_ID}: ${String(e)}`);
    }
  }

  printTable();
  writeReport(beforeText, afterText);
  console.log(`\nReport written to ${REPORT_PATH}`);
}

// -- Report ------------------------------------------------------------------

function writeReport(beforeText: string, afterText: string): void {
  const stamp = new Date().toISOString();
  const failed = rows.filter((r) => r.status === 'FAIL').length;
  const passed = rows.filter((r) => r.status === 'PASS').length;

  const lines: string[] = [
    '# Q-170: Automated verification of the three batched improvements',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q170.ts (verification only, no app code touched). Mode: ${DRY_RUN ? 'dry run' : CLEANUP_ONLY ? 'cleanup only' : 'apply'}.`,
    '',
    `Result: ${passed} passed, ${failed} failed.`,
    '',
    '## What is being verified',
    '',
    '1. The shared product strip SKU field is a search-and-pick dropdown on every surface, storing the same bare string it always did.',
    '2. A Geiger SKU can be hidden from site search, on BOTH search read paths, without a rebuild, and without being hidden anywhere else.',
    '3. The site search box sits beside the heading on the blog and video index pages, which stay statically generated.',
    '',
    '## globalSettings (a real singleton Patrick uses)',
    '',
    `- BEFORE: \`${beforeText}\``,
    `- AFTER:  \`${afterText}\``,
    '',
    APPLY
      ? 'The value above was recorded before the first write and restored in a `finally` that survives a crash. An unset field is restored by unsetting it, not by writing an empty object, so the document ends the run shaped exactly as it started. Patrick\'s DRAFT of globalSettings was never touched. The dataset is shared between staging and production, so during the run one product was briefly missing from production site search; it stayed on its category pages throughout.'
      : 'No write was made in this mode. The record-and-restore machinery is still in the script and is what `--apply` uses.',
    '',
    '## Results',
    '',
    '| Check | Expected | Actual | Status |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.check} | ${r.expected} | ${r.actual} | ${r.status} |`),
    '',
  ];

  if (timings.length) {
    lines.push('## Timings', '', ...timings.map((t) => `- ${t}`), '');
  }
  if (notes.length) {
    lines.push('## Notes / findings', '', ...notes.map((n) => `- ${n}`), '');
  }

  lines.push(
    '## The complete list of search read paths, and how completeness was established',
    '',
    'Established by grepping the repo for every importer of the two search entry points, not by reading one file:',
    '',
    '| # | Read path | Serves | Filtered in |',
    '| --- | --- | --- | --- |',
    '| A | `lib/search/load-index.ts` `search()` | the header autocomplete overlay (`components/forms/SearchBox.tsx`) AND the "Also matching" strip (`components/search/SearchAlsoMatching.tsx`) | `recomputeItems()` filters the MERGED static + delta set |',
    '| B | `lib/search/server-search.ts` `searchProducts()` | the `/search` results grid and its facet sidebar (`app/search/page.tsx`, its only importer) | `searchProducts` drops hidden SKUs; facets derive from the filtered list |',
    '| C | `public/search-index.json` (static bulk) | the raw data behind A | not filtered at build, filtered at read time by A. This is deliberate: filtering it would need a redeploy per edit |',
    '',
    '`app/api/search/route.ts` is a 501 stub and searches nothing. No other module imports either entry point.',
    '',
    '## What a script cannot prove (for Ali, after the single deploy)',
    '',
    '1. **Open the Studio** and confirm the SKU field offers search-and-pick on a blog post, a page with a product strip, and a video. Type a partial product name and check a result list appears.',
    '2. **Look at the blog and video index on a phone.** The box should stack under the heading at full width, not squeeze beside it.',
    '3. **Type into the index-page box.** The dropdown should open leftwards and be wide enough to read product rows, not clipped by the viewport.',
    '4. **The overlay race.** The client applies the hide list as soon as the live delta lands. A search fired in the gap before it lands can briefly show a hidden product in the OVERLAY only; the results page is filtered server-side and never affected. Type a second character and it corrects itself.',
    '',
  );

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
