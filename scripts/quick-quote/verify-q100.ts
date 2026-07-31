/**
 * Q-101: automated verification of Q-100 (per-decoration setup charges)
 * against the DEPLOYED staging site with REAL Sanity data.
 *
 *   pnpm tsx scripts/quick-quote/verify-q100.ts                 # dry run (default, no writes)
 *   pnpm tsx scripts/quick-quote/verify-q100.ts --apply         # real run: publish, check, patch, clean up
 *   pnpm tsx scripts/quick-quote/verify-q100.ts --cleanup-only  # delete every productPage slug zz-test-*
 *   ... --site https://dev.perfectimprints.com                  # override the checked deployment
 *
 * VERIFICATION ONLY - this script changes no app code. It publishes three
 * throwaway productPage fixtures (title "ZZ Test ...", slug "zz-test-..."),
 * asserts the deployed raw HTML of /products/<slug>, patches one fixture to
 * time webhook revalidation, then deletes everything it created (also on
 * failure). Staging and production share ONE dataset, so fixtures are briefly
 * visible on both hosts; the zz-test prefix + deletion-in-finally is the
 * accepted containment (see the Q-101 prompt).
 *
 * HARD GUARD: every mutation goes through helpers that refuse any _id/slug
 * not starting with zz-test-. Real documents cannot be touched.
 *
 * Expected numbers are derived HERE from the documented Q-100 rule (the
 * selected decoration's setupCharge wins when it is a finite number of 0 or
 * more, an explicit 0 means no setup fee, blank falls back to the flat
 * product setupCharge) - the app's own estimate module is deliberately NOT
 * imported, so this run cannot use the implementation to prove itself.
 *
 * Requires SANITY_API_TOKEN (write scope) in .env.local for --apply/--cleanup-only.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

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

// Deliberately NOT NEXT_PUBLIC_SITE_URL: the local env points that at
// production (www); this task verifies the STAGING deployment.
const SITE = (flagValue('--site') ?? 'https://dev.perfectimprints.com').replace(/\/$/, '');

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/quick-quote/Q-101-verification-report.md');

// ── Env + client (same convention as scripts/seed/seed-catalog-form.ts) ──────

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

// ── The hard zz-test guard ────────────────────────────────────────────────────

const TEST_PREFIX = 'zz-test-';

function assertTestId(id: string): void {
  const bare = id.replace(/^drafts\./, '');
  if (!bare.startsWith(TEST_PREFIX)) {
    throw new Error(`REFUSING to touch document id "${id}" - not a ${TEST_PREFIX}* fixture.`);
  }
}

function assertTestSlug(slug: string | undefined): void {
  if (!slug || !slug.startsWith(TEST_PREFIX)) {
    throw new Error(`REFUSING to touch slug "${slug}" - not a ${TEST_PREFIX}* fixture.`);
  }
}

async function guardedDelete(client: SanityClient, id: string): Promise<void> {
  assertTestId(id);
  // Re-verify against the stored document, not just the id we were handed.
  const doc = await client.fetch<{ slug?: { current?: string } } | null>(`*[_id == $id][0]{slug}`, {
    id,
  });
  if (doc) assertTestSlug(doc.slug?.current);
  await client.delete(id);
}

// ── Fixtures + expected values (independent arithmetic, documented rule) ─────

const QTY = 50; // the minimum order quantity = the single tier's minQty
const UNIT_PRICE = 10;
const FLAT_SETUP = 100;

interface Fixture {
  slug: string;
  title: string;
  /** undefined = field genuinely absent from the stored document. */
  decorationSetup: number | undefined;
}

const FIXTURES: Fixture[] = [
  { slug: 'zz-test-setup-blank', title: 'ZZ Test Setup Blank', decorationSetup: undefined },
  { slug: 'zz-test-setup-zero', title: 'ZZ Test Setup Zero', decorationSetup: 0 },
  { slug: 'zz-test-setup-fifty', title: 'ZZ Test Setup Fifty', decorationSetup: 50 },
];

/** The documented Q-100 rule, restated here so the check is independent. */
function expectedSetup(decorationSetup: number | undefined, flat: number): number {
  if (typeof decorationSetup === 'number' && Number.isFinite(decorationSetup) && decorationSetup >= 0) {
    return decorationSetup; // 0 included: it cancels the flat fee
  }
  return typeof flat === 'number' && Number.isFinite(flat) && flat >= 0 ? flat : 0;
}

function expectedTotal(f: Fixture): number {
  return QTY * UNIT_PRICE + expectedSetup(f.decorationSetup, FLAT_SETUP);
}

