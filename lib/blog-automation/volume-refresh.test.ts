/**
 * AUTO-124: the search-volume refresh as one command. Which wording is sent,
 * the plan and its priority, the batching, the cost cap (reserved BEFORE a
 * call, worst case), reading a real task's answer (a term Google has nothing
 * for is null, never 0; a term with no entry is a failure, never null), the
 * change of source, and the structural guarantees: the credentials are read
 * in one script-side file and nowhere on the site, and AUTO-123's file, its
 * lookup and the panel column are untouched.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SEARCH_VOLUME_LOCATION_ID,
  SEARCH_VOLUME_SOURCE,
  buildVolumeIndex,
  emptySearchVolumeFile,
  lookupVolume,
  parseSearchVolumeFile,
  serializeSearchVolumeFile,
  type SearchVolumeFile,
} from './search-volume';
import { applyGuard, groupIntoTopics, type Topic } from './topic-pool';
import {
  DEFAULT_MAX_CENTS_PER_DAY,
  LIVE_TASK_PRICE_CENTS,
  MAX_KEYWORDS_PER_TASK,
  MAX_REJECTIONS_PER_TASK,
  runRefreshTasks,
  type LiveTaskOutcome,
  SEARCH_VOLUME_LIVE_PATH,
  batchTerms,
  capFromArgument,
  compareFigures,
  emptyLedger,
  mergeTaskResults,
  parseLedger,
  planRefresh,
  readLiveTask,
  reserveCall,
  sendProblem,
  settleCall,
  spentCents,
  stripRefusedCharacters,
  tasksAffordable,
  usdToCents,
  wordingToSend,
} from './volume-refresh';

const ROOT = join(__dirname, '..', '..');
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const OLD_SOURCE = 'Google Ads Keyword Planner, via Ubersuggest keyword_overview (United States, English)';

function file(terms: SearchVolumeFile['terms'], failed: SearchVolumeFile['failed'] = {}, source = SEARCH_VOLUME_SOURCE): SearchVolumeFile {
  return { ...emptySearchVolumeFile(), source, terms, failed };
}

function pool(): Topic[] {
  const topics = groupIntoTopics([
    { query: 'custom matchbooks', clicks: 3, impressions: 761, position: 12.4, page: '/cat/matchbooks' },
    { query: 'custom match books', clicks: 0, impressions: 40, position: 15, page: '/cat/matchbooks' },
    { query: 'promotional footballs', clicks: 9, impressions: 1682, position: 9.1, page: '/cat/footballs' },
    { query: 'custom promotional products in melbourne, fl', clicks: 0, impressions: 26, position: 20, page: '/cat/products' },
    { query: 'what are typical setup and artwork fees for imprinting logos on pens?', clicks: 0, impressions: 22, position: 22, page: '/cat/pens' },
    { query: 'thunder sticks', clicks: 0, impressions: 120, position: 30, page: '/blog/thundersticks' },
    { query: 'custom koozies', clicks: 0, impressions: 300, position: 18, page: '/cat/koozies' },
  ]).map((c) => applyGuard(c, null));
  return topics;
}

const plan = (topics: Topic[], f: SearchVolumeFile, opts: Partial<Parameters<typeof planRefresh>[3]> = {}) =>
  planRefresh(topics, f, buildVolumeIndex(f), { today: '2026-10-03', source: SEARCH_VOLUME_SOURCE, ...opts });

/** One item as the API returned it on 2026-10-03. */
const item = (keyword: string, search_volume: number | null, lastMonth: [number, number] | null = [2026, 8]) => ({
  keyword,
  spell: null,
  location_code: 2840,
  language_code: 'en',
  search_partners: false,
  competition: search_volume === null ? null : 'HIGH',
  competition_index: search_volume === null ? null : 78,
  search_volume,
  low_top_of_page_bid: null,
  high_top_of_page_bid: null,
  cpc: null,
  monthly_searches: lastMonth === null ? null : [{ year: lastMonth[0], month: lastMonth[1], search_volume }, { year: lastMonth[0], month: lastMonth[1] - 1, search_volume }],
});

const answer = (items: unknown[], cost = 0.09) => ({
  version: '0.1.20260917',
  status_code: 20000,
  status_message: 'Ok.',
  cost,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [{ id: 'x', status_code: 20000, status_message: 'Ok.', cost, result_count: items.length, result: items }],
});

const EXPECT = { locationCode: SEARCH_VOLUME_LOCATION_ID, languageCode: 'en' };

