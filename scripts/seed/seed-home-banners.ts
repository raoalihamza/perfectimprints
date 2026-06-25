/**
 * Pre-fill homePage.bannerRow with Perfect Imprints' OWN home-page banner tiles
 * (M5-506 follow-up). Patrick's current home has a "Sunglasses / Event Tents /
 * Hats" row of small banner tiles; this pulls those three banner images from
 * PI's live site, uploads each into a SELF-HOSTED Sanity asset (never hot-linked
 * to the old site), and sets each banner's `link` to the equivalent new-site
 * category route (the slugs are preserved, so the old `/cat/<slug>` maps 1:1).
 *
 *   tsx scripts/seed/seed-home-banners.ts             # upload + patch
 *   tsx scripts/seed/seed-home-banners.ts --dry-run   # print, no writes
 *
 * Asset upload is content-hash deduped by Sanity, so re-running does NOT create
 * duplicate assets. Patrick can swap any banner in Studio afterwards.
 *
 * Requires SANITY_API_TOKEN with write scope + network access to the MPower CDN.
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

interface BannerDef {
  key: string;
  imageUrl: string;
  filename: string;
  link: string;
  alt: string;
}

// PI's live "Sunglasses / Event Tents / Hats" small-banner row. Old links were
// https://www.perfectimprints.com/cat/<slug>; the new site preserves /cat/<slug>
// (all three slugs verified present in data/pi-urls/category-urls.json).
const BANNERS: BannerDef[] = [
  {
    key: 'banner-sunglasses',
    imageUrl:
      'https://store-media.mpowerpromo.com/65e7a9eb2db27b3637eb81b2/assets/Sunglasses_HomePageBannerImages_SmallBanner-SUMMER-1778086620395.jpg',
    filename: 'home-banner-sunglasses.jpg',
    link: '/cat/sunglasses',
    alt: 'Custom Sunglasses',
  },
  {
    key: 'banner-event-tents',
    imageUrl:
      'https://store-media.mpowerpromo.com/65e7a9eb2db27b3637eb81b2/assets/EventTents_HomePage_SmallBanner-SUMMER-1778086682603.jpg',
    filename: 'home-banner-event-tents.jpg',
    link: '/cat/canopy-tents',
    alt: 'Custom Event Tents & Canopies',
  },
  {
    key: 'banner-hats',
    imageUrl:
      'https://store-media.mpowerpromo.com/65e7a9eb2db27b3637eb81b2/assets/Hats_HomePageBannerImages_SmallBanner-SUMMER-1778086702623.jpg',
    filename: 'home-banner-hats.jpg',
    link: '/cat/caps',
    alt: 'Custom Hats & Caps',
  },
];

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  console.log(`Pre-filling homePage.bannerRow with ${BANNERS.length} PI banners.`);
  for (const b of BANNERS) console.log(`  • ${b.alt}  → ${b.link}`);
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}\n`);

  const client = buildClient();

  // Resolve the homePage singleton id (fall back to the conventional id).
  const homeId: string =
    (await client.fetch<string | null>(`*[_type == "homePage"][0]._id`)) || 'homePage';
  console.log(`homePage doc: ${homeId}`);

  const bannerRow: Array<Record<string, unknown>> = [];
  for (const b of BANNERS) {
    const bytes = await fetchImage(b.imageUrl);
    console.log(`  fetched ${b.filename} (${(bytes.length / 1024).toFixed(0)} KB)`);
    if (DRY_RUN) continue;
    const asset = await client.assets.upload('image', bytes, {
      filename: b.filename,
      contentType: 'image/jpeg',
    });
    console.log(`    uploaded asset ${asset._id}`);
    bannerRow.push({
      _key: b.key,
      _type: 'object',
      image: { _type: 'image', asset: { _type: 'reference', _ref: asset._id } },
      link: b.link,
      alt: b.alt,
    });
  }

  if (DRY_RUN) {
    console.log('\nDry run — no upload/patch performed.');
    return;
  }

  // Ensure the singleton exists so .patch() can't fail on a missing doc.
  await client.createIfNotExists({ _id: homeId, _type: 'homePage' });
  await client.patch(homeId).set({ bannerRow }).commit();
  console.log(`\nPatched ${homeId}.bannerRow with ${bannerRow.length} banners. Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
