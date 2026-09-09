/**
 * Set the age group and gender on the apparel product pages (MERCH-100 part 3).
 *
 *   pnpm set-product-audience                 dry run: prints the plan, writes nothing
 *   pnpm set-product-audience -- --commit     applies it
 *   pnpm set-product-audience -- --file <path> [--commit]
 *   (= tsx scripts/seed/set-product-audience.ts ...)
 *
 * NO FLAG MEANS DRY RUN (the PORT-141 pattern). `--dry-run` is accepted and
 * wins over `--commit`.
 *
 * Input: data/seed/product-audience-merch-100.json, the list MERCH-100
 * classified from each product's title and Ali reviews before running:
 * `[{ slug, ageGroup, gender }]`, both values from Google's own lists
 * (lib/products/product-schema.ts). Every record is validated before anything
 * is written; one bad record means nothing is written.
 *
 * Rules, all deliberate:
 *   - FILLS EMPTY FIELDS ONLY. A value Patrick has since chosen in Studio is
 *     never overwritten (`setIfMissing`), so the script is safe to re-run and
 *     safe to run after he has started editing by hand.
 *   - Patches the PUBLISHED document AND its draft when one exists (the Q-155
 *     lesson): patching only the published copy would let the next Publish of
 *     an already-open draft silently blank the fields again.
 *   - Skips a slug that has no published document (a draft-only page is
 *     Patrick's to finish) and reports it.
 *   - Never publishes, never creates, never touches any other field.
 *
 * Requires NEXT_PUBLIC_SANITY_PROJECT_ID and, for --commit, SANITY_API_TOKEN
 * with write scope, from .env.local or the shell. The dry run reads through
 * the same client when a token is present (so it can say which fields are
 * already filled) and falls back to the public read API without one.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';
import { getSanityWriteClient } from '../../lib/sanity/write-client';
import { isProductAgeGroup, isProductGender } from '../../lib/products/product-schema';

const PROJECT_ROOT = resolve(__dirname, '../..');
const DEFAULT_FILE = resolve(PROJECT_ROOT, 'data/seed/product-audience-merch-100.json');

interface AudienceRecord {
  slug: string;
  ageGroup: string;
  gender: string;
}

interface ProductState {
  _id: string;
  slug: string;
  ageGroup?: string | null;
  gender?: string | null;
}

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

function parseArgs(argv: string[]): { file: string; commit: boolean } {
  let file = DEFAULT_FILE;
  let commit = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') file = resolve(argv[++i] ?? '');
    else if (a === '--commit') commit = true;
    else if (a === '--dry-run') dryRun = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return { file, commit: commit && !dryRun };
}

/** Validate every record before touching anything; one failure refuses the set. */
function validate(records: unknown): AudienceRecord[] {
  if (!Array.isArray(records)) throw new Error('The list must be a JSON array.');
  const seen = new Set<string>();
  const problems: string[] = [];
  const out: AudienceRecord[] = [];
  records.forEach((r, i) => {
    const rec = r as Partial<AudienceRecord>;
    const where = `record ${i + 1} (${rec?.slug ?? 'no slug'})`;
    if (typeof rec?.slug !== 'string' || !rec.slug.trim()) problems.push(`${where}: missing slug`);
    else if (seen.has(rec.slug)) problems.push(`${where}: listed twice`);
    else seen.add(rec.slug);
    if (!isProductAgeGroup(rec?.ageGroup)) problems.push(`${where}: ageGroup "${rec?.ageGroup}" is not one of Google's values`);
    if (!isProductGender(rec?.gender)) problems.push(`${where}: gender "${rec?.gender}" is not one of Google's values`);
    if (problems.length === 0) out.push({ slug: rec.slug as string, ageGroup: rec.ageGroup as string, gender: rec.gender as string });
  });
  if (problems.length > 0) {
    throw new Error(`Refusing the whole list:\n  ${problems.join('\n  ')}`);
  }
  return out;
}

