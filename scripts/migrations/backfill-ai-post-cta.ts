/**
 * AUTO-221: put Patrick's AI-post CTA on the engine-made posts that were
 * written before AUTO-212 started filling it in (2026-11-09).
 *
 *   pnpm backfill-ai-post-cta
 *       DRY RUN. Lists every engine-made post with what would be written, or
 *       why it is left alone. Writes nothing.
 *   pnpm backfill-ai-post-cta -- --commit
 *       Writes the two CTA fields on the posts listed as "would write".
 *   pnpm backfill-ai-post-cta -- --commit --drafts-only
 *       The same, for drafts that have never been published only. Nothing on
 *       the live site changes.
 *   pnpm backfill-ai-post-cta -- --commit --skip <id> <id> ...
 *       Holds the named posts back (commas or spaces, with or without the
 *       "drafts." prefix), for a heading that would read badly because the
 *       search it comes from does. An id that names no engine-made post stops
 *       the run before anything is written.
 *
 * NO FLAG MEANS DRY RUN (the PORT-141 pattern), and `--dry-run` wins over
 * `--commit`.
 *
 * WHAT IT MAY TOUCH is decided by lib/blog-automation/cta-backfill.ts and by
 * nothing in this file: a post made from a search topic whose CTA nobody has
 * touched (no heading, and a body that is blank or still the site default).
 * A heading or a body Patrick typed leaves the post exactly as it is, and a
 * post and its draft copy are written together or not at all. The rule is
 * proven in cta-backfill.test.ts, which also reads THIS file and fails if it
 * gains a second way to write.
 *
 * A write to a PUBLISHED post is live at once: the Sanity webhook revalidates
 * that post's page within seconds. Each write is one patch of two fields,
 * pinned to the revision that was read, after the post has been read and
 * judged again. Idempotent: a second run finds nothing to write.
 *
 * Needs NEXT_PUBLIC_SANITY_PROJECT_ID and the Sanity write access in
 * .env.local (the dataset is private, so the dry run needs it too).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';
import { CTA_BACKFILL_FACTS, isHeldBack, planCtaBackfillAll, skipIdsFrom, unknownSkipIds, type CtaBackfillFacts } from '../../lib/blog-automation/cta-backfill';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

const isDraft = (id: string): boolean => id.startsWith('drafts.');
const publishedIdOf = (id: string): string => id.replace(/^drafts\./, '');

/** Every value after a flag, up to the next flag: `--skip a b,c` gives ['a', 'b,c']. */
function valuesAfter(args: string[], name: string): string[] {
  const i = args.indexOf(name);
  if (i < 0) return [];
  const out: string[] = [];
  for (const a of args.slice(i + 1)) {
    if (a.startsWith('--')) break;
    out.push(a);
  }
  return out;
}

