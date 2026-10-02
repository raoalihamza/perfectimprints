/**
 * AUTO-123: the search-volume column. The file shape and its keying across
 * the spacing merge, the three honest cell states (never a 0 that the source
 * did not say), the merge the script runs, the server loader with the file
 * missing or damaged, and the structural guarantee that no topic's state,
 * count or default order can read a volume.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyGuard,
  applyNegativeKeywords,
  applyWrittenTopics,
  compareTopics,
  countTopics,
  groupIntoTopics,
  type Topic,
} from './topic-pool';
import {
  SEARCH_VOLUME_FILE,
  buildVolumeIndex,
  dayWords,
  emptySearchVolumeFile,
  lookupVolume,
  mergeLookupResults,
  monthWords,
  normalizeVolumeTerm,
  parseSearchVolumeFile,
  serializeSearchVolumeFile,
  summarizeSearchVolumeFile,
  volumeCellWords,
  type SearchVolumeFile,
} from './search-volume';
import { readSearchVolumeFile, resetSearchVolumeFileForTests } from './search-volume-file';
import { readFileSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function file(terms: SearchVolumeFile['terms'], failed: SearchVolumeFile['failed'] = {}): SearchVolumeFile {
  return { ...emptySearchVolumeFile(), terms, failed };
}

const pool = () =>
  groupIntoTopics([
    { query: 'custom matchbooks', clicks: 3, impressions: 761, position: 12.4, page: '/cat/matchbooks' },
    { query: 'custom match books', clicks: 0, impressions: 40, position: 15, page: '/cat/matchbooks' },
    { query: 'promotional footballs', clicks: 9, impressions: 1682, position: 9.1, page: '/cat/footballs' },
    { query: 'mini football custom', clicks: 0, impressions: 50, position: 20, page: '/cat/footballs' },
    { query: 'custom mini footballs', clicks: 1, impressions: 30, position: 22, page: '/cat/footballs' },
    { query: 'thunder sticks', clicks: 0, impressions: 120, position: 30, page: '/blog/thundersticks' },
  ]);

describe('the file: keying, parsing, writing', () => {
  it('normalises a term the one way, on write and on lookup', () => {
    expect(normalizeVolumeTerm('  Custom   Matchbooks ')).toBe('custom matchbooks');
    expect(normalizeVolumeTerm(42)).toBe('');
    expect(normalizeVolumeTerm('')).toBe('');
  });

  it('a missing, damaged or partial file reads as empty or as only its valid entries, never throws', () => {
    expect(parseSearchVolumeFile(null)).toEqual(emptySearchVolumeFile());
    expect(parseSearchVolumeFile('nonsense')).toEqual(emptySearchVolumeFile());
    expect(parseSearchVolumeFile({ terms: 'no' })).toEqual(emptySearchVolumeFile());
    const partial = parseSearchVolumeFile({
      terms: {
        'custom matchbooks': { v: 9900, f: '2026-10-02', m: '2026-05' },
        ' Promotional Footballs ': { v: 90, f: '2026-10-02', m: null },
        'bad volume': { v: -1, f: '2026-10-02', m: null },
        'bad float': { v: 9.5, f: '2026-10-02', m: null },
        'bad day': { v: 10, f: 'yesterday', m: null },
        'no figure': { v: null, f: '2026-10-02', m: null },
        '': { v: 10, f: '2026-10-02', m: null },
      },
      failed: { denied: { f: '2026-10-02', why: 'refused' }, 'custom matchbooks': { f: '2026-10-02', why: 'stale failure under a term that now has a figure' }, broken: 'x' },
    });
    expect(Object.keys(partial.terms).sort()).toEqual(['custom matchbooks', 'no figure', 'promotional footballs']);
    expect(partial.terms['promotional footballs']).toEqual({ v: 90, f: '2026-10-02', m: null });
    expect(partial.terms['no figure'].v).toBeNull();
    expect(Object.keys(partial.failed)).toEqual(['denied']);
  });

  it('writes one term per line, sorted A to Z, deterministically, and round-trips exactly', () => {
    const f = file(
      { 'promotional footballs': { v: 90, f: '2026-10-02', m: '2026-05' }, 'custom matchbooks': { v: 9900, f: '2026-10-01', m: '2026-05' }, 'no figure': { v: null, f: '2026-10-02', m: null } },
      { 'z denied': { f: '2026-10-02', why: 'refused' } },
    );
    const text = serializeSearchVolumeFile(f);
    expect(text).toBe(serializeSearchVolumeFile(f));
    const lines = text.split('\n');
    const termLines = lines.filter((l) => l.startsWith('    "')).map((l) => l.trim().split('":')[0].slice(1));
    expect(termLines).toEqual(['custom matchbooks', 'no figure', 'promotional footballs', 'z denied']);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseSearchVolumeFile(JSON.parse(text))).toEqual(f);
    // The real committed file is in that shape (line endings normalised: a
    // Windows checkout with autocrlf hands the file back with CRLF).
    const committedText = code(SEARCH_VOLUME_FILE).replace(/\r\n/g, '\n');
    const committed = parseSearchVolumeFile(JSON.parse(committedText));
    expect(serializeSearchVolumeFile(committed)).toBe(committedText);
  });
});

describe('the lookup survives the spacing merge and a change of wording', () => {
  const topics = pool();
  const matchbooks = topics.find((t) => t.query === 'custom matchbooks')!;
  const footballs = topics.find((t) => t.query === 'promotional footballs')!;
  const mini = topics.find((t) => t.query === 'mini football custom')!;

  it('the merged topic carries both spellings, and a figure stored under EITHER is found; the exact one first', () => {
    expect(matchbooks.spacingGroups.map((g) => g.query)).toEqual(['custom match books']);
    const both = buildVolumeIndex(file({ 'custom matchbooks': { v: 9900, f: '2026-10-02', m: '2026-05' }, 'custom match books': { v: 320, f: '2026-10-02', m: '2026-05' } }));
    expect(lookupVolume(matchbooks, both)).toMatchObject({ volume: 9900, term: 'custom matchbooks', exact: true });
    const otherOnly = buildVolumeIndex(file({ 'custom match books': { v: 320, f: '2026-10-02', m: '2026-05' } }));
    expect(lookupVolume(matchbooks, otherOnly)).toMatchObject({ volume: 320, term: 'custom match books', exact: false });
  });

  it('a figure looked up for a member search, or for the same words in another order, is found and named', () => {
    const member = buildVolumeIndex(file({ 'custom mini footballs': { v: 170, f: '2026-10-02', m: '2026-05' } }));
    expect(mini.variants).toContain('custom mini footballs');
    expect(lookupVolume(mini, member)).toMatchObject({ volume: 170, term: 'custom mini footballs', exact: false });
    // "football custom mini" was never a search of the topic, but it keys the same.
    const sameKey = buildVolumeIndex(file({ 'football custom mini': { v: 20, f: '2026-10-02', m: null } }));
    expect(lookupVolume(mini, sameKey)).toMatchObject({ volume: 20, term: 'football custom mini', exact: false });
  });

  it('a topic none of whose wordings was looked up is null; a different topic never borrows a figure', () => {
    const index = buildVolumeIndex(file({ 'custom matchbooks': { v: 9900, f: '2026-10-02', m: '2026-05' } }));
    expect(lookupVolume(footballs, index)).toBeNull();
    expect(lookupVolume(mini, index)).toBeNull();
    expect(lookupVolume(footballs, buildVolumeIndex(null))).toBeNull();
    expect(lookupVolume(footballs, buildVolumeIndex(undefined))).toBeNull();
  });
});

describe('the three honest cell states', () => {
  it('a number (0 included), "no figure from Google Ads", "not looked up"; never 0 for an absent figure', () => {
    const index = buildVolumeIndex(file({ zero: { v: 0, f: '2026-10-02', m: '2026-05' }, none: { v: null, f: '2026-10-02', m: null }, big: { v: 12100, f: '2026-10-02', m: '2026-05' } }));
    const t = (query: string) => ({ key: query, query, variants: [query] });
    expect(volumeCellWords(lookupVolume(t('zero'), index))).toBe('0');
    expect(volumeCellWords(lookupVolume(t('none'), index))).toBe('no figure from Google Ads');
    expect(volumeCellWords(lookupVolume(t('never'), index))).toBe('not looked up');
    expect(volumeCellWords(lookupVolume(t('big'), index))).toBe('12,100');
    expect(volumeCellWords(null)).not.toBe('0');
    expect(volumeCellWords(null)).not.toBe('');
  });

  it('the summary says how many have a figure and how old they are; the words for a day and a month', () => {
    const s = summarizeSearchVolumeFile(
      file(
        { a: { v: 10, f: '2026-10-02', m: '2026-05' }, b: { v: null, f: '2026-06-30', m: null }, c: { v: 0, f: '2026-08-15', m: '2026-04' } },
        { d: { f: '2026-10-02', why: 'refused' } },
      ),
    );
    expect(s).toEqual({ withFigure: 2, withoutFigure: 1, failed: 1, oldestLookup: '2026-06-30', newestLookup: '2026-10-02', dataFrom: '2026-04', dataThrough: '2026-05' });
    expect(summarizeSearchVolumeFile(null)).toEqual({ withFigure: 0, withoutFigure: 0, failed: 0, oldestLookup: null, newestLookup: null, dataFrom: null, dataThrough: null });
    expect(dayWords('2026-10-02')).toBe('2 October 2026');
    expect(monthWords('2026-05')).toBe('May 2026');
    expect(dayWords(null)).toBe('');
    expect(monthWords('oops')).toBe('oops');
  });
});

describe('the merge the script runs', () => {
  const existing = file({ 'custom matchbooks': { v: 9900, f: '2026-06-01', m: '2026-02' } }, { 'thunder sticks': { f: '2026-06-01', why: 'refused' } });

  it('adds, updates, keeps, records failures, rejects bad figures, and never turns an absent figure into 0', () => {
    const out = mergeLookupResults(
      existing,
      {
        'custom matchbooks': { search_volume: 9900, monthly_searches: [{ period: '202605', search_volume: 9900 }, { period: '202512', search_volume: 9900 }] },
        'promotional footballs': { search_volume: 90, monthly_searches: [{ period: '202605', search_volume: 90 }] },
        'no figure term': { search_volume: null, monthly_searches: [] },
        'no field term': {},
        'thunder sticks': { search_volume: 390, monthly_searches: [{ period: '202605', search_volume: 390 }] },
        'denied term': { error: 'The call was refused.' },
        'fraction': { search_volume: 12.5 },
        'negative': { search_volume: -3 },
        'words': { search_volume: '9900' },
        '   ': { search_volume: 10 },
      },
      '2026-10-02',
    );
    expect(out.updated).toEqual(['custom matchbooks']); // same figure, newer series month: a change worth a line
    expect(out.added.sort()).toEqual(['no field term', 'no figure term', 'promotional footballs', 'thunder sticks']);
    expect(out.failed).toEqual(['denied term']);
    expect(out.rejected.map((r) => r.term).sort()).toEqual(['   ', 'fraction', 'negative', 'words']);
    expect(out.file.terms['no figure term']).toEqual({ v: null, f: '2026-10-02', m: null });
    expect(out.file.terms['no field term'].v).toBeNull();
    expect(out.file.terms['custom matchbooks']).toEqual({ v: 9900, f: '2026-10-02', m: '2026-05' });
    expect(out.file.terms['promotional footballs']).toEqual({ v: 90, f: '2026-10-02', m: '2026-05' });
    // A failed lookup that later answers leaves the failed list.
    expect(out.file.failed).toEqual({ 'denied term': { f: '2026-10-02', why: 'The call was refused.' } });
    expect(Object.values(out.file.terms).some((t) => t.v === 0)).toBe(false);
    // The input file is untouched.
    expect(existing.terms['custom matchbooks'].f).toBe('2026-06-01');
  });

  it('a figure is never lost to a failed retry, and an unchanged figure is reported as unchanged', () => {
    const out = mergeLookupResults(existing, { 'custom matchbooks': { error: 'timed out' }, 'thunder sticks': { error: 'refused again' } }, '2026-10-02');
    expect(out.unchanged).toEqual(['custom matchbooks']);
    expect(out.file.terms['custom matchbooks']).toEqual(existing.terms['custom matchbooks']);
    expect(out.file.failed['thunder sticks']).toEqual({ f: '2026-10-02', why: 'refused again' });
    const same = mergeLookupResults(existing, { 'custom matchbooks': { search_volume: 9900, monthly_searches: [{ period: '202602', search_volume: 9900 }] } }, '2026-10-02');
    expect(same.unchanged).toEqual(['custom matchbooks']);
    expect(same.file.terms['custom matchbooks'].f).toBe('2026-10-02');
    expect(() => mergeLookupResults(existing, {}, 'today')).toThrow(/YYYY-MM-DD/);
  });
});

describe('the server loader', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    resetSearchVolumeFileForTests();
  });

  it('a missing file is null; a damaged file is null; a valid file is parsed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auto-123-'));
    dirs.push(dir);
    const missing = join(dir, 'missing.json');
    expect(readSearchVolumeFile(missing)).toBeNull();
    const damaged = join(dir, 'damaged.json');
    writeFileSync(damaged, '{ not json', 'utf8');
    expect(readSearchVolumeFile(damaged)).toBeNull();
    const wrongShape = join(dir, 'wrong.json');
    writeFileSync(wrongShape, '[1,2,3]', 'utf8');
    expect(readSearchVolumeFile(wrongShape)).toBeNull();
    const valid = join(dir, 'valid.json');
    writeFileSync(valid, serializeSearchVolumeFile(file({ 'custom matchbooks': { v: 9900, f: '2026-10-02', m: '2026-05' } })), 'utf8');
    expect(readSearchVolumeFile(valid)?.terms['custom matchbooks']).toEqual({ v: 9900, f: '2026-10-02', m: '2026-05' });
  });

  it('the committed file at the one path is readable and the route reads it through the loader, outside the cached snapshot', () => {
    const committed = readSearchVolumeFile();
    expect(committed).not.toBeNull();
    expect(Object.keys(committed!.terms).length).toBeGreaterThan(0);
    const route = code('app/api/sanity/blog-topics/route.ts');
    expect(route).toContain("from '@/lib/blog-automation/search-volume-file'");
    expect(route).toMatch(/searchVolumes: readSearchVolumeFile\(\),/);
    // It is read in the pool branch's response, after the states are settled, and never passed to anything.
    const at = route.indexOf('searchVolumes: readSearchVolumeFile()');
    expect(at).toBeGreaterThan(route.indexOf('const topics = applyNegativeKeywords('));
    // Exactly one call, and it is that one.
    expect([...route.matchAll(/readSearchVolumeFile\(/g)]).toHaveLength(1);
    expect(route.indexOf('readSearchVolumeFile(')).toBe(at + 'searchVolumes: '.length);
    expect(code('lib/blog-automation/cached-topic-pool.ts')).not.toMatch(/search-volume/);
    expect(code('lib/blog-automation/build-topic-pool.ts')).not.toMatch(/search-volume/);
  });
});

describe('no topic state, count or default order changes because of a volume', () => {
  const topics: Topic[] = pool().map((c) => applyGuard(c, null));
  const settle = () => applyNegativeKeywords(applyWrittenTopics(topics, []), []);

  it('the states and counts are identical with no file, an empty file, and a file putting 99,999 or 0 on every topic', () => {
    const baseline = settle();
    const everyTopicHuge = file(Object.fromEntries(topics.map((t) => [t.query, { v: 99_999, f: '2026-10-02', m: '2026-05' }])));
    const everyTopicZero = file(Object.fromEntries(topics.map((t) => [t.query, { v: 0, f: '2026-10-02', m: '2026-05' }])));
    for (const f of [null, emptySearchVolumeFile(), everyTopicHuge, everyTopicZero]) {
      const index = buildVolumeIndex(f);
      // Every lookup answers, and none of it is an input to anything below.
      expect(topics.map((t) => lookupVolume(t, index) !== null)).toEqual(topics.map(() => f !== null && Object.keys(f.terms).length > 0));
      expect(settle()).toEqual(baseline);
      expect(countTopics(settle())).toEqual(countTopics(baseline));
      expect([...topics].sort(compareTopics).map((t) => t.query)).toEqual([...baseline].sort(compareTopics).map((t) => t.query));
    }
    // Default order is by impressions: footballs, matchbooks, thunder sticks (a blog page ranks: excluded), mini footballs.
    expect(baseline.map((t) => [t.query, t.state])).toEqual([
      ['promotional footballs', 'usable'],
      ['custom matchbooks', 'usable'],
      ['thunder sticks', 'excluded'],
      ['mini football custom', 'usable'],
    ]);
  });

  it('the pool, the guard, the cache and the drafts read never import the volume code', () => {
    for (const rel of [
      'lib/blog-automation/topic-pool.ts',
      'lib/blog-automation/build-topic-pool.ts',
      'lib/blog-automation/cached-topic-pool.ts',
      'lib/blog-automation/written-topics.ts',
      'lib/blog-automation/topic-similarity.ts',
      'lib/blog-automation/build-topic-similarity.ts',
    ]) {
      expect(code(rel), rel).not.toMatch(/search-volume|lookupVolume|searchVolumes/);
    }
  });

  it('the volume code never reads or writes a topic state', () => {
    for (const rel of ['lib/blog-automation/search-volume.ts', 'lib/blog-automation/search-volume-file.ts']) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/\.state\b|\bstate:|applyGuard|applyNegativeKeywords|applyWrittenTopics|countTopics|['"](usable|excluded|blocked)['"]/);
    }
  });

  it('in the panel the figures feed the volume cell, the volume sort and the notice, and nothing else; the default sort never reads them', () => {
    const src = code('sanity/tools/blog-topics-tool.tsx');
    // The derived list the states and counts come from never mentions a volume.
    const derived = src.slice(src.indexOf('const topics = useMemo('), src.indexOf('const counts = useMemo('));
    expect(derived).not.toMatch(/volume/i);
    // The index is built after the counts, from the response, and read in exactly these places.
    expect(src.indexOf('const volumeIndex = useMemo(')).toBeGreaterThan(src.indexOf('const counts = useMemo('));
    const uses = [...src.matchAll(/lookupVolume\(/g)];
    expect(uses).toHaveLength(3); // the coverage count for the notice, the volume sort, the cell
    // The default sort is compareTopics, which lives in topic-pool and cannot see a volume.
    expect(src).toMatch(/default:\s*sorted\.sort\(compareTopics\);/);
    expect(src).toContain("const [sort, setSort] = useState<SortKey>('impressions');");
    // The volume sort is a chosen option and is tie-broken by the default order.
    expect(src).toMatch(/case 'volume': \{[\s\S]*?sorted\.sort\(\(a, b\) => vol\(b\) - vol\(a\) \|\| compareTopics\(a, b\)\);/);
    // The column is labelled as Google Ads searches, and the cell words come from the pure module.
    expect(src).toContain('Searches a month (Google Ads)');
    expect(src).toContain('volumeCellWords(lookup)');
    // The panel never imports the server loader.
    expect(src).not.toContain('search-volume-file');
  });
});
