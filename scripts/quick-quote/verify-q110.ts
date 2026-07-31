/**
 * Q-111: automated verification of Q-110 (quote data foundation) against the
 * DEPLOYED staging site and the REAL shared Sanity dataset.
 *
 *   pnpm tsx scripts/quick-quote/verify-q110.ts                 # dry run (default: offline checks only, no writes)
 *   pnpm tsx scripts/quick-quote/verify-q110.ts --apply         # real run: allocate, publish, verify, clean up
 *   pnpm tsx scripts/quick-quote/verify-q110.ts --cleanup-only  # sweep every zz-test-quote-* document
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *   ... --cleanup-only --counter-absent                         # also delete the quoteCounter (it did not exist before)
 *   ... --cleanup-only --counter-last 1000 --counter-prefix Q-  # also restore the counter to explicit values
 *
 * VERIFICATION ONLY - this script changes no app code. Follows the Q-101
 * conventions: hard zz-test guard, deterministic ids, cleanup in a finally,
 * expected values derived HERE with the arithmetic shown (the totals module
 * is imported only as the SUBJECT under test; every expected number is an
 * independent literal).
 *
 * THE TWO DISCIPLINE RULES OF THIS RUN:
 *   1. Staging and production share ONE dataset. Every document created here
 *      has an _id starting "zz-test-quote-" and a ZZ Test label, and every
 *      mutation goes through guards that refuse anything else.
 *   2. The quote counter is real and shared: every number allocated here is a
 *      number Patrick would never get. The counter's state is recorded BEFORE
 *      the run and restored EXACTLY in cleanup (if it did not exist before,
 *      restoration = deleting it so Patrick's first real quote is still
 *      Q-1001). Before/after values are printed so the restoration is
 *      visible, not merely claimed. The counter is the ONE permitted
 *      non-zz-test mutation, and only ever back to its recorded state.
 *
 * TOKENS ARE NEVER PRINTED IN FULL - first six characters plus a marker.
 *
 * Requires SANITY_API_TOKEN (write scope) and SANITY_WEBHOOK_SECRET in
 * .env.local for --apply (the secret must match the STAGING deployment).
 *
 * server-only note: lib/sanity/queries/quotes.ts imports 'server-only', which
 * Next resolves internally but plain node/tsx cannot. The script self-re-execs
 * once with NODE_PATH pointing at a temp shim so the REAL read helper can be
 * imported and exercised (not a re-implementation of it).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { createClient, type SanityClient } from '@sanity/client';

import {
  DEFAULT_FIRST_QUOTE_NUMBER,
  DEFAULT_QUOTE_PREFIX,
  QUOTE_COUNTER_ID,
  QUOTE_COUNTER_TYPE,
  QuoteNumberAllocationError,
  allocateQuoteNumber,
  type QuoteNumberingClient,
} from '../../lib/quotes/numbering';
import { generateQuoteToken, QUOTE_TOKEN_PATTERN } from '../../lib/quotes/token';
import { quoteTag, sanitizeTagValue } from '../../lib/sanity/cache-tags';
import { computeQuoteTotals, quoteLineTotal } from '../../lib/quotes/quote-totals';

// ── server-only shim + re-exec (must run before the dynamic helper import) ───

function ensureServerOnlyResolvable(): void {
  try {
    require.resolve('server-only');
    return; // already resolvable, no re-exec needed
  } catch {
    /* fall through */
  }
  if (process.env.Q111_SHIMMED === '1') {
    console.error('server-only shim did not take effect after re-exec; aborting.');
    process.exit(1);
  }
  const shimRoot = join(tmpdir(), 'q111-server-only-shim');
  const pkgDir = join(shimRoot, 'server-only');
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'server-only', version: '0.0.0', main: 'index.js' }),
  );
  writeFileSync(join(pkgDir, 'index.js'), 'module.exports = {};\n');
  const nodePath = process.env.NODE_PATH ? `${shimRoot}${delimiter}${process.env.NODE_PATH}` : shimRoot;
  // Under tsx, argv[1] is THIS script (tsx rewrites argv), so re-exec through
  // the tsx CLI explicitly or the child would run under plain node.
  const tsxCli = require.resolve('tsx/cli');
  const result = spawnSync(process.execPath, [tsxCli, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: nodePath, Q111_SHIMMED: '1' },
  });
  process.exit(result.status ?? 1);
}
ensureServerOnlyResolvable();

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

// Deliberately NOT NEXT_PUBLIC_SITE_URL (points at production www locally);
// this task verifies the STAGING deployment. Same convention as Q-101.
const SITE = (flagValue('--site') ?? 'https://dev.perfectimprints.com').replace(/\/$/, '');

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-111-verification-report.md');

// ── Env + client (Q-101 convention) ──────────────────────────────────────────

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

function assertTestId(id: string): void {
  const bare = id.replace(/^drafts\./, '');
  if (!bare.startsWith(TEST_PREFIX)) {
    throw new Error(`REFUSING to touch document id "${id}" - not a ${TEST_PREFIX}* fixture.`);
  }
}

/**
 * Guarded delete: the guard is re-checked against the STORED document at the
 * moment of deletion, not trusted from the id we were handed. Any stored
 * title/label must also carry the ZZ Test marker when present.
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
      if (typeof label === 'string' && label.length > 0 && !label.startsWith('ZZ Test')) {
        throw new Error(`REFUSING to delete "${id}" - stored label "${label}" is not a ZZ Test fixture.`);
      }
    }
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

/**
 * The ONE permitted non-zz-test mutation: put the counter back EXACTLY as
 * recorded. If it did not exist before the run, exact restoration means
 * deleting it (so Patrick's first real quote still seeds Q-1001).
 */
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

