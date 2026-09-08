/**
 * Import Patrick's portfolio photographs into Sanity (PORT-141).
 *
 *   pnpm import-portfolio -- --file "C:\Users\aliha\Downloads\portfolio-metadata-final.json"
 *   pnpm import-portfolio -- --file <path> --commit
 *   pnpm import-portfolio -- --file <path> --publish
 *   pnpm import-portfolio -- --file <path> --commit --publish
 *   (= tsx scripts/seed/import-portfolio-items.ts ...)
 *
 * NO FLAG MEANS DRY RUN. Running the script with no arguments validates the
 * metadata, prints the plan and writes nothing. `--dry-run` is accepted and
 * wins over every other flag. Only `--commit` and `--publish` write:
 *
 *   --commit   ensure the four `portfolioCategory` documents exist, PUBLISHED
 *              (a published item referencing a draft category would not
 *              resolve), then for each record upload the image as a Sanity
 *              asset and create the `portfolioItem` as a DRAFT.
 *   --publish  promote every existing `drafts.portfolioItem-*` from the
 *              metadata to its published id (createOrReplace + delete the
 *              draft in ONE transaction per item, the publish-blog-drafts
 *              precedent). Separate from --commit on purpose so Ali can open a
 *              few drafts in Studio before anything becomes visible.
 *
 * Input: the PORT-140 metadata file, reviewed by hand. Every record is
 * validated BEFORE anything is uploaded (lib/portfolio/import-plan.ts); one
 * bad record means nothing is imported. The script never edits that file and
 * never touches a source image. Since PORT-160 a record MAY also carry
 * `decorationMethods` (an array from lib/portfolio/decoration-methods.ts) and
 * `industry` (one value from lib/portfolio/industries.ts); both are optional,
 * validated against their vocabulary when present, and a file that does not
 * have them at all imports exactly as it did before.
 *
 * Idempotent: every document id is derived from the data (the category slug,
 * the item's filename), and an item whose draft OR published document already
 * exists is SKIPPED, not updated, so a second run creates nothing twice and
 * never overwrites a hotspot, a title or a description Ali or Patrick has
 * since changed in Studio. To re-import one item, delete it in Studio and run
 * again. Asset uploads are content-hash deduplicated by Sanity, so even a
 * re-upload of the same bytes yields the same asset document.
 *
 * Failure handling: the image is uploaded FIRST and the document is created
 * only after the upload succeeded, so a failed upload leaves no item pointing
 * at nothing. Each item is its own try/catch; a failure is recorded and the
 * loop continues; the summary at the end lists exactly what was created,
 * skipped, published and failed, so a retry (just run it again) targets only
 * the failures. Uploads run one at a time with a pause between them.
 *
 * Reads: the SAME write client every public route uses
 * (lib/sanity/write-client.ts). Requires NEXT_PUBLIC_SANITY_PROJECT_ID and,
 * for --commit / --publish, SANITY_API_TOKEN with write scope, from .env.local
 * or the shell. The dry run works without a token (the read-only "does it
 * already exist" check is then skipped and says so).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SanityClient } from '@sanity/client';
import {
  buildCategoryDoc,
  buildItemDoc,
  categoryDocId,
  contentTypeFor,
  draftId,
  flaggedForReview,
  hotspotCandidates,
  itemDocId,
  parseImportArgs,
  PORTFOLIO_IMPORT_CATEGORIES,
  totalUploadKb,
  validateImportRecords,
  type PortfolioImportRecord,
} from '../../lib/portfolio/import-plan';

const PROJECT_ROOT = resolve(__dirname, '../..');
const DEFAULT_FILE = resolve(PROJECT_ROOT, 'data/seed/portfolio-metadata.json');
/** Between uploads. 38 images in a burst is how you meet a rate limit. */
const PAUSE_MS = 1500;

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fmtKb(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(0)} KB`;
}

interface Existing {
  draft: boolean;
  published: boolean;
}

/** One read: which of the ids we are about to write already exist. */
async function fetchExisting(client: SanityClient, publishedIds: string[]): Promise<Map<string, Existing>> {
  const ids = [...publishedIds, ...publishedIds.map(draftId)];
  const found = (await client.fetch<{ _id: string }[]>(`*[_id in $ids]{ _id }`, { ids })) ?? [];
  const map = new Map<string, Existing>();
  for (const id of publishedIds) map.set(id, { draft: false, published: false });
  for (const doc of found) {
    const base = doc._id.replace(/^drafts\./, '');
    const entry = map.get(base);
    if (!entry) continue;
    if (doc._id.startsWith('drafts.')) entry.draft = true;
    else entry.published = true;
  }
  return map;
}

interface ItemOutcome {
  filename: string;
  id: string;
  status: 'created' | 'skipped-existing' | 'published' | 'already-published' | 'failed';
  detail?: string;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const args = parseImportArgs(process.argv.slice(2));
  const filePath = args.file ? resolve(args.file) : DEFAULT_FILE;
  const dry = args.mode === 'dry-run';

  console.log(`Portfolio import (PORT-141)`);
  console.log(`Mode: ${dry ? 'DRY RUN (nothing is written)' : `WRITE${args.commit ? ' --commit' : ''}${args.publish ? ' --publish' : ''}`}`);
  console.log(`Metadata: ${filePath}\n`);

  if (!existsSync(filePath)) {
    console.error(`Metadata file not found. Pass it with --file <path>.`);
    process.exit(1);
  }

  // --- 1. Validate everything before touching anything ---------------------
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Metadata file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const validation = validateImportRecords(parsed, (p) => existsSync(p));
  const printValidationErrors = () => {
    console.error(`\nValidation failed on ${validation.errors.length} point${validation.errors.length === 1 ? '' : 's'}. Nothing will be imported until the metadata file is corrected (the script never edits it).\n`);
    for (const err of validation.errors) console.error(`  - ${err}`);
  };
  if (!validation.ok && (!dry || !Array.isArray(parsed))) {
    // A write run stops here: before the plan, before any client is built.
    printValidationErrors();
    process.exit(1);
  }
  // A dry run prints the plan even when validation failed, so the failures
  // can be read against it; every plan line tolerates a missing field.
  const records = (parsed as Partial<PortfolioImportRecord>[]).map((r) => ({
    sourcePath: String(r.sourcePath ?? ''),
    filename: String(r.filename ?? ''),
    category: String(r.category ?? ''),
    title: String(r.title ?? ''),
    alt: String(r.alt ?? ''),
    description: String(r.description ?? ''),
    clientName: r.clientName,
    colors: Array.isArray(r.colors) ? r.colors.map(String) : [],
    // PORT-160: optional; a file without them imports as before.
    decorationMethods: Array.isArray(r.decorationMethods) ? r.decorationMethods.map(String) : undefined,
    industry: typeof r.industry === 'string' && r.industry ? r.industry : undefined,
    featured: r.featured === true,
    displayOrder: Number.isFinite(r.displayOrder) ? (r.displayOrder as number) : 0,
    hidden: r.hidden === true,
    needsReview: r.needsReview === true,
    reviewNote: String(r.reviewNote ?? ''),
    widthPx: Number(r.widthPx) || 0,
    heightPx: Number(r.heightPx) || 0,
    fileSizeKb: Number(r.fileSizeKb) || 0,
  })) as PortfolioImportRecord[];
  if (validation.ok) {
    const withDecoration = records.filter((r) => r.decorationMethods?.length).length;
    const withIndustry = records.filter((r) => r.industry).length;
    console.log(`Validated ${records.length} records: every field present, every colour in the vocabulary, every source file on disk.`);
    console.log(`Decoration method set on ${withDecoration} of ${records.length}, industry set on ${withIndustry} of ${records.length} (both optional; a record without them imports without them).\n`);
  } else {
    console.log(`${records.length} records read. VALIDATION FAILED (details after the plan). This is the plan that would apply once the file is corrected.\n`);
  }

  // --- 2. Plan --------------------------------------------------------------
  console.log('Categories (published, in filter-button order):');
  for (const c of PORTFOLIO_IMPORT_CATEGORIES) {
    const n = records.filter((r) => r.category === c.title).length;
    console.log(`  ${String(c.displayOrder).padStart(3)}  ${c.title.padEnd(20)} ${categoryDocId(c.title).padEnd(42)} ${n} item${n === 1 ? '' : 's'}`);
  }

  console.log('\nItems (grouped by category, in displayOrder):');
  const byCategory = [...PORTFOLIO_IMPORT_CATEGORIES].map((c) => ({
    title: c.title,
    items: records.filter((r) => r.category === c.title).sort((a, b) => a.displayOrder - b.displayOrder),
  }));
  for (const group of byCategory) {
    console.log(`\n  ${group.title}`);
    for (const r of group.items) {
      const flags = [r.featured ? 'FEATURED' : '', r.hidden ? 'HIDDEN' : '', r.needsReview ? 'REVIEW' : ''].filter(Boolean).join(' ');
      console.log(`    #${String(r.displayOrder).padStart(3)}  ${r.title}`);
      console.log(`          file: ${r.filename}  (${r.widthPx}x${r.heightPx}, ${fmtKb(r.fileSizeKb)})`);
      console.log(`          id:   ${itemDocId(r.filename)}`);
      console.log(`          colours: ${r.colors.join(', ')}${flags ? `   ${flags}` : ''}`);
      console.log(`          decoration: ${r.decorationMethods?.length ? r.decorationMethods.join(', ') : '(none)'}   industry: ${r.industry || '(none)'}`);
    }
  }

  const totalKb = totalUploadKb(records);
  console.log(`\nTotal upload: ${records.length} files, ${(totalKb / 1024).toFixed(2)} MB (from the measured sizes in the metadata).`);

  const flagged = flaggedForReview(records);
  if (flagged.length > 0) {
    console.log(`\nFlagged for a crop BEFORE upload (needsReview: true), ${flagged.length} image${flagged.length === 1 ? '' : 's'}:`);
    for (const r of flagged) console.log(`  - ${r.filename}\n      ${r.reviewNote || '(no reviewNote)'}`);
    if (!dry) {
      console.warn(`\nWARNING: ${flagged.length} flagged image${flagged.length === 1 ? ' is' : 's are'} still marked needsReview and will be imported AS IS: ${flagged.map((r) => r.filename).join('; ')}`);
    }
  }

  const hotspots = hotspotCandidates(records);
  console.log(`\nFarthest from square (long side over short side >= 1.25), ${hotspots.length} item${hotspots.length === 1 ? '' : 's'}. For information only: since PORT-150 the tile shows the whole image, so NO hotspot is needed; a crop frame in Studio is optional.`);
  for (const h of hotspots) console.log(`  ${String(h.ratio.toFixed(2)).padStart(5)}  ${h.orientation.padEnd(9)} ${h.widthPx}x${h.heightPx}  ${h.title}  [${h.category}]`);

  // --- 3. Client + existence check -----------------------------------------
  const { getSanityWriteClient } = await import('../../lib/sanity/write-client');
  const client = getSanityWriteClient();
  if (!dry && !client) {
    console.error('\nNEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN (write scope) are required to write. Nothing written.');
    process.exit(1);
  }

  const categoryIds = PORTFOLIO_IMPORT_CATEGORIES.map((c) => categoryDocId(c.title));
  const itemIds = records.map((r) => itemDocId(r.filename));
  let existing = new Map<string, Existing>();
  if (client) {
    try {
      existing = await fetchExisting(client, [...categoryIds, ...itemIds]);
      const catsThere = categoryIds.filter((id) => existing.get(id)?.published).length;
      const itemsThere = itemIds.filter((id) => existing.get(id)?.published || existing.get(id)?.draft).length;
      console.log(`\nAlready in Sanity (read-only check, dataset ${process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production'}): ${catsThere}/${categoryIds.length} categories, ${itemsThere}/${itemIds.length} items.`);
      if (itemsThere > 0) {
        for (const id of itemIds) {
          const e = existing.get(id);
          if (e?.published || e?.draft) console.log(`  exists (${e.published ? 'published' : 'draft'}): ${id}`);
        }
      }
    } catch (e) {
      console.log(`\nCould not check what already exists (${e instanceof Error ? e.message : String(e)}); a write run would check again before writing.`);
      if (!dry) process.exit(1);
    }
  } else {
    console.log('\nExistence not checked: no SANITY_API_TOKEN in the environment (fine for a dry run).');
  }

  if (dry) {
    if (!validation.ok) {
      printValidationErrors();
      console.log('\nDry run complete. Nothing was written. Correct the metadata file and run the dry run again before --commit.');
      process.exit(1);
    }
    console.log('\nDry run complete. Nothing was written. Add --commit to create drafts, --publish to publish them.');
    return;
  }
  const c = client as SanityClient;

  // --- 4. Categories, published ---------------------------------------------
  console.log('\nCategories:');
  for (const cat of PORTFOLIO_IMPORT_CATEGORIES) {
    const id = categoryDocId(cat.title);
    if (existing.get(id)?.published) {
      console.log(`  exists, left as is: ${id}`);
      continue;
    }
    await c.createIfNotExists(buildCategoryDoc(cat.title, cat.displayOrder) as { _id: string; _type: string });
    console.log(`  created (published): ${id}`);
  }

  const outcomes: ItemOutcome[] = [];

  // --- 5. Items, as drafts ----------------------------------------------------
  if (args.commit) {
    console.log('\nItems (upload, then create draft):');
    for (const [i, r] of records.entries()) {
      const id = itemDocId(r.filename);
      const label = `[${i + 1}/${records.length}] ${r.filename}`;
      const e = existing.get(id);
      if (e?.published || e?.draft) {
        outcomes.push({ filename: r.filename, id, status: 'skipped-existing', detail: e.published ? 'published' : 'draft' });
        console.log(`  ${label}: already exists as ${e.published ? 'published' : 'draft'} ${id}, skipped`);
        continue;
      }
      try {
        const contentType = contentTypeFor(r.filename);
        if (!contentType) throw new Error('not a .png or .jpg file');
        const bytes = readFileSync(r.sourcePath);
        if (bytes.length === 0) throw new Error('file is empty');
        const sizeKb = statSync(r.sourcePath).size / 1024;
        const asset = await c.assets.upload('image', bytes, { filename: r.filename, contentType });
        const doc = buildItemDoc(r, asset._id, categoryDocId(r.category), draftId(id));
        await c.createIfNotExists(doc as { _id: string; _type: string });
        outcomes.push({ filename: r.filename, id, status: 'created', detail: asset._id });
        console.log(`  ${label}: uploaded ${fmtKb(sizeKb)} as ${asset._id}, created draft ${draftId(id)}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        outcomes.push({ filename: r.filename, id, status: 'failed', detail: reason });
        console.error(`  ${label}: FAILED, no document created: ${reason}`);
      }
      if (i < records.length - 1) await sleep(PAUSE_MS);
    }
  }

  // --- 6. Publish -------------------------------------------------------------
  if (args.publish) {
    console.log('\nPublishing drafts:');
    // Re-read: --commit in this same run may have created drafts.
    const now = await fetchExisting(c, itemIds);
    for (const [i, r] of records.entries()) {
      const id = itemDocId(r.filename);
      const label = `[${i + 1}/${records.length}] ${r.filename}`;
      const e = now.get(id);
      if (!e?.draft) {
        if (e?.published) {
          outcomes.push({ filename: r.filename, id, status: 'already-published' });
          console.log(`  ${label}: already published, skipped`);
        } else {
          console.log(`  ${label}: no draft to publish (run --commit first, or it failed above)`);
        }
        continue;
      }
      try {
        const full = (await c.getDocument(draftId(id))) as Record<string, unknown> | null;
        if (!full) throw new Error('draft vanished between the check and the read');
        await c
          .transaction()
          .createOrReplace({ ...full, _id: id } as { _id: string; _type: string })
          .delete(draftId(id))
          .commit({ visibility: 'sync' });
        outcomes.push({ filename: r.filename, id, status: 'published' });
        console.log(`  ${label}: published ${id}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        outcomes.push({ filename: r.filename, id, status: 'failed', detail: `publish: ${reason}` });
        console.error(`  ${label}: PUBLISH FAILED, draft left in place: ${reason}`);
      }
      if (i < records.length - 1) await sleep(PAUSE_MS / 3);
    }
  }

  // --- 7. Summary -------------------------------------------------------------
  const count = (s: ItemOutcome['status']) => outcomes.filter((o) => o.status === s).length;
  console.log('\nSummary:');
  console.log(`  created (draft):     ${count('created')}`);
  console.log(`  skipped (existing):  ${count('skipped-existing')}`);
  console.log(`  published:           ${count('published')}`);
  console.log(`  already published:   ${count('already-published')}`);
  console.log(`  failed:              ${count('failed')}`);
  const failed = outcomes.filter((o) => o.status === 'failed');
  if (failed.length > 0) {
    console.log('\nFailed (run the same command again; existing items are skipped, so only these are retried):');
    for (const f of failed) console.log(`  - ${f.filename}  (${f.id}): ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
