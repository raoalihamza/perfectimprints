/**
 * Q-180: automated verification of the last three improvements:
 *   1. a video can belong to more than one category (backward-compatible read),
 *   2. pinned SKUs show first on a category page (reorder only, both render
 *      paths agree),
 *   3. the blog/video index search boxes show the matching content type first.
 *
 *   pnpm tsx scripts/quick-quote/verify-q180.ts                 # dry run: source + read-only deployed checks, NO writes
 *   pnpm tsx scripts/quick-quote/verify-q180.ts --apply         # real run: publish fixtures, poll, revert everything
 *   pnpm tsx scripts/quick-quote/verify-q180.ts --cleanup-only  # sweep the zz-test fixtures
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *
 * VERIFICATION ONLY - this script changes no app code.
 *
 * ================== READ THIS BEFORE RUNNING --apply ==================
 * The dataset is SHARED between staging and production. This run creates ONLY
 * new zz-test-q180-* documents and touches NO existing document and NO
 * singleton (recorded in the report). The visible cost while it runs:
 *   - one real category page briefly shows two pinned products at the top of
 *     its grid (the override is deleted at the end, restoring the exact
 *     original order - the baked JSON was never touched), and
 *   - two clearly-labelled ZZ Test videos and two ZZ Test video categories
 *     exist on /videos for about a minute.
 * Every fixture is deleted in a `finally` that survives a crash, under a guard
 * re-checked against the STORED document at the moment of deletion.
 * =======================================================================
 *
 * THE CATEGORY PAGE CHECK RUNS FIRST AND GATES EVERYTHING. `/cat/<slug>` is
 * ~22,180 URLs and the commercial heart of the site; improvement 2 deliberately
 * changes code on that path. If the raw HTML is not intact and static, this
 * script stops before writing anything at all. It is checked AGAIN at the end,
 * after all publishing.
 *
 * Conventions carried over from verify-q150/q160/q170/q175.
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
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-180-verification-report.md');

/** The category page that gates the whole run (never the pin-fixture target). */
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

const TEST_PREFIX = 'zz-test-q180-';
const TEST_LABEL_PREFIX = 'ZZ Test';
const TEST_OVERRIDE_ID = `${TEST_PREFIX}override`;
const TEST_CAT1_ID = `${TEST_PREFIX}video-cat-1`;
const TEST_CAT2_ID = `${TEST_PREFIX}video-cat-2`;
const TEST_VIDEO_A_ID = `${TEST_PREFIX}video-a`;
const TEST_VIDEO_B_ID = `${TEST_PREFIX}video-b`;
const TEST_VIDEO_A_SLUG = `${TEST_PREFIX}video-a`;
const TEST_VIDEO_B_SLUG = `${TEST_PREFIX}video-b`;
const TEST_CAT1_TITLE = `${TEST_LABEL_PREFIX} Q180 Cat One`;
const TEST_CAT2_TITLE = `${TEST_LABEL_PREFIX} Q180 Cat Two`;
const TEST_VIDEO_A_TITLE = `${TEST_LABEL_PREFIX} Q180 Video A`;
const TEST_VIDEO_B_TITLE = `${TEST_LABEL_PREFIX} Q180 Video B`;

const ALL_FIXTURE_IDS = [
  TEST_OVERRIDE_ID,
  TEST_VIDEO_A_ID,
  TEST_VIDEO_B_ID,
  TEST_CAT1_ID,
  TEST_CAT2_ID,
];

function assertTestId(id: string): void {
  const bare = id.replace(/^drafts\./, '');
  if (!bare.startsWith(TEST_PREFIX)) {
    throw new Error(`REFUSING to touch document id "${id}" - not a ${TEST_PREFIX}* fixture.`);
  }
}

/** Guard re-checked against the STORED document at the moment of deletion. */
async function guardedDelete(client: SanityClient, id: string): Promise<void> {
  assertTestId(id);
  const stored = await client.fetch<{ _id: string; _type: string; title?: string } | null>(
    `*[_id == $id][0]{_id, _type, title}`,
    { id },
  );
  if (!stored) return;
  assertTestId(stored._id);
  // The override fixture has no title field; its id prefix (re-checked above)
  // plus its type is the guard. Every other fixture must carry the ZZ label.
  if (stored._type !== 'categoryOverride') {
    if (typeof stored.title !== 'string' || !stored.title.startsWith(TEST_LABEL_PREFIX)) {
      throw new Error(
        `REFUSING to delete "${id}" - stored title "${stored.title}" is not a ZZ Test fixture.`,
      );
    }
  }
  await client.delete(id);
}