describe('which wording can be sent (measured on the API, 2026-10-03)', () => {
  it('accepts what the API accepted and refuses what it refused, with the reason', () => {
    for (const ok of ['custom pens', "men's custom polo shirts", 'custom t-shirts', 'site:perfectimprints.com', 'hot/cold packs', 'promotional bbq kits & gifts', 'décor gifts', '"stress ball" authors', '[high volume ems usa]', 'employee appreciation gifts under $5', 'paramedic+census', '3.5 inch buttons', 'pens_pencils', 'pens #1']) {
      expect(sendProblem(ok), ok).toBeNull();
    }
    for (const bad of ['stress balls in mosier, or', 'custom lapel pins?', 'lanyard (36 length)', 'neptune\u2122 cleaning cloths', 'made\u2011to\u2011order socks', 'a winter event \u2013 any', 'tool!sports', '83% of people', 'bags \u2014 bulk', 'pens; pencils', 'pens @ work', 'pens * pencils', 'pens = gifts']) {
      expect(sendProblem(bad), bad).toMatch(/characters Google Ads refuses/);
    }
    expect(sendProblem('one two three four five six seven eight nine ten eleven')).toMatch(/more than 10 words/);
    expect(sendProblem('one two three four five six seven eight nine ten')).toBeNull();
    expect(sendProblem('x'.repeat(81))).toMatch(/longer than 80 characters/);
    expect(sendProblem('x'.repeat(80))).toBeNull();
    expect(sendProblem('')).toBe('blank');
  });

  it('sends the row\'s own wording when it can, else a member wording, else the stripped wording ONLY when it keys to the same topic, else nothing', () => {
    const topics = pool();
    const by = (q: string) => topics.find((t) => t.query === q)!;
    expect(wordingToSend(by('promotional footballs'))).toMatchObject({ term: 'promotional footballs', own: true });
    // A comma is refused; the stripped wording is the same topic, so it is sent, and the lookup finds it for the row.
    const melbourne = by('custom promotional products in melbourne, fl');
    expect(stripRefusedCharacters(melbourne.query)).toBe('custom promotional products in melbourne fl');
    expect(wordingToSend(melbourne)).toMatchObject({ term: 'custom promotional products in melbourne fl', own: false });
    const stored = buildVolumeIndex(file({ 'custom promotional products in melbourne fl': { v: 10, f: '2026-10-03', m: '2026-08' } }));
    expect(lookupVolume(melbourne, stored)).toMatchObject({ volume: 10, term: 'custom promotional products in melbourne fl', exact: false });
    // Twelve words stay twelve words: nothing to send, and the reason is the row's own.
    expect(wordingToSend(by('what are typical setup and artwork fees for imprinting logos on pens?'))).toMatchObject({ term: null, why: 'more than 10 words' });
    // A member wording is used before the stripped one.
    const member = { ...by('custom koozies'), query: 'custom koozies (bulk)', variants: ['custom koozies (bulk)', 'koozies custom'] };
    expect(wordingToSend(member)).toMatchObject({ term: 'koozies custom', own: false });
  });
});