// ── Result collection (Q-101 conventions) ────────────────────────────────────

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

// ── Fixture inputs + independent arithmetic (documented rules, own literals) ─

// The four line items of the realistic test quote. Expected values are
// computed HERE as literals with the arithmetic shown; the totals module is
// imported only as the thing being checked.
const GEIGER_QTY = 250;
const GEIGER_UNIT = 3.2;
const GEIGER_SETUP = 50;
const GEIGER_SHIP = 40;
// L1: 250 x $3.20 = $800.00; + $50 setup + $40 shipping = $890.00 line total.
const L1_MERCH = 850; // 800 + 50 (shipping kept out of the merchandise subtotal)
const L1_TOTAL = 890;

const OWN_QTY = 100;
const OWN_UNIT = 5.5;
const OWN_SETUP = 25;
// L2: 100 x $5.50 = $550.00; + $25 setup = $575.00 line total (no shipping).
const L2_TOTAL = 575;

const CUSTOM_QTY = 10;
const CUSTOM_UNIT = 12;
const CUSTOM_SHIP = 15;
// L3: 10 x $12.00 = $120.00; + $15 shipping = $135.00 line total (no setup).
const L3_MERCH = 120;
const L3_TOTAL = 135;

const CHARGE_QTY = 1;
const CHARGE_PRICE = 40;
// L4 (charge): 1 x $40.00 = $40.00.
const L4_TOTAL = 40;

const SALES_TAX = 62.13;
// subtotal = 850 + 575 + 120 + 40 = 1585.00
// shipping = 40 + 15 = 55.00
// grand    = 1585 + 55 + 62.13 = 1702.13
const EXPECTED_SUBTOTAL = 1585;
const EXPECTED_SHIPPING = 55;
const EXPECTED_GRAND = 1702.13;

const QUOTE_ID = 'zz-test-quote-1';
const PRODUCT_ID = 'zz-test-quote-product';
const PRODUCT_FLAT_SETUP = 100;

const RESPONSE_KINDS = ['viewed', 'accepted', 'revisionRequested'] as const;
const responseId = (kind: string) => `zz-test-quote-resp-${kind.toLowerCase()}`;

interface GeigerCatalogEntry {
  sku: string;
  name: string;
}

function loadRealSku(): GeigerCatalogEntry {
  const raw = JSON.parse(
    readFileSync(resolve(PROJECT_ROOT, 'data/geiger/products.json'), 'utf8'),
  ) as { products: { sku?: string; name?: string }[] };
  const first = raw.products.find((p) => p.sku && p.name);
  if (!first) throw new Error('No usable SKU found in data/geiger/products.json');
  return { sku: first.sku as string, name: first.name as string };
}

function quoteLineItems(realSku: GeigerCatalogEntry): Record<string, unknown>[] {
  return [
    {
      _type: 'quoteGeigerLine',
      _key: 'line-1',
      sku: realSku.sku,
      displayName: `ZZ Test ${realSku.name}`,
      description: 'ZZ Test truncated description for the Geiger line.',
      quantity: GEIGER_QTY,
      decorationMethod: 'Screen Print, 1 Color',
      unitCost: GEIGER_UNIT,
      setupCharge: GEIGER_SETUP,
      shipping: GEIGER_SHIP,
    },
    {
      _type: 'quoteOwnProductLine',
      _key: 'line-2',
      product: { _type: 'reference', _ref: PRODUCT_ID },
      quantity: OWN_QTY,
      decorationMethod: 'Pad Print',
      unitCost: OWN_UNIT,
      setupCharge: OWN_SETUP,
    },
    {
      _type: 'quoteCustomLine',
      _key: 'line-3',
      displayName: 'ZZ Test Custom Item',
      description: 'ZZ Test fully manual line.',
      quantity: CUSTOM_QTY,
      unitCost: CUSTOM_UNIT,
      shipping: CUSTOM_SHIP,
    },
    {
      _type: 'quoteChargeLine',
      _key: 'line-4',
      label: 'Art fee',
      quantity: CHARGE_QTY,
      unitPrice: CHARGE_PRICE,
    },
  ];
}

// ── Signed revalidate POST (convention from migrate-decoration-methods.ts) ───

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

// ── Offline checks (run in dry-run AND apply) ────────────────────────────────

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function checkTokens(): void {
  const BATCH = 10_000;
  const tokens: string[] = [];
  for (let i = 0; i < BATCH; i++) tokens.push(generateQuoteToken());
  const allValid = tokens.every((t) => QUOTE_TOKEN_PATTERN.test(t) && /^[a-f0-9]{32}$/.test(t));
  record(`token: ${BATCH} generated, all 32 lowercase hex`, 'all valid', allValid ? 'all valid' : 'INVALID FOUND', allValid);
  const unique = new Set(tokens).size;
  record(`token: no collisions in ${BATCH}`, `${BATCH} unique`, `${unique} unique`, unique === BATCH);
  // The actual reason lowercase was mandated: the sanitizer must return every
  // token UNCHANGED, or two quotes could share one cache tag.
  const unchanged = tokens.every((t) => sanitizeTagValue(t) === t && quoteTag(t) === `quote:${t}`);
  record(
    `token: sanitizer round-trip (${BATCH} tokens)`,
    'sanitizeTagValue(token) === token, tag "quote:<token>"',
    unchanged ? 'all unchanged' : 'ALTERED BY SANITIZER',
    unchanged,
  );
  // Counter-example proving the check has teeth: mixed case IS altered.
  const upper = 'DEADBEEF'.repeat(4);
  record(
    'token: mixed case would collapse (control)',
    'sanitizer lowercases non-lowercase input',
    sanitizeTagValue(upper) === upper.toLowerCase() ? 'lowercased as expected' : 'unexpected',
    sanitizeTagValue(upper) === upper.toLowerCase(),
  );
}

