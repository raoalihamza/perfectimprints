/**
 * Repair the blog posts whose `relatedCategorySlugs` store a PATH instead of a
 * root slug (FIX-900; the finding is AUTO-200 section 4.1).
 *
 *   pnpm repair-related-category-slugs                dry run: prints exactly what would change, writes nothing
 *   pnpm repair-related-category-slugs -- --commit    applies it
 *   (= tsx scripts/migrations/repair-related-category-slugs.ts ...)
 *
 * NO FLAG MEANS DRY RUN (the PORT-141 pattern). `--dry-run` is accepted and
 * wins over `--commit`.
 *
 * What it finds. Every blogPost, drafts included (raw perspective, token
 * client), whose `relatedCategorySlugs` holds anything that is not a bare
 * root slug: `/cat/ornaments`, `/cat/ornaments/theme/christmas`,
 * `/cat/bags/theme/halloween`, `/cat/candy?price-min=10`. The query that reads
 * the field (`lib/sanity/queries/related-blogs.ts`) matches the bare root
 * slug exactly, so none of those values has ever shown a post on any category
 * page. Eleven published posts carried one on 2026-10-04, all filled in by
 * Patrick since July.
 *
 * What it does to each. The SAME pure rule the schema now validates with
 * (`lib/blog/related-category-slugs.ts`) reads the root slug out of each
 * value: `/cat/ornaments/theme/christmas` becomes `ornaments`,
 * `/cat/candy?price-min=10` becomes `candy`. The whole list is replaced by
 * the normalised list (order kept, duplicates collapsed) with one `set` on
 * that one field, carrying `ifRevisionId`, so a document edited between the
 * scan and the write fails loudly for that document instead of being
 * overwritten. Nothing else in the document is touched. It never publishes,
 * never creates, never deletes.
 *
 * What it refuses. A document whose list holds a value that cannot be read
 * as a root slug, or whose read root is not one of the generated root
 * categories in data/categories (the 465), is SKIPPED whole and reported:
 * the script never guesses a category and never drops a value Patrick typed.
 *
 * Drafts and published copies. The scan is by document id, so a draft and its
 * published copy are separate rows and each one holding a path is repaired on
 * its own, in one transaction, which is the Q-155 rule: patching only the
 * published copy would let a later Publish from an open draft bring the path
 * back, and patching only the draft would leave the live page dark until the
 * next Publish. On 2026-10-04 none of the eleven had a draft copy.
 *
 * Idempotent: after a commit the scan finds nothing and says so.
 *
 * Requires NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN (write scope for
 * --commit; a token is needed even for the dry run, for the drafts) from
 * .env.local or the shell. Run from the repo root (it reads data/categories).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSanityWriteClient } from '../../lib/sanity/write-client';
import { getAllGeneratedRootSlugs } from '../../lib/categories';
import {
  isCleanRelatedCategorySlug,
  planRelatedCategorySlugsRepair,
} from '../../lib/blog/related-category-slugs';

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): { commit: boolean } {
  let commit = false;
  let dryRun = false;
  for (const a of argv) {
    if (a === '--commit') commit = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('-')) {
      console.error(`Unknown flag ${a}. Flags: --commit, --dry-run.`);
      process.exit(2);
    }
  }
  return { commit: commit && !dryRun };
}

interface Row {
  _id: string;
  _rev: string;
  title?: string;
  slug?: string;
  relatedCategorySlugs?: unknown[];
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { commit } = parseArgs(process.argv.slice(2));
  const writeClient = getSanityWriteClient();
  if (!writeClient) {
    console.error(
      'NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN are required (the token even for the dry run, so drafts are scanned too).',
    );
    process.exit(1);
  }
  // Raw perspective: drafts and published copies are separate documents here.
  const client = writeClient.withConfig({ perspective: 'raw' });

  const knownRoots = new Set(getAllGeneratedRootSlugs());
  console.log(`FIX-900 relatedCategorySlugs repair`);
  console.log(`Mode: ${commit ? 'COMMIT (writes the changes below)' : 'DRY RUN (nothing is written)'}`);
  console.log(`Known root categories (data/categories): ${knownRoots.size}`);

  const rows = await client.fetch<Row[]>(
    `*[_type == "blogPost" && defined(relatedCategorySlugs) && count(relatedCategorySlugs) > 0]
      | order(_updatedAt desc) { _id, _rev, title, "slug": slug.current, relatedCategorySlugs }`,
  );
  const affected = rows.filter((r) => (r.relatedCategorySlugs ?? []).some((v) => !isCleanRelatedCategorySlug(v)));
  console.log(
    `Blog documents with the field (drafts included): ${rows.length}; holding a value that is not a bare root slug: ${affected.length}.`,
  );
  if (affected.length === 0) {
    console.log('Nothing to repair.');
    return;
  }

  const plans: { row: Row; next: string[] }[] = [];
  const skipped: string[] = [];
  for (const row of affected) {
    const variant = row._id.startsWith('drafts.') ? 'DRAFT' : 'published';
    const plan = planRelatedCategorySlugsRepair(row.relatedCategorySlugs, knownRoots);
    console.log(`\n${row._id} (${variant}) ${row.slug ? `/blog/${row.slug}` : ''}`);
    console.log(`  "${row.title ?? '(no title)'}"`);
    for (const m of plan.mapping) {
      console.log(`  ${JSON.stringify(m.from)} -> ${m.to === null ? 'CANNOT READ A ROOT SLUG' : m.to}`);
    }
    if (plan.unresolved.length > 0 || plan.unknownRoots.length > 0) {
      const why = [
        plan.unresolved.length > 0 ? `unreadable: ${plan.unresolved.map((u) => JSON.stringify(u)).join(', ')}` : '',
        plan.unknownRoots.length > 0 ? `not a generated root category: ${plan.unknownRoots.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      console.log(`  SKIPPED, nothing written for this document (${why}). Decide by hand in Studio.`);
      skipped.push(row._id);
      continue;
    }
    if (!plan.changed) {
      console.log('  already clean (nothing to write)');
      continue;
    }
    console.log(`  would set relatedCategorySlugs = ${JSON.stringify(plan.next)}`);
    plans.push({ row, next: plan.next });
  }

  // The Q-155 rule: say when the other copy exists, so a repair on one copy is understood.
  const ids = new Set(rows.map((r) => r._id));
  for (const { row } of plans) {
    const base = row._id.replace(/^drafts\./, '');
    const other = row._id.startsWith('drafts.') ? base : `drafts.${base}`;
    if (ids.has(other)) {
      const otherRepaired = plans.some((p) => p.row._id === other);
      console.log(
        `\n${row._id}: a ${other.startsWith('drafts.') ? 'draft' : 'published'} copy also exists (${other})${otherRepaired ? ', repaired in this same run' : ', and it already holds clean values'}.`,
      );
    }
  }

  console.log(`\nSummary: ${plans.length} document(s) to repair, ${skipped.length} skipped.`);
  if (!commit) {
    console.log('Dry run: nothing written. Re-run with --commit to apply.');
    return;
  }

  let tx = client.transaction();
  for (const { row, next } of plans) {
    tx = tx.patch(row._id, (p) => p.ifRevisionId(row._rev).set({ relatedCategorySlugs: next }));
  }
  try {
    await tx.commit({ autoGenerateArrayKeys: false });
    console.log(`Committed: ${plans.length} document(s) repaired.`);
  } catch (err) {
    console.error(
      'Commit FAILED; nothing was changed (a transaction is all or nothing). A document was probably edited since the scan; re-run the dry run and then --commit again.',
    );
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
