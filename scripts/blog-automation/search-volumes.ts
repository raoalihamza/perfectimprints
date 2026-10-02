/**
 * AUTO-123: refresh the committed search-volume file the Blog Topics panel
 * reads (data/blog-automation/search-volumes.json). Ali's occasional job;
 * Patrick never runs it, and if it is never run nothing breaks: the panel
 * says the figures are old or absent and works as before.
 *
 *   pnpm auto:volumes                       # = plan, DRY RUN: builds today's pool, picks the next batch, writes it to data/.local/search-volumes/batch.json
 *   pnpm auto:volumes plan --cap 250        # the cap on lookups this batch (default 250; the plan allows 300 reports a day and Patrick uses the account too)
 *   pnpm auto:volumes plan --refresh-after 180   # also re-queue terms looked up more than N days ago, oldest first (default 180)
 *   pnpm auto:volumes plan --retry-failed   # also re-queue terms whose last lookup got no answer (denied or errored)
 *   pnpm auto:volumes merge                 # DRY RUN: read data/.local/search-volumes/results.json and print what would change
 *   pnpm auto:volumes merge --commit        # write the committed file (the ONLY flag that writes it)
 *   pnpm auto:volumes status                # how many terms have a figure and how old they are
 *
 * HOW THE LOOKUPS HAPPEN, and why this is two steps with a gap in the middle.
 * The volumes come from Patrick's Ubersuggest plan, which is connected to
 * Claude Code as an MCP connector (an HTTP server Claude Code holds the
 * sign-in for). A tsx script cannot call that connector: there is no key or
 * token in this repo, and none must be put on the site. So the script does
 * the deterministic halves and Claude Code does the calls:
 *
 *   1. `plan` writes batch.json: the terms to look up, in priority order,
 *      no more than the cap.
 *   2. In a Claude Code session, Ali asks for the batch to be looked up.
 *      For each term Claude calls the Ubersuggest `keyword_overview` tool
 *      with { keyword: <term>, locId: 2840, language: 'en' } and writes the
 *      whole answer under results[<term>] in results.json; a call that is
 *      refused or fails is written as { "error": "<what happened>" }. One
 *      call per term; never more calls than the batch has terms.
 *   3. `merge --commit` folds results.json into the committed file, then Ali
 *      reviews the diff and commits it like any data change.
 *
 * RESUMABLE: the committed file is the checkpoint. A term already in it is
 * not queued again until it is older than --refresh-after; a term whose
 * lookup failed is recorded under `failed` and skipped until --retry-failed.
 * So a 4,400-topic pool at 250 a day is about 18 daily runs of the same
 * three commands, and a run that stops halfway loses nothing but the calls
 * made since the last merge (merge whatever results.json holds, then plan
 * again).
 *
 * PRIORITY (what Patrick is most likely to act on first): usable topics
 * before excluded ones before blocked ones; within each, the 90-day list
 * before the topics the 16 months added; within each of those, most
 * impressions first (90-day, then 16-month). Never-looked-up terms come
 * before refreshes; refreshes go oldest first.
 *
 * Read only apart from --commit, which writes exactly one file. No Sanity
 * write, no AI call, no paid API. The GSC key is never printed.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { Topic } from '../../lib/blog-automation/topic-pool';
import type { LookupResult, SearchVolumeFile } from '../../lib/blog-automation/search-volume';

const PROJECT_ROOT = resolve(__dirname, '../..');
const SCRATCH_DIR = resolve(PROJECT_ROOT, 'data', '.local', 'search-volumes');
const BATCH_PATH = resolve(SCRATCH_DIR, 'batch.json');
const RESULTS_PATH = resolve(SCRATCH_DIR, 'results.json');

const DEFAULT_CAP = 250;
const DEFAULT_REFRESH_AFTER_DAYS = 180;

function flagValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(name);

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim().replace(/^﻿/, '');
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

const fmt = (n: number): string => n.toLocaleString('en-US');
const today = (): string => new Date().toISOString().slice(0, 10);

function daysBetween(dayA: string, dayB: string): number {
  return Math.round((Date.parse(`${dayB}T00:00:00Z`) - Date.parse(`${dayA}T00:00:00Z`)) / 86_400_000);
}

/** The committed file as the panel reads it (the same loader), or an empty one. */
async function readCommitted(): Promise<{ file: SearchVolumeFile; existed: boolean; path: string }> {
  const [{ readSearchVolumeFile, searchVolumeFilePath }, { emptySearchVolumeFile }] = await Promise.all([
    import('../../lib/blog-automation/search-volume-file'),
    import('../../lib/blog-automation/search-volume'),
  ]);
  const path = searchVolumeFilePath();
  const file = readSearchVolumeFile(path);
  return { file: file ?? emptySearchVolumeFile(), existed: file !== null, path };
}

