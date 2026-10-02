/**
 * Refresh the committed search-volume file the Blog Topics panel reads
 * (data/blog-automation/search-volumes.json). Ali's occasional job; Patrick
 * never runs it, and if it is never run nothing breaks: the panel says the
 * figures are old or absent and works as before.
 *
 * ONE command since AUTO-124 (it replaced AUTO-123's plan / look up in a
 * Claude Code session / merge loop, which is gone):
 *
 *   pnpm auto:volumes                      # DRY RUN: builds today's pool, says what would be looked up, in how many tasks, for how much. Spends nothing, writes nothing.
 *   pnpm auto:volumes --commit             # looks the terms up and writes the committed file (the ONLY flag that spends money or writes it)
 *   pnpm auto:volumes --include-excluded   # also the topics the tab excludes or Patrick blocked (default: usable topics only)
 *   pnpm auto:volumes --refresh-after 180  # also re-look-up figures older than N days, oldest first (default 180)
 *   pnpm auto:volumes --retry-failed       # also retry terms whose last lookup got no answer
 *   pnpm auto:volumes --max-cents 60       # the cap on what this machine may spend in one UTC day, in cents (default 60)
 *   pnpm auto:volumes status               # offline: how many terms have a figure, how old they are, what was spent today
 *   pnpm auto:volumes check                # free: balance, the task price, Google's data month, and that location 2840 is the United States
 *   pnpm auto:volumes compare              # DRY RUN: what a comparison of the committed figures against a fresh answer would send
 *   pnpm auto:volumes compare --pay        # one paid task; prints the differences; never writes the committed file
 *
 * WHERE THE FIGURES COME FROM. DataForSEO's Google Ads search-volume endpoint
 * (Google Ads Keyword Planner's figures, United States, English), Live queue:
 * up to 1,000 terms a task, 9 cents a task on Patrick's account. The
 * connection is scripts/blog-automation/dataforseo-client.ts and the
 * credentials are DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD in `.env.local` of
 * the repo this is run from. They are never printed and never go to Vercel:
 * the site reads the committed file and calls no keyword API.
 *
 * THE CAP. Before every paid call the worst case (one task's price, whether
 * 10 terms come back or 1,000) is RESERVED in a local ledger,
 * data/.local/search-volumes/spend.json (gitignored), and the call is refused
 * when the day's total would pass --max-cents. The ledger is written to disk
 * before the call, so a crash still counts; an answer that never arrives
 * leaves the reservation standing. A rejected task costs 0 and is settled at
 * 0. The cap is per UTC day across every run on this machine, so a loop that
 * starts the script again and again still cannot pass it.
 *
 * RESUMABLE. The committed file is the checkpoint and it is written after
 * EVERY task: a run that stops (the cap, a crash, a closed laptop) has lost
 * nothing, and the next run looks up only what is not in the file yet.
 *
 * PRIORITY (AUTO-123's, unchanged): usable topics before excluded before
 * blocked; the 90-day list before the topics the 16 months added; most
 * impressions first. Never-looked-up terms before refreshes; refreshes
 * oldest first. Figures stored from another source are replaced first.
 *
 * No Sanity write, no AI call. The GSC key and the DataForSEO credentials are
 * never printed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { Topic } from '../../lib/blog-automation/topic-pool';
import type { SearchVolumeFile } from '../../lib/blog-automation/search-volume';
import type { PlannedTerm, RefreshPlan, SpendLedger } from '../../lib/blog-automation/volume-refresh';

const PROJECT_ROOT = resolve(__dirname, '../..');
const SCRATCH_DIR = resolve(PROJECT_ROOT, 'data', '.local', 'search-volumes');
const LEDGER_PATH = resolve(SCRATCH_DIR, 'spend.json');
/** DataForSEO allows 12 Live search-volume calls a minute; one every 6 seconds stays under it. */
const PAUSE_BETWEEN_TASKS_MS = 6000;

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
const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const today = (): string => new Date().toISOString().slice(0, 10);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const lib = () =>
  Promise.all([
    import('../../lib/blog-automation/search-volume'),
    import('../../lib/blog-automation/volume-refresh'),
    import('../../lib/blog-automation/search-volume-file'),
    import('./dataforseo-client'),
  ]).then(([volume, refresh, volumeFile, client]) => ({ volume, refresh, volumeFile, client }));

type Lib = Awaited<ReturnType<typeof lib>>;

