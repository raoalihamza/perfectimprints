/**
 * Seed / migrate the homePage singleton's top content (Part 1):
 *
 *   1. heroText  — eyebrow / H1 / sub-paragraph (Patrick's exact copy). The home
 *      hero is text-only (no image) so the LCP stays text-bound and fast.
 *   2. bannerRowHeading + bannerRowSubheading — the H2 + line above the banner row.
 *   3. valueProps[].body — MIGRATE legacy plain-string bodies to portable text so
 *      Patrick can add hyperlinks (e.g. link "Rush Production Available" to the
 *      Rush Products page). Existing pillar text is PRESERVED, never lost.
 *
 *   tsx scripts/seed/seed-home-content.ts             # write
 *   tsx scripts/seed/seed-home-content.ts --dry-run   # print, no writes
 *
 * Idempotent: heroText + banner-row headings are only set when blank (so a value
 * Patrick already edited in Studio is never clobbered); pillar bodies already in
 * portable-text form are left untouched. Requires SANITY_API_TOKEN (write scope).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');

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

const HERO_TEXT = {
  eyebrow: 'BULK PROMOTIONAL EXPERTS SINCE 1999',
  headline: 'Custom Promotional Products That People Actually Use',
  subheadline:
    'Branded apparel, drinkware, bags, tech, and giveaways for trade shows, employee gifts, safety programs, and customer thank-yous. 22,000+ products with bulk volume pricing, rush options, and free art proofs.',
};

const BANNER_ROW_HEADING = 'Featured Product Categories';
const BANNER_ROW_SUBHEADING =
  'Seasonal promos your customers and team will love and use right now!';

// Default pillar copy used only when the doc has no valueProps at all.
const DEFAULT_PILLARS: Array<{ title: string; body: string }> = [
  {
    title: 'Bulk Pricing on 22,000+ Products',
    body: 'Custom apparel, drinkware, bags, tech, writing, and giveaways — wholesale pricing scaled to your order size.',
  },
  {
    title: 'Rush Production Available',
    body: 'Promotional products with 1–5 day production for trade shows, hires, and on-site events that can’t wait.',
  },
  {
    title: 'Dedicated Reps, Free Art Proofs',
    body: 'Real account managers — not AI chat. Free art proofs before production so your branded items land right the first time.',
  },
];

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}${keyCounter}`;
}

/** Wrap a plain string in one portable-text paragraph block. */
function stringToBlocks(text: string): Array<Record<string, unknown>> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [
    {
      _type: 'block',
      _key: nextKey('b'),
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: nextKey('s'), text: trimmed, marks: [] }],
    },
  ];
}

interface RawPillar {
  _key?: string;
  _type?: string;
  title?: string;
  body?: string | Array<Record<string, unknown>>;
}

interface RawHome {
  _id: string;
  heroText?: { eyebrow?: string; headline?: string; subheadline?: string };
  bannerRowHeading?: string;
  bannerRowSubheading?: string;
  valueProps?: RawPillar[];
}

async function main(): Promise<void> {
  console.log(`Seeding homePage top content. Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}\n`);
  const client = buildClient();

  const doc = await client.fetch<RawHome | null>(
    `*[_type == "homePage"][0]{ _id, heroText, bannerRowHeading, bannerRowSubheading, valueProps }`,
  );
  const homeId = doc?._id || 'homePage';
  console.log(`homePage doc: ${homeId}`);

  const set: Record<string, unknown> = {};

  // 1. heroText — only fill blanks (don't clobber edits Patrick already made).
  const heroText = { ...(doc?.heroText ?? {}) };
  let heroChanged = false;
  for (const k of ['eyebrow', 'headline', 'subheadline'] as const) {
    if (!heroText[k]?.trim()) {
      heroText[k] = HERO_TEXT[k];
      heroChanged = true;
    }
  }
  if (heroChanged) set.heroText = heroText;

  // 2. Banner-row headings — only fill blanks.
  if (!doc?.bannerRowHeading?.trim()) set.bannerRowHeading = BANNER_ROW_HEADING;
  if (!doc?.bannerRowSubheading?.trim()) set.bannerRowSubheading = BANNER_ROW_SUBHEADING;

  // 3. valueProps — migrate string bodies → portable text, preserving text.
  const existing = doc?.valueProps ?? [];
  let pillarsChanged = false;
  let valueProps: RawPillar[];
  if (existing.length === 0) {
    valueProps = DEFAULT_PILLARS.map((p) => ({
      _key: nextKey('vp'),
      _type: 'object',
      title: p.title,
      body: stringToBlocks(p.body),
    }));
    pillarsChanged = true;
  } else {
    valueProps = existing.map((p) => {
      if (typeof p.body === 'string') {
        pillarsChanged = true;
        return { ...p, body: stringToBlocks(p.body) };
      }
      return p; // already portable text → leave untouched
    });
  }
  if (pillarsChanged) set.valueProps = valueProps;

  if (Object.keys(set).length === 0) {
    console.log('Nothing to change — home content already seeded/migrated.');
    return;
  }

  console.log('Will set:', Object.keys(set).join(', '));
  if (DRY_RUN) {
    console.log('\n' + JSON.stringify(set, null, 2));
    console.log('\nDry run — no writes performed.');
    return;
  }

  await client.createIfNotExists({ _id: homeId, _type: 'homePage' });
  await client.patch(homeId).set(set).commit();
  console.log(`\nPatched ${homeId}. Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
