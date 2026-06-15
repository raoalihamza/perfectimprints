/**
 * One-off patch: for each published blogPost, remove the first body image
 * block whose asset matches `headerImage.asset` — PI duplicates the hero
 * image in the body and our import-blogs.ts dedupe missed cases where
 * MPower's CDN used a different version timestamp on the body variant.
 *
 *   pnpm tsx scripts/migrations/dedupe-header-images.ts           # live patch
 *   pnpm tsx scripts/migrations/dedupe-header-images.ts --dry-run # log only
 *
 * Idempotent: re-runs are safe (a doc only gets patched if it actually has
 * the duplicate). We scan only the first 6 body blocks since the duplicate
 * always appears at the very start.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');
const SCAN_DEPTH = 6;

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
  if (!projectId || (!DRY_RUN && !token)) {
    throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID + SANITY_API_TOKEN required.');
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token,
  });
}

interface BodyBlock {
  _key?: string;
  _type: string;
  asset?: { _ref?: string };
  children?: { text?: string }[];
}

interface BlogDoc {
  _id: string;
  slug: { current: string };
  headerImage?: { asset?: { _ref?: string } };
  body?: BodyBlock[];
}

async function fetchAllPublished(client: SanityClient): Promise<BlogDoc[]> {
  // Paginate so we don't hit a single-query payload cap.
  const PAGE = 100;
  const out: BlogDoc[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = (await client.fetch<BlogDoc[]>(
      `*[_type == "blogPost" && !(_id in path("drafts.**"))] | order(_id asc) [${offset}...${offset + PAGE}] {
        _id, slug, headerImage, body
      }`,
    )) ?? [];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

async function main(): Promise<void> {
  const client = buildClient();
  console.log(`Fetching all published blogPosts...`);
  const docs = await fetchAllPublished(client);
  console.log(`  ${docs.length} docs fetched`);

  let scanned = 0;
  let patched = 0;
  let noHeader = 0;
  let alreadyClean = 0;
  let matchedByAssetRef = 0;
  let matchedByPosition = 0;

  for (const doc of docs) {
    scanned += 1;
    const headerRef = doc.headerImage?.asset?._ref;
    if (!headerRef) {
      noHeader += 1;
      continue;
    }
    const body = doc.body || [];

    // Strategy 1: exact asset-ref match in body[0..SCAN_DEPTH].
    // Strategy 2 (NEW): if header exists and an image appears in the first
    // SCAN_DEPTH blocks, assume it's PI's hero-image duplicate and remove
    // it. This handles cases where MPower uploads a system-thumbnail variant
    // (e.g. `_1200_1200_*.jpg`) as the og:image and the full-resolution
    // version in the body — same visual image but different asset refs.
    let dupeIdx = -1;
    let matchKind: 'ref' | 'position' | null = null;
    for (let i = 0; i < Math.min(SCAN_DEPTH, body.length); i++) {
      const b = body[i];
      if (b._type === 'image' && b.asset?._ref === headerRef) {
        dupeIdx = i;
        matchKind = 'ref';
        break;
      }
    }
    if (dupeIdx === -1) {
      for (let i = 0; i < Math.min(SCAN_DEPTH, body.length); i++) {
        const b = body[i];
        if (b._type === 'image') {
          dupeIdx = i;
          matchKind = 'position';
          break;
        }
      }
    }
    if (dupeIdx === -1) {
      alreadyClean += 1;
      continue;
    }
    const newBody = [...body.slice(0, dupeIdx), ...body.slice(dupeIdx + 1)];
    if (DRY_RUN) {
      console.log(`  [dry-run] ${doc.slug.current} — would remove body[${dupeIdx}] (${matchKind})`);
      patched += 1;
      if (matchKind === 'ref') matchedByAssetRef += 1;
      else matchedByPosition += 1;
      continue;
    }
    try {
      await client.patch(doc._id).set({ body: newBody }).commit();
      patched += 1;
      if (matchKind === 'ref') matchedByAssetRef += 1;
      else matchedByPosition += 1;
      if (patched % 25 === 0) console.log(`  patched ${patched}…`);
    } catch (e) {
      console.error(`  FAIL ${doc.slug.current}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Scanned:                ${scanned}`);
  console.log(`  No header img:          ${noHeader}`);
  console.log(`  Already clean:          ${alreadyClean}`);
  console.log(`  Patched:                ${patched}${DRY_RUN ? ' (dry-run, no writes)' : ''}`);
  console.log(`    by asset-ref match:   ${matchedByAssetRef}`);
  console.log(`    by position (top img): ${matchedByPosition}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
