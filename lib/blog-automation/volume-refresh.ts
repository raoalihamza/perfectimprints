/**
 * The search-volume REFRESH, pure half (AUTO-124). No fetch, no fs, no env:
 * which terms to look up and in what order, how they are batched into
 * DataForSEO tasks, what a task costs and whether the cap allows it, how a
 * task's answer is read, and how it is folded into the committed file. The
 * network half is scripts/blog-automation/dataforseo-client.ts and the
 * command is scripts/blog-automation/search-volumes.ts; both run on Ali's
 * machine. NOTHING on the site imports this module or the client: the site
 * reads the committed file (search-volume-file.ts) and that is all.
 *
 * What changed from AUTO-123, and what did not. AUTO-123 looked each term up
 * through the Ubersuggest MCP connector, which only an AI client can call, so
 * a refresh was three steps with a Claude Code session in the middle, 250
 * terms a day, 18 days for the pool. This is one command. The FILE, its
 * keying, the lookup rule, the panel column and the rule that a volume never
 * changes a topic's state are AUTO-123's and untouched; only the source of
 * the figures moved, to DataForSEO's Google Ads search-volume endpoint (the
 * same Google Ads Keyword Planner data, measured below).
 *
 * Measured on the real account, 2026-10-03 (three paid tasks, USD 0.27):
 *
 *   - Endpoint: POST v3/keywords_data/google_ads/search_volume/live, body
 *     [{ location_code, language_code, keywords: [...] }], up to 1,000
 *     keywords a task, USD 0.09 a task on this account's own price list
 *     whatever the number of keywords (63 keywords cost 0.09; so do 1,000).
 *     The answer came back in 2.3 s.
 *   - `cost` is reported at the top level AND per task. A REJECTED task costs
 *     0 (fifteen rejected tasks, balance unchanged).
 *   - Every keyword sent gets an entry back (63 of 63, 11 of 11). A term
 *     Google has nothing for comes back with `search_volume: null` and
 *     `monthly_searches: null`: an entry, not a 0 and not an absence. A sent
 *     term with no entry at all was never observed; if it happens it is
 *     recorded as a failed lookup, never as "no figure".
 *   - ONE keyword the API dislikes rejects the WHOLE task (40501), and the
 *     message names only the first offender. Rejected: , ? ( ) ! % ; @ * =
 *     and typographic characters (the trademark sign, en and em dashes, the
 *     non-breaking hyphen), more than 10 words, more than 80 characters.
 *     Accepted: letters (accented too), digits, space and ' - . / & : " [ ]
 *     $ + _ #. So every term is checked against that ALLOW list before it is
 *     sent (`sendProblem`); a term that fails is never put in a task.
 *   - Location 2840 is "United States" (Country, US) and language `en` is
 *     English, both read from the API's own free lists.
 *   - Against the 60 figures Ubersuggest returned on 2026-10-02: 40 identical,
 *     18 one or two steps apart on Google's ladder, and Ubersuggest's two 0s
 *     are `null` here (Google returned nothing; Ubersuggest printed 0). So
 *     the first refresh REPLACES the earlier figures (below) and the file is
 *     one source afterwards.
 */

import { lookupVolume, mergeLookupResults, normalizeVolumeTerm, type LookupResult, type MergeOutcome, type SearchVolumeFile, type VolumeIndex } from './search-volume';
import { compareTopics, queryTopicKey, topicKeys, topicQueries, type Topic } from './topic-pool';

/** The one endpoint the refresh pays for, relative to the API base the client holds. */
export const SEARCH_VOLUME_LIVE_PATH = 'keywords_data/google_ads/search_volume/live';
/** DataForSEO's limit on one task. */
export const MAX_KEYWORDS_PER_TASK = 1000;
/** Google Ads' limits on one keyword, as the API enforces them. */
export const MAX_KEYWORD_CHARS = 80;
export const MAX_KEYWORD_WORDS = 10;
/** What one Live task costs on this account's price list (2026-10-03), in cents. The script reserves the larger of this and the price the account reports. */
export const LIVE_TASK_PRICE_CENTS = 9;
/**
 * The default cap on what the script may spend in one UTC day, in cents. A
 * full pass over every topic is 5 tasks (45 cents); 60 leaves one spare call
 * and means no bug in the script can spend more than 60 cents a day.
 */
