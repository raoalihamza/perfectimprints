/**
 * Backfill images for already-imported blog drafts/published docs.
 *
 *   pnpm tsx scripts/migrations/backfill-blog-images.ts            # full run
 *   pnpm tsx scripts/migrations/backfill-blog-images.ts --dry-run  # log-only
 *   pnpm tsx scripts/migrations/backfill-blog-images.ts --limit=10 # smoke test
 *   pnpm tsx scripts/migrations/backfill-blog-images.ts --slug=foo # one blog
 *
 * Re-reads `data/blogs/raw/<slug>.json`, finds the matching Sanity blogPost
 * doc (draft OR published) by slug, fetches header + inline images from
 * Wayback (or direct CDN), uploads to Sanity assets, and patches the doc.
 *
 * Idempotent: if `headerImage.asset` already exists, header is skipped.
 * Inline image blocks are matched by their `_placeholderSrc` (preserved on
 * skip via the main import) — but since `--skip-images` drops image blocks
 * entirely from the body, this script does NOT re-add them; instead it sets
 * just the header image (the most important one for blog cards + LCP).
 *
 * Why a separate pass? The main import has hundreds of inline images per
 * site that hit timeouts on the slow Wayback CDN, blocking each blog for
 * 60s+ even with parallel fetches. Decoupling lets the migration ship
 * text-only fast, then images get backfilled at a calmer pace.
 *
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const LIMIT_FLAG = ARGS.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_FLAG ? Number(LIMIT_FLAG.split('=')[1]) : Number.POSITIVE_INFINITY;
const SLUG_FLAGS = ARGS.filter((a) => a.startsWith('--slug=')).map((a) => a.split('=')[1]);
const IMAGE_FETCH_TIMEOUT_MS = 12_000;
const CONCURRENCY = 4;

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

interface RawBlog {
  slug: string;
  title: string;
  headerImageUrl?: string | null;
  headerImagePath?: string | null;
}

interface SanityDoc {
  _id: string;
  slug?: { current?: string };
  headerImage?: { asset?: { _ref?: string } };
}

async function uploadFromUrl(
  client: SanityClient,
  url: string,
  title: string,
): Promise<string | null> {
  if (DRY_RUN) return `__dry-${url.slice(-20)}`;
  if (url.includes('/undefined/') || url.includes('undefined.')) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) return null;
    let filename = url.split('?')[0].split('/').pop() || 'header.jpg';
    if (filename.length < 3 || !filename.includes('.')) filename = 'header.jpg';
    const asset = await client.assets.upload('image', buf, { filename, title });
    return asset._id;
  } catch {
    return null;
  }
}

async function findDocForSlug(client: SanityClient, slug: string): Promise<SanityDoc | null> {
  const docs = (await client.fetch<SanityDoc[]>(
    `*[_type == "blogPost" && slug.current == $slug]{ _id, slug, headerImage }`,
    { slug },
  )) ?? [];
  if (docs.length === 0) return null;
  // Prefer published over draft if both exist.
  return docs.find((d) => !d._id.startsWith('drafts.')) ?? docs[0];
}

interface BackfillStat {
  total: number;
  alreadyHadHeader: number;
  headerUploaded: number;
  headerFailed: number;
  noSourceUrl: number;
  noSanityDoc: number;
  patchFailed: number;
}

async function backfillOne(
  client: SanityClient,
  blog: RawBlog,
  stat: BackfillStat,
): Promise<void> {
  const sourceUrl = blog.headerImageUrl;
  if (!sourceUrl) {
    stat.noSourceUrl += 1;
    return;
  }
  const doc = await findDocForSlug(client, blog.slug);
  if (!doc) {
    stat.noSanityDoc += 1;
    return;
  }
  if (doc.headerImage?.asset?._ref) {
    stat.alreadyHadHeader += 1;
    return;
  }
  const assetId = await uploadFromUrl(client, sourceUrl, `Blog header ${blog.slug}`);
  if (!assetId) {
    stat.headerFailed += 1;
    return;
  }
  if (DRY_RUN) {
    stat.headerUploaded += 1;
    return;
  }
  try {
    await client
      .patch(doc._id)
      .set({
        headerImage: {
          _type: 'image',
          asset: { _type: 'reference', _ref: assetId },
          alt: blog.title,
        },
      })
      .commit();
    stat.headerUploaded += 1;
  } catch (e) {
    stat.patchFailed += 1;
    console.warn(`  patch failed ${blog.slug}: ${e instanceof Error ? e.message : e}`);
  }
}

async function processInChunks<T>(items: T[], size: number, fn: (i: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map(fn));
  }
}

async function main(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    throw new Error(`raw blogs dir missing at ${RAW_DIR}`);
  }
  const allFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
  let blogs: RawBlog[] = allFiles.map(
    (f) => JSON.parse(readFileSync(resolve(RAW_DIR, f), 'utf8')) as RawBlog,
  );
  if (SLUG_FLAGS.length) {
    blogs = blogs.filter((b) => SLUG_FLAGS.includes(b.slug));
    console.log(`Filtered to ${blogs.length} matching --slug flags`);
  }
  if (Number.isFinite(LIMIT)) {
    blogs = blogs.slice(0, LIMIT);
    console.log(`Limited to first ${blogs.length}`);
  }
  console.log(`Backfilling header images for ${blogs.length} blogs`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | concurrency=${CONCURRENCY}`);

  const client = buildClient();
  const stat: BackfillStat = {
    total: blogs.length,
    alreadyHadHeader: 0,
    headerUploaded: 0,
    headerFailed: 0,
    noSourceUrl: 0,
    noSanityDoc: 0,
    patchFailed: 0,
  };

  let done = 0;
  await processInChunks(blogs, CONCURRENCY, async (b) => {
    await backfillOne(client, b, stat);
    done += 1;
    if (done % 25 === 0 || done === blogs.length) {
      console.log(
        `  [${done}/${blogs.length}] uploaded=${stat.headerUploaded} alreadyHad=${stat.alreadyHadHeader} failed=${stat.headerFailed} noSrc=${stat.noSourceUrl} noDoc=${stat.noSanityDoc}`,
      );
    }
  });

  console.log('\nDone.');
  console.log(`  Total processed:    ${stat.total}`);
  console.log(`  Headers uploaded:   ${stat.headerUploaded}`);
  console.log(`  Already had header: ${stat.alreadyHadHeader}`);
  console.log(`  Header fetch fail:  ${stat.headerFailed}`);
  console.log(`  Sanity patch fail:  ${stat.patchFailed}`);
  console.log(`  No source URL:      ${stat.noSourceUrl}`);
  console.log(`  No Sanity doc:      ${stat.noSanityDoc}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