describe('the plan: priority, eligibility, resumability', () => {
  it('by default only usable topics, in AUTO-123\'s order; the excluded ones only with the flag', () => {
    const topics = pool();
    const usableOnly = plan(topics, emptySearchVolumeFile());
    expect(usableOnly.queue.map((p) => p.term)).toEqual(['promotional footballs', 'custom matchbooks', 'custom koozies', 'custom promotional products in melbourne fl']);
    expect(usableOnly.counts).toMatchObject({ topics: 6, eligibleTopics: 5, leftOutByState: 1, neverLookedUp: 4, unsendable: 1 });
    expect(usableOnly.unsendable).toEqual([{ topic: 'what are typical setup and artwork fees for imprinting logos on pens?', why: 'more than 10 words' }]);
    const all = plan(topics, emptySearchVolumeFile(), { includeExcluded: true });
    // The excluded topic comes after every usable one, whatever its impressions.
    expect(all.queue.map((p) => p.term)).toEqual(['promotional footballs', 'custom matchbooks', 'custom koozies', 'custom promotional products in melbourne fl', 'thunder sticks']);
    expect(all.counts.leftOutByState).toBe(0);
  });

  it('a term already in the file is not looked up again (the file is the checkpoint), through any wording the lookup finds', () => {
    const topics = pool();
    const done = file({
      'promotional footballs': { v: 90, f: '2026-10-03', m: '2026-08' },
      'custom match books': { v: 320, f: '2026-10-03', m: '2026-08' }, // the merged spelling covers the row
      'custom koozies': { v: null, f: '2026-10-03', m: null }, // looked up, no figure: still looked up
    });
    const next = plan(topics, done);
    expect(next.queue.map((p) => p.term)).toEqual(['custom promotional products in melbourne fl']);
    expect(next.counts.alreadyCurrent).toBe(3);
  });

  it('figures older than the refresh age are re-queued after the new terms, oldest first, under the wording that holds the figure', () => {
    const topics = pool();
    const aged = file({
      'promotional footballs': { v: 90, f: '2026-01-01', m: '2025-11' },
      'custom match books': { v: 320, f: '2025-12-01', m: '2025-10' },
      'custom koozies': { v: 10, f: '2026-09-01', m: '2026-07' },
    });
    const next = plan(topics, aged);
    expect(next.queue.map((p) => p.term)).toEqual(['custom promotional products in melbourne fl', 'custom match books', 'promotional footballs']);
    expect(next.counts).toMatchObject({ neverLookedUp: 1, stale: 2, alreadyCurrent: 1 });
    expect(plan(topics, aged, { refreshAfterDays: 10 }).counts.stale).toBe(3);
  });

  it('a failed lookup is skipped until --retry-failed', () => {
    const topics = pool();
    const f = file({}, { 'custom koozies': { f: '2026-10-01', why: 'no entry' } });
    expect(plan(topics, f).queue.map((p) => p.term)).not.toContain('custom koozies');
    expect(plan(topics, f).counts.skippedFailed).toBe(1);
    const retried = plan(topics, f, { retryFailed: true });
    expect(retried.queue.find((p) => p.term === 'custom koozies')?.why).toMatch(/retrying/);
  });

  it('a file written from another source has every stored term looked up again, FIRST, and its failures retried', () => {
    const topics = pool();
    const old = file({ 'custom koozies': { v: 49500, f: '2026-10-02', m: '2025-10' }, 'engraved pens': { v: 3600, f: '2026-10-02', m: '2026-08' } }, { 'promotional footballs': { f: '2026-10-02', why: 'refused' } }, OLD_SOURCE);
    const next = plan(topics, old);
    expect(next.otherSourceTerms).toEqual(['custom koozies', 'engraved pens']);
    expect(next.queue.slice(0, 2).map((p) => p.term)).toEqual(['custom koozies', 'engraved pens']);
    expect(next.queue.map((p) => p.term)).toContain('promotional footballs');
    expect(next.queue.filter((p) => p.term === 'custom koozies')).toHaveLength(1);
    // Same source: nothing is re-queued for that reason.
    expect(plan(topics, { ...old, source: SEARCH_VOLUME_SOURCE }).otherSourceTerms).toEqual([]);
  });

  it('batches into tasks of at most 1,000', () => {
    const terms = Array.from({ length: 2227 }, (_, i) => `t${i}`);
    const tasks = batchTerms(terms);
    expect(tasks.map((t) => t.length)).toEqual([1000, 1000, 227]);
    expect(tasks.flat()).toEqual(terms);
    expect(batchTerms([])).toEqual([]);
    expect(batchTerms(terms, 5000).map((t) => t.length)).toEqual([1000, 1000, 227]); // never above the API's limit
    expect(MAX_KEYWORDS_PER_TASK).toBe(1000);
  });
});

