/**
 * Wipe all blogPost docs (drafts + published) from Sanity for a clean re-import.
 *
 *   pnpm tsx scripts/migrations/wipe-blog-posts.ts --dry-run   # list-only
 *   pnpm tsx scripts/migrations/wipe-blog-posts.ts --force     # actually delete
 *
 * Authors and blogCategory docs are LEFT IN PLACE — they're idempotently
 * upserted by `import-blogs.ts` anyway. Only blogPost docs are wiped.
 *
 * Image assets uploaded by the previous import are NOT deleted automatically
 * (Sanity garbage-collects unreferenced assets eventually). If you want a
 * full clean slate including assets, run `pnpm tsx ... --include-assets`.
 *
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const FORCE = ARGS.includes('--force');
const INCLUDE_ASSETS = ARGS.includes('--include-assets');
const BATCH_SIZE = 50;

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
    throw new Error('SANITY_API_TOKEN with write scope is required.');
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token,
  });
}

async function fetchAllBlogPostIds(client: SanityClient): Promise<string[]> {
  const docs = (await client.fetch<{ _id: string }[]>(`*[_type == "blogPost"]{ _id }`)) ?? [];
  return docs.map((d) => d._id);
}

async function fetchOrphanBlogImageAssets(client: SanityClient): Promise<string[]> {
  // Assets uploaded with title "Blog header ..." or "Blog inline ...".
  // These are images we uploaded during a previous blog migration.
  const docs = (await client.fetch<{ _id: string }[]>(
    `*[_type == "sanity.imageAsset" && (title match "Blog header*" || title match "Blog inline*")]{ _id }`,
  )) ?? [];
  return docs.map((d) => d._id);
}

async function deleteInBatches(client: SanityClient, ids: string[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const tx = client.transaction();
    for (const id of batch) tx.delete(id);
    try {
      await tx.commit({ visibility: 'sync' });
      deleted += batch.length;
      console.log(`  [${deleted}/${ids.length}] deleted`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  batch at offset ${i} failed: ${msg.slice(0, 100)}`);
    }
  }
  return deleted;
}

async function main(): Promise<void> {
  const client = buildClient();

  const blogIds = await fetchAllBlogPostIds(client);
  const draftCount = blogIds.filter((id) => id.startsWith('drafts.')).length;
  const publishedCount = blogIds.length - draftCount;

  console.log(`Found ${blogIds.length} blogPost docs (${draftCount} drafts, ${publishedCount} published)`);

  if (INCLUDE_ASSETS) {
    const assetIds = await fetchOrphanBlogImageAssets(client);
    console.log(`Found ${assetIds.length} previously-uploaded blog image assets`);
    blogIds.push(...assetIds);
  }

  if (blogIds.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  if (!FORCE && !DRY_RUN) {
    console.log('\n[REFUSING TO DELETE] Pass --force to actually delete, or --dry-run to list.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] First 10 IDs that would be deleted:');
    for (const id of blogIds.slice(0, 10)) console.log(`  - ${id}`);
    console.log(`...and ${blogIds.length - 10} more.`);
    return;
  }

  console.log(`\nDeleting ${blogIds.length} docs in batches of ${BATCH_SIZE}...`);
  const deleted = await deleteInBatches(client, blogIds);
  console.log(`\nDone. Deleted ${deleted}/${blogIds.length} docs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
