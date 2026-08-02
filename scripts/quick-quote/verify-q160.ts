/**
 * Q-160: automated verification of the real quote PDF, the status banner, and
 * the quote lifecycle, against the DEPLOYED staging site and the REAL shared
 * Sanity dataset.
 *
 *   pnpm tsx scripts/quick-quote/verify-q160.ts                 # dry run: offline checks + a LOCAL render, no Sanity writes
 *   pnpm tsx scripts/quick-quote/verify-q160.ts --apply         # real run: create fixtures, drive the deployed route, verify, clean up
 *   pnpm tsx scripts/quick-quote/verify-q160.ts --cleanup-only  # sweep every zz-test-quote-* document AND its responses
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *   ... --cleanup-only --counter-absent                         # also delete the quoteCounter (it did not exist before)
 *   ... --cleanup-only --counter-last 1002 --counter-prefix Q-  # also restore the counter to explicit values
 *
 * VERIFICATION ONLY - this script changes no app code. Same conventions as
 * scripts/quick-quote/verify-q150.ts: hard zz-test guard re-checked at the
 * moment of deletion, deterministic ids, cleanup in a finally that survives a
 * crash, the quote counter recorded before and restored exactly, and every
 * expected value derived HERE rather than imported from the module under test.
 *
 * THE ARITHMETIC IS DONE BY HAND. The grand total this script looks for in the
 * PDF is written below as a literal with the working shown. lib/quotes/
 * quote-totals.ts is never imported, so the document cannot check itself.
 *
 * TOKENS ARE NEVER PRINTED IN FULL - first six characters plus a marker.
 *
 * TEST EMAILS GO NOWHERE ON PURPOSE. Every fixture's rep address is on the
 * reserved .invalid TLD, which can never be delivered to and never bounces into
 * a real mailbox. Earlier runs on this project put bounce messages into
 * Patrick's inbox; that is why this is deliberate rather than careless.
 *
 * Requires SANITY_API_TOKEN (write scope) in .env.local for --apply.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Module } from 'node:module';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

import {
  DEFAULT_FIRST_QUOTE_NUMBER,
  DEFAULT_QUOTE_PREFIX,
  QUOTE_COUNTER_ID,
  QUOTE_COUNTER_TYPE,
  allocateQuoteNumber,
  type QuoteNumberingClient,
} from '../../lib/quotes/numbering';
import { generateQuoteToken } from '../../lib/quotes/token';

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
// locally); this task verifies the STAGING deployment. Q-101/Q-111/Q-140/Q-150.
const SITE = (flagValue('--site') ?? 'https://dev.perfectimprints.com').replace(/\/$/, '');

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-160-verification-report.md');
const PDF_ROUTE = '/api/quote-pdf';
/** Generated sample PDFs go OUTSIDE the repo, so nothing untracked is left behind. */
const LOCAL_OUT_DIR = join(tmpdir(), 'pi-quote-pdf-q160');

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

/** The guard is re-checked against the STORED document at the moment of deletion. */
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

/** A response has a random id, so its guard is "points at a zz-test-quote-* quote". */
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

// ── A minimal PDF text extractor ─────────────────────────────────────────────
//
// Deliberately hand written rather than a new dependency: this task is allowed
// exactly ONE new package (the renderer), and proving what is inside a PDF must
// not smuggle a second one in.
//
// The renderer embeds the standard Helvetica faces as subsets and draws text as
// HEX strings inside a TJ array, e.g. `[<49> -80 <54> -80 <45>] TJ` for "ITE",
// with the codes equal to their ASCII values. Each stream is Flate compressed.
// Plain parenthesised literals are handled too, for any producer that emits
// them, but the hex form is what these documents actually use.

/** Decodes the PDF string escapes that appear in a content stream literal. */
function decodePdfLiteral(raw: string): string {
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, esc: string) => {
    switch (esc) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '(':
        return '(';
      case ')':
        return ')';
      case '\\':
        return '\\';
      default:
        return String.fromCharCode(parseInt(esc, 8));
    }
  });
}

/** `<49 54 45>` to "ITE". Odd trailing nibbles are ignored, never guessed at. */
function hexToText(raw: string): string {
  const hex = raw.replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

type Matrix = [number, number, number, number, number, number];

/** PDF `cm` premultiplies: CTM' = M x CTM, in the row-vector convention. */
function multiply(m: Matrix, c: Matrix): Matrix {
  return [
    m[0] * c[0] + m[1] * c[2],
    m[0] * c[1] + m[1] * c[3],
    m[2] * c[0] + m[3] * c[2],
    m[2] * c[1] + m[3] * c[3],
    m[4] * c[0] + m[5] * c[2] + c[4],
    m[4] * c[1] + m[5] * c[3] + c[5],
  ];
}

interface PdfText {
  /** Show operations joined with a space - reads like the page. */
  text: string;
  /** Everything concatenated with nothing, so kerned runs still match. */
  dense: string;
  pages: number;
  streams: number;
  /**
   * The leftmost and rightmost x at which any text run STARTS, in PDF points.
   *
   * This is how the spike's layout bug is caught without eyes: a missing
   * `flexBasis: 0` lets one long product name widen the item column and push
   * the money columns past the right margin, and their x jumps accordingly.
   * (It is the start of each run, not its full extent, so it is a strong signal
   * rather than a proof - the visual check stays on the manual list.)
   */
  minTextX: number;
  maxTextX: number;
}

function extractPdfText(pdf: Buffer): PdfText {
  const latin = pdf.toString('latin1');
  const pieces: string[] = [];
  let streams = 0;
  let minTextX = Number.POSITIVE_INFINITY;
  let maxTextX = Number.NEGATIVE_INFINITY;

  const streamRe = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(latin)) !== null) {
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end === -1) continue;
    let content = '';
    try {
      content = inflateSync(Buffer.from(latin.slice(start, end), 'latin1')).toString('latin1');
      streams += 1;
    } catch {
      continue; // an image or an uncompressed stream - nothing to read here
    }
    // A show operation is either an array of runs followed by TJ, or a single
    // string followed by Tj. Runs inside one array are ONE word (the numbers
    // between them are kerning), so they are joined with nothing.
    const showRe = /\[([^\]]*)\]\s*TJ|<([0-9A-Fa-f\s]*)>\s*Tj|\(((?:\\.|[^\\()])*)\)\s*Tj/g;
    let show: RegExpExecArray | null;
    while ((show = showRe.exec(content)) !== null) {
      if (show[2] !== undefined) {
        pieces.push(hexToText(show[2]));
        continue;
      }
      if (show[3] !== undefined) {
        pieces.push(decodePdfLiteral(show[3]));
        continue;
      }
      const parts: string[] = [];
      const runRe = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\()])*)\)/g;
      let run: RegExpExecArray | null;
      while ((run = runRe.exec(show[1])) !== null) {
        parts.push(run[1] !== undefined ? hexToText(run[1]) : decodePdfLiteral(run[2] ?? ''));
      }
      pieces.push(parts.join(''));
    }

    // A second pass over the same stream, tracking the graphics state, to find
    // where on the page each run was actually drawn.
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    let tm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    const opRe = /(-?[\d.]+(?:\s+-?[\d.]+){5})\s+(cm|Tm)|\bq\b|\bQ\b|TJ|Tj/g;
    let op: RegExpExecArray | null;
    while ((op = opRe.exec(content)) !== null) {
      if (op[0] === 'q') {
        stack.push([...ctm] as Matrix);
        continue;
      }
      if (op[0] === 'Q') {
        ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        continue;
      }
      if (op[0] === 'TJ' || op[0] === 'Tj') {
        const x = tm[4] * ctm[0] + tm[5] * ctm[2] + ctm[4];
        if (Number.isFinite(x)) {
          if (x < minTextX) minTextX = x;
          if (x > maxTextX) maxTextX = x;
        }
        continue;
      }
      const nums = op[1].trim().split(/\s+/).map(Number) as Matrix;
      if (op[2] === 'cm') ctm = multiply(nums, ctm);
      else tm = nums;
    }
  }

  // "/Type /Page" but not "/Type /Pages".
  const pages = (latin.match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
  return {
    text: pieces.join(' '),
    dense: pieces.join(''),
    pages,
    streams,
    minTextX: Number.isFinite(minTextX) ? minTextX : 0,
    maxTextX: Number.isFinite(maxTextX) ? maxTextX : 0,
  };
}