describe('the cost cap: reserved before the call, worst case, per day', () => {
  const DAY = '2026-10-03';
  const call = (n = 1) => ({ at: `${DAY}T10:0${n}:00.000Z`, keywords: 10, priceCents: LIVE_TASK_PRICE_CENTS });

  it('reserves the full task price for 10 keywords as for 1,000, and refuses the call that would pass the cap', () => {
    let ledger = emptyLedger();
    const sent: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const r = reserveCall(ledger, DAY, call(), DEFAULT_MAX_CENTS_PER_DAY);
      if (r.ok === false) {
        expect(r.why).toMatch(/cap is 60 cents a day and 54 cents are already spent or reserved today; this call would reserve 9 more/);
        break;
      }
      ledger = r.ledger;
      sent.push(r.index);
    }
    // 6 x 9 = 54; a seventh would be 63.
    expect(sent).toEqual([0, 1, 2, 3, 4, 5]);
    expect(spentCents(ledger, DAY)).toBe(54);
    expect(tasksAffordable(ledger, DAY, 9, 60)).toBe(0);
    expect(tasksAffordable(emptyLedger(), DAY, 9, 60)).toBe(6);
  });

  it('a reservation counts in full until the answer says what the call cost; a rejected task settles at 0; a lost answer stays reserved', () => {
    const a = reserveCall(emptyLedger(), DAY, call(1), 60);
    if (a.ok === false) throw new Error('unexpected');
    expect(spentCents(a.ledger, DAY)).toBe(9);
    expect(a.ledger.days[DAY].calls[0]).toMatchObject({ reservedCents: 9, costCents: null });
    const rejected = settleCall(a.ledger, DAY, a.index, 0);
    expect(spentCents(rejected, DAY)).toBe(0);
    const paid = settleCall(a.ledger, DAY, a.index, 9);
    expect(spentCents(paid, DAY)).toBe(9);
    const lost = settleCall(a.ledger, DAY, a.index, null);
    expect(spentCents(lost, DAY)).toBe(9);
    // Another day starts from zero; the cap is per day.
    expect(spentCents(paid, '2026-10-04')).toBe(0);
  });

  it('a cap of 0 sends nothing; a dearer price list is reserved in full; a ledger read from disk survives junk', () => {
    expect(reserveCall(emptyLedger(), DAY, call(), 0).ok).toBe(false);
    const dear = reserveCall(emptyLedger(), DAY, { ...call(), priceCents: 12.5 }, 60);
    if (dear.ok === false) throw new Error('unexpected');
    expect(spentCents(dear.ledger, DAY)).toBe(13);
    expect(capFromArgument(undefined)).toBe(60);
    expect(capFromArgument('27')).toBe(27);
    expect(capFromArgument('0')).toBe(0);
    for (const junk of ['lots', '-5', '9.5', '']) expect(capFromArgument(junk)).toBe(60);
    expect(parseLedger(null)).toEqual(emptyLedger());
    expect(parseLedger({ days: { nonsense: {}, [DAY]: { calls: [{ at: 'x', keywords: 62, reservedCents: 9, costCents: 9, note: 'compare' }, { reservedCents: 'no' }, null] } } })).toEqual({
      days: { [DAY]: { calls: [{ at: 'x', keywords: 62, reservedCents: 9, costCents: 9, note: 'compare' }] } },
    });
  });

  it('reads the API\'s USD cost as whole cents without the float turning 9 into 10', () => {
    expect(usdToCents(0.09)).toBe(9);
    expect(usdToCents(0.06)).toBe(6);
    expect(usdToCents(0)).toBe(0);
    expect(usdToCents(0.091)).toBe(10);
    expect(usdToCents(0.45)).toBe(45);
    for (const junk of [undefined, null, '0.09', NaN, -1]) expect(usdToCents(junk)).toBeNull();
  });
});

