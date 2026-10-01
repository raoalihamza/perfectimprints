/**
 * AUTO-121: measure the wider window, the scaled floor, the staleness of what
 * it adds, the top-7 check and the cache budget on today's data. READ ONLY.
 *
 *   pnpm auto:verify-wider-window
 *   pnpm auto:verify-wider-window -- --similar      # also time the capped embedding (one Gemini build, about USD 0.005)
 *   pnpm auto:verify-wider-window -- --report docs/blog-automation/x.md
 *   (= tsx scripts/blog-automation/verify-wider-window.ts ...)
 *
 * Runs the SAME builder the /api/sanity/blog-topics route runs (uncached),
 * keeps the raw rows it pulled through `onRaw`, and reports from them:
 *   - the pull itself (rows, pages, requests, wall-clock) and that every list
 *     reached its end;
 *   - the added-topic count at a table of floors, against AUTO-120's figures;
 *   - when the added topics were last seen (30 / 90 / 180 / 365 / older);
 *   - the guard over the added topics, by rule, and the top-7 check over
 *     today's 90-day topics (own search, or a different wording);
 *   - the cache entry: compact and packed bytes against the budget, and what
 *     the trim would have dropped;
 *   - with --similar, the wall-clock, calls and cost of the capped embedding.
 *
 * No Sanity write, no AI call unless --similar, no paid keyword API. The key
 * is never printed. Exit 1 on failure with the message the panel would show.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { RawPulls, TopicPoolSnapshot } from '../../lib/blog-automation/build-topic-pool';
import type { SaRequestLog } from '../../lib/blog-automation/gsc-client';
import type { PoolQuery, Topic } from '../../lib/blog-automation/topic-pool';

function flagValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(name);

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

const REPORT_PATH = resolve(PROJECT_ROOT, flagValue('--report') ?? 'docs/blog-automation/AUTO-121-wider-window-report.md');

const report: string[] = [];
function out(line = ''): void {
  console.log(line);
  report.push(line);
}
const pct = (n: number, d: number): string => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const fmt = (n: number): string => n.toLocaleString('en-US');
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function writeReport(): void {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${report.join('\n')}\n`, 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

function row(t: Topic): string {
  const state = t.state === 'usable' ? 'Usable' : t.state === 'blocked' ? 'Blocked' : 'Excluded';
  const pos = t.position === null ? 'none' : t.position.toFixed(1);
  return `| ${t.query}${t.variants.length > 1 ? ` (+${t.variants.length - 1})` : ''} | ${t.position === null ? 'none' : `${fmt(t.impressions)} / ${pos}`} | ${fmt(t.long.impressions)} / ${t.long.position.toFixed(1)} | ${t.seenDays === 480 ? 'over a year' : `${t.seenDays} d`} | ${t.page ?? 'none'} | ${state} | ${(t.reason ?? '').replace(/\|/g, '/')} |`;
}

async function main(): Promise<void> {
  const [
    { buildTopicPoolSnapshot, describePoolError },
    tp,
    { packSnapshot, CACHE_ENTRY_BUDGET_BYTES },
    { SIMILARITY_MAX_TOPICS, buildTopicSimilarity },
  ] = await Promise.all([
    import('../../lib/blog-automation/build-topic-pool'),
    import('../../lib/blog-automation/topic-pool'),
    import('../../lib/blog-automation/cached-topic-pool'),
    import('../../lib/blog-automation/build-topic-similarity'),
  ]);
  const requests: SaRequestLog[] = [];
  let pool: PoolQuery[] = [];
  let raw: RawPulls | null = null;
  out("# AUTO-121: the 16 months the account already holds");
  out();
  out(`Run: ${new Date().toISOString()} (UTC). Read only: no Sanity write, no paid API${hasFlag('--similar') ? ', one embedding build' : ', no AI call'}. Built by the same code as the Blog Topics route, uncached.`);
  out();

  let snapshot: TopicPoolSnapshot;
  const started = Date.now();
  try {
    snapshot = await buildTopicPoolSnapshot({
      onRequest: (e) => requests.push(e),
      onPool: (q) => {
        pool = q;
      },
      onRaw: (r) => {
        raw = r;
      },
    });
  } catch (e) {
    const d = describePoolError(e);
    console.error(`\nFAILED: ${d.message}\n${d.hint}`);
    process.exit(1);
  }
  if (!raw) throw new Error('the builder handed back no raw rows');
  const rawRows = raw as RawPulls;
  const { topics } = snapshot;
  const counts = tp.countTopics(topics);

  // ── 1. The pull ─────────────────────────────────────────────────────────────
  out('## 1. The pull');
  out();
  out(`- Property \`${snapshot.property}\`; 90 days ${snapshot.window.start} to ${snapshot.window.end}; 16 months ${snapshot.longWindow.start} to ${snapshot.longWindow.end} (${snapshot.longWindow.days} days); band ${snapshot.band.low} to ${snapshot.band.high}; floors ${snapshot.floor} (90 days) and ${snapshot.longWindow.floor} (16 months); threshold ${snapshot.threshold}.`);
  out(`- Query rows: 90 days ${fmt(snapshot.gsc.allQueries)} over ${snapshot.gsc.queryPages} pages; 16 months ${fmt(snapshot.gsc.longQueries)} over ${snapshot.gsc.longQueryPages} pages. Query x page rows, 90 days: ${fmt(snapshot.gsc.queryPageRows)} over ${snapshot.gsc.queryPagePages} pages. Ranking pages for the added topics: ${snapshot.gsc.pageRequests} regex-filtered requests, ${fmt(snapshot.gsc.pageRequestRows)} rows.`);
  for (const [days, rows] of [...rawRows.queriesByWindow.entries()].sort((a, b) => a[0] - b[0])) out(`- Window ${days} days: ${fmt(rows.length)} query rows.`);
  const lastPages = requests.filter((r) => r.body.startRow !== undefined && r.rows === 0 && !r.body.dimensionFilterGroups).length;
  const paginated = new Set(requests.filter((r) => !r.body.dimensionFilterGroups).map((r) => `${r.body.startDate}|${r.body.dimensions.join(',')}`)).size;
  out(`- Every paginated list reached its end: ${paginated} lists, ${lastPages} empty final pages. ${requests.length} Search Analytics requests in all; build wall-clock ${fmt(snapshot.buildMs)} ms (${(snapshot.buildMs / 1000).toFixed(1)} s; script total ${((Date.now() - started) / 1000).toFixed(1)} s including the guard).`);
  out(`- Pool: ${fmt(snapshot.gsc.poolQueries)} searches from the 90 days; ${fmt(snapshot.gsc.longPoolQueries)} in the band over 16 months at the floor of ${snapshot.longWindow.floor}, of which ${fmt(snapshot.gsc.addedQueries)} are not in the 90-day pool. Topics: ${fmt(counts.topics)} (${fmt(counts.recent)} seen in the last 90 days, ${fmt(counts.older)} added by the 16 months).`);
  out();

  // ── 2. The floor table ──────────────────────────────────────────────────────
  const q90 = rawRows.queriesByWindow.get(snapshot.window.days) ?? [];
  const qLong = rawRows.queriesByWindow.get(snapshot.longWindow.days) ?? [];
  const recentTopics = topics.filter((t) => t.window === 'recent');
  const recentKeys = new Set<string>();
  for (const t of recentTopics) for (const k of tp.topicKeys(t)) recentKeys.add(k);
  const inRecentPool = new Set(pool.filter((q) => q.window === 'recent').map((q) => q.query));
  const keysAll90 = new Set(q90.map((r) => tp.queryTopicKey(r.keys[0])));
  out('## 2. What the wider window adds, by floor (band 8 to 40 over 16 months)');
  out();
  out('AUTO-120 reported 4,496 topic keys "that never appear in the 90 day data at all" and 1,261 "scaling the floor to the longer window". Measured here, three ways: keys absent from the entire 90-day query list (AUTO-120\'s first figure), keys not in the 90-day POOL (what the panel adds), and the topics those keys make after the spacing merge.');
  out();
  out('| Floor | Searches in band | Topic keys | Keys absent from all 90-day data | Keys not in the 90-day pool | Added topics |');
  out('| --- | --- | --- | --- | --- | --- |');
  const floors = [10, 20, 25, 30, 40, 50, 53, 55, 60, 75, 100, 150, 200];
  for (const floor of floors) {
    const rows = qLong.filter((r) => tp.isPoolQuery(r, { floor }));
    const keys = new Set(rows.map((r) => tp.queryTopicKey(r.keys[0])));
    const absent = [...keys].filter((k) => !keysAll90.has(k)).length;
    const notInPool = [...keys].filter((k) => !recentKeys.has(k)).length;
    const added = tp.groupIntoTopics(
      rows.filter((r) => !inRecentPool.has(r.keys[0]) && !recentKeys.has(tp.queryTopicKey(r.keys[0]))).map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10, page: null })),
    ).length;
    out(`| ${floor}${floor === snapshot.longWindow.floor ? ' (chosen)' : ''} | ${fmt(rows.length)} | ${fmt(keys.size)} | ${fmt(absent)} | ${fmt(notInPool)} | ${fmt(added)} |`);
  }
  out();
  out(`The chosen floor is ${snapshot.longWindow.floor}: the 90-day floor of ${snapshot.floor} at the same rate (${snapshot.floor} per 90 days is ${((snapshot.floor * snapshot.longWindow.days) / 90).toFixed(1)} per ${snapshot.longWindow.days} days), rounded up to the nearest five.`);
  out();

  // ── 3. Staleness ────────────────────────────────────────────────────────────
  const olderTopics = topics.filter((t) => t.window === 'older');
  out('## 3. When the added topics were last seen');
  out();
  out('| Last seen | Topics | Share |');
  out('| --- | --- | --- |');
  const seenCounts = new Map<number, number>();
  for (const t of olderTopics) seenCounts.set(t.seenDays, (seenCounts.get(t.seenDays) ?? 0) + 1);
  for (const [d, label] of [[30, 'in the last 30 days'], [90, '1 to 3 months ago'], [180, '3 to 6 months ago'], [365, '6 to 12 months ago'], [480, 'over a year ago']] as const) {
    out(`| ${label} | ${fmt(seenCounts.get(d) ?? 0)} | ${pct(seenCounts.get(d) ?? 0, olderTopics.length)} |`);
  }
  out(`| Added topics | ${fmt(olderTopics.length)} | 100% |`);
  out();
  // Why a topic seen in the last 90 days is not in the 90-day pool.
  const m90 = new Map(q90.map((r) => [r.keys[0], r]));
  let absent = 0, underFloor = 0, better = 0, worse = 0;
  for (const q of pool) {
    if (q.window !== 'older') continue;
    const r = m90.get(q.query);
    if (!r) absent += 1;
    else if (r.impressions < snapshot.floor) underFloor += 1;
    else if (r.position < snapshot.band.low) better += 1;
    else worse += 1;
  }
  out(`Of the ${fmt(snapshot.gsc.addedQueries)} added searches: ${fmt(absent)} had no 90-day row at all, ${fmt(underFloor)} had fewer than ${snapshot.floor} impressions in 90 days, ${fmt(better)} rank better than ${snapshot.band.low} in the last 90 days (the top-7 hazard, below), ${fmt(worse)} rank worse than ${snapshot.band.high} now.`);
  out();

  // ── 4. The guard over the added topics ──────────────────────────────────────
  const olderCounts = tp.countTopics(olderTopics);
  out('## 4. The guard over the added topics');
  out();
  out('| State | Added topics | Share |');
  out('| --- | --- | --- |');
  out(`| Usable | ${fmt(olderCounts.usable)} | ${pct(olderCounts.usable, olderTopics.length)} |`);
  out(`| Excluded, shares keywords with an existing post (rule one only) | ${fmt(olderCounts.excludedBySharedTokens)} | ${pct(olderCounts.excludedBySharedTokens, olderTopics.length)} |`);
  out(`| Excluded, a blog post already ranks (rule two only) | ${fmt(olderCounts.excludedByRankingPage)} | ${pct(olderCounts.excludedByRankingPage, olderTopics.length)} |`);
  out(`| Excluded, both rules | ${fmt(olderCounts.excludedByBoth)} | ${pct(olderCounts.excludedByBoth, olderTopics.length)} |`);
  out(`| Excluded, already ranks in the top 7 (the guard passed it) | ${fmt(olderCounts.excludedAlreadyRanking)} | ${pct(olderCounts.excludedAlreadyRanking, olderTopics.length)} |`);
  out(`| Excluded, total | ${fmt(olderCounts.excluded)} | ${pct(olderCounts.excluded, olderTopics.length)} |`);
  out();
  const recentCounts = tp.countTopics(recentTopics);
  out(`For comparison, the 90-day topics: ${fmt(recentCounts.topics)} topics, ${fmt(recentCounts.usable)} usable (${pct(recentCounts.usable, recentCounts.topics)}), ${fmt(recentCounts.excluded)} excluded, of which ${fmt(recentCounts.excludedAlreadyRanking)} by the top-7 check alone.`);
  out();

  // ── 5. The top-7 check ──────────────────────────────────────────────────────
  out('## 5. The top-7 check');
  out();
  const top7All90 = q90.filter((r) => r.position < snapshot.band.low).length;
  const top7Floor90 = q90.filter((r) => r.position < snapshot.band.low && r.impressions >= snapshot.floor).length;
  out(`- Searches ranking in the top 7 over the last 90 days: ${fmt(top7All90)} of ${fmt(q90.length)} (AUTO-120 counted 4,077); ${fmt(top7Floor90)} of them with at least ${snapshot.floor} impressions, which is what the check reads (a position seen once is not a rank). Over 16 months: ${fmt(qLong.filter((r) => r.position < snapshot.band.low).length)} of ${fmt(qLong.length)}.`);
  const guardPassed = (t: Topic) => t.rule === null || t.rule === 'already-ranking';
  const rankingRecent = recentTopics.filter((t) => tp.isAlreadyRanking(t));
  const rankingOlder = olderTopics.filter((t) => tp.isAlreadyRanking(t));
  const notedRecent = recentTopics.filter((t) => t.topSevenNow && !tp.isAlreadyRanking(t));
  const notedOlder = olderTopics.filter((t) => t.topSevenNow && !tp.isAlreadyRanking(t));
  out(`- The rule: a topic whose own impressions-weighted average position over the last 90 days is under ${snapshot.band.low}, with at least ${snapshot.floor} impressions, is excluded ("already ranking"). A search with the topic's words in the top 7 (its own or a different wording) is named on the row and decides nothing.`);
  out(`- Today's 90-day topics that already rank in the top 7 on average: ${fmt(rankingRecent.length)}. A search in the 90-day pool is at position 8 to 40 by construction; these are topics into which the 16 months merged a same-words search that sits in the top 7 now, pulling the average under ${snapshot.band.low}. ${fmt(rankingRecent.filter((t) => t.rule === 'already-ranking').length)} of them the guard had passed, and the top-7 rule alone excludes; the table below lists those.`);
  out(`- Added topics that already rank in the top 7 on average (the hazard AUTO-120 named: their 16-month average put them in the band): ${fmt(rankingOlder.length)}, excluded, of which ${fmt(rankingOlder.filter((t) => t.rule === 'already-ranking').length)} the guard had passed.`);
  out(`- Topics with a top-7 search named on the row but NOT excluded: ${fmt(notedRecent.length)} of the 90-day topics (${fmt(notedRecent.filter(guardPassed).length)} usable) and ${fmt(notedOlder.length)} of the added ones (${fmt(notedOlder.filter(guardPassed).length)} usable). The table below shows why they stay: the wording that ranks is usually the small one.`);
  out();
  out("### Today's 90-day topics excluded by the top-7 rule alone");
  out();
  out('| Topic (90-day impressions, average position) | The top-7 search named (position, impressions, page) |');
  out('| --- | --- |');
  for (const t of rankingRecent.filter((t) => t.rule === 'already-ranking').sort((a, b) => b.impressions - a.impressions)) {
    const top = t.topSevenNow;
    out(`| ${t.query} (${fmt(t.impressions)}, ${t.position?.toFixed(1) ?? 'none'}) | ${top ? `${top.query} (${top.position.toFixed(1)}, ${fmt(top.impressions)}, ${top.page ?? 'none'})` : 'none'} |`);
  }
  out();
  out("### Today's usable topics with a top-7 search named on the row (shown, not excluded)");
  out();
  out('| Topic (90-day impressions, average position) | Top-7 search (position, impressions, page) | Own wording? | Its share of the combined impressions |');
  out('| --- | --- | --- | --- |');
  const shares: number[] = [];
  for (const t of notedRecent.filter(guardPassed).sort((a, b) => b.impressions - a.impressions)) {
    const top = t.topSevenNow!;
    const share = top.own ? top.impressions / Math.max(1, t.impressions) : top.impressions / (t.impressions + top.impressions);
    shares.push(share);
    out(`| ${t.query} (${fmt(t.impressions)}, ${t.position?.toFixed(1) ?? 'none'}) | ${top.query} (${top.position.toFixed(1)}, ${fmt(top.impressions)}, ${top.page ?? 'none'}) | ${top.own ? 'yes' : 'no'} | ${(share * 100).toFixed(0)}% |`);
  }
  shares.sort((a, b) => a - b);
  if (shares.length > 0) {
    out();
    out(`Share of the topic's impressions carried by the top-7 search, quartiles: ${[0.25, 0.5, 0.75].map((qq) => `${(shares[Math.min(shares.length - 1, Math.floor(qq * shares.length))] * 100).toFixed(0)}%`).join(', ')}; under 20% in ${fmt(shares.filter((s) => s < 0.2).length)} of ${fmt(shares.length)}. A rule on the wording would hide the larger wording because a smaller one ranks; the weighted average does not.`);
  }
  out();
  out('### Added topics excluded because they already rank in the top 7 on average');
  out();
  out('| Topic | 90 days: impressions / average position | 16 months: impressions / position | Best top-7 search (position, impressions, page) |');
  out('| --- | --- | --- | --- |');
  for (const t of rankingOlder.sort((a, b) => b.long.impressions - a.long.impressions)) {
    const top = t.topSevenNow;
    out(`| ${t.query} | ${fmt(t.impressions)} / ${t.position?.toFixed(1) ?? 'none'} | ${fmt(t.long.impressions)} / ${t.long.position.toFixed(1)} | ${top ? `${top.query} (${top.position.toFixed(1)}, ${fmt(top.impressions)}, ${top.page ?? 'none'})` : 'none'} |`);
  }
  out();

  // ── 6. The cache ────────────────────────────────────────────────────────────
  out('## 6. The cache entry');
  out();
  const compactBytes = JSON.stringify({ ...snapshot, topics: topics.map(tp.compactTopic) }).length;
  const packed = packSnapshot(snapshot);
  const fullBytes = JSON.stringify(snapshot).length;
  out(`- Full snapshot JSON (what the route answers before blocks): ${fmt(fullBytes)} bytes (${mb(fullBytes)}).`);
  out(`- Compact shape (AUTO-110 to AUTO-119, what used to be cached): ${fmt(compactBytes)} bytes (${mb(compactBytes)}).`);
  out(`- Packed shape (AUTO-121, what is cached now): ${fmt(packed.cacheBytes)} bytes (${mb(packed.cacheBytes)}) against the budget of ${fmt(CACHE_ENTRY_BUDGET_BYTES)} (${mb(CACHE_ENTRY_BUDGET_BYTES)}) and the data cache ceiling of 2 MB. Older topics the trim dropped to fit: ${fmt(packed.omittedOlderTopics)}.`);
  const recentOnly = packSnapshot({ ...snapshot, topics: recentTopics });
  out(`- For scale, the 90-day pool alone packed: ${fmt(recentOnly.cacheBytes)} bytes (${mb(recentOnly.cacheBytes)}).`);
  out();

  // ── 7. The embedding ────────────────────────────────────────────────────────
  out('## 7. The closest-wording figures at the new size');
  out();
  out(`- Topics: ${fmt(topics.length)}; cap SIMILARITY_MAX_TOPICS = ${fmt(SIMILARITY_MAX_TOPICS)}; embedded: every 90-day topic (${fmt(recentTopics.length)}) plus the first ${fmt(Math.max(0, Math.min(SIMILARITY_MAX_TOPICS, topics.length) - recentTopics.length))} older topics by 16-month impressions; without figures: ${fmt(Math.max(0, topics.length - SIMILARITY_MAX_TOPICS))}.`);
  if (hasFlag('--similar')) {
    const { loadLinkDocsForKind } = await import('../../lib/ai/internal-links');
    const docs = await loadLinkDocsForKind('blog');
    const t0 = Date.now();
    const figures = await buildTopicSimilarity({
      generatedAt: snapshot.generatedAt,
      topics: topics.slice(0, SIMILARITY_MAX_TOPICS).map((t) => ({ key: t.key, query: t.query })),
      posts: docs.filter((d) => d.title && d.slug).map((d) => ({ title: String(d.title), href: `/blog/${d.slug}` })),
    });
    const ms = Date.now() - t0;
    out(`- Measured: ${fmt(figures.texts)} texts in ${figures.calls} calls, ${fmt(figures.promptTokens)} tokens, USD ${figures.costUsd.toFixed(4)}, ${fmt(ms)} ms wall-clock (${(ms / 1000).toFixed(0)} s) including scoring; the deadline is 150 s and the route's limit 180 s. Cache entry (results only): ${fmt(JSON.stringify(figures).length)} bytes.`);
  } else {
    out('- Not measured this run (pass --similar to time one real build).');
  }
  out();

  // ── 8. Examples ─────────────────────────────────────────────────────────────
  out('## 8. The added topics, top 40 by 16-month impressions, as the panel shows them');
  out();
  out('| Search term | 90 days: impressions / position | 16 months: impressions / position | Last seen | Page ranking | Check | Reason |');
  out('| --- | --- | --- | --- | --- | --- | --- |');
  for (const t of [...olderTopics].sort((a, b) => b.long.impressions - a.long.impressions).slice(0, 40)) out(row(t));
  out();
  out('## 9. The usable added topics, top 40 by 16-month impressions');
  out();
  out('| Search term | 90 days: impressions / position | 16 months: impressions / position | Last seen | Page ranking | Check | Reason |');
  out('| --- | --- | --- | --- | --- | --- | --- |');
  for (const t of olderTopics.filter((t) => t.state === 'usable').sort((a, b) => b.long.impressions - a.long.impressions).slice(0, 40)) out(row(t));
  out();

  out('## Appendix: every Search Analytics request made');
  out();
  out('| Body | Rows |');
  out('| --- | --- |');
  for (const r of requests) {
    const body = { ...r.body } as Record<string, unknown>;
    if (r.body.dimensionFilterGroups) body.dimensionFilterGroups = `[regex over ${r.body.dimensionFilterGroups[0].filters[0].expression.split('|').length} searches]`;
    out(`| \`${JSON.stringify(body)}\` | ${r.rows} |`);
  }
  out();
  out(`Finished ${new Date().toISOString()}; ${requests.length} Search Analytics requests, one Sanity read.`);
  writeReport();
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\nFAILED: ${msg.includes('private_key') || msg.includes('BEGIN ') ? 'an error mentioning key material was suppressed' : msg}`);
  process.exit(1);
});