export const DEFAULT_MAX_CENTS_PER_DAY = 60;
/** Refresh a figure older than this many days (AUTO-123's default, unchanged). */
export const DEFAULT_REFRESH_AFTER_DAYS = 180;

// -- Which wording can be sent -------------------------------------------------------

/** Every character the API was seen to accept. Anything else is replaced by a space or the term is not sent. */
const ALLOWED_CHARS = /^[\p{L}\p{N} '\-./&:"[\]$+_#]+$/u;
const DISALLOWED_CHAR = /[^\p{L}\p{N} '\-./&:"[\]$+_#]/gu;

/** Why a term cannot be sent as it stands, or null when it can. */
export function sendProblem(term: string): string | null {
  if (!term) return 'blank';
  if (term.length > MAX_KEYWORD_CHARS) return `longer than ${MAX_KEYWORD_CHARS} characters`;
  if (term.split(' ').length > MAX_KEYWORD_WORDS) return `more than ${MAX_KEYWORD_WORDS} words`;
  if (!ALLOWED_CHARS.test(term)) {
    const bad = [...new Set(term.match(DISALLOWED_CHAR) ?? [])].join(' ');
    return `has characters Google Ads refuses (${bad})`;
  }
  return null;
}

/** The term with every refused character turned into a space ("melbourne, fl" as "melbourne fl"). */
export function stripRefusedCharacters(term: string): string {
  return normalizeVolumeTerm(term.replace(DISALLOWED_CHAR, ' '));
}

/** A topic as the planner reads it. */
export type RefreshTopic = Pick<Topic, 'key' | 'query' | 'variants' | 'state' | 'window' | 'impressions' | 'long'> & {
  spacingGroups?: Topic['spacingGroups'];
};

/**
 * The wording of a topic that is looked up. The topic's own search when the
 * API accepts it; otherwise the first of its merged spellings and member
 * searches that it accepts; otherwise its own search with the refused
 * characters stripped, but ONLY when that still keys to the same topic. Every
 * one of those is a wording `lookupVolume` finds for the topic, and the panel
 * names it under the figure when it is not the row's own search, so a figure
 * is never attributed to words it was not fetched for.
 */
export function wordingToSend(topic: RefreshTopic): { term: string | null; own: boolean; why: string } {
  const own = normalizeVolumeTerm(topic.query);
  const ownProblem = sendProblem(own);
  if (!ownProblem) return { term: own, own: true, why: '' };
  for (const q of [...topicQueries(topic).slice(1), ...topic.variants]) {
    const term = normalizeVolumeTerm(q);
    if (term && !sendProblem(term)) return { term, own: false, why: '' };
  }
  const stripped = stripRefusedCharacters(own);
  if (stripped && !sendProblem(stripped) && topicKeys(topic).includes(queryTopicKey(stripped))) return { term: stripped, own: false, why: '' };
  return { term: null, own: false, why: ownProblem };
}

// -- The plan ------------------------------------------------------------------------

export interface PlannedTerm {
  term: string;
  /** The row the term is for (its own search), for the printout. */
  topic: string;
  state: Topic['state'];
  window: Topic['window'];
  impressions: number;
  longImpressions: number;
  why: string;
}

export interface RefreshPlanOptions {
  /** Today, YYYY-MM-DD (UTC). */
  today: string;
  refreshAfterDays?: number;
  retryFailed?: boolean;
  /** Also look up excluded and blocked topics. Default false: usable topics only. */
  includeExcluded?: boolean;
  /** The source string the script writes; when the file carries another, every stored term is looked up again, first. */
  source: string;
}

export interface RefreshPlan {
  queue: PlannedTerm[];
  /** Terms stored under another source, all re-queued at the front (empty when the source is unchanged). */
  otherSourceTerms: string[];
  counts: {
    topics: number;
    eligibleTopics: number;
    leftOutByState: number;
    alreadyCurrent: number;
    neverLookedUp: number;
    stale: number;
    otherSource: number;
    skippedFailed: number;
    unsendable: number;
  };
  /** Topics with no wording the API accepts, with the reason; never sent, never stored. */
  unsendable: { topic: string; why: string }[];
}

function daysBetween(dayA: string, dayB: string): number {
  return Math.round((Date.parse(`${dayB}T00:00:00Z`) - Date.parse(`${dayA}T00:00:00Z`)) / 86_400_000);
}

const stateRank = (s: Topic['state']): number => (s === 'usable' ? 0 : s === 'excluded' ? 1 : 2);
const windowRank = (w: Topic['window']): number => (w === 'older' ? 1 : 0);

/** AUTO-123's priority order, unchanged: usable, then excluded, then blocked; the 90-day list before the 16-month additions; most impressions first. */
export function byRefreshPriority(a: RefreshTopic, b: RefreshTopic): number {
  return stateRank(a.state) - stateRank(b.state) || windowRank(a.window) - windowRank(b.window) || compareTopics(a, b);
}

/**
 * What a run would look up, in order. Terms stored under ANOTHER source come
 * first (so the file is one source after the first task), then terms never
 * looked up in priority order, then figures older than `refreshAfterDays`,
 * oldest first. A term already current is skipped; a failed term is skipped
 * until `retryFailed`; a topic with no sendable wording is listed and never
 * sent. Excluded and blocked topics are left out unless `includeExcluded`.
 */
export function planRefresh(topics: readonly RefreshTopic[], file: SearchVolumeFile, index: VolumeIndex, opts: RefreshPlanOptions): RefreshPlan {
  const refreshAfter = opts.refreshAfterDays ?? DEFAULT_REFRESH_AFTER_DAYS;
  const sourceChanged = Object.keys(file.terms).length > 0 && file.source !== opts.source;
  const retryFailed = Boolean(opts.retryFailed) || sourceChanged;
  const plan: RefreshPlan = {
    queue: [],
    otherSourceTerms: [],
    counts: { topics: topics.length, eligibleTopics: 0, leftOutByState: 0, alreadyCurrent: 0, neverLookedUp: 0, stale: 0, otherSource: 0, skippedFailed: 0, unsendable: 0 },
    unsendable: [],
  };
  const queued = new Set<string>();
  const blank = { state: 'usable' as Topic['state'], window: 'recent' as Topic['window'], impressions: 0, longImpressions: 0 };

  if (sourceChanged) {
    for (const term of Object.keys(file.terms).sort()) {
      if (sendProblem(term)) continue; // a stored term the API would refuse is left as it is
      queued.add(term);
      plan.otherSourceTerms.push(term);
      plan.queue.push({ term, topic: term, ...blank, why: 'stored from another source, looked up again' });
    }
    plan.counts.otherSource = plan.otherSourceTerms.length;
  }

  const fresh: PlannedTerm[] = [];
  const stale: (PlannedTerm & { age: number })[] = [];
  for (const t of [...topics].sort(byRefreshPriority)) {
    if (!opts.includeExcluded && t.state !== 'usable') {
      plan.counts.leftOutByState += 1;
      continue;
    }
    plan.counts.eligibleTopics += 1;
    const own = normalizeVolumeTerm(t.query);
    const base = { topic: own, state: t.state, window: t.window, impressions: t.impressions, longImpressions: t.long?.impressions ?? 0 };
    const found = lookupVolume(t, index);
    if (found) {
      if (queued.has(found.term)) continue; // being replaced by the other-source pass
      const age = daysBetween(found.fetchedAt, opts.today);
      if (age <= refreshAfter) {
        plan.counts.alreadyCurrent += 1;
        continue;
      }
      // Refresh the wording that holds the figure, so the same entry is replaced.
      if (sendProblem(found.term)) continue;
      queued.add(found.term);
      stale.push({ ...base, term: found.term, age, why: `looked up ${found.fetchedAt}, ${age} days ago` });
      continue;
    }
    const wording = wordingToSend(t);
    if (wording.term === null) {
      plan.counts.unsendable += 1;
      plan.unsendable.push({ topic: own, why: wording.why });
      continue;
    }
    if (queued.has(wording.term)) continue;
    const failed = file.failed[wording.term] ?? file.failed[own];
    if (failed && !retryFailed) {
      plan.counts.skippedFailed += 1;
      continue;
    }
    queued.add(wording.term);
    fresh.push({
      ...base,
      term: wording.term,
      why: failed ? `retrying: the lookup on ${failed.f} got no answer (${failed.why})` : wording.own ? 'never looked up' : `never looked up; sent as "${wording.term}" because the row's own wording cannot be sent`,
    });
  }
  stale.sort((a, b) => b.age - a.age);
  plan.counts.neverLookedUp = fresh.length;
  plan.counts.stale = stale.length;
  plan.queue.push(...fresh, ...stale.map(({ age: _age, ...rest }) => rest));
  return plan;
}

/** The queue cut into tasks of at most `size` terms. */
export function batchTerms<T>(queue: readonly T[], size: number = MAX_KEYWORDS_PER_TASK): T[][] {
  const n = Math.max(1, Math.min(MAX_KEYWORDS_PER_TASK, Math.floor(size) || MAX_KEYWORDS_PER_TASK));
  const out: T[][] = [];
  for (let i = 0; i < queue.length; i += n) out.push(queue.slice(i, i + n));
  return out;
}

// -- The cost cap ---------------------------------------------------------------------

/** One call the script made or is about to make, as the local ledger records it. */
export interface LedgerCall {
  at: string;
  keywords: number;
  /** The worst case reserved BEFORE the call. */
  reservedCents: number;
  /** What the API said the call cost, in cents; null until the answer arrives (and for ever if it never does). */
  costCents: number | null;
  note?: string;
}

export interface SpendLedger {
  days: Record<string, { calls: LedgerCall[] }>;
}

export function emptyLedger(): SpendLedger {
  return { days: {} };
}

/** A ledger read from disk; anything that is not one reads as empty calls for that day, never throws. */
export function parseLedger(raw: unknown): SpendLedger {
  const out = emptyLedger();
  const days = raw && typeof raw === 'object' ? (raw as { days?: unknown }).days : null;
  if (!days || typeof days !== 'object') return out;
  for (const [day, value] of Object.entries(days as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const calls = value && typeof value === 'object' ? (value as { calls?: unknown }).calls : null;
    if (!Array.isArray(calls)) continue;
    out.days[day] = {
      calls: calls
        .filter((c): c is LedgerCall => Boolean(c) && typeof c === 'object' && Number.isFinite((c as LedgerCall).reservedCents))
        .map((c) => ({
          at: String(c.at ?? ''),
          keywords: Number(c.keywords) || 0,
          reservedCents: Math.max(0, Math.ceil(c.reservedCents)),
          costCents: typeof c.costCents === 'number' && Number.isFinite(c.costCents) ? Math.max(0, Math.ceil(c.costCents)) : null,
          ...(typeof c.note === 'string' ? { note: c.note } : {}),
        })),
    };
  }
  return out;
}

/**
 * What the day has cost so far, in cents: the reported cost of every answered
 * call, and the full RESERVATION of every call whose answer never arrived (it
 * may have been charged; the cap assumes it was).
 */
export function spentCents(ledger: SpendLedger, day: string): number {
  return (ledger.days[day]?.calls ?? []).reduce((sum, c) => sum + (c.costCents ?? c.reservedCents), 0);
}

/** A USD figure from the API as whole cents, rounded UP (0.09 is 9, not 10: the float is tamed first). */
export function usdToCents(usd: unknown): number | null {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) return null;
  return Math.max(0, Math.ceil(Math.round(usd * 1e6) / 1e4 - 1e-9));
}

/** The cap as given on the command line: a whole number of cents from 0 up; anything else is the default. */
export function capFromArgument(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_MAX_CENTS_PER_DAY;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_MAX_CENTS_PER_DAY;
}

/**
 * Reserve the worst case for one call BEFORE it is made. Returns the ledger
 * with the reservation recorded, or a refusal that says why. The reservation
 * is the task price whether 10 keywords are sent or 1,000: the API charges
 * per task.
 */
export function reserveCall(
  ledger: SpendLedger,
  day: string,
  call: { at: string; keywords: number; priceCents: number; note?: string },
  capCents: number,
): { ok: true; ledger: SpendLedger; index: number } | { ok: false; why: string } {
  const price = Math.max(0, Math.ceil(call.priceCents));
  const spent = spentCents(ledger, day);
  if (spent + price > capCents) {
    return {
      ok: false,
      why: `the cap is ${capCents} cents a day and ${spent} ${spent === 1 ? 'cent is' : 'cents are'} already spent or reserved today; this call would reserve ${price} more`,
    };
  }
  const calls = [...(ledger.days[day]?.calls ?? []), { at: call.at, keywords: call.keywords, reservedCents: price, costCents: null, ...(call.note ? { note: call.note } : {}) }];
  return { ok: true, ledger: { days: { ...ledger.days, [day]: { calls } } }, index: calls.length - 1 };
}

/** Record what a reserved call actually cost. An unknown cost leaves the reservation standing. */
export function settleCall(ledger: SpendLedger, day: string, index: number, costCents: number | null): SpendLedger {
  const calls = [...(ledger.days[day]?.calls ?? [])];
  if (!calls[index] || costCents === null) return ledger;
  calls[index] = { ...calls[index], costCents };
  return { days: { ...ledger.days, [day]: { calls } } };
}

/** How many tasks the cap still allows today at this price. */
export function tasksAffordable(ledger: SpendLedger, day: string, priceCents: number, capCents: number): number {
  const price = Math.max(1, Math.ceil(priceCents));
  return Math.max(0, Math.floor((capCents - spentCents(ledger, day)) / price));
}

// -- Reading a task's answer ---------------------------------------------------------

export type LiveTaskOutcome =
  | { ok: true; costCents: number | null; results: Record<string, LookupResult>; answered: number; noFigure: number; missing: string[] }
  | { ok: false; costCents: number | null; code: number | null; message: string };

/**
 * One Live task's JSON, read into the shape `mergeLookupResults` takes. A
 * keyword Google has nothing for is `search_volume: null` (stored as "no
 * figure"); a keyword SENT with no entry in the answer is an error for that
 * term ("no entry"), never a null and never a 0. The location and language
 * the answer echoes must be the ones asked for, or the whole task is refused.
 */
export function readLiveTask(json: unknown, sent: readonly string[], expect: { locationCode: number; languageCode: string }): LiveTaskOutcome {
  const top = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const topCost = usdToCents(top.cost);
  const task = Array.isArray(top.tasks) && top.tasks[0] && typeof top.tasks[0] === 'object' ? (top.tasks[0] as Record<string, unknown>) : null;
  const costCents = topCost ?? (task ? usdToCents(task.cost) : null);
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (top.status_code !== 20000) return { ok: false, costCents, code: typeof top.status_code === 'number' ? top.status_code : null, message: str(top.status_message) || 'no status in the answer' };
  if (!task) return { ok: false, costCents, code: null, message: 'the answer carries no task' };
  if (task.status_code !== 20000) return { ok: false, costCents, code: typeof task.status_code === 'number' ? task.status_code : null, message: str(task.status_message) || 'the task failed with no message' };
  const items = Array.isArray(task.result) ? task.result : [];
  const byTerm = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (o.location_code !== expect.locationCode || o.language_code !== expect.languageCode) {
      return { ok: false, costCents, code: null, message: `the answer is for location ${JSON.stringify(o.location_code)} / language ${JSON.stringify(o.language_code)}, not ${expect.locationCode} / ${expect.languageCode}` };
    }
    const term = normalizeVolumeTerm(o.keyword);
    if (term && !byTerm.has(term)) byTerm.set(term, o);
  }
  const results: Record<string, LookupResult> = {};
  const missing: string[] = [];
  let answered = 0;
  let noFigure = 0;
  for (const raw of sent) {
    const term = normalizeVolumeTerm(raw);
    const o = byTerm.get(term);
    if (!o) {
      missing.push(term);
      results[term] = { error: 'DataForSEO returned no entry for this term' };
      continue;
    }
    answered += 1;
    if (o.search_volume === null || o.search_volume === undefined) noFigure += 1;
    results[term] = { search_volume: o.search_volume, monthly_searches: monthlyPeriods(o.monthly_searches) };
  }
  return { ok: true, costCents, results, answered, noFigure, missing };
}

/** DataForSEO's [{year, month, search_volume}] as the [{period: 'YYYYMM'}] series the merge reads the latest month from. */
function monthlyPeriods(series: unknown): { period: string }[] {
  if (!Array.isArray(series)) return [];
  const out: { period: string }[] = [];
  for (const entry of series) {
    const o = entry && typeof entry === 'object' ? (entry as { year?: unknown; month?: unknown }) : {};
    if (typeof o.year === 'number' && typeof o.month === 'number' && Number.isInteger(o.year) && o.month >= 1 && o.month <= 12) {
      out.push({ period: `${o.year}${String(o.month).padStart(2, '0')}` });
    }
  }
  return out;
}

// -- Folding a task into the file ----------------------------------------------------

export interface TaskMergeOutcome extends MergeOutcome {
  /** Other-source terms still waiting to be replaced after this task. */
  otherSourceLeft: string[];
  /** Other-source figures dropped because the new source gave no entry for the term. */
  dropped: string[];
}

/**
 * `mergeLookupResults` (AUTO-123's merge, unchanged) plus the one thing a
 * change of source needs. A term stored under the OTHER source that was sent
 * and got no entry loses its old figure and is recorded as failed: within one
 * source a figure is never lost to a failed retry, but a figure from a source
 * the file no longer names must not sit beside the new ones unlabelled. When
 * no other-source term is left, the file's `source` becomes the new one.
 */
export function mergeTaskResults(
  file: SearchVolumeFile,
  results: Record<string, LookupResult>,
  fetchedOn: string,
  change: { source: string; otherSourceLeft: readonly string[] },
): TaskMergeOutcome {
  const merged = mergeLookupResults(file, results, fetchedOn);
  const dropped: string[] = [];
  const left: string[] = [];
  for (const term of change.otherSourceLeft) {
    const result = results[term];
    if (!result) {
      left.push(term);
      continue;
    }
    if ('error' in result && result.error !== undefined && term in merged.file.terms) {
      delete merged.file.terms[term];
      merged.file.failed[term] = { f: fetchedOn, why: `${String(result.error).slice(0, 150)}; the earlier figure came from another source and was dropped` };
      merged.unchanged = merged.unchanged.filter((t) => t !== term);
      merged.failed.push(term);
      dropped.push(term);
    }
  }
  if (left.length === 0) merged.file.source = change.source;
  return { ...merged, otherSourceLeft: left, dropped };
}

// -- The run: task after task, the file written after each ---------------------------

/** How many times one task may be re-sent after the API names a term it refuses (each rejection costs 0). */
export const MAX_REJECTIONS_PER_TASK = 10;

/** What the run does to the outside world, injected so the loop is tested without a network, a ledger or a disk. */
export interface RunTasksEffects {
  /** ONE paid task under the cap. null when the cap refused it (nothing was sent). */
  send: (terms: readonly string[], taskNumber: number) => Promise<LiveTaskOutcome | null>;
  /** Write the committed file. Called after every task that changed it. */
  write: (file: SearchVolumeFile) => void;
  /** Wait between calls (the API allows 12 a minute). */
  pause: () => Promise<void>;
  log: (line: string) => void;
  /** After a task is answered and written (the script prints the balance here). */
  afterTask?: () => Promise<void>;
}

export interface RunTasksResult {
  file: SearchVolumeFile;
  tasksDone: number;
  added: number;
  updated: number;
  unchanged: number;
  failed: number;
  noFigure: number;
  /** The API's own reported cost, summed; a task whose cost the answer did not state counts at the reserved price. */
  costCents: number;
  /** null when every task was answered. */
  stoppedWhy: string | null;
  stoppedByCap: boolean;
}

/**
 * Send the tasks in order and fold each answer into the file, WRITING THE
 * FILE AFTER EVERY TASK, so a run that stops for any reason has lost nothing.
 * It stops at the first task the cap refuses or that fails outright. One
 * recovery is automatic: the API rejects a whole task for a single keyword it
 * dislikes and names it (cost 0), so that term is recorded as failed, the
 * task is sent again without it, and the refusal is written even if the task
 * then fails, so the next run does not send the term again.
 */
export async function runRefreshTasks(
  tasks: readonly (readonly string[])[],
  start: { file: SearchVolumeFile; otherSourceLeft: readonly string[]; fetchedOn: string; source: string; priceCents: number },
  effects: RunTasksEffects,
): Promise<RunTasksResult> {
  let file = start.file;
  let otherSourceLeft = start.otherSourceLeft;
  const out: RunTasksResult = { file, tasksDone: 0, added: 0, updated: 0, unchanged: 0, failed: 0, noFigure: 0, costCents: 0, stoppedWhy: null, stoppedByCap: false };
  const n = (x: number) => x.toLocaleString('en-US');

  for (let i = 0; i < tasks.length; i += 1) {
    let terms = [...tasks[i]];
    const refused: Record<string, LookupResult> = {};
    effects.log(`Task ${i + 1} of ${tasks.length}: ${n(terms.length)} terms, reserving ${start.priceCents} cents.`);
    if (i > 0) await effects.pause();

    let outcome: LiveTaskOutcome | null = null;
    for (let attempt = 0; attempt <= MAX_REJECTIONS_PER_TASK; attempt += 1) {
      outcome = await effects.send(terms, i + 1);
      if (!outcome || outcome.ok === true) break;
      const rejection = outcome;
      out.costCents += rejection.costCents ?? 0;
      effects.log(`  Rejected (${rejection.code ?? 'no code'}): ${rejection.message} Cost reported: ${rejection.costCents ?? 'unknown'} cents.`);
      const offender = rejection.code === 40501 ? terms.find((t) => rejection.message.includes(`'${t}'`)) : undefined;
      if (!offender || attempt === MAX_REJECTIONS_PER_TASK) break;
      refused[offender] = { error: `DataForSEO refused the term: ${rejection.message}`.slice(0, 190) };
      terms = terms.filter((t) => t !== offender);
      if (terms.length === 0) break;
      await effects.pause();
    }

    if (Object.keys(refused).length > 0) {
      const merged = mergeTaskResults(file, refused, start.fetchedOn, { source: start.source, otherSourceLeft });
      file = merged.file;
      otherSourceLeft = merged.otherSourceLeft;
      out.failed += merged.failed.length;
      effects.write(file);
    }
    if (!outcome) {
      out.stoppedWhy = 'the cap';
      out.stoppedByCap = true;
      break;
    }
    if (outcome.ok === false) {
      out.stoppedWhy = `task ${i + 1} failed (${outcome.message})`;
      break;
    }

    const merged = mergeTaskResults(file, outcome.results, start.fetchedOn, { source: start.source, otherSourceLeft });
    file = merged.file;
    otherSourceLeft = merged.otherSourceLeft;
    effects.write(file);
    out.tasksDone += 1;
    out.added += merged.added.length;
    out.updated += merged.updated.length;
    out.unchanged += merged.unchanged.length;
    out.failed += merged.failed.length;
    out.noFigure += outcome.noFigure;
    out.costCents += outcome.costCents ?? start.priceCents;
    effects.log(
      `  Answered ${n(outcome.answered)} of ${n(terms.length)} (${n(outcome.noFigure)} with no figure from Google, ${n(outcome.missing.length)} with no entry); cost ${outcome.costCents ?? `unknown, ${start.priceCents} reserved`} cents. Added ${n(merged.added.length)}, updated ${n(merged.updated.length)}, unchanged ${n(merged.unchanged.length)}, failed ${n(merged.failed.length)}, rejected ${n(merged.rejected.length)}. File written.`,
    );
    for (const r of merged.rejected.slice(0, 10)) effects.log(`    REJECTED "${r.term}": ${r.why}`);
    if (effects.afterTask) await effects.afterTask();
  }
  out.file = file;
  return out;
}

// -- Comparing the committed figures against a fresh answer ---------------------------

export interface FigureComparison {
  compared: number;
  same: number;
  /** A number on both sides, different. */
  different: { term: string; stored: number; fresh: number }[];
  /** Stored 0, fresh null: the source printed 0 where Google returned nothing. */
  zeroNowNoFigure: string[];
  /** Any other change between a number and no figure. */
  figureVersusNone: { term: string; stored: number | null; fresh: number | null }[];
  noAnswer: string[];
}

/** The committed figures against a fresh task's, term by term. Writes nothing. */
export function compareFigures(file: SearchVolumeFile, results: Record<string, LookupResult>): FigureComparison {
  const out: FigureComparison = { compared: 0, same: 0, different: [], zeroNowNoFigure: [], figureVersusNone: [], noAnswer: [] };
  for (const term of Object.keys(file.terms).sort()) {
    const result = results[term];
    if (!result) continue;
    if ('error' in result && result.error !== undefined) {
      out.noAnswer.push(term);
      continue;
    }
    const raw = (result as { search_volume?: unknown }).search_volume;
    const fresh = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : null;
    const stored = file.terms[term].v;
    out.compared += 1;
    if (stored === fresh) out.same += 1;
    else if (stored === 0 && fresh === null) out.zeroNowNoFigure.push(term);
    else if (stored === null || fresh === null) out.figureVersusNone.push({ term, stored, fresh });
    else out.different.push({ term, stored, fresh });
  }
  return out;
}
