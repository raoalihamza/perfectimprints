/**
 * One-off migration (M5-506 follow-up): rename the seeded footer `page` docs to
 * the EXACT live-site slugs so SEO equity / inbound links are preserved.
 *
 *   tsx scripts/migrations/rename-static-page-slugs.ts            # migrate
 *   tsx scripts/migrations/rename-static-page-slugs.ts --dry-run  # print only
 *
 * Shipping /us-international-shipping → /shipping-policy, Returns
 * /returns-refunds → /returns, Terms /terms-of-service → /terms. For each, the
 * existing doc's content (incl. any edits) is copied to a new `_id` with the new
 * slug, then the old doc is deleted. Idempotent + safe to re-run.
 *
 * Requires SANITY_API_TOKEN with write scope.
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

const RENAMES: { oldId: string; newId: string; newSlug: string }[] = [
  { oldId: 'page-us-international-shipping', newId: 'page-shipping-policy', newSlug: 'shipping-policy' },
  { oldId: 'page-returns-refunds', newId: 'page-returns', newSlug: 'returns' },
  { oldId: 'drafts.page-terms-of-service', newId: 'drafts.page-terms', newSlug: 'terms' },
];

async function main(): Promise<void> {
  console.log(`Renaming ${RENAMES.length} static page docs to live-site slugs.`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}\n`);

  const client = buildClient();

  for (const { oldId, newId, newSlug } of RENAMES) {
    const doc = await client.getDocument(oldId);
    if (!doc) {
      console.log(`  skip   ${oldId} (not found — already migrated?)`);
      continue;
    }
    console.log(`  rename ${oldId} → ${newId}  (slug: ${newSlug})`);
    if (DRY_RUN) continue;

    const { _id: _drop, _rev: _dropRev, ...rest } = doc as Record<string, unknown>;
    void _drop;
    void _dropRev;
    await client.createOrReplace({
      ...rest,
      _id: newId,
      _type: 'page',
      slug: { _type: 'slug', current: newSlug },
    });
    await client.delete(oldId);
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
