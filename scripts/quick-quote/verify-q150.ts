/**
 * Q-150: automated verification of the customer ACTIONS on a quote (accept,
 * request a change, the view signal, the draft-quote path) against the DEPLOYED
 * staging site and the REAL shared Sanity dataset.
 *
 *   pnpm tsx scripts/quick-quote/verify-q150.ts                 # dry run (default: offline checks only, no writes)
 *   pnpm tsx scripts/quick-quote/verify-q150.ts --apply         # real run: create fixtures, drive the deployed route, verify, clean up
 *   pnpm tsx scripts/quick-quote/verify-q150.ts --cleanup-only  # sweep every zz-test-quote-* document AND its responses
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *   ... --cleanup-only --counter-absent                         # also delete the quoteCounter (it did not exist before)
 *   ... --cleanup-only --counter-last 1002 --counter-prefix Q-  # also restore the counter to explicit values
 *
 * VERIFICATION ONLY - this script changes no app code. Same conventions as
 * scripts/quick-quote/verify-q140.ts: hard zz-test guard re-checked at the
 * moment of deletion, deterministic ids, cleanup in a finally, and every
 * expected value derived HERE rather than imported from the module under test.
 *
 * THE THREE DISCIPLINE RULES OF THIS RUN:
 *   1. Staging and production share ONE dataset. Every quote created here has
 *      an _id starting "zz-test-quote-" and a ZZ Test label, and every mutation
 *      goes through guards that refuse anything else.
 *   2. RESPONSES ARE DELETED TOO. The route creates quoteResponse documents
 *      with random ids, so they cannot be found by the id prefix. They are
 *      swept by their reference back to a zz-test-quote-* quote, behind their
 *      own guard, and the sweep is re-run at the end to prove none remain.
 *   3. The quote counter is real and shared. Its state is recorded BEFORE the
 *      run and restored EXACTLY afterwards; before/after values are printed so
 *      the restoration is visible rather than claimed.
 *
 * TOKENS ARE NEVER PRINTED IN FULL - first six characters plus a marker.
 *
 * Requires SANITY_API_TOKEN (write scope) in .env.local for --apply, and
 * SANITY_WEBHOOK_SECRET matching the target deployment for the freshness
 * fallback (the run reports which revalidation path actually worked).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { createClient, type SanityClient } from '@sanity/client';

import {
  DEFAULT_FIRST_QUOTE_NUMBER,
  DEFAULT_QUOTE_PREFIX,
  QUOTE_COUNTER_ID,
  QUOTE_COUNTER_TYPE,
  allocateQuoteNumber,
  type QuoteNumberingClient,
} from '../../lib/quotes/numbering';
import { generateQuoteToken, QUOTE_TOKEN_PATTERN } from '../../lib/quotes/token';

// ── Modes / flags ─────────────────────────────────────────────────────────────

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
// locally); this task verifies the STAGING deployment. Q-101/Q-111/Q-140 convention.
const SITE = (flagValue('--site') ?? 'https://dev.perfectimprints.com').replace(/\/$/, '');

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-150-verification-report.md');
const RESPONSE_ROUTE = '/api/quote-response';

// ── Env + client ─────────────────────────────────────────────────────────────

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

// ── Token redaction (never print a full token) ───────────────────────────────

function redact(token: string | null | undefined): string {
  if (!token) return '(none)';
  return `${token.slice(0, 6)}[redacted]`;
}

// ── The hard zz-test-quote guard ─────────────────────────────────────────────

const TEST_PREFIX = 'zz-test-quote-';
const TEST_LABEL_PREFIX = 'ZZ Test';

function assertTestId(id: string): void {
  const bare = id.replace(/^drafts\./, '');
  if (!bare.startsWith(TEST_PREFIX)) {
    throw new Error(`REFUSING to touch document id "${id}" - not a ${TEST_PREFIX}* fixture.`);
  }
}

/**
 * Guarded delete: the guard is re-checked against the STORED document at the
 * moment of deletion, not trusted from the id we were handed.
 */
async function guardedDelete(client: SanityClient, id: string): Promise<void> {
  assertTestId(id);
  const stored = await client.fetch<{ _id: string; title?: string; displayName?: string } | null>(
    `*[_id == $id][0]{_id, title, displayName}`,
    { id },
  );
  if (stored) {
    assertTestId(stored._id);
    for (const label of [stored.title, stored.displayName]) {
      if (typeof label === 'string' && label.length > 0 && !label.startsWith(TEST_LABEL_PREFIX)) {
        throw new Error(
          `REFUSING to delete "${id}" - stored label "${label}" is not a ZZ Test fixture.`,
        );
      }
    }
  }
  await client.delete(id);
}

/**
 * Guarded delete for a RESPONSE, which has a random id and therefore cannot be
 * matched on the id prefix. The guard is instead: it must be a quoteResponse,
 * and it must point back at a zz-test-quote-* quote. Both facts are re-read
 * from the stored document at the moment of deletion.
 */
async function guardedDeleteResponse(client: SanityClient, id: string): Promise<void> {
  const stored = await client.fetch<{ _id: string; _type?: string; ref?: string } | null>(
    `*[_id == $id][0]{_id, _type, "ref": quote._ref}`,
    { id },
  );
  if (!stored) return;
  if (stored._type !== 'quoteResponse') {
    throw new Error(`REFUSING to delete "${id}" - it is a ${stored._type}, not a quoteResponse.`);
  }
  if (typeof stored.ref !== 'string' || !stored.ref.startsWith(TEST_PREFIX)) {
    throw new Error(
      `REFUSING to delete response "${id}" - it points at "${stored.ref}", not a ${TEST_PREFIX}* fixture.`,
    );
  }
  await client.delete(id);
}

async function guardedPatchSet(
  client: SanityClient,
  id: string,
  attrs: Record<string, unknown>,
): Promise<void> {
  assertTestId(id);
  const stored = await client.fetch<{ _id: string } | null>(`*[_id == $id][0]{_id}`, { id });
  if (stored) assertTestId(stored._id);
  await client.patch(id).set(attrs).commit();
}

// ── Counter state (record, restore EXACTLY, report) ──────────────────────────