/** The committed file as the panel reads it (the same loader), or an empty one. */
function readCommitted(l: Lib): { file: SearchVolumeFile; existed: boolean; path: string } {
  const path = l.volumeFile.searchVolumeFilePath();
  const file = l.volumeFile.readSearchVolumeFile(path);
  return { file: file ?? l.volume.emptySearchVolumeFile(), existed: file !== null, path };
}

function readLedger(l: Lib): SpendLedger {
  if (!existsSync(LEDGER_PATH)) return l.refresh.emptyLedger();
  try {
    return l.refresh.parseLedger(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')));
  } catch {
    // An unreadable ledger must not unlock spending: refuse rather than start from zero.
    console.error(`The spend ledger at ${LEDGER_PATH} is not readable. Fix or delete it by hand (deleting it forgets what was spent today), then run again.`);
    process.exit(1);
  }
}

function writeLedger(ledger: SpendLedger): void {
  mkdirSync(SCRATCH_DIR, { recursive: true });
  writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
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

/** Today's pool with the written records and the blocks applied, as the panel shows it. */
async function buildPool(): Promise<Topic[]> {
  const [{ buildTopicPoolSnapshot, describePoolError }, tp] = await Promise.all([
    import('../../lib/blog-automation/build-topic-pool'),
    import('../../lib/blog-automation/topic-pool'),
  ]);
  console.log("Building today's pool from Search Console (one to two minutes)...");
  const started = Date.now();
  let topics: Topic[];
  try {
    topics = (await buildTopicPoolSnapshot()).topics;
  } catch (e) {
    const d = describePoolError(e);
    console.error(`\nFAILED: ${d.message}\n${d.hint}`);
    process.exit(1);
  }
  // Without these two reads a written or blocked topic would still count as
  // usable, so a default run would look it up: a few terms too many, never a
  // wrong figure.
  try {
    const { readWrittenTopicSources } = await import('../../lib/blog-automation/written-topics');
    topics = tp.applyWrittenTopics(topics, await readWrittenTopicSources());
  } catch (e) {
    console.warn(`(could not read the drafts, so already-written topics are judged by the guard alone: ${e instanceof Error ? e.message : String(e)})`);
  }
  try {
    topics = tp.applyNegativeKeywords(topics, await readBlocks());
  } catch (e) {
    console.warn(`(could not read the blocked topics, so blocked topics are judged as the guard left them: ${e instanceof Error ? e.message : String(e)})`);
  }
  const counts = { usable: 0, excluded: 0, blocked: 0 } as Record<Topic['state'], number>;
  for (const t of topics) counts[t.state] += 1;
  console.log(`Pool: ${fmt(topics.length)} topics (${fmt(counts.usable)} usable, ${fmt(counts.excluded)} excluded, ${fmt(counts.blocked)} blocked) in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  return topics;
}

/** The account's balance and the price to reserve; null (with the reason printed) when it cannot be read. */
async function readAccount(l: Lib): Promise<{ balanceUsd: number; priceCents: number; dailyLimitUsd: number | null } | null> {
  if (!l.client.hasCredentials()) {
    console.log('DataForSEO: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not in this repo\'s .env.local, so the balance cannot be read and --commit would refuse.');
    return null;
  }
  try {
    const account = await l.client.accountSnapshot();
    const listed = account.livePriceCents;
    const priceCents = Math.max(l.refresh.LIVE_TASK_PRICE_CENTS, listed ?? 0);
    console.log(
      `DataForSEO: balance $${account.balanceUsd.toFixed(2)}; one task costs ${listed === null ? `${priceCents} cents (the account's price list could not be read, so the known price is used)` : `${listed} cents on the account's own price list`}${
        listed !== null && listed > l.refresh.LIVE_TASK_PRICE_CENTS ? ` (MORE than the ${l.refresh.LIVE_TASK_PRICE_CENTS} cents measured on 2026-10-03)` : ''
      }${account.dailyLimitUsd !== null ? `; the account's own daily limit is $${account.dailyLimitUsd}` : ''}.`,
    );
    return { balanceUsd: account.balanceUsd, priceCents, dailyLimitUsd: account.dailyLimitUsd };
  } catch (e) {
    console.log(`DataForSEO: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function printBalance(l: Lib, label: string): Promise<number | null> {
  try {
    const { balanceUsd } = await l.client.accountSnapshot();
    console.log(`  ${label}: $${balanceUsd.toFixed(2)}`);
    return balanceUsd;
  } catch (e) {
    console.log(`  ${label}: could not be read (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
}

/**
 * ONE paid task under the cap: reserve, call, settle. Returns the outcome, or
 * null when the cap refused the call (nothing was sent). The ledger is on
 * disk before the call leaves.
 */
async function paidTask(l: Lib, terms: readonly string[], priceCents: number, capCents: number, note: string) {
  const day = today();
  const reserved = l.refresh.reserveCall(readLedger(l), day, { at: new Date().toISOString(), keywords: terms.length, priceCents, note }, capCents);
  if (reserved.ok === false) {
    console.log(`  NOT SENT: ${reserved.why}.`);
    return null;
  }
  writeLedger(reserved.ledger);
  let json: unknown;
  try {
    json = await l.client.searchVolumeLive(terms, l.volume.SEARCH_VOLUME_LOCATION_ID, l.volume.SEARCH_VOLUME_LANGUAGE);
  } catch (e) {
    // The answer never arrived, so the call may have been charged: the reservation stands.
    console.error(`  The call failed (${e instanceof Error ? e.message : String(e)}). Its ${priceCents} cents stay reserved against today's cap in case it was charged.`);
    return { ok: false as const, costCents: null, code: null, message: 'the call got no answer' };
  }
  const outcome = l.refresh.readLiveTask(json, terms, { locationCode: l.volume.SEARCH_VOLUME_LOCATION_ID, languageCode: l.volume.SEARCH_VOLUME_LANGUAGE });
  // A cost the answer does not state leaves the full reservation standing.
  writeLedger(l.refresh.settleCall(readLedger(l), day, reserved.index, outcome.costCents));
  return outcome;
}

function printPlan(l: Lib, plan: RefreshPlan, includeExcluded: boolean): PlannedTerm[][] {
  const c = plan.counts;
  const tasks = l.refresh.batchTerms(plan.queue);
  console.log();
  console.log(
    `Topics considered: ${fmt(c.eligibleTopics)} of ${fmt(c.topics)}${includeExcluded ? ' (every state)' : ` (usable only; ${fmt(c.leftOutByState)} excluded or blocked topics left out, add --include-excluded to look them up too)`}.`,
  );
  console.log(
    `  ${fmt(c.alreadyCurrent)} already have a current figure; ${fmt(c.neverLookedUp)} never looked up; ${fmt(c.stale)} older than the refresh age; ${fmt(c.otherSource)} stored from another source (replaced first); ${fmt(c.skippedFailed)} failed earlier and skipped${c.skippedFailed > 0 ? ' (add --retry-failed)' : ''}; ${fmt(c.unsendable)} cannot be sent in any wording.`,
  );
  for (const u of plan.unsendable.slice(0, 5)) console.log(`    cannot be sent: "${u.topic.length > 90 ? `${u.topic.slice(0, 90)}...` : u.topic}" (${u.why})`);
  if (plan.unsendable.length > 5) console.log(`    ... and ${fmt(plan.unsendable.length - 5)} more.`);
  console.log(`To look up: ${fmt(plan.queue.length)} terms in ${fmt(tasks.length)} task${tasks.length === 1 ? '' : 's'} of up to ${fmt(l.refresh.MAX_KEYWORDS_PER_TASK)}.`);
  if (plan.queue.length > 0) {
    console.log('First 10:');
    for (const p of plan.queue.slice(0, 10)) console.log(`  ${p.term}  [${p.why}${p.impressions || p.longImpressions ? `; ${fmt(p.impressions)} impr. 90d / ${fmt(p.longImpressions)} 16m` : ''}]`);
  }
  return tasks;
}

// ── refresh (the default command) ────────────────────────────────────────────────

async function refresh(): Promise<void> {
  const l = await lib();
  const commit = hasFlag('--commit') && !hasFlag('--dry-run');
  const includeExcluded = hasFlag('--include-excluded');
  const retryFailed = hasFlag('--retry-failed');
  const refreshAfter = Math.max(1, Number(flagValue('--refresh-after') ?? l.refresh.DEFAULT_REFRESH_AFTER_DAYS) || l.refresh.DEFAULT_REFRESH_AFTER_DAYS);
  const capCents = l.refresh.capFromArgument(flagValue('--max-cents'));
  console.log(`Mode: ${commit ? '--commit (terms WILL be looked up, money WILL be spent, the committed file WILL be written)' : 'DRY RUN (nothing is spent, nothing is written)'}.`);
  console.log(`Cap: ${capCents} cents a UTC day on this machine. Refresh after ${refreshAfter} days${retryFailed ? ', retrying failed lookups' : ''}${includeExcluded ? ', every topic state' : ', usable topics only'}.`);

  const committed = readCommitted(l);
  const summary = l.volume.summarizeSearchVolumeFile(committed.file);
  console.log(
    committed.existed
      ? `Committed file: ${fmt(summary.withFigure)} terms with a figure, ${fmt(summary.withoutFigure)} looked up with no figure, ${fmt(summary.failed)} failed; looked up ${summary.oldestLookup ?? '-'} to ${summary.newestLookup ?? '-'}. Source: ${committed.file.source}`
      : `Committed file: none yet (${committed.path}); every term is new.`,
  );

  const topics = await buildPool();
  const plan = l.refresh.planRefresh(topics, committed.file, l.volume.buildVolumeIndex(committed.file), {
    today: today(),
    refreshAfterDays: refreshAfter,
    retryFailed,
    includeExcluded,
    source: l.volume.SEARCH_VOLUME_SOURCE,
  });
  const tasks = printPlan(l, plan, includeExcluded);

  console.log();
  const account = await readAccount(l);
  const priceCents = account?.priceCents ?? l.refresh.LIVE_TASK_PRICE_CENTS;
  const ledger = readLedger(l);
  const spent = l.refresh.spentCents(ledger, today());
  const affordable = l.refresh.tasksAffordable(ledger, today(), priceCents, capCents);
  const worstCase = tasks.length * priceCents;
  console.log(
    `Cost: ${fmt(tasks.length)} task${tasks.length === 1 ? '' : 's'} x ${priceCents} cents = ${usd(worstCase)} at most. Spent or reserved today by this machine: ${spent} cents; the cap allows ${fmt(affordable)} more task${affordable === 1 ? '' : 's'} today.`,
  );
  if (tasks.length > affordable) console.log(`  The cap would stop this run after ${fmt(affordable)} task${affordable === 1 ? '' : 's'}; the rest is picked up by the next run (raise it with --max-cents ${spent + worstCase}).`);

  if (tasks.length === 0) {
    console.log('\nNothing to look up. Nothing was spent, nothing was written.');
    return;
  }
  if (!commit) {
    console.log('\nDry run complete. Nothing was spent, nothing was written. Add --commit to look the terms up and write the committed file.');
    return;
  }
  if (!account) {
    console.error('\n--commit needs the DataForSEO account to be readable (see the line above). Nothing was spent, nothing was written.');
    process.exit(1);
  }
  if (account.balanceUsd * 100 < priceCents) {
    console.error(`\nThe balance ($${account.balanceUsd.toFixed(2)}) is below one task's price. Nothing was spent, nothing was written.`);
    process.exit(1);
  }

  console.log();
  const writeCommitted = (file: SearchVolumeFile): void => {
    mkdirSync(dirname(committed.path), { recursive: true });
    writeFileSync(committed.path, l.volume.serializeSearchVolumeFile(file), 'utf8');
  };
  const run = await l.refresh.runRefreshTasks(
    tasks.map((task) => task.map((p) => p.term)),
    { file: committed.file, otherSourceLeft: plan.otherSourceTerms, fetchedOn: today(), source: l.volume.SEARCH_VOLUME_SOURCE, priceCents },
    {
      send: (terms, taskNumber) => paidTask(l, terms, priceCents, capCents, `refresh task ${taskNumber}/${tasks.length}`),
      write: writeCommitted,
      pause: () => sleep(PAUSE_BETWEEN_TASKS_MS),
      log: (line) => console.log(line),
      afterTask: async () => {
        await printBalance(l, 'Balance now');
      },
    },
  );
  const { file, stoppedWhy } = run;
  const totals = { tasks: run.tasksDone, added: run.added, updated: run.updated, unchanged: run.unchanged, failed: run.failed, noFigure: run.noFigure, costCents: run.costCents };

  const after = l.volume.summarizeSearchVolumeFile(file);
  console.log();
  if (stoppedWhy) console.log(`Stopped early: ${stoppedWhy}. Everything answered so far is in the file; run the same command again to continue.`);
  console.log(
    `Done: ${fmt(totals.tasks)} of ${fmt(tasks.length)} tasks, ${usd(totals.costCents)} by the API's own reported cost. Added ${fmt(totals.added)}, updated ${fmt(totals.updated)}, unchanged ${fmt(totals.unchanged)}, failed ${fmt(totals.failed)}; ${fmt(totals.noFigure)} answers had no figure from Google.`,
  );
  console.log(
    `File: ${fmt(after.withFigure)} terms with a figure, ${fmt(after.withoutFigure)} with none, ${fmt(after.failed)} failed; Google's figures run to ${after.dataFrom === after.dataThrough ? after.dataThrough ?? '-' : `${after.dataFrom} to ${after.dataThrough}`}. Source: ${file.source}`,
  );
  const balanceAfter = await printBalance(l, 'Balance after');
  if (balanceAfter !== null) console.log(`  Balance before was $${account.balanceUsd.toFixed(2)}: ${usd(Math.round((account.balanceUsd - balanceAfter) * 100))} left the account during this run.`);
  console.log(`\nWritten ${committed.path}. Review the diff and commit it like any data change.`);
  if (stoppedWhy && !run.stoppedByCap) process.exit(1);
}

// ── compare ──────────────────────────────────────────────────────────────────────

async function compare(): Promise<void> {
  const l = await lib();
  const pay = hasFlag('--pay') && !hasFlag('--dry-run');
  const capCents = l.refresh.capFromArgument(flagValue('--max-cents'));
  const committed = readCommitted(l);
  const also = (flagValue('--also') ?? '').split('|').map((t) => l.volume.normalizeVolumeTerm(t)).filter(Boolean);
  const stored = Object.keys(committed.file.terms).sort();
  const sendable = [...new Set([...stored, ...also])].filter((t) => !l.refresh.sendProblem(t));
  const terms = sendable.slice(0, l.refresh.MAX_KEYWORDS_PER_TASK);
  console.log(`Mode: compare ${pay ? '--pay (ONE task WILL be paid for; the committed file is NOT written)' : '(DRY RUN, nothing is spent)'}. Cap ${capCents} cents a UTC day.`);
  console.log(`Committed file: ${fmt(stored.length)} terms. Source: ${committed.file.source}`);
  console.log(`Would send ${fmt(terms.length)} terms in one task${sendable.length > terms.length ? ` (the first ${fmt(terms.length)} A to Z of ${fmt(sendable.length)})` : ''}${also.length ? `, ${fmt(also.length)} of them extra terms from --also` : ''}.`);
  const account = await readAccount(l);
  if (!pay || terms.length === 0) {
    console.log('\nDry run complete. Nothing was spent. Add --pay to send the one task.');
    return;
  }
  if (!account) {
    console.error('\n--pay needs the DataForSEO account to be readable. Nothing was spent.');
    process.exit(1);
  }
  const outcome = await paidTask(l, terms, account.priceCents, capCents, 'compare');
  if (!outcome) process.exit(1);
  if (outcome.ok === false) {
    console.error(`The task was rejected (${outcome.code ?? 'no code'}): ${outcome.message} Cost reported: ${outcome.costCents ?? 'unknown'} cents.`);
    await printBalance(l, 'Balance after');
    process.exit(1);
  }
  console.log(`\nAnswered ${fmt(outcome.answered)} of ${fmt(terms.length)}; cost ${outcome.costCents ?? 'unknown'} cents.`);
  const c = l.refresh.compareFigures(committed.file, outcome.results);
  console.log(`Of ${fmt(c.compared)} committed terms compared: ${fmt(c.same)} identical, ${fmt(c.different.length)} with a different number, ${fmt(c.zeroNowNoFigure.length)} stored as 0 that now have no figure, ${fmt(c.figureVersusNone.length)} other figure/no-figure changes, ${fmt(c.noAnswer.length)} with no entry.`);
  for (const d of c.different) console.log(`  ${d.term}: stored ${fmt(d.stored)} (looked up ${committed.file.terms[d.term].f}, series to ${committed.file.terms[d.term].m ?? '-'}), now ${fmt(d.fresh)}`);
  for (const t of c.zeroNowNoFigure) console.log(`  ${t}: stored 0, now no figure from Google`);
  for (const d of c.figureVersusNone) console.log(`  ${d.term}: stored ${d.stored ?? 'no figure'}, now ${d.fresh ?? 'no figure'}`);
  for (const t of also) {
    const r = outcome.results[t];
    if (r && !('error' in r && r.error !== undefined)) console.log(`  --also "${t}": ${(r as { search_volume?: unknown }).search_volume ?? 'no figure'}`);
  }
  const balanceAfter = await printBalance(l, 'Balance after');
  if (balanceAfter !== null) console.log(`  Balance before was $${account.balanceUsd.toFixed(2)}.`);
  console.log('\nThe committed file was not written.');
}

// ── check (free) ─────────────────────────────────────────────────────────────────

async function check(): Promise<void> {
  const l = await lib();
  console.log('Mode: check (free calls only; nothing is spent, nothing is written).');
  const account = await readAccount(l);
  if (!account) process.exit(1);
  const status = await l.client.googleAdsStatus();
  console.log(
    `Google Ads data: figures run to ${l.volume.monthWords(status.lastMonth) || 'an unknown month'}${status.dateUpdate ? `, last updated ${status.dateUpdate}` : ''}${status.actualData === false ? '; last month\'s figures are not published by Google yet' : ''}.`,
  );
  const language = await l.client.describeLanguage(l.volume.SEARCH_VOLUME_LANGUAGE);
  console.log(`Language "${l.volume.SEARCH_VOLUME_LANGUAGE}": ${language ?? 'NOT in the API\'s language list'}.`);
  console.log('Reading the API\'s location list for the United States (a large answer, up to a minute)...');
  const location = await l.client.describeLocation(l.volume.SEARCH_VOLUME_LOCATION_ID);
  console.log(
    location
      ? `Location ${l.volume.SEARCH_VOLUME_LOCATION_ID}: ${location.name} (${location.type}, ${location.countryIso}).`
      : `Location ${l.volume.SEARCH_VOLUME_LOCATION_ID}: NOT in the API's list of United States locations.`,
  );
  const ok = location?.name === 'United States' && location.type === 'Country' && language === 'English';
  console.log(ok ? 'OK: the figures are asked for the whole United States, in English.' : 'PROBLEM: the location or language is not what the file says it is. Do not run --commit until this is understood.');
  await printBalance(l, 'Balance after (unchanged: every call above is free)');
  if (!ok) process.exit(1);
}

// ── status (offline) ─────────────────────────────────────────────────────────────

async function status(): Promise<void> {
  const l = await lib();
  const committed = readCommitted(l);
  if (!committed.existed) {
    console.log(`No committed file at ${committed.path}. The panel shows every topic as "not looked up".`);
  } else {
    const s = l.volume.summarizeSearchVolumeFile(committed.file);
    console.log(`${committed.path}`);
    console.log(`  ${fmt(s.withFigure)} terms with a figure, ${fmt(s.withoutFigure)} looked up with no figure, ${fmt(s.failed)} failed lookups.`);
    console.log(`  Looked up ${s.oldestLookup ?? '-'} to ${s.newestLookup ?? '-'}; Google's own figures run to ${s.dataFrom === s.dataThrough ? s.dataThrough ?? '-' : `${s.dataFrom} to ${s.dataThrough}`}.`);
    console.log(`  Source: ${committed.file.source}`);
    if (committed.file.source !== l.volume.SEARCH_VOLUME_SOURCE) console.log('  That is not the source the script uses now: the next --commit run looks every stored term up again, first.');
  }
  const ledger = readLedger(l);
  const calls = ledger.days[today()]?.calls ?? [];
  console.log(`Spent or reserved today (UTC) by this machine: ${l.refresh.spentCents(ledger, today())} cents over ${calls.length} call${calls.length === 1 ? '' : 's'}. The default cap is ${l.refresh.DEFAULT_MAX_CENTS_PER_DAY} cents a day.`);
}

async function main(): Promise<void> {
  // The first argument that is neither a flag nor the value of a flag that takes one.
  const takesValue = new Set(['--max-cents', '--refresh-after', '--also']);
  const args = process.argv.slice(2);
  const command = args.find((a, i) => !a.startsWith('--') && !takesValue.has(args[i - 1] ?? '')) ?? 'refresh';
  if (command === 'refresh') await refresh();
  else if (command === 'compare') await compare();
  else if (command === 'check') await check();
  else if (command === 'status') await status();
  else if (command === 'plan' || command === 'merge') {
    console.error(`"${command}" was AUTO-123's loop (plan, a Claude Code session, merge) and no longer exists. Since AUTO-124 the refresh is one command: \`pnpm auto:volumes\` (dry run), then \`pnpm auto:volumes --commit\`.`);
    process.exit(1);
  } else {
    console.error(`Unknown command "${command}". Use no command (the refresh), status, check or compare.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