/** Own USD formatter (en-US), NOT imported from the app. */
function usd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function arithmetic(f: Fixture): string {
  const setup = expectedSetup(f.decorationSetup, FLAT_SETUP);
  const setupSrc =
    f.decorationSetup === undefined
      ? `flat ${usd(FLAT_SETUP)} (decoration setup absent)`
      : f.decorationSetup === 0
        ? 'decoration setup 0 (cancels the flat fee)'
        : `decoration setup ${usd(f.decorationSetup)} (overrides flat ${usd(FLAT_SETUP)})`;
  return `${QTY} x ${usd(UNIT_PRICE)} + ${usd(setup)} setup [${setupSrc}] = ${usd(expectedTotal(f))}`;
}

function fixtureDoc(f: Fixture): Record<string, unknown> {
  return {
    _id: f.slug, // published id; deterministic, so re-runs replace not duplicate
    _type: 'productPage',
    title: f.title,
    slug: { _type: 'slug', current: f.slug },
    pricingTiers: [{ _type: 'pricingTier', _key: 'tier-1', minQty: QTY, price: UNIT_PRICE }],
    setupCharge: FLAT_SETUP,
    decorationMethods: [
      {
        _type: 'decorationMethod',
        _key: 'dec-1',
        method: 'ZZ Test Print',
        // Blank must be genuinely ABSENT, not null/0 - so the key is only
        // present for the zero/fifty fixtures.
        ...(f.decorationSetup !== undefined ? { setupCharge: f.decorationSetup } : {}),
      },
    ],
    // Containment: never on /new-products, never on sale, no lead recipient,
    // no categories (the Q-101 conditions).
    showInNewProducts: false,
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PageFetch {
  status: number;
  html: string;
  cache: string;
}

async function fetchPage(url: string): Promise<PageFetch> {
  const res = await fetch(url, { headers: { 'user-agent': 'q101-verify-script' }, redirect: 'manual' });
  const html = res.status === 200 ? await res.text() : '';
  return { status: res.status, html, cache: res.headers.get('x-vercel-cache') ?? '(none)' };
}

/** React SSR inserts <!-- --> between adjacent text nodes; strip comments before matching. */
function textOf(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

async function pollUntil(
  url: string,
  predicate: (p: PageFetch) => boolean,
  timeoutMs: number,
  intervalMs = 3000,
): Promise<{ ok: boolean; elapsedMs: number; last: PageFetch }> {
  const start = Date.now();
  let last: PageFetch = { status: 0, html: '', cache: '(none)' };
  for (;;) {
    last = await fetchPage(url);
    if (predicate(last)) return { ok: true, elapsedMs: Date.now() - start, last };
    if (Date.now() - start > timeoutMs) return { ok: false, elapsedMs: Date.now() - start, last };
    await sleep(intervalMs);
  }
}

// ── Result collection ─────────────────────────────────────────────────────────

interface Row {
  check: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'BROWSER';
}

const rows: Row[] = [];
const notes: string[] = [];

function record(check: string, expected: string, actual: string, pass: boolean): boolean {
  rows.push({ check, expected, actual, status: pass ? 'PASS' : 'FAIL' });
  return pass;
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

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanupAll(client: SanityClient): Promise<{ deleted: string[]; failed: string[] }> {
  const docs = await client.fetch<{ _id: string; slug?: string }[]>(
    `*[_type == "productPage" && slug.current match "${TEST_PREFIX}*"]{_id, "slug": slug.current}`,
  );
  // Drafts of test fixtures too, if any Studio interaction created one.
  const drafts = await client.fetch<{ _id: string; slug?: string }[]>(
    `*[_type == "productPage" && _id in path("drafts.**") && slug.current match "${TEST_PREFIX}*"]{_id, "slug": slug.current}`,
  );
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const d of [...docs, ...drafts]) {
    try {
      assertTestSlug(d.slug);
      await guardedDelete(client, d._id);
      deleted.push(d._id);
    } catch (e) {
      failed.push(`${d._id} (${(e as Error).message})`);
    }
  }
  return { deleted, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Q-101 verification of Q-100 per-decoration setup charges`);
  console.log(`Target deployment: ${SITE}`);
  console.log(`Mode: ${CLEANUP_ONLY ? 'CLEANUP ONLY' : DRY_RUN ? 'DRY RUN (default, no writes)' : 'APPLY'}`);
  console.log('');
  console.log('Expected values (derived from the documented rule, not the app code):');
  for (const f of FIXTURES) console.log(`  ${f.slug}: ${arithmetic(f)}`);
  console.log('');

  if (CLEANUP_ONLY) {
    const client = buildClient();
    const { deleted, failed } = await cleanupAll(client);
    console.log(`Deleted: ${deleted.length ? deleted.join(', ') : '(nothing found)'}`);
    if (failed.length) {
      console.error(`FAILED to delete: ${failed.join(', ')}`);
      process.exit(1);
    }
    return;
  }

  if (DRY_RUN) {
    console.log('Would create these three PUBLISHED productPage documents, verify the deployed');
    console.log(`HTML at ${SITE}/products/<slug>, patch zz-test-setup-fifty's decoration setup`);
    console.log('to 75 to time revalidation, then delete all three and confirm 404s:');
    for (const f of FIXTURES) console.log(`\n${JSON.stringify(fixtureDoc(f), null, 2)}`);
    console.log('\nRe-run with --apply to execute. --cleanup-only sweeps leftovers.');
    return;
  }

  const client = buildClient();
  let runError: unknown = null;

  try {
    // 1. Publish fixtures (createOrReplace = idempotent + resumable).
    for (const f of FIXTURES) {
      const doc = fixtureDoc(f);
      assertTestId(doc._id as string);
      assertTestSlug((doc.slug as { current: string }).current);
      await client.createOrReplace(doc as never);
      console.log(`Published ${f.slug}`);
    }

    // 2. Read back: blank must be genuinely absent (not null / not 0).
    for (const f of FIXTURES) {
      const stored = await client.fetch<{ decorationMethods?: Record<string, unknown>[] } | null>(
        `*[_id == $id][0]{decorationMethods}`,
        { id: f.slug },
      );
      const dec = stored?.decorationMethods?.[0] ?? {};
      const hasKey = Object.prototype.hasOwnProperty.call(dec, 'setupCharge');
      const storedVal = hasKey ? String((dec as { setupCharge?: unknown }).setupCharge) : 'ABSENT';
      const expected = f.decorationSetup === undefined ? 'ABSENT' : String(f.decorationSetup);
      record(`${f.slug}: stored decoration setupCharge`, expected, storedVal, storedVal === expected);
    }

    // 3. Per-page HTML checks.
    for (const f of FIXTURES) {
      const url = `${SITE}/products/${f.slug}`;
      const live = await pollUntil(url, (p) => p.status === 200, 90_000);
      record(
        `${f.slug}: page live (HTTP 200)`,
        '200',
        `${live.last.status} after ${Math.round(live.elapsedMs / 1000)}s (x-vercel-cache: ${live.last.cache})`,
        live.ok,
      );
      if (!live.ok) continue;

      const raw = live.last.html;
      const text = textOf(raw);
      const total = usd(expectedTotal(f));
      const setup = expectedSetup(f.decorationSetup, FLAT_SETUP);

      record(`${f.slug}: H1 present`, f.title, raw.includes(f.title) ? 'found' : 'MISSING', raw.includes(f.title));
      record(`${f.slug}: tier price in HTML`, usd(UNIT_PRICE), text.includes(usd(UNIT_PRICE)) ? 'found' : 'MISSING', text.includes(usd(UNIT_PRICE)));
      const bailout = raw.includes('BAILOUT_TO_CLIENT_SIDE_RENDERING');
      record(`${f.slug}: no CSR bailout marker`, 'absent', bailout ? 'PRESENT' : 'absent', !bailout);

      // Estimate assertions against the raw server HTML. The panel is a client
      // island whose INITIAL render is server-prerendered (deterministic
      // defaults), so the numbers are expected in the raw HTML; if they are
      // not, that is recorded as BROWSER (needs a human check), never faked.
      const setupPattern = /\+\s*\$[\d,]+(?:\.\d{2})?\s*setup/;
      const estimateInHtml = text.includes('estimated total');
      if (!estimateInHtml) {
        rows.push({
          check: `${f.slug}: estimate block in raw HTML`,
          expected: 'present',
          actual: 'NOT in raw HTML',
          status: 'BROWSER',
        });
        notes.push(
          `BROWSER CHECK needed: open ${url} and confirm ${setup === 0 ? 'NO setup line' : `a "+ ${usd(setup)} setup" line`} and an estimated total of ${total}.`,
        );
        continue;
      }
      if (setup === 0) {
        const hasAnySetup = setupPattern.test(text);
        record(`${f.slug}: NO setup line rendered`, 'no "+ $... setup" text', hasAnySetup ? 'setup line PRESENT' : 'none', !hasAnySetup);
      } else {
        const frag = `+ ${usd(setup)} setup`;
        record(`${f.slug}: setup line rendered`, frag, text.includes(frag) ? 'found' : 'MISSING', text.includes(frag));
      }
      record(`${f.slug}: estimated total rendered`, total, text.includes(total) ? 'found' : 'MISSING', text.includes(total));
    }

    // 4. Freshness: patch ONE fixture's decoration setup 50 -> 75, publish via
    //    the API (the webhook fires on any non-draft mutation), time how long
    //    until the deployed page shows the new number WITHOUT a redeploy.
    const patched = 'zz-test-setup-fifty';
    const newSetup = 75;
    const newTotal = usd(QTY * UNIT_PRICE + newSetup);
    assertTestId(patched);
    await client.patch(patched).set({ 'decorationMethods[0].setupCharge': newSetup }).commit();
    console.log(`Patched ${patched}: decoration setupCharge 50 -> ${newSetup}; polling for ${newTotal}...`);
    const fresh = await pollUntil(
      `${SITE}/products/${patched}`,
      (p) => p.status === 200 && textOf(p.html).includes(newTotal),
      180_000,
    );
    record(
      `${patched}: revalidation after patch (setup ${newSetup}, total ${newTotal})`,
      `${newTotal} appears without redeploy`,
      fresh.ok
        ? `updated in ${Math.round(fresh.elapsedMs / 1000)}s (x-vercel-cache: ${fresh.last.cache})`
        : `STILL STALE after ${Math.round(fresh.elapsedMs / 1000)}s`,
      fresh.ok,
    );
    if (!fresh.ok) {
      notes.push(
        `LOUD FINDING: the page did NOT reflect the published change within ${Math.round(fresh.elapsedMs / 1000)}s. ` +
          `Likely cause: productPage missing from the staging Sanity webhook Filter (docs/sanity-webhook-setup.md). ` +
          `This is the freshness mechanism the quote module depends on.`,
      );
    }
  } catch (e) {
    runError = e;
    console.error('Run failed:', e);
  } finally {
    // 5. Cleanup ALWAYS runs; then confirm the URLs 404.
    try {
      const { deleted, failed } = await cleanupAll(client);
      record('cleanup: fixtures deleted', FIXTURES.map((f) => f.slug).join(', '), deleted.join(', ') || '(none)', failed.length === 0 && deleted.length > 0);
      if (failed.length) {
        console.error(`CLEANUP INCOMPLETE. Left behind: ${failed.join(', ')}`);
        console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q100.ts --cleanup-only');
      } else {
        for (const f of FIXTURES) {
          const url = `${SITE}/products/${f.slug}`;
          const gone = await pollUntil(url, (p) => p.status === 404, 90_000);
          record(
            `${f.slug}: 404 after delete`,
            '404',
            `${gone.last.status} after ${Math.round(gone.elapsedMs / 1000)}s`,
            gone.ok,
          );
        }
      }
    } catch (cleanupErr) {
      console.error('CLEANUP FAILED:', cleanupErr);
      console.error(`Left-behind slugs may include: ${FIXTURES.map((f) => f.slug).join(', ')}`);
      console.error('Sweep with: pnpm tsx scripts/quick-quote/verify-q100.ts --cleanup-only');
    }
  }

  printTable();
  if (notes.length) {
    console.log('\nNOTES:');
    for (const n of notes) console.log(`  - ${n}`);
  }

  writeReport();
  console.log(`\nReport written to ${REPORT_PATH}`);

  const failed = rows.filter((r) => r.status === 'FAIL');
  if (runError || failed.length) {
    console.error(`\n${failed.length} check(s) FAILED${runError ? ' (plus a run error above)' : ''}.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

function writeReport(): void {
  const stamp = new Date().toISOString();
  const browser = rows.filter((r) => r.status === 'BROWSER');
  const lines: string[] = [
    '# Q-101: Automated verification of Q-100 (per-decoration setup charges)',
    '',
    `Run: ${stamp}. Target: ${SITE}. Script: scripts/quick-quote/verify-q100.ts (throwaway, verification only - no app code touched).`,
    '',
    '## Fixture arithmetic (derived from the documented rule, independent of the app code)',
    '',
    ...FIXTURES.map((f) => `- \`${f.slug}\`: ${arithmetic(f)}`),
    '',
    `All three share one pricing tier (min qty ${QTY}, price ${usd(UNIT_PRICE)}), a flat product setupCharge of ${usd(FLAT_SETUP)}, and one decoration method with no per-unit upcharge; only the decoration's own setupCharge differs (absent / 0 / 50).`,
    '',
    '## Results',
    '',
    '| Check | Expected | Actual | Status |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.check} | ${r.expected} | ${r.actual} | ${r.status} |`),
    '',
    '## Raw HTML vs browser',
    '',
    browser.length
      ? 'The estimate numbers were NOT present in the raw server HTML for the rows marked BROWSER above; the H1, tier prices, and bailout-marker absence were still verified from raw HTML. A human must confirm the listed numbers in a browser.'
      : 'The estimate numbers (setup line + estimated total) WERE present in the raw server HTML, as expected: the purchase panel is a client island whose deterministic initial render is server-prerendered. No browser check needed for the totals.',
    '',
  ];
  if (notes.length) {
    lines.push('## Notes / findings', '', ...notes.map((n) => `- ${n}`), '');
  }
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
