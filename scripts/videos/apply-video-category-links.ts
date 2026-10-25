/**
 * VID-100 Part 4: write the APPROVED video -> root category links to Sanity.
 *
 *   pnpm videos:apply-links               dry run: prints what would be written
 *   pnpm videos:apply-links -- --commit   writes it
 *
 * `--dry-run` wins over `--commit`. Needs NEXT_PUBLIC_SANITY_PROJECT_ID and
 * SANITY_API_TOKEN (from .env.local; the token even for the dry run, because
 * the drafts are read too).
 *
 * The gate. The input is docs/videos/VID-100-proposed-video-category-links.json,
 * written by `pnpm videos:propose-links` and REVIEWED BY ALI. The script
 * refuses to run while its top-level `approved` is not `true`; Ali sets it after
 * reading the markdown beside it. What is written: every row under `proposed`
 * that does not carry `"skip": true`, plus every row under `possible` that
 * carries `"approve": true`. Ali can also change a row's `root` by hand; the
 * value is checked against the 465 generated roots and FIX-900's shape rule
 * before anything is sent.
 *
 * What it writes, and what it never touches. For each row: ONE field,
 * `relatedCategorySlugs`, set to `[root]` on the published document AND on its
 * draft when one exists (the Q-155 rule: patching only the draft would leave
 * the row off until the next publish, patching only the published copy would
 * let a later publish from an open draft silently remove the link), each with
 * `ifRevisionId` so a document edited in between is left alone and reported.
 * A video that ALREADY carries a non-empty list (a link Patrick made by hand,
 * or a previous run) is SKIPPED whole and reported, never overwritten; to
 * change one, edit it in Studio. Nothing else on the document is read or
 * written. Idempotent: a second run finds every row already linked and writes
 * nothing.
 *
 * No AI model is called. The links reach the live site through the existing
 * webhook: each publish-perspective mutation fires the `video` branch, which
 * busts RELATED_VIDEOS_TAG and re-renders the root pages on their next visit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSanityWriteClient } from '../../lib/sanity/write-client';
import { getAllGeneratedRootSlugs } from '../../lib/categories';
import { isCleanRelatedCategorySlug } from '../../lib/blog/related-category-slugs';

const PROJECT_ROOT = resolve(__dirname, '../..');
const INPUT = resolve(PROJECT_ROOT, 'docs/videos/VID-100-proposed-video-category-links.json');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): { commit: boolean } {
  let commit = false;
  let dryRun = false;
  for (const a of argv) {
    // pnpm forwards the separator itself on this platform: `pnpm videos:apply-links -- --commit`
    // arrives as ["--", "--commit"].
    if (a === '--') continue;
    if (a === '--commit') commit = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('-')) {
      console.error(`Unknown flag ${a}. Flags: --commit, --dry-run.`);
      process.exit(2);
    }
  }
  return { commit: commit && !dryRun };
}

interface ProposalRow {
  _id: string;
  slug: string;
  title: string;
  root: string | null;
  skip?: boolean;
  approve?: boolean;
}

interface ProposalFile {
  approved?: boolean;
  proposed?: ProposalRow[];
  possible?: ProposalRow[];
}

interface StoredVideo {
  _id: string;
  _rev: string;
  title?: string;
  relatedCategorySlugs?: unknown;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { commit } = parseArgs(process.argv.slice(2));

  if (!existsSync(INPUT)) {
    console.error(`Missing ${INPUT}. Run pnpm videos:propose-links first.`);
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(INPUT, 'utf8')) as ProposalFile;
  if (file.approved !== true) {
    console.error(
      `The list has not been approved: "approved" is not true in ${INPUT}. Ali reads the markdown beside it, moves or ticks rows, sets "approved": true, and runs this again.`,
    );
    process.exit(1);
  }

  const writeClient = getSanityWriteClient();
  if (!writeClient) {
    console.error('NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN are required (the token even for the dry run, so drafts are read too).');
    process.exit(1);
  }
  const client = writeClient.withConfig({ perspective: 'raw' });
  const knownRoots = new Set(getAllGeneratedRootSlugs());

  const rows = [
    ...(file.proposed ?? []).filter((r) => r.skip !== true),
    ...(file.possible ?? []).filter((r) => r.approve === true),
  ];
  console.log('VID-100: write the approved video -> root category links');
  console.log(`Mode: ${commit ? 'COMMIT (writes the links below)' : 'DRY RUN (nothing is written)'}`);
  console.log(`Rows to write: ${rows.length} (${(file.proposed ?? []).filter((r) => r.skip !== true).length} proposed, ${(file.possible ?? []).filter((r) => r.approve === true).length} ticked under possible)`);

  let written = 0;
  let skippedLinked = 0;
  let refused = 0;
  let failed = 0;
  const perRoot = new Map<string, number>();

  for (const row of rows) {
    const root = (row.root ?? '').trim();
    if (!root || !isCleanRelatedCategorySlug(root) || !knownRoots.has(root)) {
      refused += 1;
      console.log(`REFUSE  ${row.slug}: "${row.root}" is not one of the 465 generated root slugs`);
      continue;
    }
    const docs = await client.fetch<StoredVideo[]>(
      `*[_type == "video" && _id in [$id, $draftId]]{ _id, _rev, title, relatedCategorySlugs }`,
      { id: row._id, draftId: `drafts.${row._id}` },
    );
    const published = docs.find((d) => d._id === row._id);
    if (!published) {
      refused += 1;
      console.log(`REFUSE  ${row.slug}: no published video with id ${row._id}`);
      continue;
    }
    const alreadyLinked = docs.some((d) => Array.isArray(d.relatedCategorySlugs) && d.relatedCategorySlugs.length > 0);
    if (alreadyLinked) {
      skippedLinked += 1;
      const have = docs.map((d) => `${d._id.startsWith('drafts.') ? 'draft' : 'published'}=${JSON.stringify(d.relatedCategorySlugs ?? [])}`).join(', ');
      console.log(`SKIP    ${row.slug}: already carries a link (${have}); edit it in Studio instead`);
      continue;
    }
    console.log(`${commit ? 'WRITE  ' : 'WOULD  '} ${row.slug} -> ${root}${docs.length > 1 ? ' (published + draft)' : ''}`);
    perRoot.set(root, (perRoot.get(root) ?? 0) + 1);
    if (!commit) {
      written += 1;
      continue;
    }
    try {
      let tx = client.transaction();
      for (const d of docs) {
        tx = tx.patch(d._id, (p) => p.ifRevisionId(d._rev).set({ relatedCategorySlugs: [root] }));
      }
      await tx.commit();
      written += 1;
    } catch (e) {
      failed += 1;
      console.log(`FAILED  ${row.slug}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  }

  console.log('');
  console.log(`${commit ? 'Written' : 'Would write'}: ${written}. Skipped (already linked): ${skippedLinked}. Refused (bad root or missing doc): ${refused}. Failed: ${failed}.`);
  console.log(`Roots that ${commit ? 'gain' : 'would gain'} a row: ${perRoot.size}`);
  for (const [root, n] of [...perRoot.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${root}: ${n}`);
  }
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