describe('reading a real task', () => {
  it('a figure is a figure, Google having nothing is null (never 0), and the series month is the latest one', () => {
    const sent = ['branded clipboards', 'zxqv plorfth wibbleknack', 'custom pens'];
    const out = readLiveTask(answer([item('branded clipboards', 170), item('zxqv plorfth wibbleknack', null, null), item('custom pens', 12100)]), sent, EXPECT);
    if (out.ok === false) throw new Error(out.message);
    expect(out).toMatchObject({ costCents: 9, answered: 3, noFigure: 1, missing: [] });
    const merged = mergeTaskResults(emptySearchVolumeFile(), out.results, '2026-10-03', { source: SEARCH_VOLUME_SOURCE, otherSourceLeft: [] });
    expect(merged.file.terms).toEqual({
      'branded clipboards': { v: 170, f: '2026-10-03', m: '2026-08' },
      'zxqv plorfth wibbleknack': { v: null, f: '2026-10-03', m: null },
      'custom pens': { v: 12100, f: '2026-10-03', m: '2026-08' },
    });
    expect(Object.values(merged.file.terms).some((t) => t.v === 0)).toBe(false);
    // The file it writes is AUTO-123's shape, byte for byte the same writer.
    expect(parseSearchVolumeFile(JSON.parse(serializeSearchVolumeFile(merged.file)))).toEqual(merged.file);
  });

  it('a real 0 from the source stays 0', () => {
    const out = readLiveTask(answer([item('quiet term', 0)]), ['quiet term'], EXPECT);
    if (out.ok === false) throw new Error(out.message);
    expect(mergeTaskResults(emptySearchVolumeFile(), out.results, '2026-10-03', { source: SEARCH_VOLUME_SOURCE, otherSourceLeft: [] }).file.terms['quiet term'].v).toBe(0);
  });

  it('a term sent with NO entry in the answer is a failed lookup, never "no figure" and never 0', () => {
    const out = readLiveTask(answer([item('custom pens', 12100)]), ['custom pens', 'vanished term'], EXPECT);
    if (out.ok === false) throw new Error(out.message);
    expect(out.missing).toEqual(['vanished term']);
    const merged = mergeTaskResults(emptySearchVolumeFile(), out.results, '2026-10-03', { source: SEARCH_VOLUME_SOURCE, otherSourceLeft: [] });
    expect(merged.file.terms['vanished term']).toBeUndefined();
    expect(merged.file.failed['vanished term']).toEqual({ f: '2026-10-03', why: 'DataForSEO returned no entry for this term' });
  });

  it('a rejected task (one refused keyword rejects them all) is an error with the API\'s own message and a cost of 0', () => {
    const rejected = {
      status_code: 20000,
      status_message: 'Ok.',
      cost: 0,
      tasks_error: 1,
      tasks: [{ status_code: 40501, status_message: "Invalid Field: 'keywords'. Keyword text has invalid characters or symbols: 'stress balls in mosier, or'.", cost: 0, result_count: 0, result: null }],
    };
    expect(readLiveTask(rejected, ['custom pens', 'stress balls in mosier, or'], EXPECT)).toEqual({
      ok: false,
      costCents: 0,
      code: 40501,
      message: "Invalid Field: 'keywords'. Keyword text has invalid characters or symbols: 'stress balls in mosier, or'.",
    });
    expect(readLiveTask({ status_code: 40100, status_message: 'You are not authorized.' }, ['x'], EXPECT)).toMatchObject({ ok: false, code: 40100, costCents: null });
    expect(readLiveTask(null, ['x'], EXPECT)).toMatchObject({ ok: false });
    expect(readLiveTask('<html>', ['x'], EXPECT)).toMatchObject({ ok: false });
  });

  it('an answer for another location or language is refused whole', () => {
    const wrong = answer([{ ...item('custom pens', 12100), location_code: 2826 }]);
    expect(readLiveTask(wrong, ['custom pens'], EXPECT)).toMatchObject({ ok: false, message: expect.stringMatching(/location 2826/) });
  });
});

describe('the change of source', () => {
  const old = file(
    { 'custom matchbooks': { v: 9900, f: '2026-10-02', m: '2026-05' }, 'promotional pens plymouth logo printing': { v: 0, f: '2026-10-02', m: null }, 'engraved pens': { v: 3600, f: '2026-10-02', m: '2026-08' } },
    {},
    OLD_SOURCE,
  );
  const otherSourceLeft = Object.keys(old.terms).sort();

  it('replaces every earlier figure, turns the earlier source\'s 0 into "no figure" when Google has nothing, and only then renames the source', () => {
    const first = readLiveTask(answer([item('custom matchbooks', 12100), item('promotional pens plymouth logo printing', null, null)]), ['custom matchbooks', 'promotional pens plymouth logo printing'], EXPECT);
    if (first.ok === false) throw new Error(first.message);
    const half = mergeTaskResults(old, first.results, '2026-10-03', { source: SEARCH_VOLUME_SOURCE, otherSourceLeft });
    expect(half.otherSourceLeft).toEqual(['engraved pens']);
    expect(half.file.source).toBe(OLD_SOURCE); // one earlier figure is still in the file
    expect(half.file.terms['custom matchbooks']).toEqual({ v: 12100, f: '2026-10-03', m: '2026-08' });
    expect(half.file.terms['promotional pens plymouth logo printing']).toEqual({ v: null, f: '2026-10-03', m: null });
    const second = readLiveTask(answer([item('engraved pens', 3600)]), ['engraved pens'], EXPECT);
    if (second.ok === false) throw new Error(second.message);
    const done = mergeTaskResults(half.file, second.results, '2026-10-03', { source: SEARCH_VOLUME_SOURCE, otherSourceLeft: half.otherSourceLeft });
    expect(done.otherSourceLeft).toEqual([]);
    expect(done.file.source).toBe(SEARCH_VOLUME_SOURCE);
    // The input files are untouched.
    expect(old.source).toBe(OLD_SOURCE);
    expect(old.terms['custom matchbooks'].v).toBe(9900);
  });

  it('an earlier-source figure the new source gives no entry for is dropped and recorded as failed, not left unlabelled', () => {
    const out = readLiveTask(answer([item('custom matchbooks', 12100), item('promotional pens plymouth logo printing', null, null)]), otherSourceLeft, EXPECT);
    if (out.ok === false) throw new Error(out.message);
    const merged = mergeTaskResults(old, out.results, '2026-10-03', { source: SEARCH_VOLUME_SOURCE, otherSourceLeft });
    expect(merged.dropped).toEqual(['engraved pens']);
    expect(merged.file.terms['engraved pens']).toBeUndefined();
    expect(merged.file.failed['engraved pens'].why).toMatch(/no entry.*another source and was dropped/);
    expect(merged.file.source).toBe(SEARCH_VOLUME_SOURCE);
  });

  it('within one source a figure is still never lost to a failed retry', () => {
    const same = { ...old, source: SEARCH_VOLUME_SOURCE };
    const merged = mergeTaskResults(same, { 'engraved pens': { error: 'DataForSEO returned no entry for this term' } }, '2026-10-03', { source: SEARCH_VOLUME_SOURCE, otherSourceLeft: [] });
    expect(merged.file.terms['engraved pens']).toEqual(old.terms['engraved pens']);
    expect(merged.dropped).toEqual([]);
  });

  it('the comparison separates a different number from a 0 that is now no figure', () => {
    const c = compareFigures(old, {
      'custom matchbooks': { search_volume: 12100 },
      'promotional pens plymouth logo printing': { search_volume: null },
      'engraved pens': { search_volume: 3600 },
      'not in the file': { search_volume: 5 },
    });
    expect(c).toEqual({ compared: 3, same: 1, different: [{ term: 'custom matchbooks', stored: 9900, fresh: 12100 }], zeroNowNoFigure: ['promotional pens plymouth logo printing'], figureVersusNone: [], noAnswer: [] });
  });
});

