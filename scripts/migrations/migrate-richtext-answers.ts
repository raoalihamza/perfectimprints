/**
 * Migrate plain-string answers/descriptions to Portable Text (Task B).
 *
 * Three fields became rich text (richAnswer): `faq.answer`,
 * `customCategory.faqs[].a`, and `video.description`. Existing docs hold plain
 * strings, which would render/validate wrong under the new array type. This
 * converts each existing plain string into Portable Text blocks (split on blank
 * lines into paragraphs; NO auto-linking — Patrick adds links by hand later).
 *
 *   tsx scripts/migrations/migrate-richtext-answers.ts             # convert (live)
 *   tsx scripts/migrations/migrate-richtext-answers.ts --dry-run   # print, no writes
 *
 * Idempotent: any value already in Portable Text (array) form is skipped. Runs
 * over BOTH published docs and drafts so Studio editing stays consistent.
 *
 * Requires SANITY_API_TOKEN with write scope (unless --dry-run).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';
import { plainTextToBlocks } from '../../lib/portable-text/html-to-blocks';

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

/** A value still needs migrating only when it's a non-empty plain string. */
function needsMigration(value: unknown): value is string {
  return typeof value === 'string';
}

interface FaqRow {
  _id: string;
  question?: string;
  answer?: unknown;
}
interface VideoRow {
  _id: string;
  title?: string;
  description?: unknown;
}
interface CustomCategoryRow {
  _id: string;
  title?: string;
  faqs?: { _key?: string; _type?: string; q?: string; a?: unknown }[];
}

async function main(): Promise<void> {
  console.log(`Rich-text answer/description migration — Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}\n`);
  const client = buildClient();

  let faqConverted = 0;
  let faqSkipped = 0;
  let videoConverted = 0;
  let videoSkipped = 0;
  let ccDocsConverted = 0;
  let ccDocsSkipped = 0;
  let ccItemsConverted = 0;

  // 1. faq.answer ----------------------------------------------------------
  const faqs = await client.fetch<FaqRow[]>(`*[_type == "faq"]{ _id, question, answer }`);
  for (const f of faqs) {
    if (needsMigration(f.answer)) {
      const blocks = plainTextToBlocks(f.answer);
      console.log(`  faq      ${f._id}  ${(f.question ?? '').slice(0, 50)} → ${blocks.length} block(s)`);
      if (!DRY_RUN) await client.patch(f._id).set({ answer: blocks }).commit();
      faqConverted++;
    } else {
      faqSkipped++;
    }
  }

  // 2. video.description ---------------------------------------------------
  const videos = await client.fetch<VideoRow[]>(`*[_type == "video"]{ _id, title, description }`);
  for (const v of videos) {
    if (needsMigration(v.description)) {
      const blocks = plainTextToBlocks(v.description);
      console.log(`  video    ${v._id}  ${(v.title ?? '').slice(0, 50)} → ${blocks.length} block(s)`);
      if (!DRY_RUN) await client.patch(v._id).set({ description: blocks }).commit();
      videoConverted++;
    } else {
      videoSkipped++;
    }
  }

  // 3. customCategory.faqs[].a --------------------------------------------
  const ccs = await client.fetch<CustomCategoryRow[]>(
    `*[_type == "customCategory"]{ _id, title, faqs }`,
  );
  for (const cc of ccs) {
    const faqsArr = cc.faqs ?? [];
    let changed = false;
    const next = faqsArr.map((item) => {
      if (needsMigration(item.a)) {
        changed = true;
        ccItemsConverted++;
        return { ...item, a: plainTextToBlocks(item.a) };
      }
      return item;
    });
    if (changed) {
      console.log(`  custCat  ${cc._id}  ${(cc.title ?? '').slice(0, 50)} → ${ccItemsConverted} item(s) so far`);
      if (!DRY_RUN) await client.patch(cc._id).set({ faqs: next }).commit();
      ccDocsConverted++;
    } else {
      ccDocsSkipped++;
    }
  }

  console.log('\nDone.');
  console.log(`  faq.answer:            converted ${faqConverted}, skipped ${faqSkipped} (already rich/empty)`);
  console.log(`  video.description:     converted ${videoConverted}, skipped ${videoSkipped} (already rich/empty)`);
  console.log(
    `  customCategory.faqs:   converted ${ccItemsConverted} item(s) across ${ccDocsConverted} doc(s), skipped ${ccDocsSkipped} doc(s)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
