/**
 * Search volume for the Blog Topics panel (AUTO-123, the last piece of Stage
 * 1). PURE: no fetch, no fs, no Sanity, so the Studio panel, the route and
 * the script share one definition of the file, one way of keying a term and
 * one lookup rule.
 *
 * What the figure is, and why it is a column and not a rule:
 *
 *   - It is Google Ads Keyword Planner's average monthly searches for the
 *     exact term in the United States, read through Patrick's DataForSEO
 *     account since AUTO-124 (2026-10-03). The first 60 figures (AUTO-123)
 *     came through his Ubersuggest plan, which resells the same Keyword
 *     Planner data; measured term for term, 40 of the 60 were identical, 18
 *     were one or two steps apart on Google's ladder (Ubersuggest serves
 *     older snapshots for some terms), and its two 0s are "no figure" here.
 *     Google rounds every volume to about 60 fixed steps (10, 20, 30, 50,
 *     70, 90, 110, ... 9,900, 12,100 ...), so a figure from either source
 *     lands on the same ladder.
 *   - It is NOT the same thing as impressions. Impressions say how often
 *     Patrick's site appeared for the search; volume says how many people are
 *     looking. AUTO-122 measured a Spearman correlation of only 0.505 between
 *     the two over the pool, with order-of-magnitude disagreements both ways
 *     ("custom matchbooks": 9,900 searches a month against 761 impressions;
 *     "promotional footballs": 90 against 1,682). A term with high volume and
 *     low impressions is an opportunity the impressions column hides.
 *   - It NEVER changes a topic's state. No exclusion, no hiding, no default
 *     ordering reads it. It is a column exactly as the closest-wording column
 *     is (AUTO-119): information Patrick reads, a decision he makes. The
 *     structural tests in search-volume.test.ts hold the pool, the guard and
 *     the drafts read to never importing this module, and this module to
 *     never touching a state.
 *
 * Where the figures live: a COMMITTED JSON file, `data/blog-automation/
 * search-volumes.json`, the way `products.json` lives in the repo. Nothing
 * on the server calls any keyword API and no keyword-API credential is on the
 * site; the file is written by Ali's occasional script run
 * (scripts/blog-automation/search-volumes.ts, one command since AUTO-124) and
 * read at request time by the blog-topics route. Volume barely moves (a refresh two or three
 * times a year is plenty, against Search Console's daily data), and if the
 * file is never refreshed nothing breaks: the figures go stale, the panel
 * says how old they are, and the list works exactly as before.
 *
 * Three states a row can show, and the words for each (the "never fabricate"
 * rule): a NUMBER, 0 included (a 0 the source states is shown as 0);
 * "no figure from Google Ads" (the term WAS looked up and Google returned no
 * volume at all, stored as null; this is what DataForSEO reports for a term
 * Keyword Planner has nothing for, where Ubersuggest printed 0: the term with
 * 3,134 impressions that AUTO-123 stored as 0 is such a term, so neither
 * reading means dead); and "not looked up" (the term is not in the file, or a lookup failed
 * and was recorded under `failed`). A blank cell is never shown: the panel
 * prints the words.
 */

import { queryTopicKey, topicKeys, topicQueries, type SpacingGroup, type TopicCandidate } from './topic-pool';

/** Where the committed file lives, relative to the repo root. One place. */
export const SEARCH_VOLUME_FILE = 'data/blog-automation/search-volumes.json';

/** Google Ads location the figures are for (the United States; verified from DataForSEO's own locations list, AUTO-124), and the language. */
export const SEARCH_VOLUME_LOCATION_ID = 2840;
export const SEARCH_VOLUME_LANGUAGE = 'en';
/** The one source string the file carries, so a reader can tell where a figure came from. */
export const SEARCH_VOLUME_SOURCE = 'Google Ads Keyword Planner, via DataForSEO keywords_data/google_ads/search_volume (United States, English)';

/** One looked-up term as stored: volume (null when Google returned none), the day it was looked up, the month Google's series runs to. */
export interface StoredVolume {
  /** Average monthly searches, a non-negative integer, or null when the source returned no figure. */
  v: number | null;
  /** The day the lookup was made, YYYY-MM-DD (UTC). */
  f: string;
  /** The latest month in Google's 12-month series, YYYY-MM, or null when the source gave no series. */
  m: string | null;
}

/** A lookup that did not get an answer (denied, errored, timed out): recorded so a later run can skip or retry it. */
export interface FailedLookup {
  f: string;
  why: string;
}

