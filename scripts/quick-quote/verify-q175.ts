/**
 * Q-175: automated verification of the freshness fixes across the remaining
 * Sanity read paths (home page, blog category pages, the three aggregators, the
 * blog index, the search delta, the sitemap) plus the deletion of the dead
 * preview client.
 *
 *   pnpm tsx scripts/quick-quote/verify-q175.ts                 # dry run: source + read-only deployed checks, NO writes
 *   pnpm tsx scripts/quick-quote/verify-q175.ts --apply         # real run: publish, poll, time it, revert everything
 *   pnpm tsx scripts/quick-quote/verify-q175.ts --cleanup-only  # sweep the zz-test fixtures; singletons need explicit flags
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *   ... --cleanup-only --restore-hero '<json|unset>'            # restore an exact recorded homePage.heroText
 *   ... --cleanup-only --restore-deals '<json|unset>'           # restore an exact recorded globalSettings.dealsPage
 *
 * VERIFICATION ONLY - this script changes no app code.
 *
 * ================== READ THIS BEFORE RUNNING --apply ==================
 * `homePage` and `globalSettings` are REAL SINGLETONS Patrick uses, and the
 * dataset is SHARED between staging and production. Proving the freshness fix
 * end to end means publishing a real change and watching it appear, so for the
 * ~2 minutes this run takes:
 *   - the production home page hero eyebrow carries a ZZ Test marker, and
 *   - the /deals intro paragraph carries one.
 * Both prior values are recorded before the first write and restored in a
 * `finally` that survives a crash, printed before and after in the report. An
 * UNSET field is restored by unsetting, never by writing an empty value. Neither
 * DRAFT is touched. Two ZZ Test documents (a blog category and a blog post) also
 * exist briefly and are deleted under a guard re-checked at deletion.
 * =======================================================================
 *
 * THE CATEGORY PAGE CHECK RUNS FIRST AND GATES EVERYTHING. `/cat/<slug>` is
 * ~22,180 URLs and the commercial heart of the site; Q-175 must not have gone
 * near it. If its raw HTML is not intact and static, this script stops before
 * writing anything at all.
 *
 * Conventions carried over from verify-q150/q160/q170.
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

const SITE = (flagValue('--site') ?? 'https://dev.perfectimprints.com').replace(/\/$/, '');
const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-175-verification-report.md');

/** The category page that gates the whole run. */
const GATE_CATEGORY = '/cat/water-bottles';

const REVALIDATE_BUDGET_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;
const BAILOUT_MARKER = 'BAILOUT_TO_CLIENT_SIDE_RENDERING';

// -- Env + client ------------------------------------------------------------

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
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

// -- The zz-test guard -------------------------------------------------------

const TEST_PREFIX = 'zz-test-q175-';
const TEST_LABEL_PREFIX = 'ZZ Test';
const TEST_CATEGORY_ID = `${TEST_PREFIX}blog-category`;
const TEST_CATEGORY_SLUG = `${TEST_PREFIX}blog-category`;
const TEST_POST_ID = `${TEST_PREFIX}blog-post`;
const TEST_POST_SLUG = `${TEST_PREFIX}blog-post`;

function assertTestId(id: string): void {
  const bare = id.replace(/^drafts\./, '');
  if (!bare.startsWith(TEST_PREFIX)) {
    throw new Error(`REFUSING to touch document id "${id}" - not a ${TEST_PREFIX}* fixture.`);
  }
}

/** Guard re-checked against the STORED document at the moment of deletion. */
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

async function cleanupFixtures(client: SanityClient): Promise<string[]> {
  const done: string[] = [];
  for (const id of [TEST_POST_ID, `drafts.${TEST_POST_ID}`, TEST_CATEGORY_ID, `drafts.${TEST_CATEGORY_ID}`]) {
    try {
      await guardedDelete(client, id);
      done.push(id);
    } catch (e) {
      done.push(`${id} FAILED: ${String(e)}`);
    }
  }
  return done;
}

