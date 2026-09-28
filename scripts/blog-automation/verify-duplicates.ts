/**
 * AUTO-119: measure the spacing merge and the advisory closest-wording figures
 * on today's pool. READ ONLY.
 *
 *   pnpm auto:verify-duplicates
 *   pnpm auto:verify-duplicates -- --report docs/blog-automation/x.md
 *   pnpm auto:verify-duplicates -- --no-embed      (skip the embedding call)
 *
 * Runs the SAME uncached pool builder the /api/sanity/blog-topics route runs,
 * guards the SAME pull a second time with the pre-AUTO-119 grouping
 * (`mergeSpacing: false`), and reports:
 *   - every group the spacing merge makes, with each spelling's state before
 *     and the merged topic's state after, so Ali can check none is wrong;
 *   - usable / excluded / blocked counts before and after, with the live
 *     drafts record (AUTO-117) and Patrick's live blocks applied to both;
 *   - that every stored record and every stored block that matched a row
 *     before the merge still matches the topic that row is now part of;
 *   - the closest-wording figures: cost, time, cache entry size, and that the
 *     counts are identical with and without them (they never touch a state);
 *   - the worked examples for the guide (sunglasses, socks tampa, balloons).
 *
 * Writes nothing to Sanity, calls no generation route. The one paid call is
 * the embedding (about half a US cent), skipped with --no-embed. No key or
 * token is printed. Exit 1 on failure.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { PoolQuery, Topic } from '../../lib/blog-automation/topic-pool';

function flagValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return undefined;
}

const PROJECT_ROOT = resolve(__dirname, '../..');

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

const REPORT_PATH = resolve(PROJECT_ROOT, flagValue('--report') ?? 'docs/blog-automation/AUTO-119-duplicates-report.md');
const EMBED = !process.argv.includes('--no-embed');

const report: string[] = [];
function out(line = ''): void {
  console.log(line);
  report.push(line);
}
const fmt = (n: number): string => n.toLocaleString('en-US');
const cell = (s: string): string => s.replace(/\|/g, '/');

async function main(): Promise<void> {
  const { buildTopicPoolSnapshot, describePoolError, guardCandidates } = await import('../../lib/blog-automation/build-topic-pool');
  const { buildTopicSimilarity } = await import('../../lib/blog-automation/build-topic-similarity');
  const { readWrittenTopicSources } = await import('../../lib/blog-automation/written-topics');
  const { loadLinkDocsForKind } = await import('../../lib/ai/internal-links');
  const tp = await import('../../lib/blog-automation/topic-pool');
  const ts = await import('../../lib/blog-automation/topic-similarity');
  const { createClient } = await import('@sanity/client');

  let pool: PoolQuery[] = [];
  let snapshot;
  let sources;
  try {
    [snapshot, sources] = await Promise.all([
      buildTopicPoolSnapshot({ onPool: (q) => { pool = q; } }),
      readWrittenTopicSources(),
    ]);
  } catch (err) {
    const d = err instanceof Error && 'hint' in err ? { message: err.message, hint: String((err as { hint: unknown }).hint) } : describePoolError(err);
    console.error(d.message);
    console.error(d.hint);
    process.exit(1);
  }
  const blogDocs = await loadLinkDocsForKind('blog');
  const beforeGuarded = await guardCandidates(tp.groupIntoTopics(pool, { mergeSpacing: false }), blogDocs, snapshot.threshold);

  const sanity = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
    apiVersion: '2024-10-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
    perspective: 'raw',
  });
  const settings = await sanity.fetch<{ nk?: { term?: string; scope?: string }[] } | null>(
    `*[_id == "globalSettings"][0]{ "nk": blogAutomation.negativeKeywords[]{ term, scope } }`,
  );
  const blocks = (settings?.nk ?? [])
    .filter((e) => e.term)
    .map((e) => ({ term: tp.normalizeBlockTerm(e.term), scope: tp.blockScopeOf(e.scope) }));

  const finish = (topics: Topic[]) => tp.applyNegativeKeywords(tp.applyWrittenTopics(topics, sources), blocks);
  const before = finish(beforeGuarded);
  const after = finish(snapshot.topics);
  const cb = tp.countTopics(before);
  const ca = tp.countTopics(after);

  out('# AUTO-119: duplicates shown, not decided');
  out();
  out(`Generated ${new Date().toISOString()} by \`pnpm auto:verify-duplicates\` (read only: no Sanity write, no generation route).`);
  out();
  out(`Search Console ${snapshot.window.start} to ${snapshot.window.end}: ${fmt(snapshot.gsc.allQueries)} queries, ${fmt(pool.length)} in the pool; ${fmt(blogDocs.length)} published posts; ${sources.length} drafts and posts carrying a topic record; ${blocks.length} stored block(s): ${blocks.map((b) => `"${b.term}" (${b.scope})`).join(', ') || 'none'}. Cold build ${fmt(snapshot.buildMs)} ms.`);
  out();

  // 1. Counts before and after the spacing merge.
  out('## 1. The pool before and after the spacing merge');
  out();
  out('| | Before (AUTO-117 grouping) | After (AUTO-119) |');
  out('| --- | --- | --- |');
  for (const [label, k] of [
    ['Topics', 'topics'],
    ['Usable', 'usable'],
    ['Excluded', 'excluded'],
    ['Blocked', 'blocked'],
    ['Excluded, rule one only', 'excludedBySharedTokens'],
    ['Excluded, rule two only', 'excludedByRankingPage'],
    ['Excluded, both rules', 'excludedByBoth'],
    ['Excluded, already written', 'excludedAlreadyWritten'],
  ] as const) {
    out(`| ${label} | ${fmt(cb[k])} | ${fmt(ca[k])} |`);
  }
  out();

  // 2. Every merged group.
  const merged = after.filter((t) => t.spacingGroups.length > 0);
  const beforeByKey = new Map(before.map((t) => [t.key, t]));
  out(`## 2. Every group the spacing merge makes (${merged.length})`);
  out();
  out('Each row is one topic after the merge; the spellings are the rows it replaced, each with the state that row had. Check that every group really is one thing.');
  out();
  out('| Merged topic | Impressions | State after | Spellings folded in (state before) |');
  out('| --- | --- | --- | --- |');
  let changed = 0;
  for (const t of merged) {
    const parts = tp.topicKeys(t).map((k) => beforeByKey.get(k)).filter((x): x is Topic => Boolean(x));
    const partText = parts.map((p) => `"${p.query}" ${fmt(p.impressions)} ${p.state}`).join('; ');
    if (parts.some((p) => p.state !== t.state)) changed += 1;
    out(`| ${cell(t.query)} | ${fmt(t.impressions)} | ${t.state}${t.rule ? ` (${t.rule})` : ''} | ${cell(partText)} |`);
  }
  out();
  out(`Groups whose parts did not all have the merged state: ${changed}. Where a part was excluded and the merged topic's main spelling was not, the merged topic is excluded with that spelling's reason (the tokenizer blind spot the merge exists for).`);
  out();

  // 3. Records and blocks.
  out('## 3. Stored records and blocks under the merged grouping');
  out();
  const containing = (key: string) => after.find((t) => tp.topicKeys(t).includes(key));
  let recordsOk = 0;
  let recordsBad = 0;
  for (const t of before.filter((x) => x.writtenAs)) {
    const now = containing(t.key);
    if (now?.writtenAs) recordsOk += 1;
    else {
      recordsBad += 1;
      out(`- RECORD LOST: "${t.query}" was already written, its merged topic "${now?.query ?? '(none)'}" is not.`);
    }
  }
  let blocksOk = 0;
  let blocksBad = 0;
  for (const t of before.filter((x) => x.state === 'blocked')) {
    const now = containing(t.key);
    if (now?.state === 'blocked') blocksOk += 1;
    else {
      blocksBad += 1;
      out(`- BLOCK LOST: "${t.query}" was blocked, its merged topic "${now?.query ?? '(none)'}" is not.`);
    }
  }
  const newlyBlocked = after.filter((t) => t.state === 'blocked' && tp.topicKeys(t).some((k) => beforeByKey.get(k)?.state !== 'blocked'));
  out(`- Topics already written before the merge: ${recordsOk + recordsBad}; still already written after: ${recordsOk}; lost: ${recordsBad}.`);
  out(`- Topics blocked before the merge: ${blocksOk + blocksBad}; still blocked after: ${blocksOk}; lost: ${blocksBad}.`);
  out(`- Merged topics now blocked as a whole because a block covered one of their spellings: ${newlyBlocked.length}${newlyBlocked.length ? ` (${newlyBlocked.map((t) => `"${t.query}"`).join(', ')})` : ''}.`);
  out();

  // 4. Closest wording.
  out('## 4. Closest wording (advisory)');
  out();
  const compactPool = JSON.stringify({ ...snapshot, topics: snapshot.topics.map(tp.compactTopic) });
  out(`- Cached pool snapshot after the merge: ${fmt(compactPool.length)} bytes (${(compactPool.length / 1024 / 1024).toFixed(2)} MB; the data cache limit is about 2 MB).`);
  if (!EMBED) {
    out('- Skipped (--no-embed).');
  } else {
    const posts = blogDocs.filter((d) => d.title && d.slug).map((d) => ({ title: String(d.title), href: `${tp.BLOG_PATH_PREFIX}${d.slug}` }));
    const compact = await buildTopicSimilarity({ generatedAt: snapshot.generatedAt, topics: snapshot.topics, posts });
    const figures = ts.expandSimilarity(compact);
    const entry = JSON.stringify(compact).length;
    out(`- Embedded ${fmt(compact.texts)} texts (${fmt(snapshot.topics.length)} topics + ${fmt(posts.length)} post titles) with ${compact.model} at ${compact.dimensions} dimensions in ${compact.calls} calls; ${fmt(compact.promptTokens)} tokens; cost USD ${compact.costUsd.toFixed(6)}; ${fmt(compact.buildMs)} ms including scoring.`);
    out(`- Cache entry (results only, never vectors): ${fmt(entry)} bytes (${(entry / 1024).toFixed(0)} KB). The route answer expands it to ${fmt(JSON.stringify(figures).length)} bytes.`);
    out(`- A month of daily Refreshes (30 pool builds): about USD ${(compact.costUsd * 30).toFixed(4)}. Without a Refresh the figures are computed at most once a day (the pool's own 24-hour cache).`);
    const recount = tp.countTopics(tp.applyNegativeKeywords(tp.applyWrittenTopics(snapshot.topics, sources), blocks));
    out(`- Counts recomputed after the figures exist: ${JSON.stringify(recount) === JSON.stringify(ca) ? 'IDENTICAL' : 'DIFFERENT (a bug)'} (usable ${fmt(recount.usable)}, excluded ${fmt(recount.excluded)}, blocked ${fmt(recount.blocked)}). The figures take only each topic's key and search as input and are never read by the guard.`);
    out();

    const show = (label: string, match: (q: string) => boolean, limit = 40) => {
      const rows = after.filter((t) => match(t.query));
      out(`### ${label} (${rows.length} topics)`);
      out();
      out('| Topic | Impressions | State | Closest topics (score) | Closest post (score) |');
      out('| --- | --- | --- | --- | --- |');
      for (const t of rows.slice(0, limit)) {
        const f = figures.byKey[t.key];
        out(`| ${cell(t.query)} | ${fmt(t.impressions)} | ${t.state} | ${cell((f?.topics ?? []).map((n) => `${n.query} (${n.score})`).join('; '))} | ${cell(f?.post ? `${f.post.title} (${f.post.score})` : '')} |`);
      }
      out();
    };
    show('Sunglasses', (q) => /sun ?glass/.test(q));
    show('Socks and Tampa', (q) => q.includes('sock') && q.includes('tampa'));
    show('Balloons', (q) => q.includes('balloon'));

    // Named pairs, scored directly (six short texts, a fraction of a cent).
    const { embedTexts } = await import('../../lib/ai/gemini');
    const pairs: [string, string][] = [
      ['custom engraved sunglasses', 'printed lens sunglasses'],
      ['custom sunglasses', 'custom engraved sunglasses'],
      ['custom pedometers', 'custom step counters'],
      ['custom koozies', 'custom coozies'],
    ];
    const pv = (await embedTexts(pairs.flat())).vectors;
    out('### Named pairs, scored directly');
    out();
    pairs.forEach(([a, b], i) => {
      out(`- "${a}" against "${b}": ${ts.displayScore(ts.cosineSimilarity(pv[2 * i], pv[2 * i + 1]))}`);
    });
    out();
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${report.join('\n')}\n`, 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
  if (recordsBad > 0 || blocksBad > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