export interface SearchVolumeFile {
  source: string;
  locationId: number;
  language: string;
  /** Keyed by the normalised term (see `normalizeVolumeTerm`), sorted A to Z on write. */
  terms: Record<string, StoredVolume>;
  /** Terms whose lookup got no answer, keyed the same way. Never shown as a figure. */
  failed: Record<string, FailedLookup>;
}

/** An empty file: what a missing or unreadable file reads as. */
export function emptySearchVolumeFile(): SearchVolumeFile {
  return { source: SEARCH_VOLUME_SOURCE, locationId: SEARCH_VOLUME_LOCATION_ID, language: SEARCH_VOLUME_LANGUAGE, terms: {}, failed: {} };
}

/**
 * The ONE normalisation of a term, on write and on lookup: trimmed, inner
 * whitespace collapsed, lower-cased. A pool query is already lower case and
 * single-spaced as Search Console reports it, so for a pool query this is an
 * identity; it exists so a term typed by hand into the results file still
 * matches.
 */
export function normalizeVolumeTerm(term: unknown): string {
  return typeof term === 'string' ? term.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

function isStoredVolume(v: unknown): v is StoredVolume {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const volumeOk = o.v === null || (typeof o.v === 'number' && Number.isInteger(o.v) && o.v >= 0);
  const dayOk = typeof o.f === 'string' && DAY.test(o.f);
  const monthOk = o.m === null || (typeof o.m === 'string' && MONTH.test(o.m));
  return volumeOk && dayOk && monthOk;
}

function isFailedLookup(v: unknown): v is FailedLookup {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.f === 'string' && DAY.test(o.f) && typeof o.why === 'string';
}

/**
 * Read the file's parsed JSON into the typed shape, dropping any entry that
 * is not what the writer writes. A file that is not an object, or has no
 * `terms` object, reads as EMPTY rather than throwing: the panel must work
 * with the file missing, partial or damaged, exactly as it does today.
 */
export function parseSearchVolumeFile(raw: unknown): SearchVolumeFile {
  const out = emptySearchVolumeFile();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  if (typeof o.source === 'string') out.source = o.source;
  if (typeof o.locationId === 'number') out.locationId = o.locationId;
  if (typeof o.language === 'string') out.language = o.language;
  if (o.terms && typeof o.terms === 'object') {
    for (const [k, v] of Object.entries(o.terms as Record<string, unknown>)) {
      const term = normalizeVolumeTerm(k);
      if (term && isStoredVolume(v)) out.terms[term] = { v: v.v, f: v.f, m: v.m };
    }
  }
  if (o.failed && typeof o.failed === 'object') {
    for (const [k, v] of Object.entries(o.failed as Record<string, unknown>)) {
      const term = normalizeVolumeTerm(k);
      if (term && isFailedLookup(v) && !(term in out.terms)) out.failed[term] = { f: v.f, why: v.why };
    }
  }
  return out;
}

/**
 * The file as written: one term per line, sorted A to Z, so a refresh shows
 * as a readable diff (the SCRAPE-940 lesson: a file written in lookup order
 * moves every line on every run). Deterministic for the same input.
 */
export function serializeSearchVolumeFile(file: SearchVolumeFile): string {
  const lines: string[] = ['{'];
  lines.push(`  "source": ${JSON.stringify(file.source)},`);
  lines.push(`  "locationId": ${JSON.stringify(file.locationId)},`);
  lines.push(`  "language": ${JSON.stringify(file.language)},`);
  const termKeys = Object.keys(file.terms).sort();
  lines.push('  "terms": {');
  termKeys.forEach((k, i) => {
    const t = file.terms[k];
    lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify({ v: t.v, f: t.f, m: t.m })}${i < termKeys.length - 1 ? ',' : ''}`);
  });
  lines.push('  },');
  const failedKeys = Object.keys(file.failed).sort();
  lines.push('  "failed": {');
  failedKeys.forEach((k, i) => {
    const t = file.failed[k];
    lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify({ f: t.f, why: t.why })}${i < failedKeys.length - 1 ? ',' : ''}`);
  });
  lines.push('  }');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

// -- Lookup ---------------------------------------------------------------------