describe('the run: the file is written after every task, and it stops where it must', () => {
  const START = { file: emptySearchVolumeFile(), otherSourceLeft: [] as string[], fetchedOn: '2026-10-03', source: SEARCH_VOLUME_SOURCE, priceCents: 9 };
  const ok = (terms: readonly string[]): LiveTaskOutcome => {
    const out = readLiveTask(answer(terms.map((t) => item(t, 10))), terms, EXPECT);
    if (out.ok === false) throw new Error(out.message);
    return out;
  };
  function harness(send: (terms: readonly string[], n: number) => LiveTaskOutcome | null) {
    const sent: string[][] = [];
    const writes: SearchVolumeFile[] = [];
    let pauses = 0;
    const effects = {
      send: async (terms: readonly string[], n: number) => {
        sent.push([...terms]);
        return send(terms, n);
      },
      write: (f: SearchVolumeFile) => {
        writes.push(JSON.parse(JSON.stringify(f)) as SearchVolumeFile);
      },
      pause: async () => {
        pauses += 1;
      },
      log: () => undefined,
    };
    return { effects, sent, writes, pauses: () => pauses };
  }
  const TASKS = [['a one', 'a two'], ['b one'], ['c one', 'c two']];

  it('three answered tasks: three writes, each holding everything answered so far; the cost is the API\'s own', async () => {
    const h = harness((terms) => ok(terms));
    const run = await runRefreshTasks(TASKS, START, h.effects);
    expect(run).toMatchObject({ tasksDone: 3, added: 5, failed: 0, costCents: 27, stoppedWhy: null, stoppedByCap: false });
    expect(h.writes.map((w) => Object.keys(w.terms).length)).toEqual([2, 3, 5]);
    expect(h.sent).toEqual(TASKS);
    expect(h.pauses()).toBe(2); // between tasks, never before the first
    expect(Object.keys(run.file.terms).sort()).toEqual(['a one', 'a two', 'b one', 'c one', 'c two']);
  });

  it('the cap refusing the second task stops the run; the first task is already in the file and the third is never sent', async () => {
    const h = harness((terms, n) => (n === 2 ? null : ok(terms)));
    const run = await runRefreshTasks(TASKS, START, h.effects);
    expect(run).toMatchObject({ tasksDone: 1, added: 2, costCents: 9, stoppedWhy: 'the cap', stoppedByCap: true });
    expect(h.sent).toEqual([TASKS[0], TASKS[1]]);
    expect(h.writes).toHaveLength(1);
    expect(Object.keys(run.file.terms)).toEqual(['a one', 'a two']);
    // The next run plans only what is not in the file: that is the resume.
  });

  it('a task that fails outright stops the run without writing anything for it', async () => {
    const h = harness((terms, n) => (n === 2 ? { ok: false, costCents: null, code: null, message: 'the call got no answer' } : ok(terms)));
    const run = await runRefreshTasks(TASKS, START, h.effects);
    expect(run).toMatchObject({ tasksDone: 1, stoppedWhy: 'task 2 failed (the call got no answer)', stoppedByCap: false, costCents: 9 });
    expect(h.writes).toHaveLength(1);
    expect(h.sent).toHaveLength(2);
  });

  it('a task rejected for one named keyword is sent again without it, at no cost, and the keyword is recorded as failed', async () => {
    const rejection = (term: string): LiveTaskOutcome => ({ ok: false, costCents: 0, code: 40501, message: `Invalid Field: 'keywords'. Keyword text has invalid characters or symbols: '${term}'.` });
    const h = harness((terms) => (terms.includes('a two') ? rejection('a two') : ok(terms)));
    const run = await runRefreshTasks([TASKS[0]], START, h.effects);
    expect(h.sent).toEqual([['a one', 'a two'], ['a one']]);
    expect(run).toMatchObject({ tasksDone: 1, added: 1, failed: 1, costCents: 9, stoppedWhy: null });
    expect(run.file.terms['a one']).toEqual({ v: 10, f: '2026-10-03', m: '2026-08' });
    expect(run.file.terms['a two']).toBeUndefined();
    expect(run.file.failed['a two'].why).toMatch(/DataForSEO refused the term/);
  });

  it('a rejection that names nothing we sent, or rejections without end, stop the run instead of looping', async () => {
    const unnamed = harness(() => ({ ok: false, costCents: 0, code: 40501, message: "Invalid Field: 'keywords'." }));
    const a = await runRefreshTasks([TASKS[0]], START, unnamed.effects);
    expect(unnamed.sent).toHaveLength(1);
    expect(a).toMatchObject({ tasksDone: 0, stoppedWhy: "task 1 failed (Invalid Field: 'keywords'.)" });
    expect(unnamed.writes).toHaveLength(0);
    // Every term refused one after another: at most 1 + MAX_REJECTIONS_PER_TASK sends for one task.
    const many = Array.from({ length: 30 }, (_, i) => `term ${i}`);
    const endless = harness((terms) => ({ ok: false, costCents: 0, code: 40501, message: `Keyword text has invalid characters or symbols: '${terms[0]}'.` }));
    const b = await runRefreshTasks([many], START, endless.effects);
    expect(endless.sent).toHaveLength(1 + MAX_REJECTIONS_PER_TASK);
    expect(b.tasksDone).toBe(0);
    expect(b.costCents).toBe(0);
    // The refusals already learned are written, so the next run does not send those terms again.
    expect(Object.keys(b.file.failed)).toHaveLength(MAX_REJECTIONS_PER_TASK);
    expect(endless.writes).toHaveLength(1);
  });
});

