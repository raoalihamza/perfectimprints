/**
 * Seed globalSettings.footerColumns with Perfect Imprints' current footer nav
 * columns (the three link columns left of the Contact column).
 *
 *   pnpm seed-footer-columns            # write (only if currently empty)
 *   pnpm seed-footer-columns --dry-run  # print, no write
 *
 * IDEMPOTENT + NON-DESTRUCTIVE: writes only when `footerColumns` is currently
 * empty/absent. If Patrick has already edited them (any column present), the
 * script reports "nothing to change" and writes nothing — it never overwrites
 * his edits. The seeded values mirror the hardcoded NAV_COLUMNS fallback in
 * components/layout/Footer.tsx, so the live footer is identical after wiring.
 *
 * Uses createIfNotExists + patch.set('footerColumns') so the singleton's other
 * fields (contact, socialLinks, dealsPage, …) are preserved.
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');
const SETTINGS_ID = 'globalSettings';

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
  if (!DRY_RUN && !token) throw new Error('SANITY_API_TOKEN (write scope) is required.');
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

// --- The current footer nav columns (mirrors Footer.tsx NAV_COLUMNS) --------
const COLUMNS: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: 'About Us',
    links: [
      { label: 'About Perfect Imprints', href: '/about' },
      { label: 'Company Core Values', href: '/company-core-values' },
      { label: 'Blog', href: '/blog' },
      { label: 'Privacy & Security', href: '/privacy-security' },
    ],
  },
  {
    heading: 'Popular Links',
    links: [
      { label: 'Drinkware', href: '/cat/drinkware' },
      { label: 'Bags & Totes', href: '/cat/bags-and-totes' },
      { label: 'T-Shirts', href: '/cat/t-shirts' },
      { label: 'Writing Instruments', href: '/cat/writing-instruments' },
      { label: 'Trade Show & Event', href: '/cat/trade-show-and-event' },
    ],
  },
  {
    heading: 'Customer Service',
    links: [
      { label: 'FAQs', href: '/faq' },
      { label: 'Sample Policy', href: '/sample-policy' },
      { label: 'US & International Shipping', href: '/shipping-policy' },
      { label: 'Returns & Refunds', href: '/returns' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
];

function slugKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildFooterColumns() {
  return COLUMNS.map((col, ci) => ({
    _key: `col-${slugKey(col.heading)}`,
    _type: 'footerColumn',
    heading: col.heading,
    links: col.links.map((l, li) => ({
      _key: `lnk-${ci}-${li}-${slugKey(l.label)}`,
      _type: 'link',
      label: l.label,
      href: l.href,
      external: false,
    })),
  }));
}

interface ExistingSettings {
  footerColumns?: unknown[];
}

async function main(): Promise<void> {
  console.log('Seeding globalSettings.footerColumns (idempotent, non-destructive).\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}\n`);

  const client = buildClient();

  const existing = await client.fetch<ExistingSettings | null>(
    `*[_id == $id][0]{ footerColumns }`,
    { id: SETTINGS_ID },
  );
  const current = existing?.footerColumns;
  const hasExisting = Array.isArray(current) && current.length > 0;

  if (hasExisting) {
    console.log(
      `Nothing to change — footerColumns already has ${current!.length} column(s); ` +
        'leaving Patrick\'s edits untouched.',
    );
    return;
  }

  const columns = buildFooterColumns();
  console.log('footerColumns is empty → seeding 3 columns:');
  for (const col of columns) {
    console.log(`  • ${col.heading} (${col.links.length} links)`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — no write performed.');
    return;
  }

  await client.createIfNotExists({ _id: SETTINGS_ID, _type: 'globalSettings' });
  await client.patch(SETTINGS_ID).set({ footerColumns: columns }).commit();
  console.log(`\n  ✓ patched ${SETTINGS_ID}.footerColumns (3 columns, 14 links)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