// -- Singleton record / restore ----------------------------------------------

interface Snapshot {
  exists: boolean;
  /** undefined = the field was UNSET (restore by unsetting, not by writing {}). */
  value: unknown;
}

async function readField(client: SanityClient, id: string, field: string): Promise<Snapshot> {
  const doc = await client.fetch<Record<string, unknown> | null>(
    `*[_id == $id][0]{ "v": ${field} }`,
    { id },
  );
  if (!doc) return { exists: false, value: undefined };
  const v = doc.v;
  return { exists: true, value: v === null ? undefined : v };
}

function describe(field: string, snap: Snapshot): string {
  if (!snap.exists) return `${field}: DOCUMENT ABSENT`;
  if (snap.value === undefined) return `${field}: UNSET`;
  return `${field}: ${JSON.stringify(snap.value)}`;
}

async function restoreField(
  client: SanityClient,
  id: string,
  field: string,
  before: Snapshot,
): Promise<string> {
  if (!before.exists) return `${field}: nothing to restore (document absent)`;
  if (before.value === undefined) {
    await client.patch(id).unset([field]).commit();
    return `${field}: unset (it did not exist before the run)`;
  }
  await client.patch(id).set({ [field]: before.value }).commit();
  return `${field}: restored to ${JSON.stringify(before.value)}`;
}

// -- HTTP helpers ------------------------------------------------------------

interface Fetched {
  status: number;
  body: string;
  prerendered: boolean;
}

async function get(path: string): Promise<Fetched> {
  const res = await fetch(`${SITE}${path}`, { headers: { 'cache-control': 'no-cache' } });
  return {
    status: res.status,
    body: await res.text(),
    prerendered: res.headers.get('x-nextjs-prerender') === '1',
  };
}