describe('structure: the credentials never reach the site, and AUTO-123 is untouched', () => {
  const SKIP = new Set(['node_modules', '.next', '.git', 'tmp', '.vercel']);
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (SKIP.has(name)) continue;
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) sources(rel, out);
      else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(rel);
    }
    return out;
  }
  const CLIENT = 'scripts/blog-automation/dataforseo-client.ts';
  const SCRIPT = 'scripts/blog-automation/search-volumes.ts';

  it('the two variables are read in exactly one file, under scripts/, and nothing the site ships mentions them or the client', () => {
    const siteFiles = ['app', 'lib', 'components', 'sanity'].flatMap((d) => sources(d)).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
    expect(siteFiles.length).toBeGreaterThan(200);
    for (const rel of siteFiles) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/process\.env\.DATAFORSEO|DATAFORSEO_(LOGIN|PASSWORD)/);
      expect(src, rel).not.toMatch(/(from|import\()\s*['"][^'"]*dataforseo-client|api\.dataforseo\.com/);
    }
    const readers = sources('scripts').filter((f) => /process\.env\.DATAFORSEO_/.test(code(f)));
    expect(readers).toEqual([CLIENT]);
    // No public variant can exist anywhere, the example file included.
    for (const rel of [...siteFiles, ...sources('scripts'), '.env.example']) expect(code(rel), rel).not.toMatch(/NEXT_PUBLIC_DATAFORSEO/);
    expect(code('.env.example')).toMatch(/^DATAFORSEO_LOGIN=\s*$/m);
    expect(code('.env.example')).toMatch(/^DATAFORSEO_PASSWORD=\s*$/m);
  });

  it('the client never prints a credential: the header is built in one place and no log or error carries it', () => {
    const src = code(CLIENT);
    expect([...src.matchAll(/process\.env\.DATAFORSEO_LOGIN/g)].length).toBe(2); // hasCredentials + authHeader
    expect([...src.matchAll(/authHeader\(\)/g)].length).toBe(2); // the definition and the one use
    expect(src).not.toMatch(/console\./);
    for (const line of src.split('\n').filter((l) => /DataForSeoError\(|throw /.test(l))) expect(line).not.toMatch(/login|password|authHeader|Authorization/);
    // The paid call is one function, hits the one endpoint, and is never retried inside the client.
    expect([...src.matchAll(/SEARCH_VOLUME_LIVE_PATH/g)].length).toBe(2); // the import and the one call
    expect(SEARCH_VOLUME_LIVE_PATH).toBe('keywords_data/google_ads/search_volume/live');
    expect(src.slice(src.indexOf('export async function searchVolumeLive'))).not.toMatch(/\bfor \(|\bwhile \(/);
  });

  it('every paid call in the script goes through the one function that reserves first, and --commit is the only switch that writes the file', () => {
    const src = code(SCRIPT);
    const calls = [...src.matchAll(/searchVolumeLive\(/g)];
    expect(calls).toHaveLength(1);
    const paid = src.slice(src.indexOf('async function paidTask('), src.indexOf('function printPlan('));
    expect(paid).toContain('searchVolumeLive(');
    // Reserve, write the ledger to disk, THEN call.
    expect(paid.indexOf('reserveCall(')).toBeGreaterThan(-1);
    expect(paid.indexOf('reserveCall(')).toBeLessThan(paid.indexOf('writeLedger(reserved.ledger)'));
    expect(paid.indexOf('writeLedger(reserved.ledger)')).toBeLessThan(paid.indexOf('searchVolumeLive('));
    expect(paid.indexOf('if (reserved.ok === false)')).toBeLessThan(paid.indexOf('searchVolumeLive('));
    // The dry run returns before anything is sent or written.
    const refresh = src.slice(src.indexOf('async function refresh('), src.indexOf('async function compare('));
    expect(refresh).toMatch(/const commit = hasFlag\('--commit'\) && !hasFlag\('--dry-run'\);/);
    expect(refresh.indexOf('if (!commit) {')).toBeGreaterThan(-1);
    expect(refresh.indexOf('if (!commit) {')).toBeLessThan(refresh.indexOf('paidTask('));
    expect(refresh.indexOf('if (!commit) {')).toBeLessThan(refresh.indexOf('writeFileSync('));
    // compare pays only with --pay and never writes the committed file.
    const compare = src.slice(src.indexOf('async function compare('), src.indexOf('async function check('));
    expect(compare).toMatch(/const pay = hasFlag\('--pay'\) && !hasFlag\('--dry-run'\);/);
    expect(compare.indexOf('if (!pay ||')).toBeLessThan(compare.indexOf('paidTask('));
    expect(compare).not.toMatch(/writeFileSync|serializeSearchVolumeFile/);
    // The old loop is gone: no batch file, no results file, no Ubersuggest.
    expect(src).not.toMatch(/batch\.json|results\.json|keyword_overview/);
    expect(src).not.toMatch(/ubersuggest/i);
  });

  it('the site still reads only the committed file: the route and the panel import neither the refresh nor the client', () => {
    for (const rel of ['app/api/sanity/blog-topics/route.ts', 'sanity/tools/blog-topics-tool.tsx', 'lib/blog-automation/search-volume.ts', 'lib/blog-automation/search-volume-file.ts', 'lib/blog-automation/cached-topic-pool.ts', 'lib/blog-automation/build-topic-pool.ts', 'lib/blog-automation/topic-pool.ts']) {
      expect(code(rel), rel).not.toMatch(/volume-refresh|dataforseo-client/);
    }
    // The committed file is still AUTO-123's shape, written by AUTO-123's writer.
    const committedText = code('data/blog-automation/search-volumes.json').replace(/\r\n/g, '\n');
    expect(serializeSearchVolumeFile(parseSearchVolumeFile(JSON.parse(committedText)))).toBe(committedText);
    expect(SEARCH_VOLUME_LOCATION_ID).toBe(2840);
    expect(SEARCH_VOLUME_SOURCE).toMatch(/DataForSEO/);
    expect(SEARCH_VOLUME_SOURCE).not.toMatch(/Ubersuggest/);
  });
});