/** What the panel shows for a topic. */
export interface VolumeLookup {
  /** The figure, 0 included, or null when the term was looked up and Google returned none. */
  volume: number | null;
  /** The stored term the figure is for; the row's own search when it matched exactly. */
  term: string;
  /**
   * true when `term` is the topic's own representative search (the figure is
   * for the words on the row); false when it is a merged spelling, a member
   * search, or a same-key wording, in which case the panel names it.
   */
  exact: boolean;
  fetchedAt: string;
  dataThrough: string | null;
}

/** A topic as the lookup reads it: its searches and keys, nothing about its state. */
export type VolumeTopic = Pick<TopicCandidate, 'key' | 'query' | 'variants'> & {
  spacingGroups?: readonly Pick<SpacingGroup, 'key' | 'query'>[];
};

/**
 * A prepared index over the file: by normalised term (exact), and by topic
 * key (so a figure looked up for one wording of a topic still shows, named,
 * after the representative wording changes or the spacing merge folds two
 * rows into one). Built once per render, not per row.
 */
export interface VolumeIndex {
  byTerm: ReadonlyMap<string, StoredVolume>;
  byKey: ReadonlyMap<string, string[]>;
}

export function buildVolumeIndex(file: SearchVolumeFile | null | undefined): VolumeIndex {
  const byTerm = new Map<string, StoredVolume>();
  const byKey = new Map<string, string[]>();
  if (!file) return { byTerm, byKey };
  for (const term of Object.keys(file.terms).sort()) {
    byTerm.set(term, file.terms[term]);
    const key = queryTopicKey(term);
    const list = byKey.get(key) ?? [];
    list.push(term);
    byKey.set(key, list);
  }
  return { byTerm, byKey };
}

/**
 * The figure for a topic, or null when none of its wordings was looked up.
 *
 * How a term is keyed so it survives the spacing merge (AUTO-119) and a
 * change of representative: the lookup tries, in order, (1) the topic's own
 * search, exactly; (2) each merged spelling's own search (the row it had
 * before the merge); (3) every member search of the topic; (4) any stored
 * term whose `queryTopicKey` is one of the topic's keys (the same words in
 * another order). Only (1) is "exact"; the others carry the stored wording
 * so the panel can say "for "custom match books"" under the figure. A topic
 * block and a written record match through the same keys (`topicKeys`), so
 * a volume cannot be lost by a merge that keeps those.
 */
export function lookupVolume(topic: VolumeTopic, index: VolumeIndex): VolumeLookup | null {
  const tried = new Set<string>();
  const candidates: { term: string; exact: boolean }[] = [];
  const add = (q: string, exact: boolean) => {
    const term = normalizeVolumeTerm(q);
    if (!term || tried.has(term)) return;
    tried.add(term);
    candidates.push({ term, exact });
  };
  const queries = topicQueries(topic);
  queries.forEach((q, i) => add(q, i === 0));
  for (const v of topic.variants) add(v, false);
  for (const k of topicKeys(topic)) for (const t of index.byKey.get(k) ?? []) add(t, false);
  for (const c of candidates) {
    const stored = index.byTerm.get(c.term);
    if (!stored) continue;
    return { volume: stored.v, term: c.term, exact: c.exact, fetchedAt: stored.f, dataThrough: stored.m };
  }
  return null;
}

/** The panel's words for a cell with no figure. Never a 0, never an empty string. */
export function volumeCellWords(lookup: VolumeLookup | null): string {
  if (lookup === null) return 'not looked up';
  if (lookup.volume === null) return 'no figure from Google Ads';
  return lookup.volume.toLocaleString('en-US');
}

// -- Age and coverage -------------------------------------------------------------

export interface VolumeFileSummary {
  /** Terms with a figure (0 included) and terms looked up that Google had none for. */
  withFigure: number;
  withoutFigure: number;
  failed: number;
  /** Oldest and newest lookup days across the file, YYYY-MM-DD, or null when empty. */
  oldestLookup: string | null;
  newestLookup: string | null;
  /**
   * The month Google's own series runs to, across the file: the earliest and
   * the latest, or null. Measured 2026-10-02: Google's 12-month series ends on
   * a different month per term (December 2025 for "business pens", September
   * 2026 for "promotional footballs"), so one month would misstate most rows.
   */
  dataFrom: string | null;
  dataThrough: string | null;
}