function checkTotalsOffline(realSku: GeigerCatalogEntry): void {
  const lines = quoteLineItems(realSku);

  // 1. single product line, no tax: 250 x 3.20 + 50 + 40 = 890
  const single = computeQuoteTotals([lines[0]]);
  record('totals: single line grand (250 x $3.20 + $50 + $40)', '890', String(single.grandTotal), near(single.grandTotal, L1_TOTAL));
  record('totals: single line subtotal excludes shipping', '850', String(single.subtotal), near(single.subtotal, L1_MERCH));

  // 2. the full mixed quote: subtotal 1585, shipping 55, tax 62.13, grand 1702.13
  const mixed = computeQuoteTotals(lines, SALES_TAX);
  record('totals: mixed subtotal (850 + 575 + 120 + 40)', String(EXPECTED_SUBTOTAL), String(mixed.subtotal), near(mixed.subtotal, EXPECTED_SUBTOTAL));
  record('totals: mixed shipping (40 + 15)', String(EXPECTED_SHIPPING), String(mixed.shippingTotal), near(mixed.shippingTotal, EXPECTED_SHIPPING));
  record('totals: mixed grand (1585 + 55 + 62.13)', String(EXPECTED_GRAND), String(mixed.grandTotal), near(mixed.grandTotal, EXPECTED_GRAND));
  const lineTotals = [L1_TOTAL, L2_TOTAL, L3_TOTAL, L4_TOTAL];
  const linesOk = mixed.lineTotals.length === 4 && mixed.lineTotals.every((v, i) => near(v, lineTotals[i]));
  record('totals: per-line totals (890, 575, 135, 40)', lineTotals.join(', '), mixed.lineTotals.join(', '), linesOk);

  // 3. charge line alone: 3 x 12.50 = 37.50
  const charge = quoteLineTotal({ _type: 'quoteChargeLine', quantity: 3, unitPrice: 12.5 });
  record('totals: charge line (3 x $12.50)', '37.5', String(charge), near(charge, 37.5));

  // 4. missing quantity: 0 x 5 + 50 setup + 25 shipping = 75
  const noQty = quoteLineTotal({ _type: 'quoteGeigerLine', unitCost: 5, setupCharge: 50, shipping: 25 });
  record('totals: missing quantity treated as 0 (0 x 5 + 50 + 25)', '75', String(noQty), near(noQty, 75));
  // negative and non-finite inputs all zero: 100 x 0 + 0 + 0 = 0
  const junk = quoteLineTotal({ _type: 'quoteCustomLine', quantity: 100, unitCost: -5, setupCharge: Number.NaN, shipping: -2 });
  record('totals: negative/NaN inputs treated as 0', '0', String(junk), junk === 0);
  const chargeNoPrice = quoteLineTotal({ _type: 'quoteChargeLine', quantity: 2 });
  record('totals: charge with no price', '0', String(chargeNoPrice), chargeNoPrice === 0);

  // 5. tax absent / invalid adds nothing; present adds verbatim
  const base = computeQuoteTotals([lines[3]]); // just the $40 art fee
  record('totals: tax absent (grand = 40)', '40', String(base.grandTotal), near(base.grandTotal, 40));
  const badTax = computeQuoteTotals([lines[3]], Number.NaN);
  const negTax = computeQuoteTotals([lines[3]], -3);
  record('totals: NaN/negative tax adds nothing', '40 / 40', `${badTax.grandTotal} / ${negTax.grandTotal}`, near(badTax.grandTotal, 40) && near(negTax.grandTotal, 40));
  const withTax = computeQuoteTotals([lines[3]], 7.77);
  record('totals: tax 7.77 added verbatim (40 + 7.77)', '47.77', String(withTax.grandTotal), near(withTax.grandTotal, 47.77));

  // 6. fraction of a cent: 3 x $0.335 = $1.005 exactly, rounds half-up to $1.01
  const cent = quoteLineTotal({ _type: 'quoteChargeLine', quantity: 3, unitPrice: 0.335 });
  record('totals: 3 x $0.335 = $1.005 rounds to', '1.01', String(cent), cent === 1.01);

  // empty quote
  const empty = computeQuoteTotals(undefined);
  record('totals: empty quote all zeros', '0 / 0 / 0', `${empty.subtotal} / ${empty.shippingTotal} / ${empty.grandTotal}`, empty.subtotal === 0 && empty.shippingTotal === 0 && empty.grandTotal === 0);
}