interface CounterState {
  prefix?: unknown;
  lastNumber?: unknown;
}

async function readCounter(client: SanityClient): Promise<CounterState | null> {
  return client.fetch<CounterState | null>(`*[_id == $id][0]{prefix, lastNumber}`, {
    id: QUOTE_COUNTER_ID,
  });
}

function describeCounter(state: CounterState | null): string {
  if (state === null) return 'ABSENT (document does not exist)';
  return `prefix=${JSON.stringify(state.prefix)} lastNumber=${JSON.stringify(state.lastNumber)}`;
}

async function restoreCounter(client: SanityClient, before: CounterState | null): Promise<string> {
  if (before === null) {
    const current = await readCounter(client);
    if (current !== null) await client.delete(QUOTE_COUNTER_ID);
    return 'deleted (it did not exist before the run)';
  }
  await client.createIfNotExists({ _id: QUOTE_COUNTER_ID, _type: QUOTE_COUNTER_TYPE });
  const sets: Record<string, unknown> = {};
  const unsets: string[] = [];
  if (before.prefix === undefined) unsets.push('prefix');
  else sets.prefix = before.prefix;
  if (before.lastNumber === undefined) unsets.push('lastNumber');
  else sets.lastNumber = before.lastNumber;
  let patch = client.patch(QUOTE_COUNTER_ID);
  if (Object.keys(sets).length) patch = patch.set(sets);
  if (unsets.length) patch = patch.unset(unsets);
  await patch.commit();
  return `restored to ${describeCounter(before)}`;
}

// ── Result collection ────────────────────────────────────────────────────────

interface Row {
  check: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'INFO';
}

const rows: Row[] = [];
const notes: string[] = [];

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

// ── Fixture inputs + INDEPENDENT arithmetic ──────────────────────────────────
//
// Worked out by hand and written as literals; the app's totals module is the
// thing under test on the page and is never imported here.

const LIVE_QTY = 200;
const LIVE_UNIT = 4.25;
const LIVE_SETUP = 45;
// 200 x $4.25 = $850.00; + $45 setup = $895.00 line total, no shipping, no tax.
const LIVE_TOTAL_DISPLAY = '$895.00';
// The freshness edit: 200 -> 400. 400 x $4.25 = $1,700.00 + $45 = $1,745.00
const FRESH_QTY = 400;
const FRESH_TOTAL_DISPLAY = '$1,745.00';

const LIVE_ID = 'zz-test-quote-q150-live';
const EXPIRED_ID = 'zz-test-quote-q150-expired';
const UNSENT_ID = 'zz-test-quote-q150-unsent';
const ALL_FIXTURE_IDS = [LIVE_ID, EXPIRED_ID, UNSENT_ID];

// Values that must NEVER reach the customer's page.
const INTERNAL_LABEL = 'ZZ Test INTERNAL-LABEL-MUST-NOT-RENDER-Q150';
const CUSTOMER_EMAIL = 'zz-test-customer-q150@example.com';
const CUSTOMER_PHONE = '555-0150-DO-NOT-RENDER';
const CUSTOMER_ADDRESS = '999 ZZ Test Withheld Street, Nowhere';
const SENT_AT = '2021-02-03T04:05:06Z';
const SENT_AT_DAY = '2021-02-03';

// Values that MUST reach the page.
const CUSTOMER_COMPANY = 'ZZ Test Buyer Company Q150';
const REP_NAME = 'ZZ Test Rep';
// A deliberately unroutable address: the notification emails from this run go
// nowhere real, which is the point (see the note about the manual mail checks).
const REP_EMAIL = 'zz-test-rep-q150@example.invalid';
const LINE_NAME = 'ZZ Test Response Line Item';

// Comments the script sends, and then looks for verbatim in Sanity.
const ACCEPT_COMMENT = 'ZZ Test acceptance comment: purchase order 12345.';
const REVISION_COMMENT = 'ZZ Test change request: please make it 500 units in navy.';
const SECOND_ACCEPT_COMMENT = 'ZZ Test second acceptance, after the change request.';