async function cleanupFixtures(client: SanityClient): Promise<string[]> {
  const done: string[] = [];
  for (const bare of ALL_FIXTURE_IDS) {
    for (const id of [bare, `drafts.${bare}`]) {
      try {
        await guardedDelete(client, id);
        done.push(id);
      } catch (e) {
        done.push(`${id} FAILED: ${String(e)}`);
      }
    }
  }
  return done;
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

async function pollFor(
  path: string,
  test: (body: string) => boolean,
): Promise<{ ok: boolean; ms: number; body: string }> {
  const started = Date.now();
  for (;;) {
    const { body } = await get(path);
    if (test(body)) return { ok: true, ms: Date.now() - started, body };
    if (Date.now() - started > REVALIDATE_BUDGET_MS) {
      return { ok: false, ms: Date.now() - started, body };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/**
 * Rendered product order: the "Item # <sku>" lines, in document order. React's
 * SSR inserts a comment separator between adjacent text nodes, so the served
 * markup is `Item # <!-- -->501030` - the regex must skip that comment (the
 * first --apply run captured the whitespace before it and read every SKU as
 * an empty string).
 */
function extractItemOrder(html: string): string[] {
  const out: string[] = [];
  const re = /Item #(?:\s*<!--[\s\S]*?-->)*\s*([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const sku = m[1].trim();
    if (sku) out.push(sku);
  }
  return out;
}

/** Strip <script> blocks (the RSC flight payload) so DOM-level counting is not
 *  polluted by the serialized props that repeat every string in the page. */
function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '');
}

/**
 * The sidebar's rendered filter OPTIONS: every facet checkbox's
 * `aria-label="Section: Value"` (a set), plus the multiset of rendered
 * `(count)</span>` values. The facet values render as checkboxes, not links,
 * so this - not an href scrape - is what proves the filter options and their
 * counts are identical before and after pinning.
 */
function extractSidebarFacets(html: string): { options: Set<string>; counts: string } {
  const dom = stripScripts(html);
  const options = new Set<string>();
  const optRe = /aria-label="([^"]+: [^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(dom)) !== null) options.add(m[1]);
  const counts: string[] = [];
  const countRe = /\((\d+)\)<\/span>/g;
  while ((m = countRe.exec(dom)) !== null) counts.push(m[1]);
  return { options, counts: counts.sort((a, b) => Number(a) - Number(b)).join(',') };
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

