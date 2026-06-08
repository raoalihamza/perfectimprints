/**
 * Import brands from data/geiger/brands.json into Sanity.
 *
 *   pnpm tsx scripts/migrations/import-brands.ts            # real run
 *   pnpm tsx scripts/migrations/import-brands.ts --dry-run  # log only
 *
 * Idempotent: each brand gets a deterministic _id (`brand-<slug>`).
 * Re-runs patch existing documents in place and skip logo asset uploads
 * when the doc already references one.
 *
 * Requires SANITY_API_TOKEN with write scope (Editor or higher).
 */

import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_FLAG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_FLAG ? Number(LIMIT_FLAG.split('=')[1]) : Number.POSITIVE_INFINITY;

const PROJECT_ROOT = resolve(__dirname, '../..');
const BRANDS_JSON_PATH = resolve(PROJECT_ROOT, 'data/geiger/brands.json');

// Minimal .env.local loader so this script can run standalone via tsx.
// Skips any keys already present in process.env.
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
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
loadDotEnvLocal();

interface BrandJson {
  name: string;
  slug: string;
  letter: string;
  geigerUrl: string;
  logoPath: string | null;
  logoAlt?: string;
  productCount: number;
  description: string | null;
}

interface BrandsJsonFile {
  scrapedAt: string;
  totalBrands: number;
  brandsWithLogos: number;
  brandsWithProducts: number;
  source: string;
  brands: BrandJson[];
}

function loadBrandsJson(): BrandsJsonFile {
  if (!existsSync(BRANDS_JSON_PATH)) {
    throw new Error(
      `brands.json not found at ${BRANDS_JSON_PATH}. Run \`python -m scripts.scrapers.geiger.run --phase e\` first.`,
    );
  }
  return JSON.parse(readFileSync(BRANDS_JSON_PATH, 'utf8')) as BrandsJsonFile;
}

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;

  if (!projectId) {
    throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID) is required.');
  }
  if (!DRY_RUN && !token) {
    throw new Error('SANITY_API_TOKEN is required for writes. Use --dry-run to skip writes.');
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token,
  });
}

interface ExistingBrandDoc {
  _id: string;
  logo?: { asset?: { _ref: string } };
  description?: string;
  geigerUrl?: string;
}

async function fetchExisting(client: SanityClient): Promise<Map<string, ExistingBrandDoc>> {
  if (DRY_RUN) return new Map();
  const docs = (await client.fetch<ExistingBrandDoc[]>(
    `*[_type == "brand" && _id in path("brand-**")] { _id, logo, description, geigerUrl }`,
  )) ?? [];
  return new Map(docs.map((d) => [d._id, d]));
}

async function uploadLogo(
  client: SanityClient,
  logoPath: string,
  brandName: string,
): Promise<string | null> {
  const absolute = resolve(PROJECT_ROOT, 'data', logoPath);
  if (!existsSync(absolute)) {
    console.warn(`    Logo file missing on disk: ${absolute} (skipping upload)`);
    return null;
  }
  if (DRY_RUN) {
    console.log(`    [dry-run] would upload ${basename(absolute)} (${brandName})`);
    return null;
  }
  const asset = await client.assets.upload('image', createReadStream(absolute), {
    filename: basename(absolute),
    title: brandName,
  });
  return asset._id;
}

function brandDocId(slug: string): string {
  return `brand-${slug}`;
}

async function importOne(
  client: SanityClient,
  brand: BrandJson,
  existing: Map<string, ExistingBrandDoc>,
): Promise<{ updated: boolean; assetReused: boolean; assetUploaded: boolean }> {
  const id = brandDocId(brand.slug);
  const existingDoc = existing.get(id);

  // Re-use existing logo asset ref if the doc already has one; otherwise
  // upload a fresh asset from disk. This keeps reruns from churning assets.
  let assetRef: string | undefined = existingDoc?.logo?.asset?._ref;
  let assetUploaded = false;
  if (!assetRef && brand.logoPath) {
    const uploadedId = await uploadLogo(client, brand.logoPath, brand.name);
    if (uploadedId) {
      assetRef = uploadedId;
      assetUploaded = true;
    }
  }

  const doc: Record<string, unknown> = {
    _id: id,
    _type: 'brand',
    name: brand.name,
    slug: { _type: 'slug', current: brand.slug },
    geigerUrl: brand.geigerUrl || undefined,
    productCount: brand.productCount,
  };
  if (assetRef) {
    doc.logo = {
      _type: 'image',
      asset: { _type: 'reference', _ref: assetRef },
      alt: brand.logoAlt || brand.name,
    };
  }
  // Preserve Patrick-edited description/featured on rerun (don't clobber).
  if (existingDoc?.description !== undefined) {
    doc.description = existingDoc.description;
  } else if (brand.description) {
    doc.description = brand.description;
  }

  if (DRY_RUN) {
    console.log(`    [dry-run] would ${existingDoc ? 'update' : 'create'} ${id} (${brand.name})`);
    return { updated: !!existingDoc, assetReused: !!existingDoc?.logo, assetUploaded };
  }

  // Use `createOrReplace` for fresh creates; for updates use `patch` so we
  // don't overwrite the `featured` boolean Patrick may have toggled.
  if (existingDoc) {
    await client
      .patch(id)
      .set({
        name: doc.name,
        slug: doc.slug,
        geigerUrl: doc.geigerUrl,
        productCount: doc.productCount,
        ...(doc.logo ? { logo: doc.logo } : {}),
      })
      .commit();
  } else {
    doc.featured = false;
    await client.createOrReplace(doc as never);
  }

  return { updated: !!existingDoc, assetReused: !!existingDoc?.logo, assetUploaded };
}

async function main(): Promise<void> {
  const { brands, totalBrands, brandsWithLogos, brandsWithProducts } = loadBrandsJson();
  console.log(
    `brands.json: ${totalBrands} total, ${brandsWithLogos} with logos, ${brandsWithProducts} with products`,
  );
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITES'}`);
  if (LIMIT < brands.length) {
    console.log(`Limited to first ${LIMIT} brands.`);
  }

  const client = buildClient();
  const existing = await fetchExisting(client);
  console.log(`Existing brand docs in Sanity: ${existing.size}\n`);

  let processed = 0;
  let created = 0;
  let updated = 0;
  let uploaded = 0;
  let reused = 0;
  let failed = 0;

  for (const brand of brands.slice(0, LIMIT)) {
    processed += 1;
    try {
      const r = await importOne(client, brand, existing);
      if (r.updated) updated += 1;
      else created += 1;
      if (r.assetUploaded) uploaded += 1;
      if (r.assetReused) reused += 1;
      if (processed % 25 === 0) {
        console.log(`  [${processed}/${Math.min(LIMIT, brands.length)}] last=${brand.name}`);
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  FAIL ${brand.slug}: ${msg}`);
    }
  }

  console.log('\nDone.');
  console.log(`  Processed:        ${processed}`);
  console.log(`  Created:          ${created}`);
  console.log(`  Updated:          ${updated}`);
  console.log(`  Logos uploaded:   ${uploaded}`);
  console.log(`  Logos reused:     ${reused}`);
  console.log(`  Failed:           ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