/** A post and its draft copy, as they are now. */
async function readPair(client: SanityClient, id: string): Promise<CtaBackfillFacts[]> {
  const pub = publishedIdOf(id);
  return client.fetch<CtaBackfillFacts[]>(`*[_id in [$pub, $draft]]${CTA_BACKFILL_FACTS}`, { pub, draft: `drafts.${pub}` });
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const args = process.argv.slice(2);
  const commit = args.includes('--commit') && !args.includes('--dry-run');
  const draftsOnly = args.includes('--drafts-only');
  const skip = skipIdsFrom(valuesAfter(args, '--skip'));
  const skipSet = new Set(skip);
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
  // The server's own write access, the one the other migration scripts use (the site's read access is read in one file only, SEC-100).
  const access = process.env.SANITY_API_TOKEN;
  if (!projectId || !access) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID and the Sanity write access are needed (in .env.local).');
  // RAW perspective: a post and its draft copy must both be visible.
  const client = createClient({ projectId, dataset, apiVersion: '2024-10-01', token: access, useCdn: false, perspective: 'raw' });

  const rows = await client.fetch<CtaBackfillFacts[]>(`*[_type == "blogPost" && defined(sourceTopic.query)]${CTA_BACKFILL_FACTS} | order(_createdAt asc)`);
  const published = new Set(rows.filter((r) => !isDraft(r._id)).map((r) => r._id));
  const kindOf = (id: string): string => (!isDraft(id) ? 'published' : published.has(publishedIdOf(id)) ? 'draft of a published post' : 'draft');
  // --drafts-only keeps to drafts that have never been published: nothing live, and no half-written pair.
  const inScope = (id: string): boolean => !isHeldBack(id, skipSet) && (!draftsOnly || kindOf(id) === 'draft');

  const plans = planCtaBackfillAll(rows);
  // A mistyped --skip id would let the post it was meant to hold back be written: stop before anything is.
  const unknown = unknownSkipIds(skip, plans);
  if (unknown.length > 0) throw new Error(`--skip names no engine-made post: ${unknown.join(', ')}. Nothing was written.`);
  const toWrite = plans.filter((p) => p.verdict.write === true && inScope(p.facts._id));
  const heldBack = plans.filter((p) => p.verdict.write === true && isHeldBack(p.facts._id, skipSet));
  const outOfScope = plans.filter((p) => p.verdict.write === true && !inScope(p.facts._id) && !isHeldBack(p.facts._id, skipSet));
  const postsToWrite = new Set(toWrite.map((p) => publishedIdOf(p.facts._id))).size;
  const leftAlone = plans.filter((p) => p.verdict.write === false);

  console.log(`${commit ? 'COMMIT' : 'DRY RUN'}${draftsOnly ? ' (drafts only)' : ''}: ${rows.length} blog documents were made from a search topic.`);
  console.log(`\n${commit ? 'WRITING' : 'WOULD WRITE'} (${toWrite.length} documents, ${postsToWrite} posts):`);
  for (const p of toWrite) {
    if (p.verdict.write !== true) continue;
    console.log(`   ${(p.facts._createdAt ?? '').slice(0, 10)}  ${kindOf(p.facts._id).padEnd(25)}  ${p.verdict.set.ctaTopic}\n               ${p.facts._id}  ${p.facts.title ?? ''}`);
  }
  if (heldBack.length > 0) {
    console.log(`\nHELD BACK by --skip (${heldBack.length}), left exactly as they are:`);
    for (const p of heldBack) if (p.verdict.write === true) console.log(`   ${kindOf(p.facts._id).padEnd(25)}  ${p.verdict.set.ctaTopic}\n               ${p.facts._id}  ${p.facts.title ?? ''}`);
  }
  if (outOfScope.length > 0) console.log(`\nNOT IN THIS RUN because of --drafts-only (${outOfScope.length} published posts and their draft copies).`);
  const tally = new Map<string, number>();
  for (const p of leftAlone) if (p.verdict.write === false) tally.set(p.verdict.reason, (tally.get(p.verdict.reason) ?? 0) + 1);
  console.log(`\nLEFT ALONE (${leftAlone.length}):`);
  for (const [reason, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${reason}`);
  for (const p of leftAlone) {
    if (p.verdict.write === false && p.verdict.reason !== 'already') console.log(`   ${kindOf(p.facts._id).padEnd(25)}  ${p.facts.title ?? p.facts._id}\n               ${p.verdict.why}`);
  }
  if (!commit) {
    console.log('\nNothing was written. Run again with --commit (add --drafts-only to leave the live posts out).');
    return;
  }

  let written = 0;
  let skipped = 0;
  for (const p of toWrite) {
    // The post as it is NOW, with its other copy, judged again: the list above may be minutes old.
    const fresh = planCtaBackfillAll(await readPair(client, p.facts._id)).find((f) => f.facts._id === p.facts._id)?.verdict;
    if (!fresh || fresh.write === false) {
      skipped += 1;
      console.log(`   left alone now: ${p.facts.title ?? p.facts._id} (${fresh && fresh.write === false ? fresh.why : 'gone'})`);
      continue;
    }
    try {
      await client.patch(fresh.id).ifRevisionId(fresh.ifRevisionId).set(fresh.set).commit();
      written += 1;
      console.log(`   written: ${fresh.set.ctaTopic}  (${kindOf(fresh.id)})`);
    } catch (err) {
      // The post changed in the last instant and Sanity refused the pinned write: it keeps what it has.
      skipped += 1;
      console.log(`   not written: ${p.facts.title ?? p.facts._id} (${err instanceof Error ? err.message.slice(0, 140) : String(err)})`);
    }
    // One at a time, unhurried: each write to a published post fires the revalidation webhook.
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`\nDone: ${written} written, ${skipped} left alone at the last look.`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