function sourceChecks(): void {
  // ---- Improvement 2: the pin rule has ONE home and both paths flow through it.
  const merge = readCode('lib/sanity/queries/category-overrides.ts');
  record(
    'pin: applyPinnedOrder called from mergeCategoryProducts',
    'category-overrides.ts imports and calls applyPinnedOrder',
    /applyPinnedOrder\(/.test(merge) && /from '@\/lib\/products\/pin-order'/.test(merge)
      ? 'imported + called'
      : 'MISSING',
    /applyPinnedOrder\(/.test(merge) && /from '@\/lib\/products\/pin-order'/.test(merge),
  );
  record(
    'pin: projection selects pinnedSkus',
    'the categoryOverride GROQ projection carries pinnedSkus',
    /pinnedSkus/.test(merge) ? 'selected' : 'MISSING',
    /pinnedSkus/.test(merge),
  );
  // Structural agreement: NEITHER render path implements its own pin logic.
  // If a route file mentioned pinnedSkus or applyPinnedOrder it would mean a
  // second implementation - the exact disagreement risk this design removes.
  const pageCode = readCode('app/cat/[...slug]/page.tsx');
  const apiCode = readCode('app/api/category-products/route.ts');
  const leaked =
    /pinnedSkus|applyPinnedOrder/.test(pageCode) || /pinnedSkus|applyPinnedOrder/.test(apiCode);
  record(
    'pin: neither render path has its own pin logic',
    'no pinnedSkus/applyPinnedOrder reference in the page or the API route (both inherit it from the shared merge)',
    leaked ? 'A ROUTE FILE REFERENCES IT' : 'both inherit from mergeCategoryProducts',
    !leaked,
  );
  const schema = readSource('sanity/schemas/documents/category-override.ts');
  record(
    'pin: schema field with the SKU picker',
    "pinnedSkus array with components: { input: ProductSkuPicker }",
    /name: 'pinnedSkus'/.test(schema) ? 'present' : 'MISSING',
    /name: 'pinnedSkus'/.test(schema),
  );
  // Freshness: the existing categoryOverride webhook branch is what busts pins.
  const hook = readCode('app/api/sanity/revalidate/route.ts');
  const overrideBranch =
    /type === 'categoryOverride'/.test(hook) &&
    /CATEGORY_CONTROL_TAG/.test(hook) &&
    /categoryTag\(/.test(hook);
  record(
    'pin: freshness rides the existing categoryOverride webhook branch',
    "type === 'categoryOverride' busts CATEGORY_CONTROL_TAG + categoryTag(slug) (no new tag needed)",
    overrideBranch ? 'present' : 'MISSING',
    overrideBranch,
  );
  // /cat staticness: the page must not read searchParams; no client component
  // under the route may call useSearchParams at render.
  record(
    'pin: /cat page still never reads searchParams',
    'no `await searchParams` / searchParams destructure in the page body',
    /await searchParams|searchParams\./.test(pageCode) ? 'READS IT' : 'does not read it',
    !/await searchParams|searchParams\./.test(pageCode),
  );
  const catClientModules = [
    'components/category/CategoryShell.tsx',
    'components/category/FilterSidebar.tsx',
    'components/category/SortDropdown.tsx',
    'components/category/Pagination.tsx',
    'components/category/ProductGrid.tsx',
  ];
  const hookUsers = catClientModules.filter((f) => /useSearchParams/.test(readCode(f)));
  record(
    'pin: no render-time useSearchParams under /cat',
    `none of the ${catClientModules.length} client modules calls useSearchParams`,
    hookUsers.length === 0 ? 'none' : `USES IT: ${hookUsers.join(', ')}`,
    hookUsers.length === 0,
  );

  // ---- Improvement 1: every video read normalizes through ONE helper.
  const videosQ = readCode('lib/sanity/queries/videos.ts');
  record(
    'video: projection carries BOTH category shapes',
    'categories[]-> plus the legacy category-> (as legacyCategory)',
    /"categories": categories\[\]->/.test(videosQ) && /"legacyCategory": category->/.test(videosQ)
      ? 'both projected'
      : 'MISSING one',
    /"categories": categories\[\]->/.test(videosQ) && /"legacyCategory": category->/.test(videosQ),
  );
  record(
    'video: related ranking is the pure shared rule',
    'getRelatedVideos uses rankRelatedVideos + videoCategoriesOf',
    /rankRelatedVideos\(/.test(videosQ) && /videoCategoriesOf\(/.test(videosQ)
      ? 'shared rule'
      : 'MISSING',
    /rankRelatedVideos\(/.test(videosQ) && /videoCategoriesOf\(/.test(videosQ),
  );
  const videoConsumers = [
    'lib/video/card-data.ts',
    'components/videos/VideosBrowser.tsx',
    'components/videos/VideoCard.tsx',
    'app/videos/[slug]/page.tsx',
  ];
  const staleReaders = videoConsumers.filter((f) =>
    /video\.category\b|\.category\?\.slug|\bcategory:\s*video\.category\b/.test(readCode(f)),
  );
  record(
    'video: no consumer still reads the single legacy field directly',
    'card-data / VideosBrowser / VideoCard / detail page all use the normalized list',
    staleReaders.length === 0 ? 'all normalized' : `STALE: ${staleReaders.join(', ')}`,
    staleReaders.length === 0,
  );
  const videoSchema = readSource('sanity/schemas/documents/video.ts');
  record(
    'video: schema has the list + retains the legacy field',
    "a categories array of blogCategory refs, and the old category field kept (readOnly) for unmigrated docs",
    /name: 'categories'/.test(videoSchema) && /name: 'category'/.test(videoSchema)
      ? 'both present'
      : 'MISSING one',
    /name: 'categories'/.test(videoSchema) && /name: 'category'/.test(videoSchema),
  );
  record(
    'video: search entry stays ONE per video',
    'getAllVideoSearchEntries joins category titles into the single category key',
    /join\(', '\)/.test(videosQ) ? 'joined' : 'MISSING',
    /join\(', '\)/.test(videosQ),
  );
  const migration = readSource('scripts/migrations/migrate-video-categories.ts');
  record(
    'video: migration is a separate idempotent script with a dry run',
    'scripts/migrations/migrate-video-categories.ts exists, supports --dry-run, is not part of the build',
    /--dry-run/.test(migration) && /unset\(\['category'\]\)/.test(migration)
      ? 'present'
      : 'MISSING pieces',
    /--dry-run/.test(migration) && /unset\(\['category'\]\)/.test(migration),
  );

  // ---- Improvement 3: group priority wired, header untouched.
  const groupOrder = readCode('lib/search/group-order.ts');
  record(
    'search: group ordering is the pure shared rule',
    'orderedSearchGroups lifts the priority group, default order otherwise',
    /orderedSearchGroups/.test(groupOrder) ? 'present' : 'MISSING',
    /orderedSearchGroups/.test(groupOrder),
  );
  const searchBox = readCode('components/forms/SearchBox.tsx');
  record(
    'search: SearchBox uses the shared rule',
    "imports orderedSearchGroups from '@/lib/search/group-order'",
    /orderedSearchGroups\(priorityType\)/.test(searchBox) ? 'wired' : 'MISSING',
    /orderedSearchGroups\(priorityType\)/.test(searchBox),
  );
  const wiring: Array<[string, RegExp, string]> = [
    ['app/blog/page.tsx', /priorityType="blog"/, 'blog index passes blog'],
    ['app/blog/page/[n]/page.tsx', /priorityType="blog"/, 'blog pagination passes blog'],
    ['app/videos/page.tsx', /priorityType="video"/, 'video index passes video'],
  ];
  const unwired = wiring.filter(([f, re]) => !re.test(readSource(f)));
  record(
    'search: both indexes pass their priority type',
    wiring.map(([, , l]) => l).join(', '),
    unwired.length === 0 ? 'all wired' : `MISSING: ${unwired.map(([f]) => f).join(', ')}`,
    unwired.length === 0,
  );
  const header = readCode('components/layout/Header.tsx');
  record(
    'search: the header box is untouched',
    'Header.tsx passes no priorityType (its dropdown order is byte-identical)',
    /priorityType/.test(header) ? 'HEADER PASSES IT' : 'no priorityType',
    !/priorityType/.test(header),
  );
  // The index and the RANKING stay untouched: the static bulk builder and the
  // server /search path carry no Q-180 edit, and load-index keeps the exact
  // Fuse options (weights/threshold). load-index DOES gain the additive
  // ensureType guarantee (the priority group is populated from a tiny
  // type-scoped index when the global top-50 crowds it out) - that appends
  // matches, it never reorders or rescores the global list.
  record(
    'search: static index + server /search untouched',
    'no Q-180 edit in server-search.ts / build-index.ts',
    ['lib/search/server-search.ts', 'scripts/search-index/build-index.ts']
      .filter((f) => readSource(f).includes('Q-180'))
      .join(', ') || 'untouched',
    ['lib/search/server-search.ts', 'scripts/search-index/build-index.ts'].every(
      (f) => !readSource(f).includes('Q-180'),
    ),
  );
  const loadIndex = readCode('lib/search/load-index.ts');
  record(
    'search: ranking options unchanged, guarantee is additive',
    'FUSE_OPTIONS keeps threshold 0.32 + title 0.8, and mergeEnsuredResults appends without reordering',
    /threshold: 0\.32/.test(loadIndex) &&
      /weight: 0\.8/.test(loadIndex) &&
      /mergeEnsuredResults/.test(loadIndex)
      ? 'unchanged + additive'
      : 'CHANGED',
    /threshold: 0\.32/.test(loadIndex) &&
      /weight: 0\.8/.test(loadIndex) &&
      /mergeEnsuredResults/.test(loadIndex),
  );
  record(
    'search: priority group populated from actual matches',
    'SearchBox passes ensureType/ensureCount when priorityType is set (the crowding fix)',
    /ensureType: priorityType/.test(searchBox) ? 'wired' : 'MISSING',
    /ensureType: priorityType/.test(searchBox),
  );

  // ---- Guardrails: quote module + freshness work untouched.
  const quoteFiles = [
    'lib/quotes/quote-totals.ts',
    'lib/quotes/quote-display.ts',
    'app/quote/[token]/page.tsx',
    'app/api/quote-response/route.ts',
  ];
  const quoteTouched = quoteFiles.filter((f) => readSource(f).includes('Q-180'));
  record(
    'guardrail: quote module untouched',
    'no Q-180 edit in any quote file',
    quoteTouched.length === 0 ? 'untouched' : `EDITED: ${quoteTouched.join(', ')}`,
    quoteTouched.length === 0,
  );
  // The Q-175 freshness pattern must survive: converted modules still tagged.
  const freshnessModules = [
    'lib/sanity/queries/videos.ts',
    'lib/sanity/queries/category-overrides.ts',
    'lib/sanity/queries/blogs.ts',
    'lib/sanity/queries/home.ts',
  ];
  const untagged = freshnessModules.filter((f) => {
    const code = readCode(f);
    const fetches = (code.match(/cachedClient\.fetch/g) ?? []).length;
    const tagged = (code.match(/tags:\s*\[/g) ?? []).length;
    return fetches > 0 && tagged === 0;
  });
  record(
    'guardrail: freshness work intact (tagged non-CDN reads)',
    'no touched query module uses cachedClient without a tags array',
    untagged.length === 0 ? 'all tagged' : `UNTAGGED: ${untagged.join(', ')}`,
    untagged.length === 0,
  );
}

// -- Deployed read-only checks -----------------------------------------------

/** The gate. Returns false if the category page is not intact and static. */
async function categoryGate(label: string): Promise<boolean> {
  const { status, body, prerendered } = await get(GATE_CATEGORY);
  const ok200 = record(`GATE${label}: category page responds`, '200', String(status), status === 200);
  const noBailout = record(
    `GATE${label}: category page is not client-side rendered`,
    `no ${BAILOUT_MARKER}`,
    body.includes(BAILOUT_MARKER) ? 'MARKER PRESENT' : 'absent',
    !body.includes(BAILOUT_MARKER),
  );
  const hasContent =
    body.includes('<h1') &&
    body.includes('Item #') &&
    body.includes('CollectionPage') &&
    body.includes('ItemList');
  const contentOk = record(
    `GATE${label}: category raw HTML carries its products`,
    'h1 + Item # lines + CollectionPage + ItemList JSON-LD',
    hasContent ? 'all present' : 'MISSING one or more',
    hasContent,
  );
  info(`GATE${label}: prerender header`, prerendered ? 'x-nextjs-prerender: 1' : 'absent');
  return ok200 && noBailout && contentOk;
}

async function indexPageChecks(): Promise<void> {
  for (const [path, label, needles] of [
    ['/blog', 'blog index', ['Perfect Imprints Blog', '/blog/']],
    ['/videos', 'video index', ['Videos']],
  ] as const) {
    const { status, body } = await get(path);
    record(`route ${label} responds`, '200', String(status), status === 200);
    if (status !== 200) continue;
    const missing = needles.filter((n) => !body.includes(n));
    record(
      `route ${label} raw HTML carries its content`,
      needles.join(' + '),
      missing.length === 0 ? 'all present' : `MISSING ${missing.join(', ')}`,
      missing.length === 0,
    );
    record(
      `route ${label} is not client-side rendered`,
      `no ${BAILOUT_MARKER}`,
      body.includes(BAILOUT_MARKER) ? 'MARKER PRESENT' : 'absent',
      !body.includes(BAILOUT_MARKER),
    );
    // The Q-180 deployment marker: the SearchBox client island's serialized
    // props ride in the page's flight payload, so a deployment carrying this
    // branch embeds `priorityType` in the raw HTML of both index pages.
    const hasMarker = record(
      `route ${label} carries the priority-group wiring`,
      'the serialized SearchBox props include priorityType (proves this deployment has Q-180)',
      body.includes('priorityType') ? 'present' : 'ABSENT (pre-Q-180 deployment?)',
      body.includes('priorityType'),
    );
    if (!hasMarker && DRY_RUN) {
      notes.push(
        `The "${label} carries the priority-group wiring" failure means the target deployment predates this branch (Q-180 is not deployed yet), not that the wiring is wrong - the source-level wiring checks above all pass. Expected until the single deploy; --apply would refuse to write for the same reason.`,
      );
    }
  }
}

// -- Pin fixture selection ----------------------------------------------------

interface CategoryJson {
  url: string;
  type: string;
  productSkus?: string[];
}

interface PinPlan {
  slug: string;
  path: string;
  /** Pin order [pinFirst, pinSecond]: deliberately NOT the category's natural order. */
  pinFirst: string;
  pinSecond: string;
  /** In the category AND hidden in phase 2 - hiding must win. */
  hiddenPin: string;
  /** NOT in the category - must be silently ignored. */
  alienSku: string;
  /** price-max that matches pinFirst but not pinSecond (or vice versa). */
  priceMax: number | null;
  cheaperPin: string | null;
}

function loadCategoryJson(slug: string): CategoryJson | null {
  const file = resolve(PROJECT_ROOT, 'data/categories', `${slug.split('/').join('__')}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as CategoryJson;
}

function buildPinPlan(client: SanityClient | null): Promise<PinPlan | null> {
  return (async () => {
    const candidates = ['tote-bags', 'sunglasses', 'lanyards', 'caps', 'pens', 'koozies'];
    const productsFile = resolve(PROJECT_ROOT, 'data/geiger/products.json');
    const priceBySku = new Map<string, number>();
    try {
      const parsed = JSON.parse(readFileSync(productsFile, 'utf8')) as {
        products?: { sku: string; low_price?: number }[];
      };
      for (const p of parsed.products ?? []) {
        if (p.sku && typeof p.low_price === 'number') priceBySku.set(p.sku, p.low_price);
      }
    } catch {
      // Prices unavailable: the filter check degrades and says so.
    }

    for (const slug of candidates) {
      const json = loadCategoryJson(slug);
      const skus = json?.productSkus ?? [];
      if (!json || json.type !== 'root' || skus.length < 12) continue;
      if (client) {
        // One-override-per-category: our fixture must not mask (or be masked
        // by) a real override, and the slug must not be Sanity-owned.
        const taken = await client.fetch<number>(
          `count(*[(_type == "categoryOverride" && categorySlug == $slug) || (_type == "customCategory" && slug.current == $slug)])`,
          { slug },
        );
        if (taken > 0) continue;
      }
      // Pins from the middle of the list so "first" is unambiguously the pin
      // rule, in an order that differs from the natural one.
      const pinFirst = skus[7];
      const pinSecond = skus[3];
      const hiddenPin = skus[10];
      // An alien SKU: from the gate category, verified absent from this one.
      const gateJson = loadCategoryJson('water-bottles');
      const alienSku =
        (gateJson?.productSkus ?? []).find((s) => !skus.includes(s)) ?? 'zz-no-alien-found';
      // Price split for the filter check.
      const p1 = priceBySku.get(pinFirst);
      const p2 = priceBySku.get(pinSecond);
      let priceMax: number | null = null;
      let cheaperPin: string | null = null;
      if (typeof p1 === 'number' && typeof p2 === 'number' && Math.abs(p1 - p2) > 0.4) {
        priceMax = (p1 + p2) / 2;
        cheaperPin = p1 < p2 ? pinFirst : pinSecond;
      }
      return {
        slug,
        path: `/cat/${slug}`,
        pinFirst,
        pinSecond,
        hiddenPin,
        alienSku,
        priceMax,
        cheaperPin,
      };
    }
    return null;
  })();
}

// -- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    `Q-180 verification - mode: ${DRY_RUN ? 'dry run' : CLEANUP_ONLY ? 'cleanup only' : 'apply'}`,
  );
  console.log(`Target: ${SITE}\n`);

  if (CLEANUP_ONLY) {
    const client = buildClient();
    const done = await cleanupFixtures(client);
    info('cleanup: fixture documents', done.join('; '));
    printTable();
    writeReport();
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  sourceChecks();

  // ---- THE GATE. Nothing is written unless the category page is intact. ----
  const gateOk = await categoryGate('');
  if (!gateOk) {
    notes.push(
      'STOPPED AT THE GATE. The category page is not intact and static on this deployment, so the run went no further and NOTHING was written to Sanity. Fix that before looking at anything else in this report.',
    );
    printTable();
    writeReport();
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  await indexPageChecks();

  if (DRY_RUN) {
    notes.push(
      'Dry run: nothing was published, so the pin round trip and the multi-category video round trip were not exercised. Re-run with --apply against the deployment.',
    );
    printTable();
    writeReport();
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }

  // ---- apply ---------------------------------------------------------------
  const client = buildClient();

  // Behavioural preflight: refuse to write on a deployment without this code.
  const blogHtml = await get('/blog');
  if (!blogHtml.body.includes('priorityType')) {
    record(
      'PREFLIGHT: deployment carries Q-180',
      'the blog index flight payload includes the priorityType prop',
      'ABSENT - refusing to write fixtures against a pre-Q-180 deployment',
      false,
    );
    notes.push(
      'PREFLIGHT REFUSED: the target deployment does not carry Q-180 (no priorityType in the blog index HTML). No fixture was written - a pin/video round trip against old code proves nothing while still altering the shared dataset.',
    );
    printTable();
    writeReport();
    console.log(`\nReport written to ${REPORT_PATH}`);
    return;
  }
  record('PREFLIGHT: deployment carries Q-180', 'priorityType in the blog index HTML', 'present', true);

  const plan = await buildPinPlan(client);
  if (!plan) {
    record(
      'pin fixture category selection',
      'a root category with >= 12 products, no existing override, not Sanity-owned',
      'NONE FOUND - pin round trip skipped',
      false,
    );
  } else {
    info(
      'pin fixture category',
      `${plan.slug} (pins [${plan.pinFirst}, ${plan.pinSecond}], hidden-pin ${plan.hiddenPin}, alien ${plan.alienSku})`,
    );
  }

  info(
    'existing documents touched',
    'NONE - this run creates only zz-test-q180-* documents; no singleton or existing document is written, so there is nothing to record and restore',
  );

  try {
    // ======================= Improvement 2: pins =======================
    if (plan) {
      // Baseline BEFORE any write: page order, sidebar facet options, API list.
      const before = await get(plan.path);
      const beforeOrder = extractItemOrder(before.body);
      const beforeFacets = extractSidebarFacets(before.body);
      const apiBefore = (await (
        await fetch(`${SITE}/api/category-products?slug=${encodeURIComponent(plan.slug)}`)
      ).json()) as { products: { sku: string; low_price?: number }[]; totalProducts: number };
      info(
        'pin baseline',
        `${apiBefore.totalProducts} products via API, ${beforeOrder.length} Item # lines on page 1, ${beforeFacets.options.size} facet options`,
      );

      // Phase 1: pins only (incl. the alien). Membership must not change.
      await client.createOrReplace({
        _id: TEST_OVERRIDE_ID,
        _type: 'categoryOverride',
        categorySlug: plan.slug,
        pinnedSkus: [plan.pinFirst, plan.pinSecond, plan.alienSku],
      });

      const pinPoll = await pollFor(plan.path, (body) => {
        const order = extractItemOrder(body);
        return order[0] === plan.pinFirst && order[1] === plan.pinSecond;
      });
      record(
        'pins lead the static page, in the arranged order',
        `raw HTML of ${plan.path} lists ${plan.pinFirst} then ${plan.pinSecond} first within ${REVALIDATE_BUDGET_MS / 1000}s`,
        pinPoll.ok
          ? `after ${(pinPoll.ms / 1000).toFixed(1)}s`
          : `NOT LEADING after ${(pinPoll.ms / 1000).toFixed(1)}s (first: ${extractItemOrder(pinPoll.body).slice(0, 3).join(', ')})`,
        pinPoll.ok,
      );
      timings.push(`pin publish to visible on the static page: ${(pinPoll.ms / 1000).toFixed(1)}s`);

      if (pinPoll.ok) {
        const pageOrder = extractItemOrder(pinPoll.body);
        record(
          'pins are on page 1',
          'both pinned SKUs render on the first (clean-URL) page',
          pageOrder.includes(plan.pinFirst) && pageOrder.includes(plan.pinSecond)
            ? 'both on page 1'
            : 'MISSING from page 1',
          pageOrder.includes(plan.pinFirst) && pageOrder.includes(plan.pinSecond),
        );
        record(
          'page still static after pinning',
          `no ${BAILOUT_MARKER}, content intact`,
          pinPoll.body.includes(BAILOUT_MARKER) ? 'MARKER PRESENT' : 'absent, content intact',
          !pinPoll.body.includes(BAILOUT_MARKER),
        );

        // THE check that matters most: the filtered route returns the SAME order.
        const apiRes = (await (
          await fetch(`${SITE}/api/category-products?slug=${encodeURIComponent(plan.slug)}`)
        ).json()) as { products: { sku: string }[]; totalProducts: number };
        const apiOrder = apiRes.products.map((p) => p.sku);
        const pageSlice = pageOrder.join('|');
        const apiSlice = apiOrder.slice(0, pageOrder.length).join('|');
        record(
          'both render paths agree on the default order',
          'the API list (no filters) starts with exactly the page-1 order of the static page',
          pageSlice === apiSlice
            ? 'identical order'
            : `DIFFER (page: ${pageOrder.slice(0, 4).join(',')} vs api: ${apiOrder.slice(0, 4).join(',')})`,
          pageSlice === apiSlice,
        );

        // Membership unchanged: same total, same SKU set, same facet links.
        const sameTotal = apiRes.totalProducts === apiBefore.totalProducts;
        const beforeSet = new Set(apiBefore.products.map((p) => p.sku));
        const afterSet = new Set(apiOrder);
        const sameSet =
          beforeSet.size === afterSet.size && [...beforeSet].every((s) => afterSet.has(s));
        record(
          'pinning changed presentation only: total + membership',
          `totalProducts still ${apiBefore.totalProducts}, SKU set identical (facet counts derive from this set)`,
          sameTotal && sameSet ? 'unchanged' : `CHANGED (total ${apiRes.totalProducts}, set equal: ${sameSet})`,
          sameTotal && sameSet,
        );
        const afterFacets = extractSidebarFacets(pinPoll.body);
        const optionsEqual =
          beforeFacets.options.size === afterFacets.options.size &&
          [...beforeFacets.options].every((l) => afterFacets.options.has(l));
        const countsEqual = beforeFacets.counts === afterFacets.counts;
        record(
          'pinning changed presentation only: filter options + facet counts',
          'the rendered sidebar options and their counts are identical before and after',
          optionsEqual && countsEqual
            ? `identical (${afterFacets.options.size} options, counts match)`
            : `CHANGED (options ${beforeFacets.options.size} -> ${afterFacets.options.size}, counts equal: ${countsEqual})`,
          optionsEqual && countsEqual,
        );
        record(
          'an alien pinned SKU breaks nothing',
          `${plan.alienSku} (not in this category) is pinned but never rendered or added`,
          apiOrder.includes(plan.alienSku) || pageOrder.includes(plan.alienSku)
            ? 'IT WAS ADDED'
            : 'ignored',
          !apiOrder.includes(plan.alienSku) && !pageOrder.includes(plan.alienSku),
        );

        // Filter behavior: a pin that does not match the filter is dropped; a
        // matching pin stays first under the default sort.
        if (plan.priceMax != null && plan.cheaperPin) {
          const filtered = (await (
            await fetch(
              `${SITE}/api/category-products?slug=${encodeURIComponent(plan.slug)}&price-max=${plan.priceMax}`,
            )
          ).json()) as { products: { sku: string }[] };
          const fOrder = filtered.products.map((p) => p.sku);
          const otherPin = plan.cheaperPin === plan.pinFirst ? plan.pinSecond : plan.pinFirst;
          record(
            'filter: non-matching pin dropped, matching pin stays first',
            `price-max=${plan.priceMax.toFixed(2)} keeps ${plan.cheaperPin} first and drops ${otherPin}`,
            fOrder[0] === plan.cheaperPin && !fOrder.includes(otherPin)
              ? 'as specified'
              : `UNEXPECTED (first: ${fOrder[0]}, other pin present: ${fOrder.includes(otherPin)})`,
            fOrder[0] === plan.cheaperPin && !fOrder.includes(otherPin),
          );
        } else {
          info(
            'filter: non-matching pin check',
            'skipped - the two pins have no usable price split in products.json',
          );
        }
        const sorted = (await (
          await fetch(
            `${SITE}/api/category-products?slug=${encodeURIComponent(plan.slug)}&sort=price-asc`,
          )
        ).json()) as { products: { sku: string; low_price?: number }[] };
        const prices = sorted.products.map((p) => p.low_price ?? Infinity);
        const isAscending = prices.every((v, i) => i === 0 || prices[i - 1] <= v);
        record(
          'sort: an explicit visitor sort wins over the pins',
          'sort=price-asc returns a strictly price-ordered list (pins not forced first)',
          isAscending ? 'price-ordered' : 'NOT price-ordered',
          isAscending,
        );

        // Phase 2: hide one pinned SKU - hiding must win.
        await client
          .patch(TEST_OVERRIDE_ID)
          .set({
            pinnedSkus: [plan.pinFirst, plan.pinSecond, plan.hiddenPin],
            hiddenSkus: [plan.hiddenPin],
          })
          .commit();
        const hidePoll = await pollFor(plan.path, (body) => {
          const order = extractItemOrder(body);
          return order[0] === plan.pinFirst && !order.includes(plan.hiddenPin);
        });
        const hideApi = (await (
          await fetch(`${SITE}/api/category-products?slug=${encodeURIComponent(plan.slug)}`)
        ).json()) as { products: { sku: string }[] };
        record(
          'a pinned SKU that is also hidden stays hidden',
          `${plan.hiddenPin} pinned AND hidden renders on neither path`,
          hidePoll.ok && !hideApi.products.some((p) => p.sku === plan.hiddenPin)
            ? 'hidden on both paths'
            : 'STILL VISIBLE somewhere',
          hidePoll.ok && !hideApi.products.some((p) => p.sku === plan.hiddenPin),
        );
      }

      // Remove the override and confirm the original order returns.
      await guardedDelete(client, TEST_OVERRIDE_ID);
      const revertPoll = await pollFor(plan.path, (body) => {
        const order = extractItemOrder(body);
        return order.length > 0 && order[0] === beforeOrder[0] && !order.includes(plan.alienSku);
      });
      record(
        'deleting the override restores the original order',
        `page 1 leads with ${beforeOrder[0]} again within ${REVALIDATE_BUDGET_MS / 1000}s`,
        revertPoll.ok
          ? `after ${(revertPoll.ms / 1000).toFixed(1)}s`
          : `NOT RESTORED after ${(revertPoll.ms / 1000).toFixed(1)}s`,
        revertPoll.ok,
      );
      timings.push(`override delete to original order: ${(revertPoll.ms / 1000).toFixed(1)}s`);
    }

    // ================= Improvement 1: multi-category video =================
    const today = new Date().toISOString().slice(0, 10);
    await client.createOrReplace({
      _id: TEST_CAT1_ID,
      _type: 'blogCategory',
      title: TEST_CAT1_TITLE,
      slug: { _type: 'slug', current: `${TEST_PREFIX}cat-one` },
    });
    await client.createOrReplace({
      _id: TEST_CAT2_ID,
      _type: 'blogCategory',
      title: TEST_CAT2_TITLE,
      slug: { _type: 'slug', current: `${TEST_PREFIX}cat-two` },
    });
    await client.createOrReplace({
      _id: TEST_VIDEO_B_ID,
      _type: 'video',
      title: TEST_VIDEO_B_TITLE,
      slug: { _type: 'slug', current: TEST_VIDEO_B_SLUG },
      embedUrl: 'https://www.youtube.com/watch?v=zzq180testbb',
      publishDate: `${today}T00:00:00Z`,
      categories: [{ _key: 'zzc1', _type: 'reference', _ref: TEST_CAT1_ID }],
    });
    await client.createOrReplace({
      _id: TEST_VIDEO_A_ID,
      _type: 'video',
      title: TEST_VIDEO_A_TITLE,
      slug: { _type: 'slug', current: TEST_VIDEO_A_SLUG },
      embedUrl: 'https://www.youtube.com/watch?v=zzq180testaa',
      publishDate: `${today}T00:01:00Z`,
      categories: [
        { _key: 'zzc1', _type: 'reference', _ref: TEST_CAT1_ID },
        { _key: 'zzc2', _type: 'reference', _ref: TEST_CAT2_ID },
      ],
    });

    const idxPoll = await pollFor('/videos', (b) => b.includes(TEST_VIDEO_A_TITLE));
    record(
      'video index picks up the fixtures',
      `${TEST_VIDEO_A_TITLE} appears on /videos within ${REVALIDATE_BUDGET_MS / 1000}s`,
      idxPoll.ok ? `after ${(idxPoll.ms / 1000).toFixed(1)}s` : 'NOT LISTED',
      idxPoll.ok,
    );
    timings.push(`video publish to /videos: ${(idxPoll.ms / 1000).toFixed(1)}s`);

    if (idxPoll.ok) {
      const both =
        idxPoll.body.includes(TEST_CAT1_TITLE) && idxPoll.body.includes(TEST_CAT2_TITLE);
      record(
        'index filter offers BOTH of the video\'s categories',
        'both ZZ category chip titles render on /videos (the chips derive from the videos\' category lists)',
        both ? 'both chips present' : 'MISSING a chip',
        both,
      );
      // One card when the filter is cleared: the unfiltered grid renders the
      // video in exactly one <article> card. Scripts are stripped first - the
      // RSC flight payload after the last card repeats every string in the
      // page and the first --apply run double-counted because of it.
      const cards = stripScripts(idxPoll.body)
        .split('<article')
        .filter((seg) => seg.includes(`/videos/${TEST_VIDEO_A_SLUG}`)).length;
      record(
        'a multi-category video renders ONCE with no filter',
        'exactly one card on the unfiltered index',
        `${cards} card(s)`,
        cards === 1,
      );
    }

    // Detail page: both badges + related videos across a shared category.
    const detailPoll = await pollFor(`/videos/${TEST_VIDEO_A_SLUG}`, (b) =>
      b.includes(TEST_VIDEO_A_TITLE),
    );
    if (detailPoll.ok) {
      const badges =
        detailPoll.body.includes(TEST_CAT1_TITLE) && detailPoll.body.includes(TEST_CAT2_TITLE);
      record(
        'video detail shows every category badge',
        'both ZZ category titles on the video page',
        badges ? 'both present' : 'MISSING one',
        badges,
      );
      record(
        'related videos work across a shared category',
        `${TEST_VIDEO_B_TITLE} (shares Cat One) appears in Related Videos`,
        detailPoll.body.includes(TEST_VIDEO_B_TITLE) ? 'related listed' : 'NOT LISTED',
        detailPoll.body.includes(TEST_VIDEO_B_TITLE),
      );
    } else {
      record(
        'video detail page renders',
        `/videos/${TEST_VIDEO_A_SLUG} renders on demand`,
        'DID NOT RENDER',
        false,
      );
    }

    // Search delta: exactly ONE entry, carrying both category titles.
    const deltaPoll = await pollFor('/api/search-index', (b) => b.includes(TEST_VIDEO_A_SLUG));
    if (deltaPoll.ok) {
      const delta = JSON.parse(deltaPoll.body) as {
        items?: { type: string; url: string; category?: string }[];
      };
      const entries = (delta.items ?? []).filter(
        (i) => i.url === `/videos/${TEST_VIDEO_A_SLUG}`,
      );
      record(
        'search index: ONE entry for a multi-category video',
        'exactly one delta entry, its category key joining both titles',
        `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, category: ${entries[0]?.category ?? '(none)'}`,
        entries.length === 1 &&
          Boolean(
            entries[0]?.category?.includes(TEST_CAT1_TITLE) &&
              entries[0]?.category?.includes(TEST_CAT2_TITLE),
          ),
      );
    } else {
      record(
        'search index delta picks up the video',
        `the live delta lists the fixture within ${REVALIDATE_BUDGET_MS / 1000}s`,
        'NOT LISTED',
        false,
      );
    }

    // The gate again, AFTER all publishing.
    await categoryGate(' re-check after all publishing');
  } finally {
    // Survives a crash. Deleting twice is harmless; leaving fixtures live is not.
    const done = await cleanupFixtures(client);
    info('cleanup: fixture documents', done.join('; '));
  }

  printTable();
  writeReport();
  console.log(`\nReport written to ${REPORT_PATH}`);
}

// -- Report ------------------------------------------------------------------

function writeReport(): void {
  const stamp = new Date().toISOString();
  const passed = rows.filter((r) => r.status === 'PASS').length;
  const failed = rows.filter((r) => r.status === 'FAIL').length;

  const lines: string[] = [
    '# Q-180: Automated verification of the last three improvements',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q180.ts (verification only, no app code touched). Mode: ${DRY_RUN ? 'dry run' : CLEANUP_ONLY ? 'cleanup only' : 'apply'}.`,
    '',
    `Result: ${passed} passed, ${failed} failed.`,
    '',
    '## The gate',
    '',
    'The category page check runs FIRST and stops the run on failure. Improvement 2 deliberately changes code on the `/cat` path (roughly 22,180 URLs), so if the raw HTML is not intact and static, nothing else in this report matters and nothing is written. It runs again at the END, after all publishing.',
    '',
    '## Existing documents',
    '',
    APPLY
      ? 'This run creates ONLY new `zz-test-q180-*` documents and writes to NO existing document and NO singleton, so there was nothing to record and restore. The fixtures (one category override, two video categories, two videos) are deleted in a `finally` that survives a crash, each under a guard re-checked against the stored document at the moment of deletion. The one visible side effect while the run was live: the fixture category briefly showed two pinned products first, and /videos briefly listed two clearly-labelled ZZ Test videos. The dataset is shared between staging and production, so both were visible on production for that window.'
      : 'No write was made in this mode.',
    '',
    '## Results',
    '',
    '| Check | Expected | Actual | Status |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.check} | ${r.expected} | ${r.actual} | ${r.status} |`),
    '',
  ];

  if (timings.length) {
    lines.push('## Timings (publish to visible)', '', ...timings.map((t) => `- ${t}`), '');
  }
  if (notes.length) {
    lines.push('## Notes / findings', '', ...notes.map((n) => `- ${n}`), '');
  }

  lines.push(
    '## What a script cannot prove (for Ali, after the single deploy)',
    '',
    '1. **Open a category page first** and confirm it looks normal, and that its raw HTML has no bailout marker.',
    '2. **Pin two products in Studio** (Category Override, Pinned SKUs), publish, and watch them lead the grid within seconds. Then apply a filter and a sort and confirm the behavior matches the report: a non-matching pin disappears, a chosen sort wins.',
    '3. **Put a video in two categories** and confirm it shows under both chips on /videos and only once with the filter cleared.',
    '4. **Type into the blog index search box** and confirm the Blogs group leads the dropdown; same on /videos for Videos. The dropdown is client-side, so a script can only prove the wiring, not the pixels.',
    '',
  );

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
