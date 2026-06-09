/**
 * Promote all blogPost drafts in Sanity to published.
 *
 *   pnpm tsx scripts/migrations/publish-blog-drafts.ts           # promote all drafts
 *   pnpm tsx scripts/migrations/publish-blog-drafts.ts --dry-run # list-only
 *   pnpm tsx scripts/migrations/publish-blog-drafts.ts --slug=foo --slug=bar # publish specific drafts only (sample)
 *
 * Run this AFTER:
 *   1. `pnpm import-blogs` has populated Sanity with drafts.
 *   2. You have manually published 5 representative sample drafts in Studio.
 *   3. Those 5 samples render cleanly on staging (Part C visual verification).
 *
 * Uses a single Sanity transaction so the promote is atomic per batch. Batches
 * of 50 docs to stay within rate/payload limits.
 *
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const EXCLUDE_STUBS = ARGS.includes('--exclude-stubs');
const SLUG_FLAGS = ARGS.filter((a) => a.startsWith('--slug=')).map((a) => a.split('=')[1]);
const BATCH_SIZE = 15;
const STUB_MARKER = 'This post is being migrated. Please check back soon';

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
  if (!DRY_RUN && !token) {
    throw new Error('SANITY_API_TOKEN with write scope is required. Use --dry-run to list-only.');
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token,
  });
}

interface DraftDoc {
  _id: string;
  slug?: { current?: string };
  title?: string;
}

async function fetchDrafts(client: SanityClient): Promise<DraftDoc[]> {
  const filters: string[] = [`_type == "blogPost"`, `_id in path("drafts.**")`];
  if (SLUG_FLAGS.length) filters.push(`slug.current in $slugs`);
  if (EXCLUDE_STUBS) {
    // A stub draft has body[0].children[0].text starting with the marker
    // string. Real content blocks never do.
    filters.push(`!(body[0].children[0].text match $stubMarker + "*")`);
  }
  const groq = `*[${filters.join(' && ')}]{ _id, title, slug }`;
  return (
    (await client.fetch<DraftDoc[]>(groq, {
      slugs: SLUG_FLAGS,
      stubMarker: STUB_MARKER,
    })) ?? []
  );
}

async function publishBatch(client: SanityClient, batch: DraftDoc[]): Promise<void> {
  const tx = client.transaction();
  for (const draft of batch) {
    // Fetch the full draft doc so we can promote it verbatim.
    const full = (await client.getDocument(draft._id)) as Record<string, unknown> | null;
    if (!full) continue;
    const publishedId = draft._id.replace(/^drafts\./, '');
    tx.createOrReplace({ ...full, _id: publishedId } as never);
    tx.delete(draft._id);
  }
  await tx.commit({ visibility: 'sync' });
}

async function main(): Promise<void> {
  const client = buildClient();
  const drafts = await fetchDrafts(client);
  console.log(`Found ${drafts.length} blogPost drafts`);
  if (SLUG_FLAGS.length) console.log(`Filtered to slugs: ${SLUG_FLAGS.join(', ')}`);

  if (drafts.length === 0) {
    console.log('Nothing to publish.');
    return;
  }

  const preview = drafts.slice(0, 10).map((d) => `${d.slug?.current ?? '?'} (${d._id})`);
  console.log('First 10 drafts:');
  for (const p of preview) console.log(`  - ${p}`);

  if (DRY_RUN) {
    console.log(`\n[dry-run] Would publish ${drafts.length} drafts. No writes made.`);
    return;
  }

  let published = 0;
  for (let i = 0; i < drafts.length; i += BATCH_SIZE) {
    const batch = drafts.slice(i, i + BATCH_SIZE);
    try {
      await publishBatch(client, batch);
      published += batch.length;
      console.log(`  [${published}/${drafts.length}] published`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  Batch starting at ${i} failed: ${msg}`);
    }
  }

  console.log(`\nDone. Published ${published}/${drafts.length} drafts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
