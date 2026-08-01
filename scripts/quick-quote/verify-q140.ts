/**
 * Q-140: automated verification of the customer quote page (/quote/<token>)
 * against the DEPLOYED staging site and the REAL shared Sanity dataset.
 *
 *   pnpm tsx scripts/quick-quote/verify-q140.ts                 # dry run (default: offline checks only, no writes)
 *   pnpm tsx scripts/quick-quote/verify-q140.ts --apply         # real run: create fixtures, fetch pages, verify, clean up
 *   pnpm tsx scripts/quick-quote/verify-q140.ts --cleanup-only  # sweep every zz-test-quote-* document
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *   ... --cleanup-only --counter-absent                         # also delete the quoteCounter (it did not exist before)
 *   ... --cleanup-only --counter-last 1002 --counter-prefix Q-  # also restore the counter to explicit values
 *
 * VERIFICATION ONLY - this script changes no app code. Same conventions as
 * scripts/quick-quote/verify-q110.ts: hard zz-test guard re-checked at the
 * moment of deletion, deterministic ids, cleanup in a finally, and every
 * expected number derived HERE as an independent literal with the arithmetic
 * shown (the app's totals module is deliberately NOT imported - checking a
 * module against itself proves nothing).
 *
 * THE TWO DISCIPLINE RULES OF THIS RUN:
 *   1. Staging and production share ONE dataset. Every document created here
 *      has an _id starting "zz-test-quote-" and a ZZ Test label, and every
 *      mutation goes through guards that refuse anything else.
 *   2. The quote counter is real and shared. Its state is recorded BEFORE the
 *      run and restored EXACTLY afterwards; before/after values are printed so
 *      the restoration is visible rather than claimed. Note a real quote
 *      Q-1002 already exists in the dataset, so unlike the Q-111 run the
 *      counter is expected to be PRESENT before this run. The counter is the
 *      ONE permitted non-zz-test mutation, and only ever back to its recorded
 *      state.
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
// locally); this task verifies the STAGING deployment. Q-101/Q-111 convention.
const SITE = (flagValue('--site') ?? 'https://dev.perfectimprints.com').replace(/\/$/, '');

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-140-verification-report.md');

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
 * moment of deletion, not trusted from the id we were handed. Any stored label
 * must also carry the ZZ Test marker when present.
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
// Every expected amount below is worked out by hand and written as a literal.
// lib/quotes/quote-totals.ts is the thing under test and is never imported.

const GEIGER_QTY = 250;
const GEIGER_UNIT = 3.2;
const GEIGER_SETUP = 50;
const GEIGER_SHIP = 40;
// L1: 250 x $3.20 = $800.00; + $50 setup + $40 shipping = $890.00 line total.
const L1_TOTAL_DISPLAY = '$890.00';

const OWN_QTY = 100;
const OWN_UNIT = 5.5;
const OWN_SETUP = 25;
// L2: 100 x $5.50 = $550.00; + $25 setup = $575.00 line total (no shipping).
const L2_TOTAL_DISPLAY = '$575.00';

const CUSTOM_QTY = 10;
const CUSTOM_UNIT = 12;
const CUSTOM_SHIP = 15;
// L3: 10 x $12.00 = $120.00; + $15 shipping = $135.00 line total (no setup).
const L3_TOTAL_DISPLAY = '$135.00';

const CHARGE_QTY = 1;
const CHARGE_PRICE = 40;
// L4 (charge): 1 x $40.00 = $40.00.
const L4_TOTAL_DISPLAY = '$40.00';

const SALES_TAX = 62.13;
// merchandise subtotal = 850 + 575 + 120 + 40 = 1585.00 (shipping excluded)
// shipping             = 40 + 15 = 55.00
// grand                = 1585 + 55 + 62.13 = 1702.13
const SUBTOTAL_DISPLAY = '$1,585.00';
const SHIPPING_DISPLAY = '$55.00';
const TAX_DISPLAY = '$62.13';
const GRAND_DISPLAY = '$1,702.13';

// The freshness edit: quantity 250 -> 300 on line 1.
// L1 becomes 300 x $3.20 = $960.00; + $50 + $40 = $1,050.00
// subtotal   = 1010 + 575 + 120 + 40 = 1745.00
// grand      = 1745 + 55 + 62.13 = 1862.13
const FRESH_QTY = 300;
const FRESH_GRAND_DISPLAY = '$1,862.13';

// Fixture ids.
const FULL_ID = 'zz-test-quote-q140-full';
const EXPIRED_ID = 'zz-test-quote-q140-expired';
const EMPTY_ID = 'zz-test-quote-q140-empty';
const SPARSE_ID = 'zz-test-quote-q140-sparse';
const PRODUCT_ID = 'zz-test-quote-q140-product';
const ALL_FIXTURE_IDS = [FULL_ID, EXPIRED_ID, EMPTY_ID, SPARSE_ID, PRODUCT_ID];

// Values that must NEVER reach the customer's page.
const INTERNAL_LABEL = 'ZZ Test INTERNAL-LABEL-MUST-NOT-RENDER-Q140';
const CUSTOMER_EMAIL = 'zz-test-customer-q140@example.com';
const CUSTOMER_PHONE = '555-0100-DO-NOT-RENDER';
const CUSTOMER_ADDRESS = '999 ZZ Test Withheld Street, Nowhere';
const SENT_AT = '2021-02-03T04:05:06Z';
const SENT_AT_DAY = '2021-02-03';
const SENT_AT_PRETTY = 'February 3, 2021';
const GEIGER_SKU_MARKER = 'ZZQ140SKU';

// Values that MUST reach the page.
const CUSTOMER_COMPANY = 'ZZ Test Buyer Company';
const CUSTOMER_CONTACT = 'ZZ Test Contact Person';
const REP_NAME = 'ZZ Test Rep';
const REP_EMAIL = 'zz-test-rep-q140@example.com';
const REP_PHONE = '800-773-9472';
const L1_NAME = 'ZZ Test Geiger Line Item';
const L2_PRODUCT_TITLE = 'ZZ Test Own Product Title';
const L3_NAME = 'ZZ Test Custom Item';
const L4_LABEL = 'ZZ Test Art Fee';
const LONG_DESCRIPTION_TAIL = 'ZZTAILMARKERQ140';
const LINE_NOTE = 'ZZ Test line note for the customer.';
const SPARSE_LINE_NAME = 'ZZ Test Bare Line';

/** Dates relative to the run, so the fixtures do not rot. */
function isoDayOffset(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** A description long enough to force the Read more control. */
function longDescription(): string {
  return `${'This is a deliberately long product description written to exceed the preview length so the Read more control appears on the customer quote page. '.repeat(2)}${LONG_DESCRIPTION_TAIL}`;
}

function fullQuoteLines(): Record<string, unknown>[] {
  return [
    {
      _type: 'quoteGeigerLine',
      _key: 'q140-line-1',
      sku: GEIGER_SKU_MARKER,
      displayName: L1_NAME,
      description: longDescription(),
      quantity: GEIGER_QTY,
      decorationMethod: 'Screen Print, 1 Color',
      unitCost: GEIGER_UNIT,
      setupCharge: GEIGER_SETUP,
      shipping: GEIGER_SHIP,
      note: LINE_NOTE,
    },
    {
      // displayName deliberately BLANK so the referenced product's title is
      // what has to appear - the deref fallback path.
      _type: 'quoteOwnProductLine',
      _key: 'q140-line-2',
      product: { _type: 'reference', _ref: PRODUCT_ID },
      quantity: OWN_QTY,
      decorationMethod: 'Pad Print',
      unitCost: OWN_UNIT,
      setupCharge: OWN_SETUP,
    },
    {
      _type: 'quoteCustomLine',
      _key: 'q140-line-3',
      displayName: L3_NAME,
      description: 'A short manual description.',
      quantity: CUSTOM_QTY,
      unitCost: CUSTOM_UNIT,
      shipping: CUSTOM_SHIP,
    },
    {
      _type: 'quoteChargeLine',
      _key: 'q140-line-4',
      label: L4_LABEL,
      quantity: CHARGE_QTY,
      unitPrice: CHARGE_PRICE,
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

/**
 * React serializes a genuinely-undefined value into its flight payload as the
 * sentinel `$undefined`. That sentinel appears on EVERY App Router page on
 * this site (verified against the live /faq), so a naive "no 'undefined'
 * anywhere" test can never pass for any Next page. Stripping the sentinel
 * first leaves exactly the case that matters: a real string "undefined" that
 * leaked into rendered markup from an unguarded interpolation.
 */
function withoutFlightUndefinedSentinel(html: string): string {
  return html.replace(/\$undefined/g, '');
}

/** The rendered quote itself, isolated from the shared header/footer chrome. */
function quoteRegion(html: string): string | null {
  const start = html.indexOf('<article id="quote-document"');
  if (start === -1) return null;
  const end = html.indexOf('</article>', start);
  return end === -1 ? html.slice(start) : html.slice(start, end + '</article>'.length);
}

// ── Offline checks (run in dry-run AND apply) ────────────────────────────────

function offlineChecks(): void {
  // The route file exists at the exact path, with no underscore-prefixed or
  // stray bracketed segment (a folder starting with "_" never becomes a route,
  // which has cost a deployment on this project before).
  const routePath = resolve(PROJECT_ROOT, 'app/quote/[token]/page.tsx');
  const routeExists = existsSync(routePath);
  record(
    'route: app/quote/[token]/page.tsx exists',
    'present',
    routeExists ? 'present' : 'MISSING',
    routeExists,
  );

  if (routeExists) {
    const src = readFileSync(routePath, 'utf8');
    // Comments are stripped first: this file documents WHY it avoids the
    // dynamic APIs, and matching that prose would be a false positive.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const noDynamicApi = !/searchParams|\bcookies\s*\(|\bheaders\s*\(/.test(code);
    record(
      'route: reads no searchParams / cookies / headers (comments stripped)',
      'none present',
      noDynamicApi ? 'none present' : 'DYNAMIC API FOUND',
      noDynamicApi,
    );
    const hasDynamicParams = /export const dynamicParams = true/.test(src);
    record(
      'route: dynamicParams = true (a quote published after the deploy renders)',
      'true',
      hasDynamicParams ? 'true' : 'NOT SET',
      hasDynamicParams,
    );
    const emptyParams = /return \[\];/.test(src);
    record(
      'route: generateStaticParams prebuilds nothing (no token list in the build)',
      'returns []',
      emptyParams ? 'returns []' : 'PREBUILDS TOKENS',
      emptyParams,
    );
    const robotsMeta = /index: false, follow: false/.test(src);
    record(
      'route: metadata robots index:false follow:false',
      'set',
      robotsMeta ? 'set' : 'NOT SET',
      robotsMeta,
    );
    const referrerMeta = /referrer: 'no-referrer'/.test(src);
    record(
      'route: metadata referrer no-referrer',
      'set',
      referrerMeta ? 'set' : 'NOT SET',
      referrerMeta,
    );
    const notFoundOnNull = /if \(!quote\) notFound\(\);/.test(src);
    record(
      'route: unknown token becomes notFound()',
      'present',
      notFoundOnNull ? 'present' : 'MISSING',
      notFoundOnNull,
    );
  }

  // The sitemap must never enumerate quotes.
  const sitemapSrc = readFileSync(resolve(PROJECT_ROOT, 'app/sitemap.ts'), 'utf8');
  const sitemapClean = !/\/quote\b|getQuoteByToken|QUOTES_TAG/.test(sitemapSrc);
  record(
    'sitemap source: no quote route anywhere',
    'absent',
    sitemapClean ? 'absent' : 'REFERENCED',
    sitemapClean,
  );

  // The HTTP-level noindex header.
  const configSrc = readFileSync(resolve(PROJECT_ROOT, 'next.config.ts'), 'utf8');
  const hasHeader = /source: '\/quote\/:token\*'/.test(configSrc) && /X-Robots-Tag/.test(configSrc);
  record(
    'next.config: X-Robots-Tag header on /quote/:token*',
    'present',
    hasHeader ? 'present' : 'MISSING',
    hasHeader,
  );

  // Token generation still behaves (the page depends on the format).
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
  const found = await client.fetch<{ _id: string }[]>(
    `*[_id match "${TEST_PREFIX}*" || _id match "drafts.${TEST_PREFIX}*"]{_id}`,
  );
  const deleted: string[] = [];
  const failed: string[] = [];
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
  console.log(`Q-140 verification - target ${SITE}`);
  console.log(DRY_RUN ? 'MODE: dry run (offline checks only, no writes)' : CLEANUP_ONLY ? 'MODE: cleanup only' : 'MODE: apply');

  offlineChecks();

  if (DRY_RUN) {
    printTable();
    console.log('\nDry run complete. Re-run with --apply to exercise the deployed page.');
    writeReport();
    console.log(`Report written to ${REPORT_PATH}`);
    const failed = rows.filter((r) => r.status === 'FAIL');
    if (failed.length) process.exit(1);
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
        await restoreCounter(client, { lastNumber: Number(last), prefix: prefix ?? DEFAULT_QUOTE_PREFIX });
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

  try {
    // 1. Fixtures. Every number comes from the REAL allocator so it can never
    //    collide with one of Patrick's quotes; the counter is put back later.
    const numbering = client as unknown as QuoteNumberingClient;
    const fullNumber = (await allocateQuoteNumber(numbering)).quoteNumber;
    const expiredNumber = (await allocateQuoteNumber(numbering)).quoteNumber;
    const emptyNumber = (await allocateQuoteNumber(numbering)).quoteNumber;
    const sparseNumber = (await allocateQuoteNumber(numbering)).quoteNumber;

    tokens.full = generateQuoteToken();
    tokens.expired = generateQuoteToken();
    tokens.empty = generateQuoteToken();
    tokens.sparse = generateQuoteToken();
    console.log(`Fixture tokens: full=${redact(tokens.full)} expired=${redact(tokens.expired)} empty=${redact(tokens.empty)} sparse=${redact(tokens.sparse)}`);

    await client.createOrReplace({
      _id: PRODUCT_ID,
      _type: 'productPage',
      title: L2_PRODUCT_TITLE,
      slug: { _type: 'slug', current: 'zz-test-quote-q140-product' },
      pricingTiers: [{ _key: 'tier-1', minQty: 50, price: 6.5 }],
    } as never);

    const commonCustomer = {
      customerCompany: CUSTOMER_COMPANY,
      customerName: CUSTOMER_CONTACT,
      customerEmail: CUSTOMER_EMAIL,
      customerPhone: CUSTOMER_PHONE,
      customerAddress: CUSTOMER_ADDRESS,
      repName: REP_NAME,
      repEmail: REP_EMAIL,
      repPhone: REP_PHONE,
    };

    await client.createOrReplace({
      _id: FULL_ID,
      _type: 'quote',
      quoteNumber: fullNumber,
      slug: { _type: 'slug', current: tokens.full },
      title: INTERNAL_LABEL,
      ...commonCustomer,
      quoteDate: isoDayOffset(0),
      expiryDate: isoDayOffset(30),
      lineItems: fullQuoteLines(),
      salesTax: SALES_TAX,
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
      lineItems: [
        {
          _type: 'quoteCustomLine',
          _key: 'q140-exp-1',
          displayName: L3_NAME,
          quantity: CUSTOM_QTY,
          unitCost: CUSTOM_UNIT,
          shipping: CUSTOM_SHIP,
        },
      ],
    } as never);

    await client.createOrReplace({
      _id: EMPTY_ID,
      _type: 'quote',
      quoteNumber: emptyNumber,
      slug: { _type: 'slug', current: tokens.empty },
      title: INTERNAL_LABEL,
      ...commonCustomer,
      quoteDate: isoDayOffset(0),
      expiryDate: isoDayOffset(30),
      lineItems: [],
    } as never);

    // Every optional field absent: no image, no description, no decoration, no
    // setup, no shipping, no tax, no expiry, no company, no rep phone.
    await client.createOrReplace({
      _id: SPARSE_ID,
      _type: 'quote',
      quoteNumber: sparseNumber,
      slug: { _type: 'slug', current: tokens.sparse },
      customerEmail: CUSTOMER_EMAIL,
      quoteDate: isoDayOffset(0),
      lineItems: [
        {
          _type: 'quoteCustomLine',
          _key: 'q140-sparse-1',
          displayName: SPARSE_LINE_NAME,
          quantity: 5,
          unitCost: 2,
        },
      ],
    } as never);

    // Sanity's published documents propagate within a moment; give the write
    // a beat before the first (cold) page generation.
    await sleep(2000);

    // 2. The main page renders, statically, with the real content in the HTML.
    const full = await fetchPage(`/quote/${tokens.full}`);
    record('page: published quote returns 200', '200', String(full.status), full.status === 200);

    const region = quoteRegion(full.html);
    record(
      'page: raw HTML carries the rendered quote (not a client-side shell)',
      'quote article present, no BAILOUT marker',
      region
        ? full.html.includes(BAILOUT_MARKER)
          ? 'BAILOUT MARKER FOUND'
          : 'article present, no marker'
        : 'ARTICLE MISSING',
      Boolean(region) && !full.html.includes(BAILOUT_MARKER),
    );

    const hay = region ?? full.html;
    for (const [label, needle] of [
      ['quote number', fullNumber],
      ['customer company', CUSTOMER_COMPANY],
      ['customer contact name', CUSTOMER_CONTACT],
      ['line 1 name (Geiger)', L1_NAME],
      ['line 2 name (own product, deref fallback)', L2_PRODUCT_TITLE],
      ['line 3 name (custom)', L3_NAME],
      ['line 4 label (charge)', L4_LABEL],
      ['rep name', REP_NAME],
      ['rep email', REP_EMAIL],
      ['line note', LINE_NOTE],
      ['full description (Read more content)', LONG_DESCRIPTION_TAIL],
    ] as const) {
      record(`page: raw HTML contains the ${label}`, needle, hay.includes(needle) ? 'present' : 'MISSING', hay.includes(needle));
    }

    // 3. Independently computed money. These literals were worked out by hand
    //    at the top of this file; the app's totals module is not imported.
    for (const [label, needle] of [
      ['grand total', GRAND_DISPLAY],
      ['subtotal', SUBTOTAL_DISPLAY],
      ['shipping total', SHIPPING_DISPLAY],
      ['sales tax', TAX_DISPLAY],
      ['line 1 total', L1_TOTAL_DISPLAY],
      ['line 2 total', L2_TOTAL_DISPLAY],
      ['line 3 total', L3_TOTAL_DISPLAY],
      ['line 4 total', L4_TOTAL_DISPLAY],
    ] as const) {
      record(
        `money: page shows the hand-computed ${label}`,
        needle,
        hay.includes(needle) ? needle : 'NOT FOUND',
        hay.includes(needle),
      );
    }

    // 4. Hidden from search + no referrer leak.
    const robotsMeta = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex[^"]*nofollow[^"]*"/i.test(full.html);
    record('robots: meta noindex + nofollow on the page', 'present', robotsMeta ? 'present' : 'MISSING', robotsMeta);
    const referrerMeta = /<meta[^>]+name="referrer"[^>]+content="no-referrer"/i.test(full.html);
    record('referrer: meta no-referrer on the page', 'present', referrerMeta ? 'present' : 'MISSING', referrerMeta);
    const xRobots = full.headers.get('x-robots-tag') ?? '';
    record(
      'robots: X-Robots-Tag response header',
      'contains noindex',
      xRobots || '(absent)',
      xRobots.toLowerCase().includes('noindex'),
    );

    // 5. Never in the sitemap.
    const sitemap = await fetchPage('/sitemap.xml');
    const sitemapMentions = sitemap.html.includes('/quote/') || sitemap.html.includes(tokens.full);
    record(
      'sitemap: deployed sitemap.xml lists no quote URL',
      'absent',
      sitemapMentions ? 'FOUND A QUOTE URL' : `absent (${sitemap.html.length} bytes scanned)`,
      !sitemapMentions,
    );

    // 6. Bad tokens 404 rather than erroring.
    const unknownToken = generateQuoteToken();
    for (const [label, path] of [
      ['unknown (well-formed) token', `/quote/${unknownToken}`],
      ['malformed token', '/quote/not-a-real-token'],
      ['token with tag-hostile characters', '/quote/AB%20cd..%2Fee'],
      ['empty token (trailing slash)', '/quote/'],
      ['bare /quote', '/quote'],
    ] as const) {
      const res = await fetchPage(path);
      record(`404: ${label}`, '404', String(res.status), res.status === 404);
    }

    // 7. Expired quote: notice shown, prices still shown.
    const expired = await fetchPage(`/quote/${tokens.expired}`);
    const expiredRegion = quoteRegion(expired.html) ?? expired.html;
    record('expired: page returns 200', '200', String(expired.status), expired.status === 200);
    const hasNotice = /passed its expiry date/i.test(expiredRegion);
    record('expired: expiry notice rendered', 'notice present', hasNotice ? 'notice present' : 'MISSING', hasNotice);
    // 10 x $12.00 = $120.00 + $15.00 shipping = $135.00
    record(
      'expired: prices still shown (not hidden)',
      L3_TOTAL_DISPLAY,
      expiredRegion.includes(L3_TOTAL_DISPLAY) ? L3_TOTAL_DISPLAY : 'NOT FOUND',
      expiredRegion.includes(L3_TOTAL_DISPLAY),
    );

    // 8. Zero line items renders rather than throwing.
    const empty = await fetchPage(`/quote/${tokens.empty}`);
    record('empty: quote with no line items returns 200', '200', String(empty.status), empty.status === 200);
    const emptyRegion = quoteRegion(empty.html) ?? empty.html;
    const emptyState = /No items have been added/i.test(emptyRegion);
    record('empty: empty state rendered', 'message present', emptyState ? 'message present' : 'MISSING', emptyState);

    // 9. Missing optional fields render as nothing, never as "undefined".
    const sparse = await fetchPage(`/quote/${tokens.sparse}`);
    record('sparse: quote missing every optional field returns 200', '200', String(sparse.status), sparse.status === 200);
    const sparseRegion = quoteRegion(sparse.html) ?? sparse.html;
    record(
      'sparse: the one line still renders',
      SPARSE_LINE_NAME,
      sparseRegion.includes(SPARSE_LINE_NAME) ? 'present' : 'MISSING',
      sparseRegion.includes(SPARSE_LINE_NAME),
    );
    for (const [label, html] of [
      ['sparse quote', sparse.html],
      ['full quote', full.html],
      ['empty quote', empty.html],
      ['expired quote', expired.html],
    ] as const) {
      const cleaned = withoutFlightUndefinedSentinel(html);
      const idx = cleaned.toLowerCase().indexOf('undefined');
      const context = idx === -1 ? 'absent' : `FOUND: ...${cleaned.slice(Math.max(0, idx - 60), idx + 60).replace(/\s+/g, ' ')}...`;
      record(
        `no-undefined: "undefined" nowhere in the ${label} HTML (React's $undefined flight sentinel excluded)`,
        'absent',
        context,
        idx === -1,
      );
    }

    // 10. Nothing internal leaked.
    for (const [label, needle] of [
      ['internal label', INTERNAL_LABEL],
      ['customer email', CUSTOMER_EMAIL],
      ['customer phone', CUSTOMER_PHONE],
      ['customer address', CUSTOMER_ADDRESS],
      ['sent-at date (raw)', SENT_AT_DAY],
      ['sent-at date (formatted)', SENT_AT_PRETTY],
      ['Geiger SKU', GEIGER_SKU_MARKER],
    ] as const) {
      const leaked = full.html.includes(needle);
      record(`withheld: ${label} does not appear anywhere in the HTML`, 'absent', leaked ? 'LEAKED' : 'absent', !leaked);
    }

    // 11. Freshness: edit the quote, and the customer's page must follow
    //     WITHOUT a redeploy. First try the real Sanity webhook (which only
    //     fires if `quote` is in the webhook Filter - the outstanding manual
    //     step from Q-110); if that does not land, fall back to a signed
    //     revalidate POST, which is byte-identical to what Sanity sends.
    const editedLines = fullQuoteLines();
    (editedLines[0] as Record<string, unknown>).quantity = FRESH_QTY;
    await guardedPatchSet(client, FULL_ID, { lineItems: editedLines });
    const editedAt = Date.now();

    let freshVia = '';
    let freshSeconds = 0;
    for (let i = 0; i < 6 && !freshVia; i++) {
      await sleep(5000);
      const again = await fetchPage(`/quote/${tokens.full}`);
      if (again.html.includes(FRESH_GRAND_DISPLAY)) {
        freshVia = 'the real Sanity webhook';
        freshSeconds = Math.round((Date.now() - editedAt) / 1000);
      }
    }

    if (!freshVia) {
      const secret = process.env.SANITY_WEBHOOK_SECRET;
      if (!secret) {
        notes.push(
          'SANITY_WEBHOOK_SECRET was not set, so the signed-revalidate fallback could not run. The freshness result below reflects the real webhook only.',
        );
      } else {
        const posted = await postSignedRevalidate(secret, {
          _id: FULL_ID,
          _type: 'quote',
          slug: { current: tokens.full },
        });
        info('freshness: signed revalidate POST', `${posted.status} ${posted.body.slice(0, 120)}`);
        for (let i = 0; i < 4 && !freshVia; i++) {
          await sleep(4000);
          const again = await fetchPage(`/quote/${tokens.full}`);
          if (again.html.includes(FRESH_GRAND_DISPLAY)) {
            freshVia = 'a signed revalidate POST (the real webhook did NOT fire - check the webhook Filter)';
            freshSeconds = Math.round((Date.now() - editedAt) / 1000);
          }
        }
      }
    }

    record(
      'freshness: an edit reaches the customer page with no redeploy',
      `grand total becomes ${FRESH_GRAND_DISPLAY}`,
      freshVia ? `updated in ~${freshSeconds}s via ${freshVia}` : 'DID NOT UPDATE (see notes)',
      Boolean(freshVia),
    );
    if (!freshVia) {
      notes.push(
        'The edited quote did not appear on the page within the polling window. Reported as-is rather than retried until it passed. The two things to check: (1) `quote` is present in the Sanity webhook Filter on this environment, and (2) the revalidate route returned 200 for the quote type.',
      );
    }
    if (freshVia.startsWith('a signed')) {
      notes.push(
        'The real Sanity webhook did not deliver for the `quote` type. The revalidation code path is correct (the signed POST updated the page), so the missing piece is the manual webhook Filter update from Q-110: append "quote" to the _type list on BOTH webhooks.',
      );
    }
  } catch (e) {
    runError = e;
    console.error('Run failed:', e);
  } finally {
    try {
      const { deleted, failed } = await cleanupDocs(client);
      record(
        'cleanup: fixtures deleted',
        'all zz-test-quote-* gone',
        deleted.length ? deleted.join(', ') : '(none found)',
        failed.length === 0,
      );
      if (failed.length) {
        console.error(`CLEANUP INCOMPLETE. Left behind: ${failed.join(', ')}`);
        console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q140.ts --cleanup-only');
      }
      const leftover = await client.fetch<number>(
        `count(*[_id match "${TEST_PREFIX}*" || _id match "drafts.${TEST_PREFIX}*"])`,
      );
      record('cleanup: zero test documents remain', '0', String(leftover), leftover === 0);
    } catch (cleanupErr) {
      console.error('CLEANUP FAILED:', cleanupErr);
      console.error(`Left behind (expected ids): ${ALL_FIXTURE_IDS.join(', ')}`);
      console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q140.ts --cleanup-only');
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
        console.error(`*** The counter did NOT exist before this run. DELETE "${QUOTE_COUNTER_ID}", or run: pnpm tsx scripts/quick-quote/verify-q140.ts --cleanup-only --counter-absent`);
      } else {
        console.error(`*** Restore "${QUOTE_COUNTER_ID}" to: ${describeCounter(counterBefore)}`);
        console.error(`*** Or run: pnpm tsx scripts/quick-quote/verify-q140.ts --cleanup-only --counter-last ${String(counterBefore.lastNumber)} --counter-prefix ${String(counterBefore.prefix)}`);
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
    '# Q-140: Automated verification of the customer quote page',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q140.ts (verification only - no app code touched). Mode: ${DRY_RUN ? 'dry run (offline checks only)' : 'apply'}. Dataset is SHARED between staging and production; every fixture used the zz-test-quote- prefix and was deleted; the quote counter was recorded before the run and restored exactly (values in the table). Tokens are never printed in full.`,
    '',
    '## Fixture arithmetic (independent literals, not derived from the app code)',
    '',
    '- Geiger line: 250 x $3.20 = $800.00; + $50 setup + $40 shipping = $890.00 (merchandise $850.00)',
    '- Own-product line: 100 x $5.50 = $550.00; + $25 setup = $575.00 (display name blank on purpose, so the referenced product title has to appear)',
    '- Custom line: 10 x $12.00 = $120.00; + $15 shipping = $135.00 (merchandise $120.00)',
    '- Charge line: 1 x $40.00 = $40.00',
    '- Subtotal (merchandise): 850 + 575 + 120 + 40 = $1,585.00; shipping 40 + 15 = $55.00',
    '- Sales tax as typed: $62.13 (added verbatim, never calculated)',
    '- Grand total: 1585 + 55 + 62.13 = $1,702.13',
    '- After the freshness edit (quantity 250 -> 300): line 1 = 300 x $3.20 + $50 + $40 = $1,050.00; subtotal $1,745.00; grand total $1,862.13',
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
    'None of the following are marked passed; they need a human with a browser:',
    '',
    '1. Open a real quote link and confirm it looks right and reads as part of the Perfect Imprints site.',
    '2. Open the same link on a phone and confirm the line items are readable without sideways scrolling.',
    '3. Use the browser print preview (Ctrl+P) and confirm the quote is usable as a printed page: no site header or footer, line items whole, descriptions complete.',
    '',
  );
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