/** Dates relative to the run, so the fixtures do not rot. */
function isoDayOffset(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function liveLines(quantity: number): Record<string, unknown>[] {
  return [
    {
      _type: 'quoteCustomLine',
      _key: 'q150-line-1',
      displayName: LINE_NAME,
      quantity,
      unitCost: LIVE_UNIT,
      setupCharge: LIVE_SETUP,
    },
  ];
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

interface PageResult {
  status: number;
  html: string;
  headers: Headers;
}

async function fetchPage(path: string): Promise<PageResult> {
  const res = await fetch(`${SITE}${path}`, {
    headers: { 'cache-control': 'no-cache' },
    redirect: 'follow',
  });
  return { status: res.status, html: await res.text(), headers: res.headers };
}

interface ApiResult {
  status: number;
  body: string;
  json: Record<string, unknown>;
}

/** POSTs multipart form data to the response route, exactly as the browser does. */
async function postResponse(fields: Record<string, string>, files: File[] = []): Promise<ApiResult> {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  for (const f of files) body.append('files', f);
  const res = await fetch(`${SITE}${RESPONSE_ROUTE}`, { method: 'POST', body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* a non-JSON body is itself the finding, reported through `body` */
  }
  return { status: res.status, body: text, json };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postSignedRevalidate(
  secret: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify(payload);
  const t = Date.now().toString();
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('base64url');
  const res = await fetch(`${SITE}/api/sanity/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sanity-webhook-signature': `t=${t},v1=${v1}` },
    body,
  });
  return { status: res.status, body: await res.text() };
}

const BAILOUT_MARKER = 'BAILOUT_TO_CLIENT_SIDE_RENDERING';

/** The rendered quote itself, isolated from the shared header/footer chrome. */
function quoteRegion(html: string): string | null {
  const start = html.indexOf('<article id="quote-document"');
  if (start === -1) return null;
  const end = html.indexOf('</article>', start);
  return end === -1 ? html.slice(start) : html.slice(start, end + '</article>'.length);
}

/** True when the deployment's Turnstile is configured and rejected our token-less POST. */
function isTurnstileBlock(result: ApiResult): boolean {
  return result.status === 400 && /verify you are human/i.test(result.body);
}

// ── Sanity read helpers ──────────────────────────────────────────────────────

interface StoredResponse {
  _id: string;
  kind?: string;
  createdAt?: string;
  comment?: string;
  quoteNumber?: string;
  fileNames?: (string | null)[];
}

async function responsesFor(client: SanityClient, quoteId: string): Promise<StoredResponse[]> {
  return client.fetch<StoredResponse[]>(
    `*[_type == "quoteResponse" && quote._ref == $id] | order(createdAt asc){
      _id, kind, createdAt, comment, quoteNumber,
      "fileNames": files[].asset->originalFilename
    }`,
    { id: quoteId },
  );
}

// ── Offline checks (run in dry-run AND apply) ────────────────────────────────

function offlineChecks(): void {
  // 1. The route exists at the exact path, with no underscore-prefixed or
  //    stray bracketed segment (a folder starting with "_" never becomes a
  //    route, which has cost a deployment on this project before).
  const routePath = resolve(PROJECT_ROOT, 'app/api/quote-response/route.ts');
  const routeExists = existsSync(routePath);
  record(
    'route: app/api/quote-response/route.ts exists',
    'present',
    routeExists ? 'present' : 'MISSING',
    routeExists,
  );

  if (routeExists) {
    const src = readFileSync(routePath, 'utf8');
    const nodeRuntime = /export const runtime = 'nodejs'/.test(src);
    record('route: nodejs runtime', 'set', nodeRuntime ? 'set' : 'NOT SET', nodeRuntime);
    const forceDynamic = /export const dynamic = 'force-dynamic'/.test(src);
    record(
      'route: force-dynamic (a write route is never prerendered)',
      'set',
      forceDynamic ? 'set' : 'NOT SET',
      forceDynamic,
    );
    // The structural rule of the whole module: responses are new documents.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const patchesNothing = !/\.patch\(|createOrReplace|createIfNotExists/.test(code);
    record(
      'route: never patches or replaces a document (append-only responses)',
      'no patch / createOrReplace',
      patchesNothing ? 'no patch / createOrReplace' : 'A MUTATION OF AN EXISTING DOC WAS FOUND',
      patchesNothing,
    );
    const createsResponses = /_type: 'quoteResponse'/.test(code);
    record(
      'route: creates quoteResponse documents',
      'present',
      createsResponses ? 'present' : 'MISSING',
      createsResponses,
    );
    // The record must be written before the email, so a mail failure cannot
    // lose it. Position in the source is a proxy, but a reliable one here.
    const createIdx = code.indexOf("_type: 'quoteResponse'");
    const notifyIdx = code.indexOf('await notify(');
    const orderOk = createIdx !== -1 && notifyIdx !== -1 && createIdx < notifyIdx;
    record(
      'route: the response is saved BEFORE the notification is sent',
      'save then notify',
      orderOk ? 'save then notify' : 'ORDER NOT PROVEN',
      orderOk,
    );
  }

  // 2. The page must still be static-safe: no dynamic API in the route file,
  //    and no useSearchParams in the island under it.
  const pagePath = resolve(PROJECT_ROOT, 'app/quote/[token]/page.tsx');
  if (existsSync(pagePath)) {
    const pageCode = readFileSync(pagePath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const noDynamicApi = !/searchParams|\bcookies\s*\(|\bheaders\s*\(/.test(pageCode);
    record(
      'page: still reads no searchParams / cookies / headers',
      'none present',
      noDynamicApi ? 'none present' : 'DYNAMIC API FOUND',
      noDynamicApi,
    );
  }

  const islandPath = resolve(PROJECT_ROOT, 'components/quote/QuoteActions.tsx');
  const islandExists = existsSync(islandPath);
  record(
    'island: components/quote/QuoteActions.tsx exists',
    'present',
    islandExists ? 'present' : 'MISSING',
    islandExists,
  );
  if (islandExists) {
    const islandCode = readFileSync(islandPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // THE staticness trap: a render-time useSearchParams anywhere under the
    // route swaps the prerendered HTML for the loading skeleton while the build
    // still reports the route as static (CLAUDE.md Section 13, M-SEO5).
    const noUseSearchParams = !/useSearchParams/.test(islandCode);
    record(
      'island: no useSearchParams (the silent prerender killer)',
      'absent',
      noUseSearchParams ? 'absent' : 'FOUND - THIS WOULD SILENTLY BREAK THE STATIC PAGE',
      noUseSearchParams,
    );
    const tokenFromProp = /token: string/.test(islandCode) || /token,/.test(islandCode);
    record(
      'island: the token arrives as a prop, not from the URL',
      'prop',
      tokenFromProp ? 'prop' : 'NOT PROVEN',
      tokenFromProp,
    );
  }

  // 3. The three buttons are defined in the component source.
  if (islandExists) {
    const src = readFileSync(islandPath, 'utf8');
    for (const label of ['Accept this quote', 'Request a change', 'Print or save as PDF']) {
      const present = src.includes(label);
      record(`island: "${label}" control defined`, 'present', present ? 'present' : 'MISSING', present);
    }
  }

  // 4. quoteResponse must NOT be wired into the webhook: the route revalidates
  //    directly, so a Filter entry would be a redundant, forgettable step.
  const revalidateSrc = readFileSync(
    resolve(PROJECT_ROOT, 'app/api/sanity/revalidate/route.ts'),
    'utf8',
  );
  const revalidateCode = revalidateSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const noResponseCase = !/['"]quoteResponse['"]/.test(revalidateCode);
  record(
    'webhook: no quoteResponse case in the revalidate route (by design)',
    'absent',
    noResponseCase ? 'absent' : 'A CASE EXISTS',
    noResponseCase,
  );

  // 5. Print styles hide the action controls: a printed quote showing a greyed
  //    out Accept button reads as though it could not be accepted.
  const printSrc = readFileSync(
    resolve(PROJECT_ROOT, 'components/quote/QuotePrintStyles.tsx'),
    'utf8',
  );
  const hidesActions = /\.quote-actions\s*\{\s*display:\s*none/.test(printSrc);
  record(
    'print: the action buttons are hidden on paper',
    'hidden',
    hidesActions ? 'hidden' : 'NOT HIDDEN',
    hidesActions,
  );

  // 6. The sitemap still never enumerates quotes.
  const sitemapSrc = readFileSync(resolve(PROJECT_ROOT, 'app/sitemap.ts'), 'utf8');
  const sitemapClean = !/\/quote\b|getQuoteByToken|QUOTES_TAG/.test(sitemapSrc);
  record(
    'sitemap source: no quote route anywhere',
    'absent',
    sitemapClean ? 'absent' : 'REFERENCED',
    sitemapClean,
  );

  // 7. Draft creation must be non-fatal for the lead, and must not publish.
  const creatorPath = resolve(PROJECT_ROOT, 'lib/leads/quote-draft-creator.ts');
  const creatorExists = existsSync(creatorPath);
  record(
    'draft: lib/leads/quote-draft-creator.ts exists',
    'present',
    creatorExists ? 'present' : 'MISSING',
    creatorExists,
  );
  if (creatorExists) {
    const src = readFileSync(creatorPath, 'utf8');
    const draftsId = /_id: `drafts\.\$\{/.test(src);
    record(
      'draft: written at a drafts. id (never published)',
      'drafts. prefix',
      draftsId ? 'drafts. prefix' : 'NOT A DRAFT ID',
      draftsId,
    );
    const wrapped = /try \{/.test(src) && /catch \(err\)/.test(src);
    record(
      'draft: every path wrapped so a failure cannot lose the lead',
      'try/catch present',
      wrapped ? 'try/catch present' : 'NOT WRAPPED',
      wrapped,
    );
    const noNumber = !/quoteNumber/.test(src.replace(/\/\*[\s\S]*?\*\//g, ''));
    record(
      'draft: no quote number allocated',
      'absent',
      noNumber ? 'absent' : 'ALLOCATES A NUMBER',
      noNumber,
    );
  }

  // 8. Token generation still behaves (the route depends on the format).
  const sample = Array.from({ length: 500 }, () => generateQuoteToken());
  const allValid = sample.every((t) => QUOTE_TOKEN_PATTERN.test(t));
  record(
    'token: 500 generated, all 32 lowercase hex',
    'all valid',
    allValid ? 'all valid' : 'INVALID FOUND',
    allValid,
  );
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupDocs(client: SanityClient): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];

  // RESPONSES FIRST, because they are found through their reference to a quote
  // and that reference has to still exist for the guard to pass.
  const responses = await client.fetch<{ _id: string }[]>(
    `*[_type == "quoteResponse" && quote._ref match "${TEST_PREFIX}*"]{_id}`,
  );
  for (const doc of responses) {
    try {
      await guardedDeleteResponse(client, doc._id);
      deleted.push(`response ${doc._id}`);
    } catch (e) {
      failed.push(`${doc._id} (${(e as Error).message})`);
    }
  }

  const found = await client.fetch<{ _id: string }[]>(
    `*[_id match "${TEST_PREFIX}*" || _id match "drafts.${TEST_PREFIX}*"]{_id}`,
  );
  for (const doc of found) {
    try {
      await guardedDelete(client, doc._id);
      deleted.push(doc._id);
    } catch (e) {
      failed.push(`${doc._id} (${(e as Error).message})`);
    }
  }
  return { deleted, failed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Q-150 verification - target ${SITE}`);
  console.log(
    DRY_RUN
      ? 'MODE: dry run (offline checks only, no writes)'
      : CLEANUP_ONLY
        ? 'MODE: cleanup only'
        : 'MODE: apply',
  );

  offlineChecks();

  if (DRY_RUN) {
    printTable();
    console.log('\nDry run complete. Re-run with --apply to exercise the deployed route.');
    writeReport();
    console.log(`Report written to ${REPORT_PATH}`);
    if (rows.some((r) => r.status === 'FAIL')) process.exit(1);
    return;
  }

  const client = buildClient();

  if (CLEANUP_ONLY) {
    const { deleted, failed } = await cleanupDocs(client);
    console.log(`Deleted: ${deleted.length ? deleted.join(', ') : '(none found)'}`);
    if (failed.length) {
      console.error(`LEFT BEHIND: ${failed.join(', ')}`);
      process.exit(1);
    }
    if (process.argv.includes('--counter-absent')) {
      await restoreCounter(client, null);
      console.log('quoteCounter deleted.');
    } else {
      const last = flagValue('--counter-last');
      const prefix = flagValue('--counter-prefix');
      if (last !== undefined) {
        await restoreCounter(client, {
          lastNumber: Number(last),
          prefix: prefix ?? DEFAULT_QUOTE_PREFIX,
        });
        console.log(`quoteCounter restored to prefix=${prefix ?? DEFAULT_QUOTE_PREFIX} lastNumber=${last}`);
      }
    }
    console.log('Cleanup complete.');
    return;
  }

  // ---- APPLY ----
  const counterBefore = await readCounter(client);
  console.log(`quoteCounter BEFORE the run: ${describeCounter(counterBefore)}`);
  info('counter: state BEFORE the run', describeCounter(counterBefore));
  if (counterBefore === null) {
    notes.push(
      `The quoteCounter did not exist before this run, so exact restoration means deleting it (the first real quote would then still seed ${DEFAULT_QUOTE_PREFIX}${DEFAULT_FIRST_QUOTE_NUMBER}).`,
    );
  }

  let runError: unknown = null;
  const tokens: Record<string, string> = {};
  let turnstileBlocked = false;

  try {
    // ---------------------------------------------------------------- 1. Fixtures
    const numbering = client as unknown as QuoteNumberingClient;
    const liveNumber = (await allocateQuoteNumber(numbering)).quoteNumber;
    const expiredNumber = (await allocateQuoteNumber(numbering)).quoteNumber;
    const unsentNumber = (await allocateQuoteNumber(numbering)).quoteNumber;

    tokens.live = generateQuoteToken();
    tokens.expired = generateQuoteToken();
    tokens.unsent = generateQuoteToken();
    console.log(
      `Fixture tokens: live=${redact(tokens.live)} expired=${redact(tokens.expired)} unsent=${redact(tokens.unsent)}`,
    );

    const commonCustomer = {
      customerCompany: CUSTOMER_COMPANY,
      customerName: 'ZZ Test Contact Person',
      customerEmail: CUSTOMER_EMAIL,
      customerPhone: CUSTOMER_PHONE,
      customerAddress: CUSTOMER_ADDRESS,
      repName: REP_NAME,
      repEmail: REP_EMAIL,
      repPhone: '800-773-9472',
    };

    await client.createOrReplace({
      _id: LIVE_ID,
      _type: 'quote',
      quoteNumber: liveNumber,
      slug: { _type: 'slug', current: tokens.live },
      title: INTERNAL_LABEL,
      ...commonCustomer,
      quoteDate: isoDayOffset(0),
      expiryDate: isoDayOffset(30),
      lineItems: liveLines(LIVE_QTY),
      sentAt: SENT_AT,
    } as never);

    await client.createOrReplace({
      _id: EXPIRED_ID,
      _type: 'quote',
      quoteNumber: expiredNumber,
      slug: { _type: 'slug', current: tokens.expired },
      title: INTERNAL_LABEL,
      ...commonCustomer,
      quoteDate: isoDayOffset(-60),
      expiryDate: isoDayOffset(-5),
      lineItems: liveLines(LIVE_QTY),
      sentAt: SENT_AT,
    } as never);

    // Never sent: a view here must be RECORDED but must NOT email Patrick,
    // because the only person who can be opening it is Patrick himself.
    await client.createOrReplace({
      _id: UNSENT_ID,
      _type: 'quote',
      quoteNumber: unsentNumber,
      slug: { _type: 'slug', current: tokens.unsent },
      title: INTERNAL_LABEL,
      ...commonCustomer,
      quoteDate: isoDayOffset(0),
      expiryDate: isoDayOffset(30),
      lineItems: liveLines(LIVE_QTY),
    } as never);

    await sleep(2000);

    // ------------------------------------------- 2. THE STATICNESS GATE
    const page = await fetchPage(`/quote/${tokens.live}`);
    record('page: published quote returns 200', '200', String(page.status), page.status === 200);

    const region = quoteRegion(page.html);
    const bailed = page.html.includes(BAILOUT_MARKER);
    record(
      'STATICNESS: raw HTML carries the rendered quote, with NO client-side-render bailout',
      'quote article present, no BAILOUT marker',
      region ? (bailed ? 'BAILOUT MARKER FOUND' : 'article present, no marker') : 'ARTICLE MISSING',
      Boolean(region) && !bailed,
    );

    const hay = region ?? page.html;
    for (const [label, needle] of [
      ['quote number', liveNumber],
      ['customer company', CUSTOMER_COMPANY],
      ['line item name', LINE_NAME],
      ['hand-computed line total', LIVE_TOTAL_DISPLAY],
    ] as const) {
      record(
        `page: raw HTML contains the ${label}`,
        needle,
        hay.includes(needle) ? 'present' : 'MISSING',
        hay.includes(needle),
      );
    }

    // The buttons must be in the SERVER-rendered HTML, not painted in later.
    for (const label of ['Accept this quote', 'Request a change', 'Print or save as PDF']) {
      const present = hay.includes(label);
      record(
        `STATICNESS: "${label}" is in the server-rendered HTML`,
        'present',
        present ? 'present' : 'MISSING',
        present,
      );
    }

    // ------------------------------------------- 3. Bad tokens are indistinguishable
    const unknownToken = generateQuoteToken();
    const badTokenResults: ApiResult[] = [];
    for (const [label, value] of [
      ['unknown (well-formed) token', unknownToken],
      ['malformed token', 'not-a-real-token'],
      ['empty token', ''],
      ['tag-hostile token', 'AB cd../ee'],
    ] as const) {
      const res = await postResponse({ token: value, kind: 'accepted', comment: 'x' });
      badTokenResults.push(res);
      record(`reject: ${label} answered 404`, '404', String(res.status), res.status === 404);
    }
    const bodies = new Set(badTokenResults.map((r) => `${r.status}:${r.body}`));
    record(
      'reject: unknown and malformed tokens are INDISTINGUISHABLE (same status and message)',
      '1 distinct response',
      `${bodies.size} distinct response(s)`,
      bodies.size === 1,
    );

    // ------------------------------------------- 4. Empty-comment change request
    const emptyRevision = await postResponse({
      token: tokens.live,
      kind: 'revisionRequested',
      comment: '   ',
    });
    if (isTurnstileBlock(emptyRevision)) turnstileBlocked = true;
    if (turnstileBlocked) {
      notes.push(
        'Turnstile IS configured on this deployment, so every scripted POST is rejected as unverified. That is the CAPTCHA working exactly as intended and is not a defect, but it means the accept / change-request / upload / view checks below could not run from a script. They must be checked by hand in a browser (the manual list at the end of the report).',
      );
      info('BLOCKED BY TURNSTILE', 'accept, change request, upload and view checks could not run from a script');
    } else {
      record(
        'reject: a change request with an empty comment is refused',
        '400',
        String(emptyRevision.status),
        emptyRevision.status === 400,
      );
      const saysWhy = /what you would like changed/i.test(emptyRevision.body);
      record(
        'reject: the empty-comment message says what to do',
        'explains what is needed',
        saysWhy ? 'explains what is needed' : emptyRevision.body.slice(0, 80),
        saysWhy,
      );

      // --------------------------------------- 5. Expired quote refuses an accept
      const expiredAccept = await postResponse({
        token: tokens.expired,
        kind: 'accepted',
        comment: ACCEPT_COMMENT,
      });
      record(
        'expired: accepting an expired quote is refused',
        '409',
        String(expiredAccept.status),
        expiredAccept.status === 409,
      );
      const expiredMessage = /passed its expiry date/i.test(expiredAccept.body);
      record(
        'expired: the refusal tells the customer to contact their rep',
        'clear message',
        expiredMessage ? 'clear message' : expiredAccept.body.slice(0, 80),
        expiredMessage,
      );
      const expiredStored = await responsesFor(client, EXPIRED_ID);
      record(
        'expired: nothing was recorded for the refused accept',
        '0 responses',
        `${expiredStored.length} response(s)`,
        expiredStored.length === 0,
      );

      // --------------------------------------- 6. A real change request
      const revision = await postResponse({
        token: tokens.live,
        kind: 'revisionRequested',
        comment: REVISION_COMMENT,
      });
      record(
        'change request: accepted by the route',
        '200',
        String(revision.status),
        revision.status === 200,
      );
      await sleep(1500);
      let stored = await responsesFor(client, LIVE_ID);
      const revisionRows = stored.filter((r) => r.kind === 'revisionRequested');
      record(
        'change request: exactly one record of the right kind',
        '1',
        String(revisionRows.length),
        revisionRows.length === 1,
      );
      record(
        'change request: the comment is stored intact',
        REVISION_COMMENT,
        revisionRows[0]?.comment ?? '(none)',
        revisionRows[0]?.comment === REVISION_COMMENT,
      );
      record(
        'change request: the record carries the quote number for its paper trail',
        liveNumber,
        revisionRows[0]?.quoteNumber ?? '(none)',
        revisionRows[0]?.quoteNumber === liveNumber,
      );

      // --------------------------------------- 7. Accept, with a file
      const artwork = new File([Buffer.from('ZZ Test artwork bytes')], 'zz-test-logo.png', {
        type: 'image/png',
      });
      const accept = await postResponse(
        { token: tokens.live, kind: 'accepted', comment: ACCEPT_COMMENT },
        [artwork],
      );
      record('accept: accepted by the route', '200', String(accept.status), accept.status === 200);
      await sleep(2500);
      stored = await responsesFor(client, LIVE_ID);
      const acceptRows = stored.filter((r) => r.kind === 'accepted');
      record(
        'accept: exactly one record of the right kind',
        '1',
        String(acceptRows.length),
        acceptRows.length === 1,
      );
      record(
        'accept: the comment is stored intact',
        ACCEPT_COMMENT,
        acceptRows[0]?.comment ?? '(none)',
        acceptRows[0]?.comment === ACCEPT_COMMENT,
      );
      const fileNames = (acceptRows[0]?.fileNames ?? []).filter(Boolean);
      record(
        'accept: the artwork is attached to the response',
        'zz-test-logo.png',
        fileNames.join(', ') || '(none)',
        fileNames.some((n) => typeof n === 'string' && n.includes('zz-test-logo')),
      );

      // --------------------------------------- 8. Bad uploads are refused
      const tooBig = new File([Buffer.alloc(11 * 1024 * 1024, 1)], 'zz-test-huge.png', {
        type: 'image/png',
      });
      const bigResult = await postResponse(
        { token: tokens.live, kind: 'accepted', comment: 'ZZ Test oversized upload' },
        [tooBig],
      );
      record(
        'upload: an oversized file is refused',
        '400',
        String(bigResult.status),
        bigResult.status === 400,
      );
      const bigMessage = /larger than|too large/i.test(bigResult.body);
      record(
        'upload: the oversized message names the problem',
        'says the file is too large',
        bigMessage ? 'says the file is too large' : bigResult.body.slice(0, 80),
        bigMessage,
      );

      const badType = new File([Buffer.from('MZ')], 'zz-test-payload.exe', {
        type: 'application/octet-stream',
      });
      const typeResult = await postResponse(
        { token: tokens.live, kind: 'accepted', comment: 'ZZ Test bad file type' },
        [badType],
      );
      record(
        'upload: a disallowed file type is refused',
        '400',
        String(typeResult.status),
        typeResult.status === 400,
      );
      const typeMessage = /unsupported file type/i.test(typeResult.body);
      record(
        'upload: the wrong-type message names the problem',
        'says the type is unsupported',
        typeMessage ? 'says the type is unsupported' : typeResult.body.slice(0, 80),
        typeMessage,
      );

      // --------------------------------------- 9. More than one response, in order
      const second = await postResponse({
        token: tokens.live,
        kind: 'accepted',
        comment: SECOND_ACCEPT_COMMENT,
      });
      record(
        'multiple: a quote can be responded to again (not locked after the first)',
        '200',
        String(second.status),
        second.status === 200,
      );
      await sleep(1500);
      stored = await responsesFor(client, LIVE_ID);
      const actions = stored.filter((r) => r.kind !== 'viewed');
      record(
        'multiple: all three actions accumulated',
        '3',
        String(actions.length),
        actions.length === 3,
      );
      const ordered = actions.every(
        (r, i) => i === 0 || String(actions[i - 1].createdAt) <= String(r.createdAt),
      );
      record(
        'multiple: the records are in chronological order',
        'ascending createdAt',
        ordered ? 'ascending createdAt' : 'OUT OF ORDER',
        ordered,
      );
      const latest = actions[actions.length - 1];
      record(
        'multiple: the latest response is identifiable and is the second acceptance',
        SECOND_ACCEPT_COMMENT,
        latest?.comment ?? '(none)',
        latest?.comment === SECOND_ACCEPT_COMMENT,
      );

      // --------------------------------------- 10. The view signal + its debounce
      const view1 = await postResponse({ token: tokens.live, kind: 'viewed' });
      record('view: the signal is accepted', '200', String(view1.status), view1.status === 200);
      record(
        'view: the first view is recorded',
        'recorded: true',
        JSON.stringify(view1.json),
        view1.json.recorded === true,
      );
      record(
        'view: the first view of a SENT quote notifies',
        'notified: true',
        String(view1.json.notified),
        view1.json.notified === true,
      );

      const view2 = await postResponse({ token: tokens.live, kind: 'viewed' });
      record(
        'view: an immediate second view records NOTHING (the refresh guard)',
        'recorded: false',
        JSON.stringify(view2.json),
        view2.json.recorded === false,
      );
      record(
        'view: an immediate second view does NOT notify (no inbox flood)',
        'notified absent or false',
        String(view2.json.notified ?? 'absent'),
        view2.json.notified !== true,
      );
      const view3 = await postResponse({ token: tokens.live, kind: 'viewed' });
      record(
        'view: a third rapid view also records nothing',
        'recorded: false',
        JSON.stringify(view3.json),
        view3.json.recorded === false,
      );
      await sleep(1500);
      stored = await responsesFor(client, LIVE_ID);
      const viewRows = stored.filter((r) => r.kind === 'viewed');
      record(
        'view: three rapid opens produced exactly ONE stored record',
        '1',
        String(viewRows.length),
        viewRows.length === 1,
      );
      notes.push(
        'The notification side is verified through the route\'s own answer (`notified: true` on the first view, absent/false on the immediate repeats), not by reading an inbox. The script cannot see Patrick\'s mailbox, so "an email actually arrived" stays on the manual list.',
      );

      // --------------------------------------- 11. An unsent quote never notifies
      const unsentView = await postResponse({ token: tokens.unsent, kind: 'viewed' });
      record(
        'view: opening a quote that was never sent is recorded',
        'recorded: true',
        JSON.stringify(unsentView.json),
        unsentView.json.recorded === true,
      );
      record(
        'view: opening a quote that was never sent does NOT notify (your own preview)',
        'notified: false',
        String(unsentView.json.notified),
        unsentView.json.notified === false,
      );

      // --------------------------------------- 12. THE CLOBBER TEST, end to end
      //
      // Q-111 proved at the data layer that a publish cannot erase a response.
      // This proves it again through the real route: responses created by the
      // deployed API, then the quote REPLACED wholesale exactly as a Studio
      // publish replaces it, then every response re-read.
      const beforeClobber = await responsesFor(client, LIVE_ID);
      await client.createOrReplace({
        _id: LIVE_ID,
        _type: 'quote',
        quoteNumber: liveNumber,
        slug: { _type: 'slug', current: tokens.live },
        title: INTERNAL_LABEL,
        ...commonCustomer,
        quoteDate: isoDayOffset(0),
        expiryDate: isoDayOffset(30),
        lineItems: liveLines(FRESH_QTY),
        sentAt: SENT_AT,
      } as never);
      await sleep(1500);
      const afterClobber = await responsesFor(client, LIVE_ID);
      record(
        'CLOBBER: every response survives the quote being replaced wholesale',
        `${beforeClobber.length} responses`,
        `${afterClobber.length} responses`,
        afterClobber.length === beforeClobber.length && afterClobber.length > 0,
      );
      const commentsSurvived =
        afterClobber.some((r) => r.comment === ACCEPT_COMMENT) &&
        afterClobber.some((r) => r.comment === REVISION_COMMENT);
      record(
        'CLOBBER: the comments are still readable afterwards',
        'both comments present',
        commentsSurvived ? 'both comments present' : 'A COMMENT WAS LOST',
        commentsSurvived,
      );

      // --------------------------------------- 13. Freshness, after all of that
      const editedAt = Date.now();
      let freshVia = '';
      let freshSeconds = 0;
      for (let i = 0; i < 6 && !freshVia; i++) {
        await sleep(5000);
        const again = await fetchPage(`/quote/${tokens.live}`);
        if (again.html.includes(FRESH_TOTAL_DISPLAY)) {
          freshVia = 'the real Sanity webhook';
          freshSeconds = Math.round((Date.now() - editedAt) / 1000);
        }
      }
      if (!freshVia) {
        const secret = process.env.SANITY_WEBHOOK_SECRET;
        if (!secret) {
          notes.push(
            'SANITY_WEBHOOK_SECRET was not set, so the signed-revalidate fallback could not run. The freshness result reflects the real webhook only.',
          );
        } else {
          const posted = await postSignedRevalidate(secret, {
            _id: LIVE_ID,
            _type: 'quote',
            slug: { current: tokens.live },
          });
          info('freshness: signed revalidate POST', `${posted.status} ${posted.body.slice(0, 120)}`);
          for (let i = 0; i < 4 && !freshVia; i++) {
            await sleep(4000);
            const again = await fetchPage(`/quote/${tokens.live}`);
            if (again.html.includes(FRESH_TOTAL_DISPLAY)) {
              freshVia =
                'a signed revalidate POST (the real webhook did NOT fire - check the webhook Filter)';
              freshSeconds = Math.round((Date.now() - editedAt) / 1000);
            }
          }
        }
      }
      record(
        'freshness: an edit still reaches the customer page with no redeploy',
        `line total becomes ${FRESH_TOTAL_DISPLAY}`,
        freshVia ? `updated in ~${freshSeconds}s via ${freshVia}` : 'DID NOT UPDATE (see notes)',
        Boolean(freshVia),
      );
      if (freshVia.startsWith('a signed')) {
        notes.push(
          'The real Sanity webhook did not deliver for the `quote` type. The revalidation code path is correct (the signed POST updated the page), so the missing piece is the manual webhook Filter update from Q-110: append "quote" to the _type list on BOTH webhooks. `quoteResponse` must NOT be added - the response route revalidates directly.',
        );
      }

      // --------------------------------------- 14. The page after responses exist
      const after = await fetchPage(`/quote/${tokens.live}`);
      const afterRegion = quoteRegion(after.html) ?? after.html;
      record(
        'page: still renders in raw HTML after responses exist',
        'article present, no BAILOUT marker',
        quoteRegion(after.html)
          ? after.html.includes(BAILOUT_MARKER)
            ? 'BAILOUT MARKER FOUND'
            : 'article present, no marker'
          : 'ARTICLE MISSING',
        Boolean(quoteRegion(after.html)) && !after.html.includes(BAILOUT_MARKER),
      );
      const showsState = /You accepted this quote/i.test(afterRegion);
      record(
        'page: a returning visitor is told what they already did',
        'acceptance shown',
        showsState ? 'acceptance shown' : 'NOT SHOWN',
        showsState,
      );
      const notLocked = afterRegion.includes('Request a change');
      record(
        'page: the buttons are still available (a quote can be answered again)',
        'still available',
        notLocked ? 'still available' : 'LOCKED',
        notLocked,
      );

      // --------------------------------------- 15. Nothing internal leaked
      for (const [label, needle] of [
        ['internal label', INTERNAL_LABEL],
        ['customer email', CUSTOMER_EMAIL],
        ['customer phone', CUSTOMER_PHONE],
        ['customer address', CUSTOMER_ADDRESS],
        ['sent-at date', SENT_AT_DAY],
        ["the customer's own comment text", ACCEPT_COMMENT],
      ] as const) {
        const leaked = after.html.includes(needle);
        record(
          `withheld: ${label} does not appear in the page HTML`,
          'absent',
          leaked ? 'LEAKED' : 'absent',
          !leaked,
        );
      }
    }
  } catch (e) {
    runError = e;
    console.error('Run failed:', e);
  } finally {
    try {
      const { deleted, failed } = await cleanupDocs(client);
      record(
        'cleanup: fixtures AND their responses deleted',
        'all zz-test-quote-* gone',
        deleted.length ? `${deleted.length} deleted` : '(none found)',
        failed.length === 0,
      );
      if (failed.length) {
        console.error(`CLEANUP INCOMPLETE. Left behind: ${failed.join(', ')}`);
        console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q150.ts --cleanup-only');
      }
      const leftoverQuotes = await client.fetch<number>(
        `count(*[_id match "${TEST_PREFIX}*" || _id match "drafts.${TEST_PREFIX}*"])`,
      );
      const leftoverResponses = await client.fetch<number>(
        `count(*[_type == "quoteResponse" && quote._ref match "${TEST_PREFIX}*"])`,
      );
      record(
        'cleanup: zero test quotes remain',
        '0',
        String(leftoverQuotes),
        leftoverQuotes === 0,
      );
      record(
        'cleanup: zero test RESPONSES remain',
        '0',
        String(leftoverResponses),
        leftoverResponses === 0,
      );
    } catch (cleanupErr) {
      console.error('CLEANUP FAILED:', cleanupErr);
      console.error(`Left behind (expected quote ids): ${ALL_FIXTURE_IDS.join(', ')}`);
      console.error('Their responses have random ids; sweep them by reference with:');
      console.error('  pnpm tsx scripts/quick-quote/verify-q150.ts --cleanup-only');
    }

    try {
      const restoreMsg = await restoreCounter(client, counterBefore);
      const counterAfter = await readCounter(client);
      const restoredExactly =
        (counterBefore === null && counterAfter === null) ||
        (counterBefore !== null &&
          counterAfter !== null &&
          counterAfter.prefix === counterBefore.prefix &&
          counterAfter.lastNumber === counterBefore.lastNumber);
      console.log(`quoteCounter AFTER restore: ${describeCounter(counterAfter)} (${restoreMsg})`);
      info('counter: state AFTER restore', `${describeCounter(counterAfter)} (${restoreMsg})`);
      record(
        'counter: restored EXACTLY to its before-run state',
        describeCounter(counterBefore),
        describeCounter(counterAfter),
        restoredExactly,
      );
    } catch (counterErr) {
      console.error('COUNTER RESTORE FAILED:', counterErr);
      console.error('*** MANUAL RESTORE REQUIRED ***');
      if (counterBefore === null) {
        console.error(
          `*** The counter did NOT exist before this run. DELETE "${QUOTE_COUNTER_ID}", or run: pnpm tsx scripts/quick-quote/verify-q150.ts --cleanup-only --counter-absent`,
        );
      } else {
        console.error(`*** Restore "${QUOTE_COUNTER_ID}" to: ${describeCounter(counterBefore)}`);
        console.error(
          `*** Or run: pnpm tsx scripts/quick-quote/verify-q150.ts --cleanup-only --counter-last ${String(counterBefore.lastNumber)} --counter-prefix ${String(counterBefore.prefix)}`,
        );
      }
      record(
        'counter: restored EXACTLY to its before-run state',
        describeCounter(counterBefore),
        'RESTORE FAILED (see console)',
        false,
      );
    }
  }

  printTable();
  if (notes.length) {
    console.log('\nNOTES:');
    for (const n of notes) console.log(`  - ${n}`);
  }

  writeReport();
  console.log(`\nReport written to ${REPORT_PATH}`);

  const failedRows = rows.filter((r) => r.status === 'FAIL');
  if (runError || failedRows.length) {
    console.error(
      `\n${failedRows.length} check(s) FAILED${runError ? ' (plus a run error above)' : ''}.`,
    );
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

function writeReport(): void {
  const stamp = new Date().toISOString();
  const lines: string[] = [
    '# Q-150: Automated verification of the customer actions on a quote',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q150.ts (verification only - no app code touched). Mode: ${DRY_RUN ? 'dry run (offline checks only)' : 'apply'}. Dataset is SHARED between staging and production; every fixture quote used the zz-test-quote- prefix, every response the route created was swept by its reference back to one of those quotes, and the quote counter was recorded before the run and restored exactly (values in the table). Tokens are never printed in full.`,
    '',
    '## Fixture arithmetic (independent literals, not derived from the app code)',
    '',
    '- Live quote line: 200 x $4.25 = $850.00; + $45 setup = $895.00, no shipping, no tax',
    '- After the freshness edit (quantity 200 -> 400): 400 x $4.25 = $1,700.00; + $45 = $1,745.00',
    '',
    '## Results',
    '',
    '| Check | Expected | Actual | Status |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.check} | ${r.expected} | ${r.actual} | ${r.status} |`),
    '',
  ];
  if (notes.length) {
    lines.push('## Notes / findings', '', ...notes.map((n) => `- ${n}`), '');
  }
  lines.push(
    '## What a script cannot prove (for Ali, after the deploy)',
    '',
    'None of the following are marked passed; they need a human with a browser and an inbox:',
    '',
    '1. Accept a real quote with a comment and a small image, and confirm the email reaches Patrick with the artwork attached.',
    '2. Request a change on another quote and confirm that email arrives with the comment prominent.',
    '3. Open a quote and confirm the "opened" email arrives, then refresh several times and confirm no further emails.',
    '4. Confirm the responses appear in Studio under the quote, newest first, with the artwork downloadable.',
    '5. Submit Get a Quote on a product page: confirm a DRAFT quote appears in Studio with the right product, quantity and prices, and that the normal lead email still arrives.',
    '6. Check the three buttons on a phone.',
    '',
  );
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