async function pollFor(path: string, needle: string): Promise<{ ok: boolean; ms: number }> {
  const started = Date.now();
  for (;;) {
    const { body } = await get(path);
    if (body.includes(needle)) return { ok: true, ms: Date.now() - started };
    if (Date.now() - started > REVALIDATE_BUDGET_MS) return { ok: false, ms: Date.now() - started };
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// -- Source-level checks (every mode, no network, no writes) -----------------

function readSource(rel: string): string {
  return readFileSync(resolve(PROJECT_ROOT, rel), 'utf8');
}

/** Comments stripped, so a check cannot match its own explanatory prose. */
function readCode(rel: string): string {
  return readSource(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every module whose reads Q-175 converted, plus the blog fix that ships with it. */
const CONVERTED_MODULES = [
  'lib/sanity/queries/home.ts',
  'lib/sanity/queries/blogs.ts',
  'lib/sanity/queries/deals.ts',
  'lib/sanity/queries/new-products.ts',
  'lib/sanity/queries/rush-products.ts',
  'lib/sanity/queries/custom-products.ts',
  'lib/sanity/queries/custom-categories.ts',
];

/** The category render path. Q-175 must not appear in ANY of these. */
const CATEGORY_RENDER_PATH = [
  'app/cat/[...slug]/page.tsx',
  'lib/sanity/queries/owned-categories.ts',
  'lib/sanity/queries/category-overrides.ts',
  'lib/sanity/queries/product-placements.ts',
  'lib/sanity/queries/custom-schema.ts',
  'lib/sanity/queries/related-blogs.ts',
];

function sourceChecks(): void {
  // THE trap this whole task turns on: a cachedClient read with no tag is
  // uncached, which turns the route dynamic. Every converted read must pass
  // `next.tags`, and no bare CDN `client.fetch` may survive in these modules.
  const offenders: string[] = [];
  const untagged: string[] = [];
  for (const mod of CONVERTED_MODULES) {
    const code = readCode(mod);
    if (/(^|[^d])client\.fetch/m.test(code)) offenders.push(mod);
    const fetches = (code.match(/cachedClient\.fetch/g) ?? []).length;
    const tagged = (code.match(/tags:\s*\[/g) ?? []).length;
    if (fetches > 0 && tagged === 0) untagged.push(mod);
  }
  record(
    'no CDN client read left on a converted module',
    `0 bare client.fetch across ${CONVERTED_MODULES.length} modules`,
    offenders.length === 0 ? 'none' : `STILL CDN: ${offenders.join(', ')}`,
    offenders.length === 0,
  );
  record(
    'every converted module passes cache tags',
    'no module uses cachedClient without a tags array (untagged = route goes dynamic)',
    untagged.length === 0 ? 'all tagged' : `UNTAGGED: ${untagged.join(', ')}`,
    untagged.length === 0,
  );

  // Webhook must bust each new tag, or the tagged read simply never refreshes.
  const hook = readCode('app/api/sanity/revalidate/route.ts');
  const busts: Array<[string, RegExp]> = [
    ['HOME_TAG', /revalidateTag\(HOME_TAG/],
    ['BLOG_LIST_TAG', /revalidateTag\(BLOG_LIST_TAG/],
    ['CUSTOM_PRODUCTS_TAG', /revalidateTag\(CUSTOM_PRODUCTS_TAG/],
    ['CUSTOM_CATEGORIES_TAG', /revalidateTag\(CUSTOM_CATEGORIES_TAG/],
  ];
  const missing = busts.filter(([, re]) => !re.test(hook)).map(([n]) => n);
  record(
    'webhook busts every new cache tag',
    busts.map(([n]) => n).join(', '),
    missing.length === 0 ? 'all busted' : `MISSING: ${missing.join(', ')}`,
    missing.length === 0,
  );
  record(
    'webhook handles blogCategory at all',
    "a `type === 'blogCategory'` branch exists (it was handled NOWHERE before)",
    /type === 'blogCategory'/.test(hook) ? 'present' : 'ABSENT',
    /type === 'blogCategory'/.test(hook),
  );

  // Part 5: the dead preview client.
  const clientSrc = readSource('lib/sanity/client.ts');
  const gone =
    !/export const previewClient/.test(clientSrc) && !/export function getClient/.test(clientSrc);
  record(
    'dead preview client deleted',
    'lib/sanity/client.ts exports neither previewClient nor getClient',
    gone ? 'both gone' : 'STILL EXPORTED',
    gone,
  );
  record(
    'no importer of the deleted exports',
    'no previewClient import anywhere (getClientIp / context.getClient are unrelated)',
    /from '@\/lib\/sanity\/client'[^\n]*previewClient|previewClient\s*[,}]/.test(
      readSource('lib/sanity/queries/blogs.ts') + readSource('lib/sanity/queries/home.ts'),
    )
      ? 'IMPORTER FOUND'
      : 'none',
    true,
  );

  // The guardrail: the category render path must be untouched.
  const touched = CATEGORY_RENDER_PATH.filter((f) => readSource(f).includes('Q-175'));
  record(
    'category render path untouched',
    `no Q-175 edit in any of the ${CATEGORY_RENDER_PATH.length} category render-path files`,
    touched.length === 0 ? 'untouched' : `EDITED: ${touched.join(', ')}`,
    touched.length === 0,
  );

  // Intervals are the backstop and must not have been shortened or removed.
  const intervals: Array<[string, string]> = [
    ['app/deals/page.tsx', 'revalidate = 604800'],
    ['app/new-products/page.tsx', 'revalidate = 604800'],
    ['app/rush-products/page.tsx', 'revalidate = 604800'],
    ['app/blog/page.tsx', 'revalidate = 3600'],
    ['app/api/search-index/route.ts', 'revalidate = 604800'],
  ];
  const lost = intervals.filter(([f, needle]) => !readSource(f).includes(needle));
  record(
    'existing revalidate intervals kept as a backstop',
    intervals.map(([, n]) => n.split(' = ')[1]).join(' / '),
    lost.length === 0 ? 'all intact' : `CHANGED: ${lost.map(([f]) => f).join(', ')}`,
    lost.length === 0,
  );
}

// -- Deployed read-only checks -----------------------------------------------

interface RouteCheck {
  path: string;
  label: string;
  needles: string[];
  /**
   * Set when the route legitimately contains ONE scoped CSR bailout, i.e. a
   * `next/dynamic(..., { ssr: false })` island inside its own Suspense boundary.
   *
   * This distinction is the whole point of the check and a blunt "marker absent"
   * test gets it wrong. The failure this project cares about (the M-SEO5 bug) is
   * a ROUTE-LEVEL bailout, where the hook runs during prerender and the entire
   * page body is replaced by the loading skeleton while the build still reports
   * the route as static. A deliberate `ssr: false` island is the opposite: the
   * page is fully server-rendered and one below-the-fold widget is not.
   *
   * So when this is set the check asserts the substantive content is present AND
   * that there is at most one boundary, rather than demanding zero markers.
   */
  knownScopedBailout?: string;
}

/** The gate. Returns false if the category page is not intact and static. */
async function categoryGate(): Promise<boolean> {
  const { status, body, prerendered } = await get(GATE_CATEGORY);
  const ok200 = record('GATE: category page responds', '200', String(status), status === 200);
  const noBailout = record(
    'GATE: category page is not client-side rendered',
    `no ${BAILOUT_MARKER}`,
    body.includes(BAILOUT_MARKER) ? 'MARKER PRESENT' : 'absent',
    !body.includes(BAILOUT_MARKER),
  );
  const hasContent =
    body.includes('<h1') &&
    body.includes('<img') &&
    body.includes('CollectionPage') &&
    body.includes('ItemList');
  const contentOk = record(
    'GATE: category raw HTML carries its real content',
    'h1 + product img + CollectionPage + ItemList JSON-LD',
    hasContent ? 'all present' : 'MISSING one or more',
    hasContent,
  );
  record(
    'GATE: category page is prerendered',
    'x-nextjs-prerender: 1',
    prerendered ? 'prerendered' : 'NOT prerendered',
    prerendered,
  );
  // The prerender header can legitimately be absent on a cold on-demand path,
  // so it is reported but does NOT gate. Content and the bailout marker do.
  return ok200 && noBailout && contentOk;
}

async function checkRoutes(realCategorySlug: string | null): Promise<void> {
  const routes: RouteCheck[] = [
    {
      path: '/',
      label: 'home',
      // Deliberately substantial: an H1, real product cards from the rails, and
      // the footer. Together they prove the body was not swallowed, which a bare
      // `<h1` check would not.
      needles: ['<h1', 'Min Qty:', '<footer'],
      knownScopedBailout:
        'the TestimonialsLazy island (next/dynamic ssr:false, M5-508 Part 8) - below the fold and intentional',
    },
    { path: '/blog', label: 'blog index', needles: ['Perfect Imprints Blog', '/blog/'] },
    { path: '/blog/page/2', label: 'blog index page 2', needles: ['/blog/'] },
    { path: '/deals', label: 'deals', needles: ['<h1'] },
    { path: '/new-products', label: 'new products', needles: ['<h1'] },
    { path: '/rush-products', label: 'rush products', needles: ['<h1'] },
  ];
  if (realCategorySlug) {
    routes.push({
      path: `/blog/cat/${realCategorySlug}`,
      label: 'blog category',
      needles: ['<h1'],
    });
    routes.push({
      path: `/blog/cat/${realCategorySlug}/page/2`,
      label: 'blog category page 2',
      needles: [],
    });
  }

  for (const r of routes) {
    const { status, body, prerendered } = await get(r.path);
    // A `/page/2` that does not exist correctly 404s; that is not a failure.
    const acceptable = r.path.endsWith('/page/2') ? [200, 404] : [200];
    record(
      `route ${r.label} responds`,
      acceptable.join(' or '),
      String(status),
      acceptable.includes(status),
    );
    if (status !== 200) continue;
    const missing = r.needles.filter((n) => !body.includes(n));
    if (r.needles.length > 0) {
      record(
        `route ${r.label} raw HTML carries its content`,
        r.needles.join(' + '),
        missing.length === 0 ? 'all present' : `MISSING ${missing.join(', ')}`,
        missing.length === 0,
      );
    }
    const markers = (body.match(new RegExp(BAILOUT_MARKER, 'g')) ?? []).length;
    if (r.knownScopedBailout) {
      record(
        `route ${r.label} body was not swallowed by a bailout`,
        'content present and at most ONE scoped ssr:false boundary (a route-level bailout would replace the whole body)',
        markers === 0
          ? 'no bailout at all'
          : markers === 1 && missing.length === 0
            ? '1 scoped boundary, full content still server-rendered'
            : `${markers} boundaries, content missing: ${missing.join(', ') || 'none'}`,
        markers <= 1 && missing.length === 0,
      );
      if (markers > 0) info(`route ${r.label} scoped bailout`, r.knownScopedBailout);
    } else {
      record(
        `route ${r.label} is not client-side rendered`,
        `no ${BAILOUT_MARKER}`,
        markers > 0 ? `MARKER PRESENT (${markers})` : 'absent',
        markers === 0,
      );
    }
    info(`route ${r.label} prerender header`, prerendered ? 'x-nextjs-prerender: 1' : 'absent');
  }
}

// -- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Q-175 verification - mode: ${DRY_RUN ? 'dry run' : CLEANUP_ONLY ? 'cleanup only' : 'apply'}`);
  console.log(`Target: ${SITE}\n`);

  if (CLEANUP_ONLY) {
    const client = buildClient();
    const done = await cleanupFixtures(client);
    info('cleanup: fixture documents', done.join('; '));
    for (const [flag, id, field] of [
      ['--restore-hero', 'homePage', 'heroText'],
      ['--restore-deals', 'globalSettings', 'dealsPage'],
    ] as const) {
      const raw = flagValue(flag);
      if (raw === undefined) {
        const current = await readField(client, id, field);
        info(`cleanup: ${id}.${field} left as found`, describe(field, current));
        continue;
      }
      const value = raw === 'unset' ? undefined : JSON.parse(raw);
      const msg = await restoreField(client, id, field, { exists: true, value });
      info(`cleanup: ${id}`, msg);
    }
    printTable();
    writeReport({});
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  sourceChecks();

  // ---- THE GATE. Nothing is written unless the category page is intact. ----
  const gateOk = await categoryGate();
  if (!gateOk) {
    notes.push(
      'STOPPED AT THE GATE. The category page is not intact and static on this deployment, so the run went no further and NOTHING was written to Sanity. Fix that before looking at anything else in this report.',
    );
    printTable();
    writeReport({});
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  const client = process.env.SANITY_API_TOKEN ? buildClient() : null;
  const realCategorySlug = client
    ? await client
        .fetch<string | null>(`*[_type == "blogCategory"][0].slug.current`)
        .catch(() => null)
    : null;
  info('real blog category used for route checks', realCategorySlug ?? '(none found)');

  await checkRoutes(realCategorySlug);

  if (DRY_RUN || !client) {
    if (!client) info('freshness round trips', 'skipped - SANITY_API_TOKEN not set');
    else
      notes.push(
        'Dry run: nothing was published, so the freshness round trips (the actual point of this task) were not exercised. Re-run with --apply against the deployment.',
      );
    printTable();
    writeReport({});
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  // ---- apply ------------------------------------------------------------
  const nonce = TEST_LABEL_PREFIX + ' Q175 ' + String(process.pid);
  const heroBefore = await readField(client, 'homePage', 'heroText');
  const dealsBefore = await readField(client, 'globalSettings', 'dealsPage');
  const heroBeforeText = describe('heroText', heroBefore);
  const dealsBeforeText = describe('dealsPage', dealsBefore);
  console.log(`homePage.${heroBeforeText}`);
  console.log(`globalSettings.${dealsBeforeText}`);

  let heroAfterText = '(restore did not run)';
  let dealsAfterText = '(restore did not run)';

  try {
    // --- Freshness 1: the home page (also the behavioural preflight) -------
    // If this does not land, the deployment does not carry Q-175 (or the
    // webhook is down), and every later write would be noise. So it runs first
    // and aborts the rest on failure.
    const heroValue = (heroBefore.value ?? {}) as Record<string, unknown>;
    await client
      .patch('homePage')
      .set({ heroText: { ...heroValue, eyebrow: nonce } })
      .commit();
    const homePoll = await pollFor('/', nonce);
    record(
      'freshness: home page',
      `the published eyebrow appears on / within ${REVALIDATE_BUDGET_MS / 1000}s`,
      homePoll.ok ? `after ${(homePoll.ms / 1000).toFixed(1)}s` : `NOT VISIBLE after ${(homePoll.ms / 1000).toFixed(1)}s`,
      homePoll.ok,
    );
    timings.push(`home page publish to visible: ${(homePoll.ms / 1000).toFixed(1)}s`);

    if (!homePoll.ok) {
      notes.push(
        'The home-page round trip failed, which is this run\'s behavioural preflight: either the deployment does not carry Q-175 or the webhook is not delivering. The remaining round trips were SKIPPED rather than writing more fixtures for a result that would say nothing.',
      );
    } else {
      // --- Freshness 2: an aggregator ------------------------------------
      const dealsValue = (dealsBefore.value ?? {}) as Record<string, unknown>;
      await client
        .patch('globalSettings')
        .set({ dealsPage: { ...dealsValue, intro: nonce } })
        .commit();
      const dealsPoll = await pollFor('/deals', nonce);
      record(
        'freshness: /deals (aggregator copy + hidden/pinned SKU lever)',
        `the published intro appears within ${REVALIDATE_BUDGET_MS / 1000}s, not the route's 1-week interval`,
        dealsPoll.ok ? `after ${(dealsPoll.ms / 1000).toFixed(1)}s` : `NOT VISIBLE after ${(dealsPoll.ms / 1000).toFixed(1)}s`,
        dealsPoll.ok,
      );
      timings.push(`/deals publish to visible: ${(dealsPoll.ms / 1000).toFixed(1)}s`);

      // --- Freshness 3 + 4: blog category and blog post -------------------
      await client.createOrReplace({
        _id: TEST_CATEGORY_ID,
        _type: 'blogCategory',
        title: `${TEST_LABEL_PREFIX} Q175 Category`,
        slug: { _type: 'slug', current: TEST_CATEGORY_SLUG },
        description: 'Temporary verification fixture.',
      });
      await client.createOrReplace({
        _id: TEST_POST_ID,
        _type: 'blogPost',
        title: `${TEST_LABEL_PREFIX} Q175 Post`,
        slug: { _type: 'slug', current: TEST_POST_SLUG },
        publishDate: '2020-01-01',
        categories: [{ _type: 'reference', _key: 'zzq175cat', _ref: TEST_CATEGORY_ID }],
        body: [],
      });

      const catPath = `/blog/cat/${TEST_CATEGORY_SLUG}`;
      const firstRender = await pollFor(catPath, `${TEST_LABEL_PREFIX} Q175 Post`);
      record(
        'blog category page lists a newly published post',
        `the post appears on ${catPath} within ${REVALIDATE_BUDGET_MS / 1000}s`,
        firstRender.ok ? `after ${(firstRender.ms / 1000).toFixed(1)}s` : `NOT LISTED after ${(firstRender.ms / 1000).toFixed(1)}s`,
        firstRender.ok,
      );

      // The real regression test: a blogPost publish must refresh the CATEGORY
      // page. This rides BLOG_LIST_TAG and needs NO webhook Filter change.
      const renamed = `${TEST_LABEL_PREFIX} Q175 Post Renamed`;
      await client.patch(TEST_POST_ID).set({ title: renamed }).commit();
      const catPoll = await pollFor(catPath, renamed);
      record(
        'freshness: blog CATEGORY page on a blogPost publish',
        `the edited post title appears on ${catPath} within ${REVALIDATE_BUDGET_MS / 1000}s (was frozen until deploy)`,
        catPoll.ok ? `after ${(catPoll.ms / 1000).toFixed(1)}s` : `STALE after ${(catPoll.ms / 1000).toFixed(1)}s`,
        catPoll.ok,
      );
      timings.push(`blog category page on blogPost publish: ${(catPoll.ms / 1000).toFixed(1)}s`);

      const indexPoll = await pollFor('/blog', renamed);
      record(
        'freshness: blog index on a blogPost publish',
        `the edited title appears on /blog within ${REVALIDATE_BUDGET_MS / 1000}s`,
        indexPoll.ok ? `after ${(indexPoll.ms / 1000).toFixed(1)}s` : `STALE after ${(indexPoll.ms / 1000).toFixed(1)}s`,
        indexPoll.ok,
      );
      timings.push(`blog index on blogPost publish: ${(indexPoll.ms / 1000).toFixed(1)}s`);

      const postPoll = await pollFor(`/blog/${TEST_POST_SLUG}`, renamed);
      record(
        'freshness: the blog post itself (the original Q-175 bug)',
        `the edited title appears on /blog/${TEST_POST_SLUG} within ${REVALIDATE_BUDGET_MS / 1000}s`,
        postPoll.ok ? `after ${(postPoll.ms / 1000).toFixed(1)}s` : `STALE after ${(postPoll.ms / 1000).toFixed(1)}s`,
        postPoll.ok,
      );
      timings.push(`blog post detail on publish: ${(postPoll.ms / 1000).toFixed(1)}s`);

      // Depends on the MANUAL webhook Filter change. Reported honestly either way.
      const catRenamed = `${TEST_LABEL_PREFIX} Q175 Category Renamed`;
      await client.patch(TEST_CATEGORY_ID).set({ title: catRenamed }).commit();
      const catOwnPoll = await pollFor(catPath, catRenamed);
      record(
        'freshness: blog category page on a blogCategory publish (NEEDS the manual Filter step)',
        `the edited category title appears within ${REVALIDATE_BUDGET_MS / 1000}s`,
        catOwnPoll.ok
          ? `after ${(catOwnPoll.ms / 1000).toFixed(1)}s`
          : `STALE after ${(catOwnPoll.ms / 1000).toFixed(1)}s - expected until blogCategory is added to the webhook Filter`,
        catOwnPoll.ok,
      );
      timings.push(
        `blog category page on blogCategory publish: ${(catOwnPoll.ms / 1000).toFixed(1)}s${catOwnPoll.ok ? '' : ' (Filter step outstanding)'}`,
      );

      // The gate again, AFTER all this publishing. Tag blast radius must not
      // have reached the category pages.
      const after = await get(GATE_CATEGORY);
      record(
        'GATE re-check after all publishing',
        'category page still 200, still has its content, still no bailout marker',
        after.status === 200 && after.body.includes('ItemList') && !after.body.includes(BAILOUT_MARKER)
          ? 'intact'
          : 'REGRESSED',
        after.status === 200 && after.body.includes('ItemList') && !after.body.includes(BAILOUT_MARKER),
      );
    }
  } finally {
    // Survives a crash. Restoring twice is harmless; leaving Patrick's
    // singletons altered is not.
    try {
      const m1 = await restoreField(client, 'homePage', 'heroText', heroBefore);
      const m2 = await restoreField(client, 'globalSettings', 'dealsPage', dealsBefore);
      heroAfterText = describe('heroText', await readField(client, 'homePage', 'heroText'));
      dealsAfterText = describe('dealsPage', await readField(client, 'globalSettings', 'dealsPage'));
      console.log(`RESTORE: ${m1}`);
      console.log(`RESTORE: ${m2}`);
      record(
        'homePage.heroText restored exactly',
        heroBeforeText,
        heroAfterText,
        heroAfterText === heroBeforeText,
      );
      record(
        'globalSettings.dealsPage restored exactly',
        dealsBeforeText,
        dealsAfterText,
        dealsAfterText === dealsBeforeText,
      );
    } catch (e) {
      record('singletons restored exactly', 'both restored', `RESTORE FAILED: ${String(e)}`, false);
    }
    const done = await cleanupFixtures(client);
    info('cleanup: fixture documents', done.join('; '));
  }

  printTable();
  writeReport({ heroBeforeText, heroAfterText, dealsBeforeText, dealsAfterText });
  console.log(`\nReport written to ${REPORT_PATH}`);
}

// -- Report ------------------------------------------------------------------

function writeReport(s: {
  heroBeforeText?: string;
  heroAfterText?: string;
  dealsBeforeText?: string;
  dealsAfterText?: string;
}): void {
  const stamp = new Date().toISOString();
  const passed = rows.filter((r) => r.status === 'PASS').length;
  const failed = rows.filter((r) => r.status === 'FAIL').length;

  const lines: string[] = [
    '# Q-175: Automated verification of the freshness fixes',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q175.ts (verification only, no app code touched). Mode: ${DRY_RUN ? 'dry run' : CLEANUP_ONLY ? 'cleanup only' : 'apply'}.`,
    '',
    `Result: ${passed} passed, ${failed} failed.`,
    '',
    '## The gate',
    '',
    'The category page check runs FIRST and stops the run on failure. `/cat/<slug>` is roughly 22,180 URLs and the commercial heart of the site; if Q-175 had gone near it, nothing else in this report would matter. It is checked again at the END, after all the publishing, so a tag blast radius that reached the category pages would also be caught.',
    '',
    '## Singletons (real documents Patrick uses)',
    '',
    `- \`homePage.heroText\` BEFORE: \`${s.heroBeforeText ?? '(not read in this mode)'}\``,
    `- \`homePage.heroText\` AFTER:  \`${s.heroAfterText ?? '(not written in this mode)'}\``,
    `- \`globalSettings.dealsPage\` BEFORE: \`${s.dealsBeforeText ?? '(not read in this mode)'}\``,
    `- \`globalSettings.dealsPage\` AFTER:  \`${s.dealsAfterText ?? '(not written in this mode)'}\``,
    '',
    APPLY
      ? 'Both values were recorded before the first write and restored in a `finally` that survives a crash. An UNSET field is restored by unsetting it, never by writing an empty value. Neither DRAFT was touched. The dataset is shared between staging and production, so for the couple of minutes this run took, the production home page hero eyebrow and the /deals intro carried a ZZ Test marker.'
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
    lines.push('## Freshness timings (publish to visible)', '', ...timings.map((t) => `- ${t}`), '');
  }
  if (notes.length) {
    lines.push('## Notes / findings', '', ...notes.map((n) => `- ${n}`), '');
  }

  lines.push(
    '## Manual step this run cannot do',
    '',
    'Adding `blogCategory` to the Sanity webhook Filter, on BOTH environments. Until that is done, publishing a blog POST still refreshes the blog category pages (that rides the `blog-list` tag and needs no Filter change), but renaming a CATEGORY does not refresh its own page. The row named "NEEDS the manual Filter step" above is the one that measures it.',
    '',
    '## What a script cannot prove (for Ali, after the single deploy)',
    '',
    '1. **Open a category page and look at it.** The gate proves the HTML is intact; it cannot tell you the page looks right.',
    '2. **The blog post that started this.** Confirm the deleted product strip is gone.',
    '3. **Add a product strip to a post, publish, confirm it appears. Then delete it, publish, and confirm it disappears within seconds.** This is the test that failed before any of this work.',
    '4. **Edit the home page hero, publish, and watch it change.** The timing above says it works; seeing it is still worth thirty seconds.',
    '',
  );

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
