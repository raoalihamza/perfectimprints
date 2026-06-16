/**
 * Identify blogs whose Sanity body image count is less than the raw scrape's
 * image count (i.e. blogs where the original import dropped images silently
 * due to upload failures), then delete those docs from Sanity. After this,
 * `pnpm import-blogs --resume` will re-import only the deleted slugs.
 *
 *   pnpm tsx scripts/migrations/delete-affected-blogs.ts            # live
 *   pnpm tsx scripts/migrations/delete-affected-blogs.ts --dry-run  # log only
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');
const RAW_DIR = resolve(PROJECT_ROOT, 'data/blogs/raw');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
  if (!projectId || (!DRY_RUN && !token)) {
    throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID + SANITY_API_TOKEN required.');
  }
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

interface RawBlog {
  slug: string;
  images?: string[];
}

async function main(): Promise<void> {
  const c = buildClient();

  // 1. Find Sanity body image count per slug.
  const docs = (await c.fetch<{ slug: string; bodyImgs: number }[]>(
    `*[_type=="blogPost" && !(_id in path("drafts.**"))] { "slug": slug.current, "bodyImgs": count(body[_type=="image"]) }`,
  )) ?? [];
  const sanityImgCount = new Map(docs.map((d) => [d.slug, d.bodyImgs]));

  // 2. For each raw JSON, compute deficit. Threshold: any deficit >= 1.
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
  const affected: string[] = [];
  for (const f of files) {
    const slug = f.replace(/\.json$/, '');
    const d = JSON.parse(readFileSync(resolve(RAW_DIR, f), 'utf8')) as RawBlog;
    const rawCount = (d.images || []).length;
    const sanCount = sanityImgCount.get(slug) ?? 0;
    if (rawCount > sanCount) affected.push(slug);
  }

  console.log(`Affected slugs (raw images > sanity images): ${affected.length}`);
  if (DRY_RUN) {
    console.log(`First 10:`);
    for (const s of affected.slice(0, 10)) console.log(`  ${s}`);
    console.log(`\n[dry-run] would delete published doc + any draft for each.`);
    return;
  }

  // 3. Delete published + draft docs for affected slugs. Batch in transactions.
  const idsToDelete: string[] = [];
  for (const slug of affected) {
    idsToDelete.push(`blog-post-${slug}`);
    idsToDelete.push(`drafts.blog-post-${slug}`);
  }

  const BATCH = 50;
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const batch = idsToDelete.slice(i, i + BATCH);
    const tx = c.transaction();
    for (const id of batch) tx.delete(id);
    try {
      await tx.commit({ visibility: 'sync' });
      deleted += batch.length;
      if (i % 500 === 0 || i + BATCH >= idsToDelete.length) {
        console.log(`  ${deleted}/${idsToDelete.length} delete ops committed`);
      }
    } catch (e) {
      console.warn(`  Batch fail offset ${i}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\nDone. ${affected.length} slugs cleared. Now run \`pnpm import-blogs --resume\` to re-import.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
