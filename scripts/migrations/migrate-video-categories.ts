/**
 * Migrate video documents from the legacy single `category` reference to the
 * `categories` list (Q-180 improvement 1).
 *
 * For each video (published AND drafts) that still carries the legacy
 * `category` reference:
 *   - if `categories` is empty/absent → set `categories` to a one-item list
 *     holding the same reference, then unset `category`;
 *   - if `categories` already has entries → just unset `category` (the list
 *     already wins at read time, and if the legacy value is not in the list
 *     that is an editorial choice already visible on the live site).
 *
 * NOT run as part of the build. The read paths honor BOTH shapes
 * (lib/video/video-categories.ts), so nothing breaks before, during, or after
 * this runs - it only tidies the stored shape so Studio shows one field.
 *
 *   tsx scripts/migrations/migrate-video-categories.ts             # convert (live)
 *   tsx scripts/migrations/migrate-video-categories.ts --dry-run   # print, no writes
 *
 * Idempotent: a doc with no legacy `category` is skipped, so a re-run is a
 * no-op. Requires SANITY_API_TOKEN with write scope (unless --dry-run).
 */

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
  // No perspective → both published docs and drafts are returned.
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

interface VideoRow {
  _id: string;
  title?: string;
  category?: { _ref?: string; _type?: string };
  categories?: { _ref?: string }[];
}

async function main(): Promise<void> {
  console.log(
    `Video category → categories migration - Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}\n`,
  );
  const client = buildClient();

  const videos = await client.fetch<VideoRow[]>(
    `*[_type == "video"]{ _id, title, category, categories }`,
  );

  let moved = 0;
  let clearedOnly = 0;
  let skipped = 0;

  for (const v of videos) {
    const legacyRef = v.category?._ref;
    if (!legacyRef) {
      skipped++;
      continue;
    }
    const existing = (v.categories ?? []).filter((c) => c?._ref);
    const alreadyListed = existing.some((c) => c._ref === legacyRef);
    const label = `${v._id}  ${(v.title ?? '').slice(0, 50)}`;

    if (existing.length === 0) {
      console.log(`  move     ${label} → categories: [${legacyRef}], unset category`);
      if (!DRY_RUN) {
        await client
          .patch(v._id)
          .set({
            categories: [{ _key: randomUUID(), _type: 'reference', _ref: legacyRef }],
          })
          .unset(['category'])
          .commit();
      }
      moved++;
    } else {
      console.log(
        `  clear    ${label} → categories already has ${existing.length} entr${existing.length === 1 ? 'y' : 'ies'}${alreadyListed ? ' (incl. the legacy one)' : ''}, unset category only`,
      );
      if (!DRY_RUN) {
        await client.patch(v._id).unset(['category']).commit();
      }
      clearedOnly++;
    }
  }

  console.log('\nDone.');
  console.log(`  moved into categories: ${moved}`);
  console.log(`  legacy cleared only:   ${clearedOnly} (categories already populated)`);
  console.log(`  skipped (no legacy):   ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