/** US Letter is 612 points wide; the document uses a 36 point margin. */
const PAGE_WIDTH_PT = 612;
const PAGE_MARGIN_PT = 36;

/** Present in either reading of the extracted text, whitespace-insensitive. */
function pdfContains(extracted: PdfText, needle: string): boolean {
  const squash = (s: string) => s.replace(/\s+/g, '');
  return (
    extracted.text.includes(needle) ||
    extracted.dense.includes(needle) ||
    squash(extracted.text).includes(squash(needle)) ||
    squash(extracted.dense).includes(squash(needle))
  );
}

function isPdf(bytes: Buffer): boolean {
  return bytes.length > 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * THE SPIKE'S BUG, checked without eyes. A 130-character product name is on the
 * fixture precisely so that a missing `flexBasis: 0` would widen the item
 * column and shove the money columns past the right margin. If every text run
 * starts inside the margins, that did not happen.
 */
function recordLayoutExtent(prefix: string, extracted: PdfText): void {
  const right = PAGE_WIDTH_PT - PAGE_MARGIN_PT;
  const inside = extracted.minTextX >= 0 && extracted.maxTextX <= right;
  record(
    `${prefix}: a 130-character product name does not push anything off the page`,
    `every text run starts between 0 and ${right} pt`,
    `${extracted.minTextX.toFixed(1)} to ${extracted.maxTextX.toFixed(1)} pt`,
    inside,
  );
}

// ── Fixture inputs + INDEPENDENT arithmetic ──────────────────────────────────
//
// Worked out by hand and written as literals. lib/quotes/quote-totals.ts is
// never imported here: the totals module is what the PDF uses, so importing it
// would be the document marking its own homework.
//
//   16 product lines, each: 100 x $2.50 = $250.00; + $25 setup + $10 shipping
//     line total   = $285.00      (16 x $285.00 = $4,560.00)
//     merchandise  = $275.00 each (16 x $275.00 = $4,400.00)
//     shipping     = $10.00 each  (16 x $10.00  =   $160.00)
//   1 charge line: 2 x $40.00 = $80.00
//   subtotal     = $4,400.00 + $80.00 = $4,480.00   (shipping excluded)
//   shipping     = $160.00
//   sales tax    = $45.25 (typed on the quote, never calculated)
//   GRAND TOTAL  = $4,480.00 + $160.00 + $45.25 = $4,685.25

const PRODUCT_LINE_COUNT = 16;
const LINE_QTY = 100;
const LINE_UNIT = 2.5;
const LINE_SETUP = 25;
const LINE_SHIPPING = 10;
const CHARGE_QTY = 2;
const CHARGE_UNIT = 40;
const SALES_TAX = 45.25;

const LINE_TOTAL_DISPLAY = '$285.00';
const CHARGE_TOTAL_DISPLAY = '$80.00';
const SUBTOTAL_DISPLAY = '$4,480.00';
const SHIPPING_DISPLAY = '$160.00';
const TAX_DISPLAY = '$45.25';
const GRAND_TOTAL_DISPLAY = '$4,685.25';

// The expired fixture: 10 x $5.00 = $50.00, no setup, no shipping, no tax.
const EXPIRED_TOTAL_DISPLAY = '$50.00';

const LIVE_ID = 'zz-test-quote-q160-live';
const EXPIRED_ID = 'zz-test-quote-q160-expired';
const ALL_FIXTURE_IDS = [LIVE_ID, EXPIRED_ID];

// Values that must NEVER reach the PDF.
const INTERNAL_LABEL = 'ZZ Test INTERNAL-LABEL-MUST-NOT-PRINT-Q160';
const CUSTOMER_EMAIL = 'zz-test-customer-q160@example.invalid';
const CUSTOMER_PHONE = '555-0160-DO-NOT-PRINT';
const CUSTOMER_ADDRESS = '999 ZZ Test Withheld Street, Nowhere';
const SENT_AT = '2021-02-03T04:05:06Z';
const SENT_AT_DAY = '2021-02-03';
const GEIGER_SKU = 'ZZTESTSKU501003';

// Values that MUST reach the PDF.
const CUSTOMER_COMPANY = 'ZZ Test Buyer Company Q160';
const REP_NAME = 'ZZ Test Rep';
// Reserved TLD: undeliverable by definition, so no notification from this run
// can ever land in (or bounce into) a real mailbox. Deliberate, see the header.
const REP_EMAIL = 'zz-test-rep-q160@example.invalid';

/** A deliberately awkward product name - the spike's flexBasis trap needs one. */
const LONG_NAME =
  'ZZ Test Line 01 Premium Double Walled Vacuum Insulated Stainless Steel Travel Tumbler With Sliding Lid And Full Colour Wrap Decoration';
const LONG_DESCRIPTION =
  'ZZ Test description. Double walled 18/8 stainless steel with a copper lining, a press fit sliding lid, and a powder coated exterior that takes a full colour wrap. Keeps drinks hot for six hours and cold for eighteen. Supplied in a recycled kraft carton, twenty four units per carton, decorated one position as standard with additional positions quoted separately on request.';
const LONG_NOTE =
  'ZZ Test line note. Artwork must be supplied as vector EPS or AI with fonts converted to outlines. A digital proof is issued within one working day of receiving usable artwork and production begins once the proof is approved in writing.';

/**
 * A REAL Geiger CDN image, carrying the `format=webp` parameter every catalog
 * URL carries. This is the trap the spike found: the renderer decodes JPEG and
 * PNG only, and this URL has always worked purely because the CDN chose to
 * content-negotiate. Taken verbatim (entity-decoded) from data/geiger/products.json.
 */
const WEBP_IMAGE_URL =
  'https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?format=webp&thumbnail=275&w=275&h=275';
/** A host that does not resolve: the dead-image path, on purpose. */
const BROKEN_IMAGE_URL = 'https://zz-test-not-a-real-host-q160.invalid/missing.jpg';

function isoDayOffset(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function lineName(index: number): string {
  return index === 0 ? LONG_NAME : `ZZ Test Line ${String(index + 1).padStart(2, '0')} Item`;
}

/** The awkward fixture: long name, long text, a webp URL, a dead URL, many rows. */
function fixtureLines(): Record<string, unknown>[] {
  const lines: Record<string, unknown>[] = [];
  for (let i = 0; i < PRODUCT_LINE_COUNT; i++) {
    const base: Record<string, unknown> = {
      _key: `q160-line-${i}`,
      quantity: LINE_QTY,
      unitCost: LINE_UNIT,
      setupCharge: LINE_SETUP,
      shipping: LINE_SHIPPING,
      displayName: lineName(i),
      decorationMethod: 'Screen Print, 2 Colors',
    };
    if (i === 0) {
      lines.push({
        ...base,
        _type: 'quoteGeigerLine',
        sku: GEIGER_SKU,
        imageUrl: WEBP_IMAGE_URL,
        description: LONG_DESCRIPTION,
        note: LONG_NOTE,
      });
    } else if (i === 1) {
      lines.push({
        ...base,
        _type: 'quoteGeigerLine',
        sku: GEIGER_SKU,
        imageUrl: BROKEN_IMAGE_URL,
        description: 'ZZ Test line with a dead image URL.',
      });
    } else {
      lines.push({ ...base, _type: 'quoteCustomLine' });
    }
  }
  lines.push({
    _key: 'q160-charge',
    _type: 'quoteChargeLine',
    label: 'ZZ Test Art Fee',
    quantity: CHARGE_QTY,
    unitPrice: CHARGE_UNIT,
  });
  return lines;
}

function expiredLines(): Record<string, unknown>[] {
  return [
    {
      _key: 'q160-expired-line',
      _type: 'quoteCustomLine',
      displayName: 'ZZ Test Expired Line Item',
      quantity: 10,
      unitCost: 5,
    },
  ];
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

interface PdfResult {
  status: number;
  ms: number;
  bytes: Buffer;
  contentType: string;
  disposition: string;
  bodyText: string;
}

async function fetchPdf(token: string): Promise<PdfResult> {
  const started = Date.now();
  const res = await fetch(`${SITE}${PDF_ROUTE}/${encodeURIComponent(token)}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    ms: Date.now() - started,
    bytes: buffer,
    contentType: res.headers.get('content-type') ?? '',
    disposition: res.headers.get('content-disposition') ?? '',
    bodyText: buffer.length < 4096 ? buffer.toString('utf8') : '',
  };
}

/**
 * A baseline round trip to a route on the SAME deployment that does almost no
 * work (a malformed token is rejected before any Sanity call). Subtracting it
 * from the PDF timing separates network latency from the actual generation.
 */
async function baselineRoundTripMs(): Promise<number> {
  const body = new FormData();
  body.set('token', 'not-a-real-token');
  body.set('kind', 'viewed');
  const started = Date.now();
  await fetch(`${SITE}/api/quote-response`, { method: 'POST', body });
  return Date.now() - started;
}

async function fetchPage(path: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${SITE}${path}`, { headers: { 'cache-control': 'no-cache' } });
  return { status: res.status, html: await res.text() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const BAILOUT_MARKER = 'BAILOUT_TO_CLIENT_SIDE_RENDERING';

function quoteRegion(html: string): string | null {
  const start = html.indexOf('<article id="quote-document"');
  if (start === -1) return null;
  const end = html.indexOf('</article>', start);
  return end === -1 ? html.slice(start) : html.slice(start, end + '</article>'.length);
}

// ── Offline checks ───────────────────────────────────────────────────────────

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function offlineChecks(): void {
  // 1. THE ROUTE PATH. A folder starting with an underscore never becomes a
  //    route, and that exact mistake cost a deployment during the PDF spike.
  const routePath = resolve(PROJECT_ROOT, 'app/api/quote-pdf/[token]/route.ts');
  const routeExists = existsSync(routePath);
  record(
    'route: app/api/quote-pdf/[token]/route.ts exists',
    'present',
    routeExists ? 'present' : 'MISSING',
    routeExists,
  );
  const segments = 'api/quote-pdf/[token]'.split('/');
  const badSegment = segments.find((s) => s.startsWith('_') || (s.startsWith('[') && !s.endsWith(']')));
  record(
    'route: no underscore-prefixed or malformed segment in the path',
    'none',
    badSegment ? `BAD SEGMENT "${badSegment}"` : 'none',
    !badSegment,
  );

  if (routeExists) {
    const src = readFileSync(routePath, 'utf8');
    const code = stripComments(src);
    record(
      'route: nodejs runtime',
      'set',
      /export const runtime = 'nodejs'/.test(code) ? 'set' : 'NOT SET',
      /export const runtime = 'nodejs'/.test(code),
    );
    record(
      'route: force-dynamic (never prerendered, so it cannot affect a page)',
      'set',
      /export const dynamic = 'force-dynamic'/.test(code) ? 'set' : 'NOT SET',
      /export const dynamic = 'force-dynamic'/.test(code),
    );
    const durationMatch = /export const maxDuration = (\d+)/.exec(code);
    record(
      'route: a longer maxDuration is set (the bulk-import precedent)',
      'a number',
      durationMatch ? durationMatch[1] : 'NOT SET',
      Boolean(durationMatch),
    );
    record(
      'route: rate limited with the shared limiter (downloads are repeatable, so generously)',
      'createRateLimiter used',
      /createRateLimiter/.test(code) ? 'createRateLimiter used' : 'NOT RATE LIMITED',
      /createRateLimiter/.test(code),
    );
    const limitMatch = /createRateLimiter\(\{ max: (\d+)/.exec(code);
    if (limitMatch) info('route: download allowance', `${limitMatch[1]} per hour per IP and token`);
    record(
      'route: the token is validated before any Sanity call',
      'isQuoteToken guard',
      /isQuoteToken\(token\)/.test(code) ? 'isQuoteToken guard' : 'MISSING',
      /isQuoteToken\(token\)/.test(code),
    );
    record(
      'route: resolves the quote SERVER-SIDE, trusting nothing else from the request',
      'getQuoteByToken(token)',
      /getQuoteByToken\(token\)/.test(code) ? 'getQuoteByToken(token)' : 'MISSING',
      /getQuoteByToken\(token\)/.test(code),
    );
    record(
      'route: never patches or creates a document (a download writes nothing)',
      'no mutation',
      /\.patch\(|\.create|createOrReplace/.test(code) ? 'A MUTATION WAS FOUND' : 'no mutation',
      !/\.patch\(|\.create|createOrReplace/.test(code),
    );
    record(
      'route: a private document is never put in a shared cache',
      'Cache-Control private/no-store',
      /private, no-store/.test(code) ? 'Cache-Control private/no-store' : 'NOT SET',
      /private, no-store/.test(code),
    );
    record(
      'route: tells crawlers the same thing the page does',
      'X-Robots-Tag noindex',
      /X-Robots-Tag/.test(code) ? 'X-Robots-Tag noindex' : 'NOT SET',
      /X-Robots-Tag/.test(code),
    );
    record(
      'route: a render failure returns a clean message, never a raw error',
      'try/catch around the render',
      /try \{[\s\S]*renderQuotePdf[\s\S]*catch/.test(code) ? 'try/catch around the render' : 'NOT WRAPPED',
      /try \{[\s\S]*renderQuotePdf[\s\S]*catch/.test(code),
    );
  }

  // 2. THE DEPENDENCY, and where it is allowed to appear.
  const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const pinned = pkg.dependencies?.['@react-pdf/renderer'];
  record(
    'dependency: @react-pdf/renderer pinned to the exact version the spike validated',
    '4.5.1',
    pinned ?? '(absent)',
    pinned === '4.5.1',
  );

  // 3. THE IMAGE RULES the spike paid for.
  const modelPath = resolve(PROJECT_ROOT, 'lib/quotes/quote-pdf-model.ts');
  if (existsSync(modelPath)) {
    const code = stripComments(readFileSync(modelPath, 'utf8'));
    record(
      'images: an undecodable format parameter is stripped from the URL',
      'format deleted',
      /searchParams\.delete\('format'\)/.test(code) ? 'format deleted' : 'NOT STRIPPED',
      /searchParams\.delete\('format'\)/.test(code),
    );
  }
  const imagesPath = resolve(PROJECT_ROOT, 'lib/quotes/pdf/quote-pdf-images.ts');
  if (existsSync(imagesPath)) {
    const code = stripComments(readFileSync(imagesPath, 'utf8'));
    const timeoutMatch = /QUOTE_PDF_IMAGE_TIMEOUT_MS = ([\d_]+)/.exec(code);
    record(
      'images: fetched with an EXPLICIT timeout, not left to the renderer',
      'AbortSignal.timeout',
      /AbortSignal\.timeout/.test(code) ? 'AbortSignal.timeout' : 'NO TIMEOUT',
      /AbortSignal\.timeout/.test(code),
    );
    if (timeoutMatch) info('images: per-image timeout', `${timeoutMatch[1].replace(/_/g, '')} ms`);
    record(
      'images: fetched in parallel, so N slow images cost one wait and not N',
      'Promise.all',
      /Promise\.all/.test(code) ? 'Promise.all' : 'SERIAL',
      /Promise\.all/.test(code),
    );
    record(
      'images: the bytes are verified as JPEG or PNG by magic number',
      'detectFormat present',
      /0xff && bytes\[1\] === 0xd8/.test(code) ? 'detectFormat present' : 'NOT VERIFIED',
      /0xff && bytes\[1\] === 0xd8/.test(code),
    );
    record(
      'images: a failure resolves to null, so a missing photo never fails the download',
      'returns null',
      /return null;/.test(code) ? 'returns null' : 'NOT PROVEN',
      /return null;/.test(code),
    );
  }

  // 4. THE LAYOUT TRAP, from the spike: flexBasis: 0 on every flexible cell.
  const docPath = resolve(PROJECT_ROOT, 'lib/quotes/pdf/QuotePdfDocument.tsx');
  if (existsSync(docPath)) {
    const code = stripComments(readFileSync(docPath, 'utf8'));
    record(
      'layout: flexBasis 0 on the flexible cells (or a long name pushes the money off the page)',
      'present',
      /flexBasis: 0/.test(code) ? 'present' : 'MISSING - THE SPIKE\'S EXACT BUG',
      /flexBasis: 0/.test(code),
    );
    record(
      'layout: the table header is fixed, so it repeats on every page',
      'fixed header',
      /styles\.tableHeader\} fixed/.test(code) ? 'fixed header' : 'NOT FIXED',
      /styles\.tableHeader\} fixed/.test(code),
    );
    record(
      'layout: rows are wrap={false}, so a line item never splits across a page',
      'wrap={false}',
      /styles\.row\} wrap=\{false\}/.test(code) ? 'wrap={false}' : 'ROWS CAN SPLIT',
      /styles\.row\} wrap=\{false\}/.test(code),
    );
    record(
      'layout: a page number is printed',
      'Page N of M',
      /pageNumber\} of \$\{totalPages\}/.test(code) ? 'Page N of M' : 'MISSING',
      /pageNumber\} of \$\{totalPages\}/.test(code),
    );
    record(
      'layout: no font file is registered (the built-in Helvetica, no binary asset)',
      'no Font.register',
      /Font\.register/.test(code) ? 'A FONT IS REGISTERED' : 'no Font.register',
      !/Font\.register/.test(code),
    );
    // Nothing internal may be modelled, so it cannot be printed by accident.
    for (const forbidden of ['sku', 'sentAt', 'customerEmail', 'customerPhone', 'customerAddress']) {
      record(
        `withheld: the PDF document never references \`${forbidden}\``,
        'absent',
        new RegExp(`\\b${forbidden}\\b`).test(code) ? 'REFERENCED' : 'absent',
        !new RegExp(`\\b${forbidden}\\b`).test(code),
      );
    }
  }

  // 5. The button, and the banner.
  const islandPath = resolve(PROJECT_ROOT, 'components/quote/QuoteActions.tsx');
  if (existsSync(islandPath)) {
    const src = readFileSync(islandPath, 'utf8');
    const code = stripComments(src);
    record(
      'island: no useSearchParams (the silent prerender killer)',
      'absent',
      /useSearchParams/.test(code) ? 'FOUND - WOULD SILENTLY BREAK THE STATIC PAGE' : 'absent',
      !/useSearchParams/.test(code),
    );
    record(
      'button: the PDF control calls the real route',
      '/api/quote-pdf/',
      /\/api\/quote-pdf\//.test(code) ? '/api/quote-pdf/' : 'MISSING',
      /\/api\/quote-pdf\//.test(code),
    );
    record(
      'button: a working state is shown while the PDF is generated',
      'Preparing your PDF',
      src.includes('Preparing your PDF') ? 'Preparing your PDF' : 'MISSING',
      src.includes('Preparing your PDF'),
    );
    record(
      'button: a failure points at the browser print option',
      'print fallback offered',
      /window\.print\(\)/.test(code) ? 'print fallback offered' : 'NO FALLBACK',
      /window\.print\(\)/.test(code),
    );
    // The buttons must never be locked by what the customer already did.
    const disabledCount = (code.match(/disabled=\{expired\}/g) ?? []).length;
    record(
      'buttons: the two response controls are gated only by EXPIRY, never by the last action',
      'disabled={expired} twice, nothing keyed on the status',
      `${disabledCount} expiry gate(s), ${/disabled=\{settled/.test(code) ? 'A STATUS GATE EXISTS' : 'no status gate'}`,
      disabledCount === 2 && !/disabled=\{settled/.test(code),
    );
    record(
      'banner: the status panel says the customer can still do something else',
      'follow-up line present',
      /You can still accept this quote below/.test(src) ? 'follow-up line present' : 'MISSING',
      /You can still accept this quote below/.test(src),
    );
    record(
      'banner: it carries real visual weight (a thick rule and a larger heading)',
      'border-l-8 + text-lg',
      /border-l-8/.test(src) && /text-lg font-bold/.test(src) ? 'border-l-8 + text-lg' : 'STILL A QUIET NOTE',
      /border-l-8/.test(src) && /text-lg font-bold/.test(src),
    );
  }

  // 6. The print stylesheet is KEPT as the fallback.
  const printPath = resolve(PROJECT_ROOT, 'components/quote/QuotePrintStyles.tsx');
  record(
    'print: the print stylesheet is retained as the fallback',
    'present',
    existsSync(printPath) ? 'present' : 'REMOVED',
    existsSync(printPath),
  );

  // 7. The page itself is unchanged in the ways that keep it static.
  const pagePath = resolve(PROJECT_ROOT, 'app/quote/[token]/page.tsx');
  if (existsSync(pagePath)) {
    const code = stripComments(readFileSync(pagePath, 'utf8'));
    const noDynamicApi = !/searchParams|\bcookies\s*\(|\bheaders\s*\(/.test(code);
    record(
      'page: still reads no searchParams / cookies / headers',
      'none present',
      noDynamicApi ? 'none present' : 'DYNAMIC API FOUND',
      noDynamicApi,
    );
    record(
      'page: does NOT import the PDF renderer (it must not enter the page bundle)',
      'absent',
      /react-pdf/.test(code) ? 'IMPORTED' : 'absent',
      !/react-pdf/.test(code),
    );
  }

  // 8. No webhook change: a PDF download introduces no document type.
  const revalidateSrc = stripComments(
    readFileSync(resolve(PROJECT_ROOT, 'app/api/sanity/revalidate/route.ts'), 'utf8'),
  );
  const quoteCasePresent = /type === 'quote'/.test(revalidateSrc);
  record(
    'webhook: no new document type, so no Filter change (quote was wired in Q-110)',
    "the 'quote' branch already exists",
    quoteCasePresent ? "the 'quote' branch already exists" : 'NOT FOUND',
    quoteCasePresent,
  );

  // 9. The sitemap still never enumerates quotes, and now never the PDF either.
  const sitemapSrc = readFileSync(resolve(PROJECT_ROOT, 'app/sitemap.ts'), 'utf8');
  record(
    'sitemap: no quote route and no PDF route anywhere',
    'absent',
    /\/quote\b|quote-pdf|getQuoteByToken/.test(sitemapSrc) ? 'REFERENCED' : 'absent',
    !/\/quote\b|quote-pdf|getQuoteByToken/.test(sitemapSrc),
  );
}

// ── The local render (proves the layout without a deployment) ─────────────────

/**
 * `server-only` is a marker package Next resolves at build time and that is not
 * installed as a real module, so importing anything that guards itself with it
 * fails under plain node. The render path is exactly that kind of module, and
 * exercising the REAL one (including the real image fetch) is worth far more
 * than a local copy that could drift from it, so the marker is pointed at a
 * harmless built-in for the life of this script.
 *
 * This is a verification-script shim and nothing else: it changes no app code
 * and has no effect on any build.
 */
function shimServerOnly(): void {
  const anyModule = Module as unknown as {
    _resolveFilename?: (request: string, ...rest: unknown[]) => string;
  };
  const original = anyModule._resolveFilename;
  if (!original) return;
  anyModule._resolveFilename = function patched(request: string, ...rest: unknown[]): string {
    if (request === 'server-only') return original.call(this, 'node:events', ...rest);
    return original.call(this, request, ...rest);
  };
}

async function localRenderCheck(): Promise<void> {
  shimServerOnly();
  let renderQuotePdf: (quote: unknown, now: Date) => Promise<{ buffer: Buffer; fileName: string }>;
  try {
    const mod = (await import('../../lib/quotes/pdf/render-quote-pdf')) as {
      renderQuotePdf: typeof renderQuotePdf;
    };
    renderQuotePdf = mod.renderQuotePdf;
  } catch (err) {
    record(
      'local render: the renderer module loads',
      'loads',
      `FAILED: ${(err as Error).message.slice(0, 120)}`,
      false,
    );
    return;
  }

  const quote = {
    quoteNumber: 'ZZ-TEST-LOCAL',
    quoteDate: isoDayOffset(0),
    expiryDate: isoDayOffset(30),
    customer: { company: CUSTOMER_COMPANY, name: 'ZZ Test Contact Person' },
    rep: { name: REP_NAME, email: REP_EMAIL, phone: '800-773-9472' },
    lineItems: fixtureLines(),
    salesTax: SALES_TAX,
    // Deliberately present, and deliberately expected NOT to print.
    title: INTERNAL_LABEL,
    sentAt: SENT_AT,
  };

  const started = Date.now();
  let buffer: Buffer;
  try {
    buffer = (await renderQuotePdf(quote, new Date())).buffer;
  } catch (err) {
    record(
      'local render: an awkward quote renders without throwing',
      'renders',
      `THREW: ${(err as Error).message.slice(0, 140)}`,
      false,
    );
    return;
  }
  const ms = Date.now() - started;
  timings.push(`Local render (this machine, includes the remote image fetch): ${ms} ms, ${buffer.byteLength} bytes`);

  record('local render: produces a real PDF', '%PDF- header', isPdf(buffer) ? '%PDF- header' : 'NOT A PDF', isPdf(buffer));
  const extracted = extractPdfText(buffer);
  info('local render', `${ms} ms, ${buffer.byteLength} bytes, ${extracted.pages} page(s)`);

  record(
    'local render: 17 lines produce more than one page',
    '2 or more pages',
    `${extracted.pages} page(s)`,
    extracted.pages >= 2,
  );
  const headerRepeats = (extracted.text.match(/LINE TOTAL/g) ?? []).length;
  record(
    'local render: the table header repeats on every page',
    `at least ${extracted.pages}`,
    `${headerRepeats} occurrence(s)`,
    headerRepeats >= extracted.pages,
  );
  const allNames = Array.from({ length: PRODUCT_LINE_COUNT }, (_, i) => lineName(i));
  const missingNames = allNames.filter((n) => !pdfContains(extracted, n));
  record(
    'local render: every line item name is on the document',
    '0 missing',
    missingNames.length ? `MISSING: ${missingNames.slice(0, 2).join(' | ')}` : '0 missing',
    missingNames.length === 0,
  );
  record(
    'local render: the hand-computed grand total is on the document',
    GRAND_TOTAL_DISPLAY,
    pdfContains(extracted, GRAND_TOTAL_DISPLAY) ? GRAND_TOTAL_DISPLAY : 'MISSING',
    pdfContains(extracted, GRAND_TOTAL_DISPLAY),
  );
  recordLayoutExtent('local render', extracted);
  for (const [label, needle] of [
    ['internal label', INTERNAL_LABEL],
    ['the Geiger item number', GEIGER_SKU],
    ['the sent-at date', SENT_AT_DAY],
  ] as const) {
    record(
      `local render: ${label} is NOT printed`,
      'absent',
      pdfContains(extracted, needle) ? 'PRINTED' : 'absent',
      !pdfContains(extracted, needle),
    );
  }

  try {
    mkdirSync(LOCAL_OUT_DIR, { recursive: true });
    const out = join(LOCAL_OUT_DIR, 'q160-sample.pdf');
    writeFileSync(out, buffer);
    console.log(`Sample PDF written OUTSIDE the repo: ${out}`);
    notes.push(`A sample PDF from the local render was written to ${out} (outside the repo, nothing untracked is left behind). Open it to judge whether it reads as a document a buyer would forward.`);
  } catch {
    /* writing the sample is a convenience, never a failure */
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupDocs(client: SanityClient): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];

  // Responses first: they are found through their reference to a quote, and
  // that reference has to still exist for the guard to pass.
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
  console.log(`Q-160 verification - target ${SITE}`);
  console.log(
    DRY_RUN
      ? 'MODE: dry run (offline checks + a local render, no Sanity writes)'
      : CLEANUP_ONLY
        ? 'MODE: cleanup only'
        : 'MODE: apply',
  );

  offlineChecks();

  if (!CLEANUP_ONLY) await localRenderCheck();

  if (DRY_RUN) {
    printTable();
    if (notes.length) {
      console.log('\nNOTES:');
      for (const n of notes) console.log(`  - ${n}`);
    }
    writeReport();
    console.log(`\nDry run complete. Re-run with --apply to exercise the deployed route.`);
    console.log(`Report written to ${REPORT_PATH}`);
    if (rows.some((r) => r.status === 'FAIL')) process.exit(1);
    return;
  }

  if (APPLY) {
    // PREFLIGHT, before a single fixture is written. If the deployment does not
    // carry this code yet, every deployed check would fail for the one reason
    // that says nothing about the feature, and the shared dataset would have
    // been written to for nothing. Our route answers a well-formed but unknown
    // token with its own JSON message; a deployment without the route answers
    // the same 404 with Next's HTML error page, which is how they are told
    // apart.
    const probe = await fetchPdf(generateQuoteToken());
    const routeLive = probe.bodyText.includes('This quote link is no longer available');
    if (!routeLive) {
      console.error(
        `\nThe PDF route is not live on ${SITE} yet (probe answered ${probe.status} without the route's own message).`,
      );
      console.error('Deploy first, then re-run with --apply. NOTHING was written to Sanity.');
      info(
        'preflight: is the PDF route deployed on the target',
        `NO - probe answered ${probe.status}; the run stopped before writing any fixture`,
      );
      printTable();
      writeReport();
      console.log(`\nReport written to ${REPORT_PATH}`);
      process.exit(1);
    }
    info('preflight: the PDF route is live on the target', `probe answered ${probe.status} with the route's own message`);
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

  try {
    // ---------------------------------------------------------------- Fixtures
    const numbering = client as unknown as QuoteNumberingClient;
    const liveNumber = (await allocateQuoteNumber(numbering)).quoteNumber;
    const expiredNumber = (await allocateQuoteNumber(numbering)).quoteNumber;

    tokens.live = generateQuoteToken();
    tokens.expired = generateQuoteToken();
    console.log(`Fixture tokens: live=${redact(tokens.live)} expired=${redact(tokens.expired)}`);

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
      lineItems: fixtureLines(),
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
      lineItems: expiredLines(),
      sentAt: SENT_AT,
    } as never);

    await sleep(2500);

    // ------------------------------------------------- 1. THE PDF ITSELF
    const cold = await fetchPdf(tokens.live);
    record(
      'pdf: a published quote returns 200',
      '200',
      String(cold.status),
      cold.status === 200,
    );
    record(
      'pdf: the content type is application/pdf',
      'application/pdf',
      cold.contentType || '(none)',
      cold.contentType.includes('application/pdf'),
    );
    record(
      'pdf: it is a real, openable PDF',
      '%PDF- header',
      isPdf(cold.bytes) ? '%PDF- header' : `NOT A PDF (${cold.bytes.byteLength} bytes)`,
      isPdf(cold.bytes),
    );
    record(
      'pdf: the download filename carries the quote number',
      `filename containing ${liveNumber}`,
      cold.disposition || '(no Content-Disposition)',
      cold.disposition.includes('attachment') && cold.disposition.includes(liveNumber),
    );

    if (!isPdf(cold.bytes)) {
      info('pdf: the body returned instead', cold.bodyText.slice(0, 200) || '(binary)');
    } else {
      const extracted = extractPdfText(cold.bytes);
      info(
        'pdf: shape',
        `${cold.bytes.byteLength} bytes, ${extracted.pages} page(s), ${extracted.streams} decoded stream(s)`,
      );

      // 2. CONTENT, extracted rather than assumed.
      for (const [label, needle] of [
        ['the quote number', liveNumber],
        ['the customer company', CUSTOMER_COMPANY],
        ['the rep name', REP_NAME],
      ] as const) {
        record(
          `pdf: contains ${label}`,
          needle,
          pdfContains(extracted, needle) ? 'present' : 'MISSING',
          pdfContains(extracted, needle),
        );
      }
      const allNames = Array.from({ length: PRODUCT_LINE_COUNT }, (_, i) => lineName(i));
      const missingNames = allNames.filter((n) => !pdfContains(extracted, n));
      record(
        'pdf: EVERY line item name is present, including the 130-character one',
        '0 missing of 16',
        missingNames.length ? `MISSING ${missingNames.length}` : '0 missing of 16',
        missingNames.length === 0,
      );
      record(
        'pdf: the charge line is present',
        'ZZ Test Art Fee',
        pdfContains(extracted, 'ZZ Test Art Fee') ? 'present' : 'MISSING',
        pdfContains(extracted, 'ZZ Test Art Fee'),
      );

      // 3. THE MONEY, against arithmetic done by hand at the top of this file.
      for (const [label, needle] of [
        ['a product line total (100 x $2.50 + $25 + $10)', LINE_TOTAL_DISPLAY],
        ['the charge line total (2 x $40.00)', CHARGE_TOTAL_DISPLAY],
        ['the subtotal ($4,400 merchandise + $80 charge)', SUBTOTAL_DISPLAY],
        ['the shipping total (16 x $10.00)', SHIPPING_DISPLAY],
        ['the sales tax as typed', TAX_DISPLAY],
        ['THE GRAND TOTAL ($4,480 + $160 + $45.25)', GRAND_TOTAL_DISPLAY],
      ] as const) {
        record(
          `pdf: ${label}`,
          needle,
          pdfContains(extracted, needle) ? needle : 'MISSING',
          pdfContains(extracted, needle),
        );
      }

      // 4. PAGE BREAKING.
      record(
        'pdf: 17 lines produce more than one page',
        '2 or more pages',
        `${extracted.pages} page(s)`,
        extracted.pages >= 2,
      );
      const headerRepeats = (extracted.text.match(/LINE TOTAL/g) ?? []).length;
      record(
        'pdf: the table header repeats on every page',
        `at least ${extracted.pages}`,
        `${headerRepeats} occurrence(s)`,
        headerRepeats >= extracted.pages,
      );
      const pageMarkers = (extracted.text.match(/Page \d+ of \d+/g) ?? []).length;
      record(
        'pdf: every page is numbered',
        `at least ${extracted.pages}`,
        `${pageMarkers} page number(s)`,
        pageMarkers >= extracted.pages,
      );
      recordLayoutExtent('pdf', extracted);

      // 5. NOTHING INTERNAL.
      for (const [label, needle] of [
        ['the internal label', INTERNAL_LABEL],
        ["the customer's own email", CUSTOMER_EMAIL],
        ["the customer's own phone", CUSTOMER_PHONE],
        ["the customer's own address", CUSTOMER_ADDRESS],
        ['the sent-at date', SENT_AT_DAY],
        ['the Geiger supplier item number', GEIGER_SKU],
        ['a /products/ link', '/products/'],
      ] as const) {
        record(
          `withheld: ${label} is not in the PDF text`,
          'absent',
          pdfContains(extracted, needle) ? 'LEAKED' : 'absent',
          !pdfContains(extracted, needle),
        );
      }
    }

    // 6. TIMINGS: cold, warm, and the network separated out.
    const baseline = await baselineRoundTripMs();
    const warm: number[] = [];
    for (let i = 0; i < 4; i++) {
      const w = await fetchPdf(tokens.live);
      if (w.status === 200) warm.push(w.ms);
      await sleep(400);
    }
    const warmMedian = warm.length
      ? [...warm].sort((a, b) => a - b)[Math.floor(warm.length / 2)]
      : 0;
    timings.push(
      `Deployed cold (first request, includes the dead-image timeout): ${cold.ms} ms round trip`,
      `Deployed warm: ${warm.join(', ')} ms round trip (median ${warmMedian} ms)`,
      `Baseline round trip to a no-work route on the same deployment: ${baseline} ms`,
      `So the generation plus payload is roughly ${Math.max(0, warmMedian - baseline)} ms warm and ${Math.max(0, cold.ms - baseline)} ms cold, the rest is network latency from this location.`,
    );
    info('timing: cold / warm-median / network baseline', `${cold.ms} / ${warmMedian} / ${baseline} ms`);
    record(
      'timing: a warm download stays under 10 seconds even with a dead image on the quote',
      'under 10000 ms',
      `${warmMedian} ms`,
      warmMedian > 0 && warmMedian < 10_000,
    );
    notes.push(
      'The 16-line fixture deliberately carries one DEAD image URL and one format=webp URL, so every timing above is a worst case rather than a clean one. A real quote with working photos is faster.',
    );

    // 7. THE BROKEN IMAGE did not break the document (proved by the checks
    //    above: the same response contained every line and the grand total).
    record(
      'images: a quote carrying a dead image URL still produces a valid PDF',
      'valid PDF',
      isPdf(cold.bytes) ? 'valid PDF' : 'FAILED',
      isPdf(cold.bytes),
    );
    notes.push(
      'The webp-format image URL on line 1 and the dead host on line 2 are both in the live fixture, so "a broken image still renders" and "a webp URL still renders its image" are proved by the same response that carried every line and the correct grand total. Whether the photo is visually present is on the manual list - text extraction cannot see a picture.',
    );

    // ------------------------------------------------- 8. AN EXPIRED QUOTE
    const expired = await fetchPdf(tokens.expired);
    record(
      'expired: the PDF still downloads',
      '200',
      String(expired.status),
      expired.status === 200,
    );
    if (isPdf(expired.bytes)) {
      const ex = extractPdfText(expired.bytes);
      record(
        'expired: the document says so',
        'passed its expiry date',
        pdfContains(ex, 'passed its expiry date') ? 'stated' : 'NOT STATED',
        pdfContains(ex, 'passed its expiry date'),
      );
      record(
        'expired: the price is still on it',
        EXPIRED_TOTAL_DISPLAY,
        pdfContains(ex, EXPIRED_TOTAL_DISPLAY) ? EXPIRED_TOTAL_DISPLAY : 'MISSING',
        pdfContains(ex, EXPIRED_TOTAL_DISPLAY),
      );
      record(
        'expired: the expiry date is labelled as expired, not as valid until',
        'Expired:',
        pdfContains(ex, 'Expired:') ? 'Expired:' : 'NOT LABELLED',
        pdfContains(ex, 'Expired:'),
      );
    }

    // ------------------------------------- 9. BAD TOKENS ARE INDISTINGUISHABLE
    const badResults: { status: number; body: string }[] = [];
    for (const [label, value] of [
      ['unknown (well-formed) token', generateQuoteToken()],
      ['malformed token', 'not-a-real-token'],
      ['tag-hostile token', 'AB cd../ee'],
    ] as const) {
      const res = await fetchPdf(value);
      badResults.push({ status: res.status, body: res.bodyText });
      record(`reject: ${label} answered 404`, '404', String(res.status), res.status === 404);
    }
    // An EMPTY token cannot reach this route at all: /api/quote-pdf/ has no
    // dynamic segment to fill, so the platform 404s it before the handler runs.
    // Same answer to the caller, which is the property under test.
    const emptyRes = await fetch(`${SITE}${PDF_ROUTE}/`, { headers: { 'cache-control': 'no-cache' } });
    record(
      'reject: an empty token answers 404 (the route does not exist without one)',
      '404',
      String(emptyRes.status),
      emptyRes.status === 404,
    );
    const distinct = new Set(badResults.map((r) => `${r.status}:${r.body}`));
    record(
      'reject: unknown and malformed tokens are INDISTINGUISHABLE (same status, same message)',
      '1 distinct response',
      `${distinct.size} distinct response(s)`,
      distinct.size === 1,
    );

    // ------------------------------------- 10. THE PAGE IS STILL STATIC
    const page = await fetchPage(`/quote/${tokens.live}`);
    const region = quoteRegion(page.html);
    const bailed = page.html.includes(BAILOUT_MARKER);
    record(
      'STATICNESS: raw HTML carries the rendered quote, with NO client-side-render bailout',
      'article present, no BAILOUT marker',
      region ? (bailed ? 'BAILOUT MARKER FOUND' : 'article present, no marker') : 'ARTICLE MISSING',
      Boolean(region) && !bailed,
    );
    const hay = region ?? page.html;
    for (const label of ['Accept this quote', 'Request a change', 'Download PDF']) {
      record(
        `STATICNESS: "${label}" is in the server-rendered HTML`,
        'present',
        hay.includes(label) ? 'present' : 'MISSING',
        hay.includes(label),
      );
    }
    record(
      'page: the grand total is still in the raw HTML',
      GRAND_TOTAL_DISPLAY,
      hay.includes(GRAND_TOTAL_DISPLAY) ? 'present' : 'MISSING',
      hay.includes(GRAND_TOTAL_DISPLAY),
    );
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
        console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q160.ts --cleanup-only');
      }
      const leftoverQuotes = await client.fetch<number>(
        `count(*[_id match "${TEST_PREFIX}*" || _id match "drafts.${TEST_PREFIX}*"])`,
      );
      const leftoverResponses = await client.fetch<number>(
        `count(*[_type == "quoteResponse" && quote._ref match "${TEST_PREFIX}*"])`,
      );
      record('cleanup: zero test quotes remain', '0', String(leftoverQuotes), leftoverQuotes === 0);
      record(
        'cleanup: zero test RESPONSES remain',
        '0',
        String(leftoverResponses),
        leftoverResponses === 0,
      );
    } catch (cleanupErr) {
      console.error('CLEANUP FAILED:', cleanupErr);
      console.error(`Left behind (expected quote ids): ${ALL_FIXTURE_IDS.join(', ')}`);
      console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q160.ts --cleanup-only');
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
          `*** The counter did NOT exist before this run. DELETE "${QUOTE_COUNTER_ID}", or run: pnpm tsx scripts/quick-quote/verify-q160.ts --cleanup-only --counter-absent`,
        );
      } else {
        console.error(`*** Restore "${QUOTE_COUNTER_ID}" to: ${describeCounter(counterBefore)}`);
        console.error(
          `*** Or run: pnpm tsx scripts/quick-quote/verify-q160.ts --cleanup-only --counter-last ${String(counterBefore.lastNumber)} --counter-prefix ${String(counterBefore.prefix)}`,
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
  if (timings.length) {
    console.log('\nTIMINGS:');
    for (const t of timings) console.log(`  - ${t}`);
  }
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
    '# Q-160: Automated verification of the quote PDF, the status banner, and the lifecycle',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q160.ts (verification only - no app code touched). Mode: ${DRY_RUN ? 'dry run (offline checks + a local render)' : 'apply'}.`,
    '',
    DRY_RUN
      ? 'Nothing was written to Sanity in this mode. The safety machinery is still in the script and is used by `--apply`: the `zz-test-quote-` id prefix, a `ZZ Test` label, a guard re-checked against the stored document at the moment of deletion, cleanup in a finally that survives a crash, and the quote counter recorded before the run and restored exactly.'
      : 'The dataset is SHARED between staging and production. Every fixture quote used the `zz-test-quote-` id prefix and a `ZZ Test` label, every guard was re-checked against the stored document at the moment of deletion, and the quote counter was recorded before the run and restored exactly (values in the table). Tokens are never printed in full.',
    '',
    '**Test emails go nowhere on purpose.** Every fixture rep address is on the reserved `.invalid` TLD, which can never be delivered to and never bounces into a real mailbox. Earlier runs on this project put bounce messages into Patrick\'s inbox; this is deliberate, not careless.',
    '',
    '## Fixture arithmetic (independent literals - lib/quotes/quote-totals.ts is never imported here)',
    '',
    '- 16 product lines, each 100 x $2.50 = $250.00; + $25.00 setup + $10.00 shipping = **$285.00** line total',
    '- merchandise per line $275.00, so 16 x $275.00 = **$4,400.00**; shipping 16 x $10.00 = **$160.00**',
    '- 1 charge line: 2 x $40.00 = **$80.00**',
    '- subtotal (shipping excluded) = $4,400.00 + $80.00 = **$4,480.00**',
    '- sales tax, typed on the quote, never calculated = **$45.25**',
    '- **GRAND TOTAL = $4,480.00 + $160.00 + $45.25 = $4,685.25**',
    '- expired fixture: 10 x $5.00 = **$50.00**, no setup, no shipping, no tax',
    '',
    'The fixture is deliberately awkward: a 130-character product name (the spike\'s `flexBasis` trap), a 350-character description, a long line note, one image URL carrying `format=webp`, and one image URL on a host that does not resolve.',
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
  if (DRY_RUN) {
    lines.push(
      '## What this run did NOT cover',
      '',
      'This was a dry run, so nothing was written to Sanity and the DEPLOYED route was never called. The local render above proves the document itself: it exercises the real model, the real image fetch (including a dead host and a `format=webp` Geiger URL), and the real renderer, on the real awkward fixture.',
      '',
      'Still to run, once the branch is deployed:',
      '',
      '```',
      'pnpm tsx scripts/quick-quote/verify-q160.ts --apply',
      '```',
      '',
      'That adds: the deployed route answering 200 with `application/pdf` and the right download filename, deployed cold and warm timings with the network baseline separated out, the expired quote still downloading, unknown / malformed / empty tokens all answering an identical 404, and the quote page still being static with all three buttons in the raw HTML. It refuses to write anything if the route is not live on the target yet.',
      '',
    );
  }
  lines.push(
    '## What a script cannot prove (for Ali, after the single deploy)',
    '',
    'None of the following are marked passed; text extraction cannot see geometry, and a script has no inbox:',
    '',
    '1. **Download a real quote\'s PDF and look at it.** Does it read as a document a buyer would forward to their boss? Are the product photos actually visible, and is the long product name wrapping inside its column rather than pushing the money columns sideways?',
    '2. **Download one on a phone.** Confirm it opens in the phone\'s own PDF viewer and is readable.',
    '3. **Confirm the status banner is the first thing you notice** after accepting or requesting a change, and that all three buttons still work afterwards.',
    '4. **Carried over from Q-155 and still unconfirmed:** press Mark as sent, open the customer link, and confirm the "opened" email arrives. Then refresh several times and confirm no flood.',
    '',
  );
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