export function summarizeSearchVolumeFile(file: SearchVolumeFile | null | undefined): VolumeFileSummary {
  const out: VolumeFileSummary = { withFigure: 0, withoutFigure: 0, failed: 0, oldestLookup: null, newestLookup: null, dataFrom: null, dataThrough: null };
  if (!file) return out;
  for (const t of Object.values(file.terms)) {
    if (t.v === null) out.withoutFigure += 1;
    else out.withFigure += 1;
    if (out.oldestLookup === null || t.f < out.oldestLookup) out.oldestLookup = t.f;
    if (out.newestLookup === null || t.f > out.newestLookup) out.newestLookup = t.f;
    if (t.m && (out.dataThrough === null || t.m > out.dataThrough)) out.dataThrough = t.m;
    if (t.m && (out.dataFrom === null || t.m < out.dataFrom)) out.dataFrom = t.m;
  }
  out.failed = Object.keys(file.failed).length;
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-05" as "May 2026"; anything else verbatim. */
export function monthWords(month: string | null): string {
  if (!month || !MONTH.test(month)) return month ?? '';
  const [y, m] = month.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : month;
}

/** "2026-10-02" as "2 October 2026"; anything else verbatim. Day-only, no timezone arithmetic. */
export function dayWords(day: string | null): string {
  if (!day || !DAY.test(day)) return day ?? '';
  const [y, m, d] = day.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${d} ${MONTHS[m - 1]} ${y}` : day;
}

// -- The script's merge (pure, so it is tested) ---------------------------------------

/** One answer from the source for one term, as the results file records it. */
export type LookupResult =
  | {
      /** The headline figure. A missing or non-numeric value is "no figure" (null); never coerced to 0. */
      search_volume?: unknown;
      /** Google's 12-month series, from which the latest month is taken. */
      monthly_searches?: unknown;
      error?: undefined;
    }
  | { error: string };

export interface MergeOutcome {
  file: SearchVolumeFile;
  added: string[];
  updated: string[];
  unchanged: string[];
  failed: string[];
  /** Results refused because the term was blank or the figure was not an integer >= 0 or null. */
  rejected: { term: string; why: string }[];
}

function latestMonth(series: unknown): string | null {
  if (!Array.isArray(series)) return null;
  let best: string | null = null;
  for (const entry of series) {
    const period = entry && typeof entry === 'object' ? (entry as { period?: unknown }).period : undefined;
    if (typeof period !== 'string' || !/^\d{6}$/.test(period)) continue;
    const month = `${period.slice(0, 4)}-${period.slice(4, 6)}`;
    if (best === null || month > best) best = month;
  }
  return best;
}

/**
 * Fold a results file into the committed file. A term with a figure (or an
 * explicit null) replaces its entry and clears any failure; a term with an
 * error is recorded under `failed` unless it already has a figure (a figure
 * is never lost to a later failed retry); a figure that is not a non-negative
 * integer is REJECTED and reported, never stored as 0.
 */
export function mergeLookupResults(
  file: SearchVolumeFile,
  results: Record<string, LookupResult>,
  fetchedOn: string,
): MergeOutcome {
  const next: SearchVolumeFile = { ...file, terms: { ...file.terms }, failed: { ...file.failed } };
  const out: MergeOutcome = { file: next, added: [], updated: [], unchanged: [], failed: [], rejected: [] };
  if (!DAY.test(fetchedOn)) throw new Error(`fetchedOn must be YYYY-MM-DD, got ${JSON.stringify(fetchedOn)}`);
  for (const [rawTerm, result] of Object.entries(results)) {
    const term = normalizeVolumeTerm(rawTerm);
    if (!term) {
      out.rejected.push({ term: rawTerm, why: 'blank term' });
      continue;
    }
    if ('error' in result && result.error !== undefined) {
      if (term in next.terms) {
        out.unchanged.push(term);
      } else {
        next.failed[term] = { f: fetchedOn, why: String(result.error).slice(0, 200) };
        out.failed.push(term);
      }
      continue;
    }
    const raw = (result as { search_volume?: unknown }).search_volume;
    let v: number | null;
    if (raw === null || raw === undefined) v = null;
    else if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) v = raw;
    else {
      out.rejected.push({ term, why: `search_volume is ${JSON.stringify(raw)}, not a whole number of 0 or more` });
      continue;
    }
    const entry: StoredVolume = { v, f: fetchedOn, m: latestMonth((result as { monthly_searches?: unknown }).monthly_searches) };
    const before = next.terms[term];
    delete next.failed[term];
    next.terms[term] = entry;
    if (!before) out.added.push(term);
    else if (before.v === entry.v && before.m === entry.m) out.unchanged.push(term);
    else out.updated.push(term);
  }
  return out;
}