// ── plan ───────────────────────────────────────────────────────────────────────

interface BatchTerm {
  term: string;
  state: Topic['state'];
  window: 'recent' | 'older';
  impressions: number;
  longImpressions: number;
  why: string;
}

async function plan(): Promise<void> {
  const cap = Math.max(1, Math.min(300, Number(flagValue('--cap') ?? DEFAULT_CAP) || DEFAULT_CAP));
  const refreshAfter = Math.max(1, Number(flagValue('--refresh-after') ?? DEFAULT_REFRESH_AFTER_DAYS) || DEFAULT_REFRESH_AFTER_DAYS);
  const retryFailed = hasFlag('--retry-failed');
  console.log(`Mode: plan (DRY RUN, nothing is written but the batch file). Cap ${cap} lookups, refresh after ${refreshAfter} days${retryFailed ? ', retrying failed lookups' : ''}.`);

  const [{ buildTopicPoolSnapshot, describePoolError }, tp, { normalizeVolumeTerm, lookupVolume, buildVolumeIndex, summarizeSearchVolumeFile }] = await Promise.all([
    import('../../lib/blog-automation/build-topic-pool'),
    import('../../lib/blog-automation/topic-pool'),
    import('../../lib/blog-automation/search-volume'),
  ]);
  const committed = await readCommitted();
  const summary = summarizeSearchVolumeFile(committed.file);
  console.log(
    committed.existed
      ? `Committed file: ${fmt(summary.withFigure)} terms with a figure, ${fmt(summary.withoutFigure)} looked up with no figure, ${fmt(summary.failed)} failed; looked up ${summary.oldestLookup ?? '-'} to ${summary.newestLookup ?? '-'}.`
      : `Committed file: none yet (${committed.path}); every term is new.`,
  );

  console.log('Building today\'s pool from Search Console (one to two minutes)...');
  const started = Date.now();
  let topics: Topic[];
  try {
    topics = (await buildTopicPoolSnapshot()).topics;
  } catch (e) {
    const d = describePoolError(e);
    console.error(`\nFAILED: ${d.message}\n${d.hint}`);
    process.exit(1);
  }
  console.log(`Pool: ${fmt(topics.length)} topics in ${((Date.now() - started) / 1000).toFixed(1)} s.`);

  // Blocks and written records, when the environment allows the reads; a
  // missing read only affects the ORDER (a blocked topic is queued last).
  try {
    const { readWrittenTopicSources } = await import('../../lib/blog-automation/written-topics');
    topics = tp.applyWrittenTopics(topics, await readWrittenTopicSources());
  } catch (e) {
    console.warn(`(could not read the drafts, so already-written topics are ordered by the guard alone: ${e instanceof Error ? e.message : String(e)})`);
  }
  try {
    topics = tp.applyNegativeKeywords(topics, await readBlocks());
  } catch (e) {
    console.warn(`(could not read the blocked topics, so blocked topics are ordered as the guard left them: ${e instanceof Error ? e.message : String(e)})`);
  }

  const stateRank = (s: Topic['state']) => (s === 'usable' ? 0 : s === 'excluded' ? 1 : 2);
  const windowRank = (t: Topic) => (t.window === 'older' ? 1 : 0);
  const byPriority = (a: Topic, b: Topic) =>
    stateRank(a.state) - stateRank(b.state) || windowRank(a) - windowRank(b) || tp.compareTopics(a, b);
  const ordered = [...topics].sort(byPriority);

  const index = buildVolumeIndex(committed.file);
  const now = today();
  const fresh: BatchTerm[] = [];
  const stale: (BatchTerm & { age: number })[] = [];
  const seen = new Set<string>();
  let skippedFailed = 0;
  for (const t of ordered) {
    const term = normalizeVolumeTerm(t.query);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const base = { term, state: t.state, window: t.window, impressions: t.impressions, longImpressions: t.long.impressions };
    const found = lookupVolume(t, index);
    if (found) {
      const age = daysBetween(found.fetchedAt, now);
      if (age > refreshAfter) stale.push({ ...base, age, why: `looked up ${found.fetchedAt} for "${found.term}", ${age} days ago` });
      continue;
    }
    if (committed.file.failed[term]) {
      if (!retryFailed) {
        skippedFailed += 1;
        continue;
      }
      fresh.push({ ...base, why: `retrying: last lookup on ${committed.file.failed[term].f} got no answer (${committed.file.failed[term].why})` });
      continue;
    }
    fresh.push({ ...base, why: 'never looked up' });
  }
  stale.sort((a, b) => b.age - a.age);
  const queue: BatchTerm[] = [...fresh, ...stale.map(({ age: _age, ...rest }) => rest)];
  const batch = queue.slice(0, cap);

  const remainingAfter = Math.max(0, queue.length - batch.length);
  console.log();
  console.log(`Queue: ${fmt(fresh.length)} never looked up (${fmt(skippedFailed)} failed earlier and skipped${retryFailed ? '' : '; add --retry-failed to include them'}), ${fmt(stale.length)} older than ${refreshAfter} days.`);
  console.log(`This batch: ${fmt(batch.length)} lookups (cap ${cap}). After it, ${fmt(remainingAfter)} would remain: about ${Math.ceil(remainingAfter / cap)} more daily run${Math.ceil(remainingAfter / cap) === 1 ? '' : 's'} at this cap.`);
  const byState = { usable: 0, excluded: 0, blocked: 0 } as Record<Topic['state'], number>;
  for (const b of batch) byState[b.state] += 1;
  console.log(`In this batch: ${fmt(byState.usable)} usable, ${fmt(byState.excluded)} excluded, ${fmt(byState.blocked)} blocked; ${fmt(batch.filter((b) => b.window === 'recent').length)} from the 90-day list, ${fmt(batch.filter((b) => b.window === 'older').length)} added by the 16 months.`);
  console.log();
  console.log('First 20 of the batch:');
  for (const b of batch.slice(0, 20)) console.log(`  ${b.term}  [${b.state}, ${b.window}, ${fmt(b.impressions)} impr. 90d / ${fmt(b.longImpressions)} 16m; ${b.why}]`);

  mkdirSync(SCRATCH_DIR, { recursive: true });
  writeFileSync(
    BATCH_PATH,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        cap,
        topicsInPool: topics.length,
        howTo:
          'For each term in `terms`, call the Ubersuggest MCP tool keyword_overview with { keyword: <term>, locId: 2840, language: "en" } and store the whole answer under results[<term>] in results.json next to this file, as { "fetchedOn": "YYYY-MM-DD", "results": { ... } }. A refused or failed call is stored as { "error": "<what happened>" }. One call per term, never more than this file lists. Then run: pnpm auto:volumes merge (dry run), then pnpm auto:volumes merge --commit.',
        terms: batch,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log();
  console.log(`Batch written to ${BATCH_PATH} (${fmt(batch.length)} terms). Nothing else was written.`);
  console.log('Next: have the batch looked up (see howTo in the batch file), then `pnpm auto:volumes merge`.');
}

/** The negative keywords from Global Settings, through a plain read; empty when the project id is not configured. */
async function readBlocks(): Promise<{ term: string; scope: 'topic' | 'word' }[]> {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (!projectId) return [];
  const { createClient } = await import('@sanity/client');
  const { normalizeBlockTerm, blockScopeOf } = await import('../../lib/blog-automation/topic-pool');
  const client = createClient({
    projectId,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
    apiVersion: '2024-10-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
  });
  const entries = await client.fetch<{ term?: unknown; scope?: unknown }[] | null>(
    `*[_id == "globalSettings"][0].blogAutomation.negativeKeywords[]{ term, scope }`,
  );
  return (entries ?? []).map((e) => ({ term: normalizeBlockTerm(e.term), scope: blockScopeOf(e.scope) })).filter((e) => e.term);
}

// ── merge ──────────────────────────────────────────────────────────────────────

async function merge(): Promise<void> {
  const commit = hasFlag('--commit') && !hasFlag('--dry-run');
  console.log(`Mode: merge ${commit ? '--commit (the committed file WILL be written)' : '(DRY RUN, nothing is written)'}.`);
  if (!existsSync(RESULTS_PATH)) {
    console.error(`No results file at ${RESULTS_PATH}. Run \`pnpm auto:volumes plan\` and have the batch looked up first.`);
    process.exit(1);
  }
  let parsed: { fetchedOn?: unknown; results?: unknown };
  try {
    parsed = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as { fetchedOn?: unknown; results?: unknown };
  } catch (e) {
    console.error(`results.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const fetchedOn = typeof parsed.fetchedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fetchedOn) ? parsed.fetchedOn : null;
  if (!fetchedOn || !parsed.results || typeof parsed.results !== 'object') {
    console.error('results.json must be { "fetchedOn": "YYYY-MM-DD", "results": { "<term>": <keyword_overview answer> | { "error": "..." } } }.');
    process.exit(1);
  }
  const results = parsed.results as Record<string, LookupResult>;

  const [{ mergeLookupResults, serializeSearchVolumeFile, summarizeSearchVolumeFile }, committed] = await Promise.all([
    import('../../lib/blog-automation/search-volume'),
    readCommitted(),
  ]);
  const outcome = mergeLookupResults(committed.file, results, fetchedOn);
  console.log(`Results: ${fmt(Object.keys(results).length)} terms fetched on ${fetchedOn}.`);
  console.log(`  added ${fmt(outcome.added.length)}, updated ${fmt(outcome.updated.length)}, unchanged ${fmt(outcome.unchanged.length)}, failed (recorded, no figure) ${fmt(outcome.failed.length)}, rejected ${fmt(outcome.rejected.length)}.`);
  for (const r of outcome.rejected) console.log(`  REJECTED "${r.term}": ${r.why}`);
  for (const t of outcome.failed) console.log(`  failed "${t}": ${outcome.file.failed[t]?.why ?? ''}`);
  const show = [...outcome.added, ...outcome.updated].slice(0, 15);
  if (show.length > 0) {
    console.log('  First of the new or changed figures:');
    for (const t of show) {
      const e = outcome.file.terms[t];
      console.log(`    ${t}: ${e.v === null ? 'no figure' : fmt(e.v)} a month${e.m ? ` (Google's series to ${e.m})` : ''}`);
    }
  }
  const text = serializeSearchVolumeFile(outcome.file);
  const after = summarizeSearchVolumeFile(outcome.file);
  console.log(`After merge: ${fmt(after.withFigure)} terms with a figure, ${fmt(after.withoutFigure)} with none, ${fmt(after.failed)} failed; file ${fmt(Buffer.byteLength(text, 'utf8'))} bytes.`);
  if (!commit) {
    console.log('\nDry run complete. Nothing was written. Add --commit to write the committed file.');
    return;
  }
  mkdirSync(dirname(committed.path), { recursive: true });
  writeFileSync(committed.path, text, 'utf8');
  const archived = resolve(SCRATCH_DIR, `results.merged-${fetchedOn}-${Date.now()}.json`);
  renameSync(RESULTS_PATH, archived);
  console.log(`\nWritten ${committed.path}. results.json moved to ${archived} so it is not merged twice. Review the diff and commit it like any data change.`);
}

// ── status ─────────────────────────────────────────────────────────────────────

async function status(): Promise<void> {
  const [{ summarizeSearchVolumeFile }, committed] = await Promise.all([import('../../lib/blog-automation/search-volume'), readCommitted()]);
  if (!committed.existed) {
    console.log(`No committed file at ${committed.path}. The panel shows every topic as "not looked up".`);
    return;
  }
  const s = summarizeSearchVolumeFile(committed.file);
  console.log(`${committed.path}`);
  console.log(`  ${fmt(s.withFigure)} terms with a figure, ${fmt(s.withoutFigure)} looked up with no figure, ${fmt(s.failed)} failed lookups.`);
  console.log(`  Looked up ${s.oldestLookup ?? '-'} to ${s.newestLookup ?? '-'}; Google's own figures run to ${s.dataThrough ?? '-'}.`);
  console.log(`  Source: ${committed.file.source}`);
}

async function main(): Promise<void> {
  const command = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'plan';
  if (command === 'plan') await plan();
  else if (command === 'merge') await merge();
  else if (command === 'status') await status();
  else {
    console.error(`Unknown command "${command}". Use plan, merge or status.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