async function checkExhaustionStub(): Promise<void> {
  // Simulated allocation exhaustion via a stub client whose guarded commit
  // always conflicts. Safe: touches nothing real. Reports EXACTLY what a
  // caller receives when allocation cannot succeed.
  const stub: QuoteNumberingClient = {
    fetch: async <T>() => ({ _rev: 'stub-rev', prefix: 'Q-', lastNumber: 1000 }) as T,
    createIfNotExists: async () => ({}),
    patch: () => ({
      ifRevisionId: () => ({
        set: () => ({
          commit: async () => {
            throw new Error('409 revision conflict (simulated)');
          },
        }),
      }),
    }),
  };
  const started = Date.now();
  try {
    await allocateQuoteNumber(stub);
    record('numbering: exhaustion behaviour (stub)', 'throws QuoteNumberAllocationError', 'DID NOT THROW', false);
  } catch (err) {
    const isTyped = err instanceof QuoteNumberAllocationError;
    const msg = err instanceof Error ? err.message : String(err);
    record(
      'numbering: exhaustion behaviour (stub)',
      'throws QuoteNumberAllocationError, no number issued',
      `${isTyped ? 'QuoteNumberAllocationError' : 'WRONG ERROR TYPE'} after ${Math.round((Date.now() - started) / 100) / 10}s`,
      isTyped,
    );
    notes.push(
      `What a caller receives when allocation cannot succeed (simulated 5x conflict): ` +
        `${isTyped ? 'QuoteNumberAllocationError' : 'Error'}: "${msg}". The quote is left ` +
        `unnumbered and unpublishable (validation requires the number); nothing is consumed.`,
    );
  }
}

