/**
 * AUTO-117: measure the guard's memory of what it has already written. READ ONLY.
 *
 *   pnpm auto:verify-written-topics
 *   pnpm auto:verify-written-topics -- --report docs/blog-automation/x.md
 *   (= tsx scripts/blog-automation/verify-written-topics.ts ...)
 *
 * Runs the SAME uncached pool builder and the SAME live drafts read the
 * /api/sanity/blog-topics route runs, then reports:
 *   - AUTO-115's measurement re-run: every topic's state with and without the
 *     already-written rule, and which topics change (AUTO-115 found zero);
 *   - the one-token blind spot (topics rule one can never exclude) before and
 *     after, and how much of it an existing published post still overlaps;
 *   - what a backfill of the existing posts could honestly claim, by exact
 *     title key and exact slug key;
 *   - the near synonyms a scheduler would work through one by one.
 *
 * No Sanity write, no AI call, no paid API. No key or token is printed. Needs
 * GSC_SERVICE_ACCOUNT_JSON_B64 and SANITY_API_TOKEN (drafts are not public).
 * Exit 1 on failure with the same message the panel would show.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { Topic } from '../../lib/blog-automation/topic-pool';

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

const REPORT_PATH = resolve(PROJECT_ROOT, flagValue('--report') ?? 'docs/blog-automation/AUTO-117-written-topics-report.md');

const report: string[] = [];
function out(line = ''): void {
  console.log(line);
  report.push(line);
}

interface PostRow {
  _id: string;
  title?: string;
  slug?: string;
}

async function main(): Promise<void> {
  const { buildTopicPoolSnapshot, describePoolError } = await import('../../lib/blog-automation/build-topic-pool');
  const { readWrittenTopicSources } = await import('../../lib/blog-automation/written-topics');
  const tp = await import('../../lib/blog-automation/topic-pool');
  const { createClient } = await import('@sanity/client');

  let snapshot;
  let sources;
  try {
    [snapshot, sources] = await Promise.all([buildTopicPoolSnapshot(), readWrittenTopicSources()]);
  } catch (err) {
    const d = err instanceof Error && 'hint' in err ? { message: err.message, hint: String((err as { hint: unknown }).hint) } : describePoolError(err);
    console.error(d.message);
    console.error(d.hint);
    process.exit(1);
  }

  // The published post list and the stored blocks, for context (read only).
  const sanity = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
    apiVersion: '2024-10-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
    perspective: 'raw',
  });
  const [posts, settings] = await Promise.all([
    sanity.fetch<(PostRow & { kw?: string[] })[]>(
      `*[_type == "blogPost" && !(_id in path("versions.**"))]{ _id, title, "slug": slug.current, "kw": aiTopicKeywords }`,
    ),
    sanity.fetch<{ nk?: { term?: string; scope?: string }[] } | null>(
      `*[_id == "globalSettings"][0]{ "nk": blogAutomation.negativeKeywords[]{ term, scope } }`,
    ),
  ]);
  const blocks = (settings?.nk ?? [])
    .filter((e) => e.term)
    .map((e) => ({ term: tp.normalizeBlockTerm(e.term), scope: tp.blockScopeOf(e.scope) }));
  const published = posts.filter((p) => !p._id.startsWith('drafts.'));
  const drafts = posts.filter((p) => p._id.startsWith('drafts.'));

  out('# AUTO-117: the guard remembers what it has written');
  out();
  out(`Generated ${new Date().toISOString()} by \`pnpm auto:verify-written-topics\` (read only).`);
  out();
  out(`Search Console ${snapshot.window.start} to ${snapshot.window.end}: ${snapshot.gsc.allQueries.toLocaleString('en-US')} queries, ${snapshot.gsc.poolQueries.toLocaleString('en-US')} in the pool, ${snapshot.topics.length.toLocaleString('en-US')} topics; cold build ${snapshot.buildMs} ms.`);
  out(`Blog documents: ${published.length} published, ${drafts.length} drafts. With a recorded source topic: ${posts.filter((p) => p._id && (sources ?? []).some((s) => s.via === 'recorded' && s.documentId === p._id.replace(/^drafts\./, ''))).length}. With topic keywords: ${published.filter((p) => p.kw?.length).length} published, ${drafts.filter((p) => p.kw?.length).length} drafts.`);
  out(`Written sources read live (draft and published copy collapsed): ${sources.length}, of which ${sources.filter((s) => s.status === 'draft').length} drafts never published, ${sources.filter((s) => s.via === 'recorded').length} recorded, ${sources.filter((s) => s.via === 'keyword').length} by keyword.`);

  // 1. AUTO-115, re-run.
  const before = tp.applyNegativeKeywords(snapshot.topics, blocks);
  const after = tp.applyNegativeKeywords(tp.applyWrittenTopics(snapshot.topics, sources), blocks);
  const cb = tp.countTopics(before);
  const ca = tp.countTopics(after);
  out();
  out('## 1. State changes (AUTO-115 found zero)');
  out();
  out('| | usable | excluded | blocked | excluded, already written |');
  out('|---|---:|---:|---:|---:|');
  out(`| without the rule | ${cb.usable} | ${cb.excluded} | ${cb.blocked} | 0 |`);
  out(`| with the rule | ${ca.usable} | ${ca.excluded} | ${ca.blocked} | ${ca.excludedAlreadyWritten} |`);
  out();
  const changed: string[] = [];
  const alsoRecorded: string[] = [];
  after.forEach((a, i) => {
    if (!a.writtenAs) return;
    const line = `"${a.query}" (${a.impressions} impressions, ${a.variants.length} searches), by the ${a.writtenAs.status} "${a.writtenAs.title}" (${a.writtenAs.via === 'recorded' ? 'recorded topic' : `keyword "${a.writtenAs.matchedQuery}"`})`;
    if (before[i].state !== a.state) changed.push(`- ${before[i].state} to ${a.state}: ${line}`);
    else alsoRecorded.push(`- already ${before[i].state}: ${line}`);
  });
  out(`**Topics that change state: ${changed.length}.**`);
  for (const l of changed) out(l);
  out();
  out(`Already excluded by the token or ranking rule, now also carrying the record: ${alsoRecorded.length}.`);
  for (const l of alsoRecorded) out(l);

  // 2. The one-token blind spot.
  const oneToken = (t: Topic) => new Set(tp.detectorInput(t.query).split(' ').filter(Boolean).map(tp.singularToken)).size < 2;
  const titleTokens = published.map((p) => new Set(tp.tokenize(`${p.title ?? ''} ${p.slug ?? ''}`).map(tp.singularToken)));
  const overlapped = (t: Topic) => {
    const need = tp.detectorInput(t.query).split(' ').filter(Boolean).map(tp.singularToken);
    return need.length > 0 && titleTokens.some((tok) => need.every((x) => tok.has(x)));
  };
  const ot = after.filter(oneToken);
  const ub = before.filter((t) => oneToken(t) && t.state === 'usable');
  const ua = after.filter((t) => oneToken(t) && t.state === 'usable');
  out();
  out('## 2. The one-token blind spot');
  out();
  out(`Topics with fewer than two significant tokens after stripping (rule one can never exclude them): ${ot.length} of ${after.length} (${((ot.length / after.length) * 100).toFixed(1)}%).`);
  out(`Usable among them: ${ub.length} without the rule, ${ua.length} with it.`);
  out(`Usable one-token topics whose only token already appears in a published post's title or address: ${ub.filter(overlapped).length} without the rule, ${ua.filter(overlapped).length} with it. These remain uncovered: those posts carry no record.`);
  out();
  out('The 20 of those with the most impressions, for Patrick to tick if they are duplicates:');
  for (const t of ua.filter(overlapped).slice(0, 20)) out(`- "${t.query}" (${t.impressions} impressions)`);

  // 3. What a backfill could claim.
  const byKey = new Map(after.map((t) => [t.key, t]));
  const claim = (keyOf: (p: PostRow) => string) => {
    const rows: string[] = [];
    for (const p of published) {
      const k = keyOf(p);
      const t = k ? byKey.get(k) : undefined;
      if (t && t.state === 'usable') rows.push(`- "${t.query}" (${t.impressions} impressions) from "${p.title}" (/blog/${p.slug})`);
    }
    return rows;
  };
  const byTitle = claim((p) => (p.title ? tp.queryTopicKey(p.title) : ''));
  const bySlug = claim((p) => (p.slug ? tp.queryTopicKey(p.slug.replace(/-/g, ' ')) : ''));
  out();
  out('## 3. What a backfill of the existing posts could claim');
  out();
  out(`Usable topics whose key equals a published post's title key: ${byTitle.length}.`);
  for (const l of byTitle) out(l);
  out(`Usable topics whose key equals a published post's address key: ${bySlug.length}.`);
  for (const l of bySlug) out(l);

  // 4. Near synonyms.
  const usable = after.filter((t) => t.state === 'usable');
  const head = (t: Topic) => {
    const toks = tp.significantTokens(t.query).map(tp.singularToken);
    return toks[toks.length - 1] ?? '';
  };
  const byHead = new Map<string, number>();
  for (const t of usable) {
    const h = head(t);
    if (h) byHead.set(h, (byHead.get(h) ?? 0) + 1);
  }
  const clusters = [...byHead.entries()].sort((a, b) => b[1] - a[1]);
  const multi = clusters.filter(([, n]) => n >= 2);
  const containing = (w: string) => usable.filter((t) => tp.tokenize(t.query).map(tp.singularToken).includes(w)).length;
  out();
  out('## 4. Near synonyms among the usable topics');
  out();
  out(`${usable.length} usable topics; head noun (last significant word, plural folded): ${clusters.length} distinct, ${multi.length} with two or more topics, holding ${multi.reduce((n, [, c]) => n + c, 0)} topics.`);
  out(`Largest: ${clusters.slice(0, 15).map(([h, n]) => `${h} ${n}`).join(', ')}.`);
  out(`Usable topics containing the word: sunglasses ${containing('sunglass')}, pen ${containing('pen')}, bag ${containing('bag')}, balloon ${containing('balloon')}.`);

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${report.join('\n')}\n`, 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
