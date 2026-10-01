/**
 * AUTO-110: measure the blog topic guard on today's pool. READ ONLY.
 *
 *   pnpm auto:verify-topic-pool                 # full report
 *   pnpm auto:verify-topic-pool -- --report docs/blog-automation/x.md
 *   (= tsx scripts/blog-automation/verify-topic-pool.ts ...)
 *
 * Runs the SAME builder the /api/sanity/blog-topics route runs
 * (lib/blog-automation/build-topic-pool.ts, uncached), then reports:
 *   - the guard's real numbers per TOPIC (what the panel shows) and per QUERY
 *     (how AUTO-100 counted, so its 60.0% can be compared like for like);
 *   - ten example topics as Patrick would see them, across every state;
 *   - the wall-clock of the build (the route's maxDuration is judged against
 *     it) and the JSON size of the snapshot (the data cache refuses an entry
 *     over about 2 MB);
 *   - every Search Analytics request made.
 *
 * No Sanity write, no AI call, no paid API. The key is never printed. Exit 1
 * on failure, with the same message and hint the panel would show.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { TopicPoolSnapshot } from '../../lib/blog-automation/build-topic-pool';
import type { SaRequestLog } from '../../lib/blog-automation/gsc-client';
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
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

const REPORT_PATH = resolve(PROJECT_ROOT, flagValue('--report') ?? 'docs/blog-automation/AUTO-110-guard-report.md');

const report: string[] = [];
function out(line = ''): void {
  console.log(line);
  report.push(line);
}
const pct = (n: number, d: number): string => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const fmt = (n: number): string => n.toLocaleString('en-US');

function writeReport(): void {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${report.join('\n')}\n`, 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

function row(t: Topic): string {
  const state = t.state === 'usable' ? 'Usable' : t.state === 'blocked' ? 'Blocked' : 'Excluded';
  const reason =
    t.reason ??
    (t.matchedPost && t.sharedTokens.length > 0
      ? `Closest existing post shares only "${t.sharedTokens.join(', ')}": ${t.matchedPost.title}`
      : '');
  return `| ${t.query}${t.variants.length > 1 ? ` (+${t.variants.length - 1} similar)` : ''} | ${fmt(t.impressions)} | ${fmt(t.clicks)} | ${t.position === null ? "none" : t.position.toFixed(1)} | ${t.page ?? 'none'} | ${state} | ${reason.replace(/\|/g, '/')} |`;
}

async function main(): Promise<void> {
  // Dynamic imports AFTER loadDotEnvLocal(): lib/sanity/client.ts reads the
  // project id at import time, and a static import is hoisted above the env
  // load (the AUTO-100 script's own reason for importing inside main).
  const [{ buildTopicPoolSnapshot, describePoolError }, { CANNIBALIZATION_THRESHOLD, compactTopic, countTopics, isBlogPath, sectionOfPath }] =
    await Promise.all([
      import('../../lib/blog-automation/build-topic-pool'),
      import('../../lib/blog-automation/topic-pool'),
    ]);
  const requests: SaRequestLog[] = [];
  let pool: PoolQuery[] = [];
  out('# AUTO-110: the blog topic guard on today\'s pool');
  out();
  out(`Run: ${new Date().toISOString()} (UTC). Read only: no Sanity write, no AI call, no paid API. Built by the same code as the Blog Topics route, uncached.`);
  out();

  let snapshot: TopicPoolSnapshot;
  try {
    snapshot = await buildTopicPoolSnapshot({
      onRequest: (e) => requests.push(e),
      onPool: (q) => {
        pool = q;
      },
    });
  } catch (e) {
    const d = describePoolError(e);
    console.error(`\nFAILED: ${d.message}\n${d.hint}`);
    process.exit(1);
  }

  const { topics } = snapshot;
  const counts = countTopics(topics);
  const json = JSON.stringify(snapshot);

  out('## The pull');
  out();
  out(`- Property: \`${snapshot.property}\`; window ${snapshot.window.start} to ${snapshot.window.end} (${snapshot.window.days} days); band ${snapshot.band.low} to ${snapshot.band.high}; floor ${snapshot.floor} impressions; threshold ${snapshot.threshold} (the constant CANNIBALIZATION_THRESHOLD in lib/blog-automation/topic-pool.ts, currently ${CANNIBALIZATION_THRESHOLD}).`);
  out(`- Query rows: ${fmt(snapshot.gsc.allQueries)} over ${snapshot.gsc.queryPages} pages; in the pool: ${fmt(snapshot.gsc.poolQueries)}; query x page rows: ${fmt(snapshot.gsc.queryPageRows)} over ${snapshot.gsc.queryPagePages} pages.`);
  out(`- Published posts the detector scored against: ${fmt(snapshot.publishedPosts)}.`);
  out(`- Build wall-clock: ${fmt(snapshot.buildMs)} ms (the route's maxDuration is 120 s).`);
  out(`- Full snapshot JSON: ${fmt(json.length)} bytes (${(json.length / 1024 / 1024).toFixed(2)} MB).`);
  const compactJson = JSON.stringify({ ...snapshot, topics: snapshot.topics.map(compactTopic) });
  out(`- Cached (compact) snapshot JSON, what the route stores: ${fmt(compactJson.length)} bytes (${(compactJson.length / 1024 / 1024).toFixed(2)} MB; the data cache limit is about 2 MB).`);
  out();

  out('## The guard, per topic (what the panel shows)');
  out();
  out('| State | Topics | Share |');
  out('| --- | --- | --- |');
  out(`| Usable | ${fmt(counts.usable)} | ${pct(counts.usable, counts.topics)} |`);
  out(`| Excluded, shares keywords with an existing post (rule one only) | ${fmt(counts.excludedBySharedTokens)} | ${pct(counts.excludedBySharedTokens, counts.topics)} |`);
  out(`| Excluded, a blog post already ranks (rule two only) | ${fmt(counts.excludedByRankingPage)} | ${pct(counts.excludedByRankingPage, counts.topics)} |`);
  out(`| Excluded, both rules | ${fmt(counts.excludedByBoth)} | ${pct(counts.excludedByBoth, counts.topics)} |`);
  out(`| Excluded, total | ${fmt(counts.excluded)} | ${pct(counts.excluded, counts.topics)} |`);
  out(`| Topics | ${fmt(counts.topics)} | 100% |`);
  out();
  const ruleOneAny = counts.excludedBySharedTokens + counts.excludedByBoth;
  const ruleTwoAny = counts.excludedByRankingPage + counts.excludedByBoth;
  out(`Rule one fires on ${fmt(ruleOneAny)} topics (${pct(ruleOneAny, counts.topics)}); rule two on ${fmt(ruleTwoAny)} (${pct(ruleTwoAny, counts.topics)}); rule two alone adds ${fmt(counts.excludedByRankingPage)} the detector did not catch.`);
  out();

  // Per query, the way AUTO-100 counted: rule one is a property of the topic
  // (every member shares the significant token set), rule two of the query.
  const ruleOneByKey = new Map(topics.map((t) => [t.key, t.rule === 'shared-tokens' || t.rule === 'both']));
  const keyOf = new Map<string, string>();
  for (const t of topics) for (const v of t.variants) keyOf.set(v, t.key);
  let qTokens = 0;
  let qPage = 0;
  let qEither = 0;
  let qBoth = 0;
  const bySection = new Map<string, number>();
  for (const q of pool) {
    const one = ruleOneByKey.get(keyOf.get(q.query) ?? '') ?? false;
    const two = isBlogPath(q.page);
    if (one) qTokens += 1;
    if (two) qPage += 1;
    if (one || two) qEither += 1;
    if (one && two) qBoth += 1;
    const sec = sectionOfPath(q.page);
    bySection.set(sec, (bySection.get(sec) ?? 0) + 1);
  }
  out('## The guard, per query (how AUTO-100 counted; its combined rule excluded 60.0%)');
  out();
  out(`- Pool queries: ${fmt(pool.length)}.`);
  out(`- Rule one (shares ${snapshot.threshold}+ significant tokens, near-generic words stripped): ${fmt(qTokens)} (${pct(qTokens, pool.length)}).`);
  out(`- Rule two (top page is already a /blog/ post): ${fmt(qPage)} (${pct(qPage, pool.length)}).`);
  out(`- Both: ${fmt(qBoth)} (${pct(qBoth, pool.length)}).`);
  out(`- Either, the combined rule: ${fmt(qEither)} (${pct(qEither, pool.length)}); surviving queries ${fmt(pool.length - qEither)}.`);
  out();
  out('Top page per pool query, by section:');
  out();
  for (const [sec, n] of [...bySection.entries()].sort((a, b) => b[1] - a[1])) out(`- ${sec}: ${fmt(n)} (${pct(n, pool.length)})`);
  out();

  out('## Ten example topics, as the panel shows them');
  out();
  out('| Search term | Impressions | Clicks | Avg. position | Page ranking now | Check | Reason |');
  out('| --- | --- | --- | --- | --- | --- | --- |');
  const byImpr = (a: Topic, b: Topic) => b.impressions - a.impressions;
  const pick = (pred: (t: Topic) => boolean, n: number) => topics.filter(pred).sort(byImpr).slice(0, n);
  const examples = [
    ...pick((t) => t.state === 'usable', 4),
    ...pick((t) => t.rule === 'shared-tokens', 2),
    ...pick((t) => t.rule === 'ranking-page', 2),
    ...pick((t) => t.rule === 'both', 2),
  ];
  for (const t of examples) out(row(t));
  out();

  out('## The usable list, top 30 by impressions');
  out();
  out('| Search term | Impressions | Clicks | Avg. position | Page ranking now | Check | Reason |');
  out('| --- | --- | --- | --- | --- | --- | --- |');
  for (const t of pick((t) => t.state === 'usable', 30)) out(row(t));
  out();

  out('## Appendix: every Search Analytics request made');
  out();
  out('| Property | Body | Rows |');
  out('| --- | --- | --- |');
  for (const r of requests) out(`| ${r.property} | \`${JSON.stringify(r.body)}\` | ${r.rows} |`);
  out();
  out(`Finished ${new Date().toISOString()}; ${requests.length} Search Analytics requests, one Sanity read.`);
  writeReport();
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\nFAILED: ${msg.includes('private_key') || msg.includes('BEGIN ') ? 'an error mentioning key material was suppressed' : msg}`);
  process.exit(1);
});
