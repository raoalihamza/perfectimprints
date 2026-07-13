/**
 * Backfill the blog CTA body paragraph (blogPost.ctaBody).
 *
 * `ctaBody` is a new optional per-post field. When blank the blog page falls
 * back to DEFAULT_CTA_BODY, so every post — published or draft — already shows
 * the exact same paragraph it showed before this field existed (nothing breaks
 * without running this). This one-time backfill WRITES that current default
 * into each PUBLISHED post so the text is physically stored on the doc:
 *   - it stays locked to today's wording even if the code default ever changes,
 *   - and Patrick sees it pre-filled in Studio, editable per post.
 *
 *   tsx scripts/migrations/backfill-blog-cta-body.ts             # write (live)
 *   tsx scripts/migrations/backfill-blog-cta-body.ts --dry-run   # count only, no writes
 *
 * PUBLISHED docs only (per request: keep published blogs safe). Drafts are left
 * alone — they fall back to the same DEFAULT_CTA_BODY, so publishing a draft
 * later never changes the visible text. Idempotent: any post that already has a
 * non-empty ctaBody is skipped. Each write triggers the Sanity webhook →
 * revalidates that blog page.
 *
 * Requires SANITY_API_TOKEN with write scope (unless --dry-run).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';
import { DEFAULT_CTA_BODY } from '../../lib/blog/cta-defaults';

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

interface BlogRow {
  _id: string;
  title?: string;
  ctaBody?: string;
}

async function main(): Promise<void> {
  console.log(`Blog CTA body backfill — Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}\n`);
  const client = buildClient();

  // PUBLISHED posts only (exclude drafts). A post needs backfilling when it has
  // no non-empty ctaBody yet.
  const rows = await client.fetch<BlogRow[]>(
    `*[_type == "blogPost" && !(_id in path("drafts.**"))]{ _id, title, ctaBody }`,
  );

  let written = 0;
  let skipped = 0;
  for (const row of rows) {
    if (typeof row.ctaBody === 'string' && row.ctaBody.trim().length > 0) {
      skipped++;
      continue;
    }
    console.log(`  blogPost  ${row._id}  ${(row.title ?? '').slice(0, 60)}`);
    if (!DRY_RUN) await client.patch(row._id).set({ ctaBody: DEFAULT_CTA_BODY }).commit();
    written++;
  }

  console.log('\nDone.');
  console.log(`  published posts scanned: ${rows.length}`);
  console.log(`  ${DRY_RUN ? 'would write' : 'wrote'}: ${written}`);
  console.log(`  skipped (already set):   ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