function checkStaticSources(): void {
  // G. reserved slug in the canonical list + both schema mirrors.
  const files: [string, string][] = [
    ['lib/reserved-slugs.ts', 'canonical list'],
    ['sanity/schemas/documents/page.ts', 'page schema mirror'],
    ['sanity/schemas/documents/landing-page.ts', 'landingPage schema mirror'],
  ];
  for (const [rel, label] of files) {
    const src = readFileSync(resolve(PROJECT_ROOT, rel), 'utf8');
    const present = /'quote',/.test(src);
    record(`reserved slug: 'quote' in ${label}`, 'present', present ? 'present' : 'MISSING', present);
  }

  // 13. Is the read helper genuinely tagged as intended (from the code)?
  const helperSrc = readFileSync(resolve(PROJECT_ROOT, 'lib/sanity/queries/quotes.ts'), 'utf8');
  const tagged =
    helperSrc.includes('QUOTES_TAG') &&
    helperSrc.includes('quoteTag(token)') &&
    helperSrc.includes('revalidate: false') &&
    !helperSrc.includes("'no-store'");
  record(
    'read helper: tagged fetch (static source check)',
    'tags [QUOTES_TAG, quote:<token>], revalidate:false, no no-store',
    tagged ? 'as intended' : 'NOT AS INTENDED',
    tagged,
  );
  const routeSrc = readFileSync(resolve(PROJECT_ROOT, 'app/api/sanity/revalidate/route.ts'), 'utf8');
  const busts = routeSrc.includes('revalidateTag(QUOTES_TAG') && routeSrc.includes('bustTag(quoteTag(');
  record(
    'webhook route: quote case busts both tags (static source check)',
    'QUOTES_TAG + quoteTag(<slug>)',
    busts ? 'both busted' : 'MISSING A TAG BUST',
    busts,
  );
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupDocs(client: SanityClient): Promise<{ deleted: string[]; failed: string[] }> {
  const found = await client.fetch<{ _id: string; _type: string }[]>(
    `*[_id match "${TEST_PREFIX}*" || _id match "drafts.${TEST_PREFIX}*"]{_id, _type}`,
  );
  // Quotes first: they hold the only strong references (to the test product).
  const ordered = [...found].sort((a, b) => (a._type === 'quote' ? -1 : 0) - (b._type === 'quote' ? -1 : 0));
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const pass of [0, 1]) {
    for (const d of ordered) {
      if (deleted.includes(d._id)) continue;
      try {
        await guardedDelete(client, d._id);
        deleted.push(d._id);
      } catch (e) {
        if (pass === 1) failed.push(`${d._id} (${(e as Error).message})`);
      }
    }
    if (failed.length === 0 && deleted.length === ordered.length) break;
  }
  return { deleted, failed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Q-111 verification of Q-110 (quote data foundation)');
  console.log(`Target deployment: ${SITE}`);
  console.log(`Mode: ${CLEANUP_ONLY ? 'CLEANUP ONLY' : DRY_RUN ? 'DRY RUN (default: offline checks only, no writes)' : 'APPLY'}`);
  console.log('');

  const realSku = loadRealSku();

  if (CLEANUP_ONLY) {
    const client = buildClient();
    const { deleted, failed } = await cleanupDocs(client);
    console.log(`Deleted: ${deleted.length ? deleted.join(', ') : '(nothing found)'}`);
    if (failed.length) {
      console.error(`FAILED to delete: ${failed.join(', ')}`);
    }
    const counter = await readCounter(client);
    console.log(`quoteCounter now: ${describeCounter(counter)}`);
    if (process.argv.includes('--counter-absent')) {
      if (counter !== null) {
        await client.delete(QUOTE_COUNTER_ID);
        console.log('quoteCounter deleted (restored to: absent).');
      } else {
        console.log('quoteCounter already absent.');
      }
    } else if (flagValue('--counter-last') !== undefined) {
      const last = Number(flagValue('--counter-last'));
      const prefix = flagValue('--counter-prefix') ?? DEFAULT_QUOTE_PREFIX;
      const msg = await restoreCounter(client, { prefix, lastNumber: last });
      console.log(`quoteCounter ${msg}.`);
    } else if (counter !== null) {
      console.log(
        'NOTE: the counter was NOT changed. To restore it, re-run with --counter-absent ' +
          '(if it did not exist before a failed run) or --counter-last <n> --counter-prefix <p>.',
      );
    }
    if (failed.length) process.exit(1);
    return;
  }

  // Offline checks run in BOTH dry-run and apply.
  checkTokens();
  checkTotalsOffline(realSku);
  await checkExhaustionStub();
  checkStaticSources();

  if (DRY_RUN) {
    printTable();
    console.log('\nDry run complete (offline checks only). --apply additionally:');
    console.log(`  1. probes ${SITE}/api/sanity/revalidate for the deployed quote case (aborts if absent),`);
    console.log('  2. records the quoteCounter state, allocates 3 sequential + 6 concurrent numbers,');
    console.log(`  3. publishes ${PRODUCT_ID} (productPage) and ${QUOTE_ID} (quote, real SKU ${realSku.sku}),`);
    console.log('  4. exercises the read helper (found / null cases), the price-snapshot rule,');
    console.log('     the signed revalidate POST, and the quoteResponse clobber + delete tests,');
    console.log('  5. deletes every zz-test-quote-* document and restores the counter EXACTLY.');
    console.log('\nRe-run with --apply to execute. --cleanup-only sweeps leftovers.');
    return;
  }

  // ── APPLY ──
  const client = buildClient();
  const secret = process.env.SANITY_WEBHOOK_SECRET;
  if (!secret) throw new Error('SANITY_WEBHOOK_SECRET is required for --apply (freshness check).');

  // Deployment gate: the deployed route must have the Q-110 quote case.
  const gate = await postSignedRevalidate(secret, {
    _type: 'quote',
    slug: { current: 'deadbeefdeadbeefdeadbeefdeadbeef' },
  });
  let gateOk = false;
  try {
    const parsed = JSON.parse(gate.body) as { revalidated?: boolean; type?: string };
    gateOk = gate.status === 200 && parsed.revalidated === true && parsed.type === 'quote';
  } catch {
    gateOk = false;
  }
  record('deploy gate: staging route has the quote case', '200 revalidated:true type:quote', `${gate.status} ${gate.body}`, gateOk);
  if (!gateOk) {
    printTable();
    console.error('\nABORTING: the deployed staging route does not handle type "quote" (Q-110 not live?).');
    process.exit(1);
  }

  // Counter discipline: record BEFORE anything allocates.
  const counterBefore = await readCounter(client);
  console.log(`quoteCounter BEFORE the run: ${describeCounter(counterBefore)}`);
  info('counter: state BEFORE the run', describeCounter(counterBefore));
  const base =
    counterBefore && typeof counterBefore.lastNumber === 'number' && Number.isFinite(counterBefore.lastNumber)
      ? Math.floor(counterBefore.lastNumber)
      : DEFAULT_FIRST_QUOTE_NUMBER - 1;
  const prefix =
    counterBefore && typeof counterBefore.prefix === 'string' && counterBefore.prefix.length > 0
      ? counterBefore.prefix
      : DEFAULT_QUOTE_PREFIX;

  let runError: unknown = null;
  const token = generateQuoteToken();

  try {
    // ── A. Numbering ──
    // A1. sequential
    const seq: number[] = [];
    let firstQuoteNumber = '';
    for (let i = 0; i < 3; i++) {
      const a = await allocateQuoteNumber(client);
      seq.push(a.number);
      if (i === 0) firstQuoteNumber = a.quoteNumber;
      const expectedNum = base + 1 + i;
      record(
        `numbering: sequential #${i + 1}`,
        `${prefix}${expectedNum}`,
        a.quoteNumber,
        a.number === expectedNum && a.quoteNumber === `${prefix}${expectedNum}` && /^\d+$/.test(String(a.number)),
      );
    }

    // A2. concurrency: 6 simultaneous allocations.
    const CONCURRENT = 6;
    const settled = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, () => allocateQuoteNumber(client)),
    );
    const won = settled.filter((s): s is PromiseFulfilledResult<{ number: number; quoteNumber: string }> => s.status === 'fulfilled').map((s) => s.value.number);
    const lost = settled.filter((s) => s.status === 'rejected');
    record(`numbering: ${CONCURRENT} concurrent allocations all succeed`, `${CONCURRENT}/${CONCURRENT}`, `${won.length}/${CONCURRENT}${lost.length ? ` (${lost.length} threw)` : ''}`, won.length === CONCURRENT);
    const distinct = new Set(won).size === won.length;
    record('numbering: concurrent numbers all distinct', 'no duplicates', distinct ? 'no duplicates' : `DUPLICATES in ${won.join(',')}`, distinct);
    const sortedWon = [...won].sort((a, b) => a - b);
    const expectedSet = Array.from({ length: won.length }, (_, i) => base + 4 + i);
    const contiguous = sortedWon.join(',') === expectedSet.join(',');
    record('numbering: concurrent set contiguous', expectedSet.join(','), sortedWon.join(','), contiguous);
    const counterAfterAlloc = await readCounter(client);
    const expectedLast = base + 3 + won.length;
    record(
      'numbering: counter matches count issued',
      `lastNumber ${expectedLast}`,
      describeCounter(counterAfterAlloc),
      typeof counterAfterAlloc?.lastNumber === 'number' && counterAfterAlloc.lastNumber === expectedLast,
    );
    for (const l of lost) {
      notes.push(`Concurrent allocation rejection observed (raw): ${(l as PromiseRejectedResult).reason}`);
    }

    // ── D. Documents + read path ──
    // The referenced product page is OUR OWN published productPage fixture:
    // the non-negotiable guard forbids patching real documents, and check 11
    // must patch the referenced product, so a zz-test product plays that role
    // (the dereference mechanics are identical to a real one).
    await client.createOrReplace({
      _id: PRODUCT_ID,
      _type: 'productPage',
      title: 'ZZ Test Quote Product',
      slug: { _type: 'slug', current: PRODUCT_ID },
      pricingTiers: [{ _type: 'pricingTier', _key: 'tier-1', minQty: 100, price: 6 }],
      setupCharge: PRODUCT_FLAT_SETUP,
      showInNewProducts: false,
    });
    console.log(`Published ${PRODUCT_ID}`);

    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await client.createOrReplace({
      _id: QUOTE_ID,
      _type: 'quote',
      quoteNumber: firstQuoteNumber,
      slug: { _type: 'slug', current: token },
      title: 'ZZ Test Quote',
      customerCompany: 'ZZ Test Company',
      customerName: 'Ali Hamza Rao',
      customerEmail: 'alihamzarao13@gmail.com',
      repName: 'ZZ Test Rep',
      repEmail: 'zz-test@example.com',
      quoteDate: today,
      expiryDate: expiry,
      lineItems: quoteLineItems(realSku),
      salesTax: SALES_TAX,
    });
    console.log(`Published ${QUOTE_ID} (number ${firstQuoteNumber}, token ${redact(token)})`);

    // 7. No total is stored on the published document.
    const rawDoc = await client.fetch<Record<string, unknown> | null>(`*[_id == $id][0]`, { id: QUOTE_ID });
    const forbiddenKeys = ['subtotal', 'shippingTotal', 'grandTotal', 'total', 'lineTotals', 'computedTotals', 'responses'];
    const persisted = forbiddenKeys.filter((k) => rawDoc && k in rawDoc);
    record('doc: no persisted totals fields', `none of: ${forbiddenKeys.join(', ')}`, persisted.length ? `PERSISTED: ${persisted.join(', ')}` : 'none present', persisted.length === 0);

    // 9. The REAL read helper (imported through the server-only shim).
    const { getQuoteByToken } = (await import('../../lib/sanity/queries/quotes')) as typeof import('../../lib/sanity/queries/quotes');
    const fetched = await getQuoteByToken(token);
    record('read helper: returns the quote by token', 'non-null', fetched ? 'non-null' : 'NULL', fetched !== null);
    if (fetched) {
      record('read helper: quoteNumber round-trips', firstQuoteNumber, String(fetched.quoteNumber), fetched.quoteNumber === firstQuoteNumber);
      const types = (fetched.lineItems ?? []).map((l) => l._type).join(',');
      record(
        'read helper: 4 line items in order',
        'quoteGeigerLine,quoteOwnProductLine,quoteCustomLine,quoteChargeLine',
        types,
        types === 'quoteGeigerLine,quoteOwnProductLine,quoteCustomLine,quoteChargeLine',
      );
      const l1 = fetched.lineItems?.[0] as { sku?: string; quantity?: number; unitCost?: number } | undefined;
      record(
        'read helper: Geiger line intact (sku, qty, unit cost)',
        `${realSku.sku}, 250, 3.2`,
        `${l1?.sku}, ${l1?.quantity}, ${l1?.unitCost}`,
        l1?.sku === realSku.sku && l1?.quantity === GEIGER_QTY && l1?.unitCost === GEIGER_UNIT,
      );
      const l2 = fetched.lineItems?.[1] as { product?: { _id?: string; title?: string; slug?: string } } | undefined;
      record(
        'read helper: own-product line dereferenced for display',
        `${PRODUCT_ID} / ZZ Test Quote Product`,
        `${l2?.product?._id ?? '(none)'} / ${l2?.product?.title ?? '(none)'}`,
        l2?.product?._id === PRODUCT_ID && l2?.product?.title === 'ZZ Test Quote Product',
      );
      const cust = fetched.customer;
      record(
        'read helper: customer block mapped',
        'ZZ Test Company / Ali Hamza Rao / alihamzarao13@gmail.com',
        `${cust?.company} / ${cust?.name} / ${cust?.email}`,
        cust?.company === 'ZZ Test Company' && cust?.name === 'Ali Hamza Rao' && cust?.email === 'alihamzarao13@gmail.com',
      );
      record('read helper: salesTax round-trips', String(SALES_TAX), String(fetched.salesTax), fetched.salesTax === SALES_TAX);
    }

    // 10. null cases, never throwing.
    const nullCases: [string, string][] = [
      ['unknown well-formed token', 'abcdef0123456789abcdef0123456789'],
      ['malformed token', 'not-a-real-token'],
      ['empty string', ''],
      ['sanitizer-altering characters', 'DEADBEEF!!deadbeef__deadbeef##00'],
    ];
    for (const [label, bad] of nullCases) {
      let result: 'null' | 'non-null' | 'THREW' = 'THREW';
      try {
        result = (await getQuoteByToken(bad)) === null ? 'null' : 'non-null';
      } catch {
        result = 'THREW';
      }
      record(`read helper: ${label}`, 'null (no throw)', result, result === 'null');
    }

    // 11. Prices are a snapshot: change the referenced product, re-read.
    await guardedPatchSet(client, PRODUCT_ID, { setupCharge: 999 });
    const afterEdit = await getQuoteByToken(token);
    const snapLine = afterEdit?.lineItems?.[1] as { unitCost?: number; setupCharge?: number } | undefined;
    record(
      'snapshot: product setupCharge 100 -> 999, quote line unchanged',
      `unitCost ${OWN_UNIT}, setupCharge ${OWN_SETUP}`,
      `unitCost ${snapLine?.unitCost}, setupCharge ${snapLine?.setupCharge}`,
      snapLine?.unitCost === OWN_UNIT && snapLine?.setupCharge === OWN_SETUP,
    );
    await guardedPatchSet(client, PRODUCT_ID, { setupCharge: PRODUCT_FLAT_SETUP });
    const restoredProduct = await client.fetch<{ setupCharge?: number } | null>(`*[_id == $id][0]{setupCharge}`, { id: PRODUCT_ID });
    record('snapshot: product restored exactly', `setupCharge ${PRODUCT_FLAT_SETUP}`, `setupCharge ${restoredProduct?.setupCharge}`, restoredProduct?.setupCharge === PRODUCT_FLAT_SETUP);

    // ── E. Freshness (12): signed POST with the REAL token ──
    const reval = await postSignedRevalidate(secret, { _type: 'quote', slug: { current: token } });
    let revalOk = false;
    let scope = '';
    try {
      const parsed = JSON.parse(reval.body) as { revalidated?: boolean; scope?: string; type?: string };
      scope = parsed.scope ?? '';
      revalOk = reval.status === 200 && parsed.revalidated === true && parsed.type === 'quote';
    } catch {
      revalOk = false;
    }
    record('freshness: signed revalidate POST accepted', '200 revalidated:true type:quote', `${reval.status} revalidated:${revalOk}`, revalOk);
    const expectedScope = `/quote/${token.slice(0, 6)}[redacted]`;
    record('freshness: token redacted in response', expectedScope, scope || '(no scope)', scope === expectedScope);
    const leaked = reval.body.includes(token);
    record('freshness: full token NOT in response body', 'absent', leaked ? 'FULL TOKEN PRESENT' : 'absent', !leaked);
    notes.push(
      'The revalidate response reports scope + type only; it does not enumerate busted tag names ' +
        '(deliberate, the body lands in the webhook delivery log). That the quote case busts ' +
        'QUOTES_TAG + quote:<token> is verified from the route source (static check above); the ' +
        'cache-level effect has no observable surface until the /quote/<token> page exists.',
    );

    // ── F. Response records (14, 15) ──
    for (const kind of RESPONSE_KINDS) {
      await client.createOrReplace({
        _id: responseId(kind),
        _type: 'quoteResponse',
        quote: { _type: 'reference', _ref: QUOTE_ID, _weak: true },
        quoteNumber: firstQuoteNumber,
        kind,
        createdAt: new Date().toISOString(),
        ...(kind === 'accepted' ? { comment: 'ZZ Test acceptance comment' } : {}),
        ...(kind === 'revisionRequested' ? { comment: 'ZZ Test revision comment' } : {}),
        context: 'q111-verification-script',
      });
    }
    const createdKindDocs = await client.fetch<{ kind?: string }[]>(
      `*[_type == "quoteResponse" && _id match "${TEST_PREFIX}*"]{kind}`,
    );
    const createdKinds = createdKindDocs.map((d) => d.kind ?? '?').sort().join(',');
    record('responses: one of each kind created', 'accepted,revisionRequested,viewed', createdKinds, createdKinds === 'accepted,revisionRequested,viewed');
    notes.push(
      'Writer note for the future response route: this script sets _weak:true on the reference ' +
        'object it writes. The schema-level weak:true governs Studio-created references; an ' +
        'API-written reference carries weakness only via the stored _weak flag. The quote ' +
        'deletion succeeding below (with responses present) is the empirical proof the stored ' +
        'references are weak.',
    );

    // The clobber test: simulate Patrick editing a draft and publishing it
    // (publish REPLACES the published document wholesale).
    const published = await client.fetch<Record<string, unknown> | null>(`*[_id == $id][0]`, { id: QUOTE_ID });
    if (!published) throw new Error('test quote vanished before the clobber test');
    const draftId = `drafts.${QUOTE_ID}`;
    assertTestId(draftId);
    const draft = { ...published, _id: draftId, title: 'ZZ Test Quote (edited)' };
    delete (draft as Record<string, unknown>)._rev;
    delete (draft as Record<string, unknown>)._createdAt;
    delete (draft as Record<string, unknown>)._updatedAt;
    await client.createOrReplace(draft as never);
    // "Publish": replace the published doc with the draft content, drop the draft.
    const publishedFromDraft = { ...draft, _id: QUOTE_ID };
    await client.transaction().createOrReplace(publishedFromDraft as never).delete(draftId).commit();
    const survivors = await client.fetch<{ _id: string; kind?: string; quoteNumber?: string }[]>(
      `*[_type == "quoteResponse" && _id match "${TEST_PREFIX}*"]{_id, kind, quoteNumber} | order(kind asc)`,
    );
    record(
      'responses: SURVIVE parent edit + republish (clobber test)',
      '3 records intact',
      `${survivors.length} records (${survivors.map((s) => s.kind).join(',')})`,
      survivors.length === RESPONSE_KINDS.length && survivors.every((s) => s.quoteNumber === firstQuoteNumber),
    );

    // 15. Delete the quote; responses must not block and must remain readable.
    let deleteOk = true;
    let deleteMsg = 'deleted cleanly';
    try {
      await guardedDelete(client, QUOTE_ID);
    } catch (e) {
      deleteOk = false;
      deleteMsg = `BLOCKED: ${(e as Error).message}`;
    }
    record('delete: quote deletes despite responses (weak refs)', 'deleted cleanly', deleteMsg, deleteOk);
    const afterDelete = await client.fetch<{ kind?: string; quoteNumber?: string }[]>(
      `*[_type == "quoteResponse" && _id match "${TEST_PREFIX}*"]{kind, quoteNumber}`,
    );
    record(
      'delete: responses remain, quote number intact',
      `3 records, all ${firstQuoteNumber}`,
      `${afterDelete.length} records, numbers: ${[...new Set(afterDelete.map((r) => r.quoteNumber))].join(',')}`,
      afterDelete.length === RESPONSE_KINDS.length && afterDelete.every((r) => r.quoteNumber === firstQuoteNumber),
    );
    const goneQuote = await getQuoteByToken(token);
    record('delete: read helper returns null after delete', 'null', goneQuote === null ? 'null' : 'STILL RETURNED', goneQuote === null);
  } catch (e) {
    runError = e;
    console.error('Run failed:', e);
  } finally {
    // Cleanup ALWAYS runs: delete fixtures, restore the counter EXACTLY.
    try {
      const { deleted, failed } = await cleanupDocs(client);
      record('cleanup: fixtures deleted', 'all zz-test-quote-* gone', deleted.length ? deleted.join(', ') : '(none found)', failed.length === 0);
      if (failed.length) {
        console.error(`CLEANUP INCOMPLETE. Left behind: ${failed.join(', ')}`);
        console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q110.ts --cleanup-only');
      }
      const leftover = await client.fetch<number>(`count(*[_id match "${TEST_PREFIX}*" || _id match "drafts.${TEST_PREFIX}*"])`);
      record('cleanup: zero test documents remain', '0', String(leftover), leftover === 0);
    } catch (cleanupErr) {
      console.error('CLEANUP FAILED:', cleanupErr);
      console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q110.ts --cleanup-only');
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
      record('counter: restored EXACTLY to its before-run state', describeCounter(counterBefore), describeCounter(counterAfter), restoredExactly);
    } catch (counterErr) {
      console.error('COUNTER RESTORE FAILED:', counterErr);
      console.error('*** MANUAL RESTORE REQUIRED ***');
      if (counterBefore === null) {
        console.error(`*** The counter did NOT exist before this run. DELETE the document "${QUOTE_COUNTER_ID}" (via Vision/API), or run: pnpm tsx scripts/quick-quote/verify-q110.ts --cleanup-only --counter-absent`);
      } else {
        console.error(`*** Restore "${QUOTE_COUNTER_ID}" to: ${describeCounter(counterBefore)}`);
        console.error(`*** Or run: pnpm tsx scripts/quick-quote/verify-q110.ts --cleanup-only --counter-last ${String(counterBefore.lastNumber)} --counter-prefix ${String(counterBefore.prefix)}`);
      }
      record('counter: restored EXACTLY to its before-run state', describeCounter(counterBefore), 'RESTORE FAILED (see console)', false);
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
    console.error(`\n${failedRows.length} check(s) FAILED${runError ? ' (plus a run error above)' : ''}.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

function writeReport(): void {
  const stamp = new Date().toISOString();
  const lines: string[] = [
    '# Q-111: Automated verification of Q-110 (quote data foundation)',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q110.ts (verification only - no app code touched). Dataset is SHARED between staging and production; every fixture used the zz-test-quote- prefix and was deleted; the quote counter was recorded before the run and restored exactly (values in the table).`,
    '',
    '## Fixture arithmetic (independent literals, not derived from the app code)',
    '',
    '- Geiger line: 250 x $3.20 = $800.00; + $50 setup + $40 shipping = $890.00 (merchandise $850.00)',
    '- Own-product line: 100 x $5.50 = $550.00; + $25 setup = $575.00',
    '- Custom line: 10 x $12.00 = $120.00; + $15 shipping = $135.00 (merchandise $120.00)',
    '- Charge line (Art fee): 1 x $40.00 = $40.00',
    '- Subtotal (merchandise): 850 + 575 + 120 + 40 = $1,585.00; shipping 40 + 15 = $55.00',
    '- Sales tax as typed: $62.13 (added verbatim, never calculated)',
    '- Grand total: 1585 + 55 + 62.13 = $1,702.13',
    '- Fraction of a cent: 3 x $0.335 = $1.005 exactly, rounds half-up to $1.01',
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
    '## What a script cannot prove (Studio click-through for Ali)',
    '',
    'None of the following are marked passed; they need a human in the Studio:',
    '',
    '1. Open Content > Quote > Create new. The "Assign quote number" button should appear in Quote identity; after one click a number like Q-1001 shows as plain text with "Assigned automatically. Not editable." and NO editable text box; the Private link token field is read-only with a generated value.',
    '2. Add line items and change a quantity: the "Totals (computed)" box should update live (subtotal / shipping / sales tax / grand total).',
    '3. Duplicate an existing quote (document menu > Duplicate) and try to publish the copy: publishing should be BLOCKED by the uniqueness messages on the quote number and the private link token.',
    '4. On a quote that has responses, the "Responses" box in Sending & responses should list them newest first (nothing writes responses yet, so this is only observable after the later prompts, or while the Q-111 fixtures briefly existed).',
    '5. Create a new quote and check the "Your details" fieldset: name/email should pre-fill from the logged-in Studio user (whose name actually appears is worth confirming), phone from Global Settings contact.',
    '6. On a Geiger product line, the SKU field should offer the search-and-pick product picker, not free typing.',
    '7. The "no persisted totals" check covered an API-authored document; a Studio-edited quote should equally never gain stored totals fields (the totals field stores nothing by design).',
    '',
  );
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