function readClient(): SanityClient {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is not set.');
  return createClient({
    projectId,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
    apiVersion: '2024-10-01',
    useCdn: false,
    perspective: 'raw',
    token: process.env.SANITY_API_TOKEN,
  });
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { file, commit } = parseArgs(process.argv.slice(2));
  if (!existsSync(file)) throw new Error(`List not found: ${file}`);
  const records = validate(JSON.parse(readFileSync(file, 'utf8')));
  console.log(`${commit ? 'COMMIT' : 'DRY RUN'}: ${records.length} records from ${file}`);

  const client = readClient();
  const slugs = records.map((r) => r.slug);
  // Both the published document and any draft, in one read.
  const docs = await client.fetch<ProductState[]>(
    `*[_type == "productPage" && slug.current in $slugs]{ _id, "slug": slug.current, ageGroup, gender }`,
    { slugs },
  );
  const bySlug = new Map<string, { published?: ProductState; draft?: ProductState }>();
  for (const d of docs) {
    const entry = bySlug.get(d.slug) ?? {};
    if (d._id.startsWith('drafts.')) entry.draft = d;
    else entry.published = d;
    bySlug.set(d.slug, entry);
  }

  const plan: { slug: string; ids: string[]; set: Record<string, string>; kept: string[] }[] = [];
  const skipped: string[] = [];
  for (const r of records) {
    const entry = bySlug.get(r.slug);
    if (!entry?.published) {
      skipped.push(`${r.slug}: no published document${entry?.draft ? ' (draft only)' : ''}`);
      continue;
    }
    // A field counts as filled when EITHER copy holds a value: the draft is
    // where Patrick's unpublished edit lives.
    const filled = (field: 'ageGroup' | 'gender') =>
      Boolean(entry.published?.[field]?.trim()) || Boolean(entry.draft?.[field]?.trim());
    const set: Record<string, string> = {};
    const kept: string[] = [];
    if (filled('ageGroup')) kept.push(`ageGroup=${entry.published.ageGroup ?? entry.draft?.ageGroup}`);
    else set.ageGroup = r.ageGroup;
    if (filled('gender')) kept.push(`gender=${entry.published.gender ?? entry.draft?.gender}`);
    else set.gender = r.gender;
    const ids = [entry.published._id, ...(entry.draft ? [entry.draft._id] : [])];
    plan.push({ slug: r.slug, ids, set, kept });
  }

  for (const p of plan) {
    const setText = Object.keys(p.set).length
      ? Object.entries(p.set).map(([k, v]) => `${k}=${v}`).join(', ')
      : 'nothing to set';
    console.log(
      `  ${p.slug}: ${setText}${p.kept.length ? ` (kept ${p.kept.join(', ')})` : ''}${p.ids.length > 1 ? ' [+draft]' : ''}`,
    );
  }
  for (const s of skipped) console.log(`  SKIP ${s}`);
  const toWrite = plan.filter((p) => Object.keys(p.set).length > 0);
  console.log(
    `\nplan: ${toWrite.length} to patch, ${plan.length - toWrite.length} already filled, ${skipped.length} skipped`,
  );

  if (!commit) {
    console.log('Dry run: nothing written. Re-run with --commit to apply.');
    return;
  }

  const writeClient = getSanityWriteClient();
  if (!writeClient) throw new Error('SANITY_API_TOKEN (write scope) is required for --commit.');
  let patched = 0;
  let failed = 0;
  for (const p of toWrite) {
    try {
      // One transaction per product: published + draft together, setIfMissing
      // so a value typed in Studio between the dry run and now still wins.
      let tx = writeClient.transaction();
      for (const id of p.ids) tx = tx.patch(id, (patch) => patch.setIfMissing(p.set));
      await tx.commit();
      patched += 1;
      console.log(`  patched ${p.slug} (${p.ids.join(', ')})`);
    } catch (err) {
      failed += 1;
      console.error(`  FAILED ${p.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\ndone: ${patched} patched, ${failed} failed. Nothing was published; the fields are live on the next Publish or immediately on already-published documents (the webhook refreshes each /products/<slug>).`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
