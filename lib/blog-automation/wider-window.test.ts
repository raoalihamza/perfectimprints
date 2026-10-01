/**
 * AUTO-121: the wider window and the top-7 check, the pure half.
 *
 *   - A search the 16 months add carries its 90-day figures when it has any
 *     ("none" otherwise), its 16-month figures, when it was last seen, and
 *     which window put it in the list; a pool built the old way (no `long`,
 *     no `seenDays`, no `window`) means exactly what it meant.
 *   - The top-7 check: a topic whose own impressions-weighted average position
 *     over the last 90 days is under 8 (with at least the floor of impressions)
 *     is excluded with its own reason; a search with its words in the top 7,
 *     own or a different wording, is reported on the row and changes nothing;
 *     a position seen under the floor is not a rank. The guard's two rules and
 *     the threshold are untouched (their tests are in topic-pool.test.ts).
 *   - The packed cache shape round-trips exactly and is smaller; the budget
 *     trims older topics only, lowest 16-month impressions first, and records
 *     how many it dropped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CANNIBALIZATION_THRESHOLD,
  POOL_IMPRESSIONS_FLOOR,
  POOL_LONG_IMPRESSIONS_FLOOR,
  POOL_LONG_WINDOW_DAYS,
  SEEN_WINDOWS_DAYS,
  alreadyRankingSentence,
  alsoRankingSentence,
  applyGuard,
  applyNegativeKeywords,
  applyWrittenTopics,
  buildTopSevenIndex,
  compactTopic,
  compareTopics,
  countTopics,
  decideGuard,
  expandTopic,
  findTopSevenNow,
  groupIntoTopics,
  isAlreadyRanking,
  packTopics,
  seenDaysLabel,
  seenDaysOf,
  unpackTopics,
  type PoolQuery,
  type Topic,
} from './topic-pool';
import { packSnapshot, unpackSnapshot } from './cached-topic-pool';
import type { TopicPoolSnapshot } from './build-topic-pool';

const ROOT = join(__dirname, '..', '..');

const recent = (query: string, impressions: number, position: number, page: string | null = '/cat/x', long?: PoolQuery['long']): PoolQuery => ({
  query,
  clicks: Math.floor(impressions / 20),
  impressions,
  position,
  page,
  long: long ?? { impressions: impressions * 4, clicks: Math.floor(impressions / 5), position: position + 2 },
  seenDays: 30,
  window: 'recent',
});

const older = (
  query: string,
  longImpressions: number,
  longPosition: number,
  seenDays: PoolQuery['seenDays'] = 365,
  page: string | null = '/cat/x',
  recentNow: { impressions: number; position: number } | null = null,
): PoolQuery => ({
  query,
  clicks: 0,
  impressions: recentNow?.impressions ?? 0,
  position: recentNow?.position ?? null,
  page,
  long: { impressions: longImpressions, clicks: Math.floor(longImpressions / 10), position: longPosition },
  seenDays,
  window: 'older',
});

describe('the numbers AUTO-121 settled', () => {
  it('a fixed 16-month window and its floor at the same rate as the 90-day one', () => {
    expect(POOL_LONG_WINDOW_DAYS).toBe(480);
    expect(POOL_LONG_IMPRESSIONS_FLOOR).toBe(55);
    // 10 per 90 days is 53.3 per 480 days; 55 is that rounded up to five.
    expect(POOL_LONG_IMPRESSIONS_FLOOR).toBeGreaterThanOrEqual(Math.ceil((POOL_IMPRESSIONS_FLOOR * POOL_LONG_WINDOW_DAYS) / 90));
    expect(SEEN_WINDOWS_DAYS).toEqual([30, 90, 180, 365]);
    // The guard's own numbers are untouched.
    expect(CANNIBALIZATION_THRESHOLD).toBe(2);
    expect(POOL_IMPRESSIONS_FLOOR).toBe(10);
  });

  it('the constants are spelled in the pure module only', () => {
    const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
    for (const rel of ['lib/blog-automation/build-topic-pool.ts', 'lib/blog-automation/cached-topic-pool.ts', 'app/api/sanity/blog-topics/route.ts', 'sanity/tools/blog-topics-tool.tsx']) {
      expect(read(rel), rel).not.toMatch(/\b480\b\s*[;,)]|\b55\b\s*[;,)]/);
    }
  });
});

describe('last seen', () => {
  it('is the smallest window with an impression, else the whole 16 months', () => {
    const seenIn = new Map<number, Set<string>>([
      [30, new Set(['a'])],
      [90, new Set(['a', 'b'])],
      [180, new Set(['a', 'b', 'c'])],
      [365, new Set(['a', 'b', 'c', 'd'])],
    ]);
    expect(seenDaysOf('a', seenIn)).toBe(30);
    expect(seenDaysOf('b', seenIn)).toBe(90);
    expect(seenDaysOf('c', seenIn)).toBe(180);
    expect(seenDaysOf('d', seenIn)).toBe(365);
    expect(seenDaysOf('e', seenIn)).toBe(POOL_LONG_WINDOW_DAYS);
  });

  it('has words for every value, none of them a verdict', () => {
    const labels = [30, 90, 180, 365, 480].map((d) => seenDaysLabel(d as 30));
    expect(labels).toEqual(['in the last 30 days', '1 to 3 months ago', '3 to 6 months ago', '6 to 12 months ago', 'over a year ago']);
    for (const l of labels) expect(l).not.toMatch(/stale|dead|old\b|weak|poor/i);
  });
});

describe('grouping with both windows', () => {
  it('a pool built the old way means what it meant: 16-month figures equal the 90-day ones, seen 90, window recent', () => {
    const [t] = groupIntoTopics([
      { query: 'custom mini footballs', clicks: 5, impressions: 617, position: 12, page: '/cat/mini' },
      { query: 'mini football custom', clicks: 1, impressions: 100, position: 20, page: '/cat/mini' },
    ]);
    expect(t.impressions).toBe(717);
    expect(t.position).toBe(13.1);
    expect(t.long).toEqual({ impressions: 717, clicks: 6, position: 13.1 });
    expect(t.seenDays).toBe(90);
    expect(t.window).toBe('recent');
    expect(t.topSevenNow).toBeNull();
    const topic = applyGuard(t, null);
    expect(topic.long).toEqual(t.long);
    expect(topic.window).toBe('recent');
    expect(countTopics([topic])).toMatchObject({ recent: 1, older: 0, excludedAlreadyRanking: 0 });
  });

  it('sums each window over its own members, and the 90-day position is null when nothing was seen in 90 days', () => {
    const [t] = groupIntoTopics([older('promotional megaphones', 300, 14), older('megaphones promotional', 100, 22, 180)]);
    expect(t.impressions).toBe(0);
    expect(t.clicks).toBe(0);
    expect(t.position).toBeNull();
    expect(t.long).toEqual({ impressions: 400, clicks: 40, position: 16 });
    expect(t.seenDays).toBe(180);
    expect(t.window).toBe('older');
  });

  it('a search the 16 months add joins the 90-day topic with its words, and the topic stays recent', () => {
    const [t] = groupIntoTopics([recent('custom pens', 200, 15), older('pens custom', 800, 12, 365)]);
    expect(t.query).toBe('custom pens');
    expect(t.variants).toEqual(['custom pens', 'pens custom']);
    expect(t.impressions).toBe(200);
    expect(t.position).toBe(15);
    expect(t.long.impressions).toBe(1600);
    expect(t.window).toBe('recent');
    expect(t.seenDays).toBe(30);
  });

  it('an older search with a few 90-day impressions keeps them, and the older topic sorts after the recent ones', () => {
    const faded: PoolQuery = { ...older('custom whistles', 700, 18, 30), impressions: 4, clicks: 0, position: 55.3 };
    const topics = groupIntoTopics([faded, recent('custom pens', 12, 15), older('custom ducks', 900, 12)]);
    expect(topics.map((t) => t.query)).toEqual(['custom pens', 'custom whistles', 'custom ducks']);
    expect(topics[1].position).toBe(55.3);
    expect(topics[1].window).toBe('older');
    // Among topics with no 90-day impressions, 16-month impressions decide.
    expect([...topics].sort(compareTopics).map((t) => t.query)).toEqual(['custom pens', 'custom whistles', 'custom ducks']);
  });
});

describe('the top-7 check', () => {
  const index = buildTopSevenIndex([
    { query: 'value calendars', position: 6.0, impressions: 233, page: '/cat/calendars' },
    { query: 'rubber duck', position: 2.1, impressions: 49, page: '/blog/10-facts-rubber-ducks' },
    { query: 'custom whistles with logo', position: 2.0, impressions: 1, page: '/cat/whistles' },
    { query: 'custom match books', position: 5.5, impressions: 30, page: '/cat/matches' },
    { query: 'custom pens', position: 12, impressions: 500, page: '/cat/pens' },
  ]);

  it('indexes only positions under 8 with at least the floor of impressions', () => {
    expect(index.get('k:calendar value')).toHaveLength(1);
    expect(index.get('k:whistle')).toBeUndefined();
    expect(index.get('k:pen')).toBeUndefined();
  });

  it('a topic already in the top 7 on average over the last 90 days is excluded with its own rule and sentence, and counted', () => {
    // An added topic (16-month average 14.5, in the band) that now sits at 6.0 with 233 impressions.
    const [c] = groupIntoTopics([older('value calendars', 969, 14.5, 30, '/cat/calendars', { impressions: 233, position: 6.0 })]);
    expect(isAlreadyRanking(c)).toBe(true);
    c.topSevenNow = findTopSevenNow(c, index);
    expect(c.topSevenNow).toEqual({ query: 'value calendars', position: 6, impressions: 233, page: '/cat/calendars', own: true });
    const t = applyGuard(c, null);
    expect(t.state).toBe('excluded');
    expect(t.rule).toBe('already-ranking');
    expect(t.reason).toBe(alreadyRankingSentence(t));
    expect(t.reason).toBe('You already rank in the top 7 for this topic (average position 6.0 over 233 impressions in the last 90 days, best for "value calendars" at 6.0 with /cat/calendars), so it is not an opportunity.');
    expect(countTopics([t]).excludedAlreadyRanking).toBe(1);
    // The guard's own decision for the same candidate is untouched: usable.
    expect(decideGuard(c, null).state).toBe('usable');
    // It needs nothing but the topic's own 90-day figures: without the top-7 search it still fires.
    const bare = applyGuard({ ...c, topSevenNow: null }, null);
    expect(bare.rule).toBe('already-ranking');
    expect(bare.reason).toContain('average position 6.0 over 233 impressions');
  });

  it('one small wording in the top 7 does not tip a topic whose average stays in the band', () => {
    // "custom imprint" 432 at 19.3 with "for imprint" 20 at 2.4 merged in: weighted 18.6, usable.
    const [c] = groupIntoTopics([recent('custom imprint', 432, 19.3), older('for imprint', 200, 12, 30, '/', { impressions: 20, position: 2.4 })]);
    expect(c.position).toBe(18.6);
    expect(isAlreadyRanking(c)).toBe(false);
    c.topSevenNow = findTopSevenNow(c, buildTopSevenIndex([{ query: 'for imprint', position: 2.4, impressions: 20, page: '/' }]));
    expect(c.topSevenNow?.own).toBe(true);
    const t = applyGuard(c, null);
    expect(t.state).toBe('usable');
    expect(alsoRankingSentence(t.topSevenNow!)).toContain('You also rank in the top 7 for the search "for imprint"');
  });

  it('"own" means the exact search: a spacing variant not in the pool is found, but as a different wording', () => {
    // The spacing key also folds the generic words, so it would call "rubber
    // duck" an own search of "custom rubber ducks"; the exact search is the
    // only safe reading, and the variant is still reported on the row.
    const [c] = groupIntoTopics([older('custom matchbooks', 720, 12)]);
    c.topSevenNow = findTopSevenNow(c, index);
    expect(c.topSevenNow?.own).toBe(false);
    expect(c.topSevenNow?.query).toBe('custom match books');
    expect(applyGuard(c, null).state).toBe('usable');
    // When the variant is in the pool it is one of the topic's searches, and own;
    // with its 30 impressions at 5.5 the topic's own average is 5.5, so excluded.
    const [merged] = groupIntoTopics([older('custom matchbooks', 720, 12), older('custom match books', 60, 12, 30, '/cat/matches', { impressions: 30, position: 5.5 })]);
    merged.topSevenNow = findTopSevenNow(merged, index);
    expect(merged.topSevenNow?.own).toBe(true);
    expect(applyGuard(merged, null).rule).toBe('already-ranking');
  });

  it('a DIFFERENT wording in the top 7 is reported and changes nothing', () => {
    const [c] = groupIntoTopics([recent('custom rubber ducks', 1503, 23.4)]);
    c.topSevenNow = findTopSevenNow(c, index);
    expect(c.topSevenNow).toEqual({ query: 'rubber duck', position: 2.1, impressions: 49, page: '/blog/10-facts-rubber-ducks', own: false });
    const t = applyGuard(c, null);
    expect(t.state).toBe('usable');
    expect(t.rule).toBeNull();
    expect(t.reason).toBeNull();
    expect(alsoRankingSentence(t.topSevenNow!)).toContain('You also rank in the top 7 for the different wording "rubber duck"');
    expect(countTopics([t])).toMatchObject({ usable: 1, excludedAlreadyRanking: 0 });
  });

  it('a position seen under the floor is not a rank', () => {
    const [c] = groupIntoTopics([older('custom whistles with logo', 61, 21.8, 30, '/cat/whistles', { impressions: 1, position: 2.0 })]);
    expect(findTopSevenNow(c, index)).toBeNull();
    expect(isAlreadyRanking(c)).toBe(false);
    expect(applyGuard(c, null).state).toBe('usable');
  });

  it('when the guard already excluded the topic, its rule stays and the sentence is appended', () => {
    const [c] = groupIntoTopics([older('value calendars', 969, 14.5, 30, '/blog/calendar-ideas', { impressions: 233, position: 6.0 })]);
    c.topSevenNow = findTopSevenNow(c, index);
    const t = applyGuard(c, null);
    expect(t.rule).toBe('ranking-page');
    expect(t.reason).toContain('/blog/calendar-ideas already ranks');
    expect(t.reason).toContain('You already rank in the top 7');
  });

  it('a block still wins, and unblocking restores the already-ranking verdict; a draft is reported first', () => {
    const [c] = groupIntoTopics([older('value calendars', 969, 14.5, 30, '/cat/calendars', { impressions: 233, position: 6.0 })]);
    c.topSevenNow = findTopSevenNow(c, index);
    const t = applyGuard(c, null);
    const blocked = applyNegativeKeywords([t], [{ term: 'value calendars', scope: 'topic' }]);
    expect(blocked[0].state).toBe('blocked');
    expect(applyNegativeKeywords(blocked, [])[0]).toMatchObject({ state: 'excluded', rule: 'already-ranking' });
    const written = applyWrittenTopics([t], [{ documentId: 'd1', title: 'Calendars', status: 'draft', via: 'recorded', queries: ['value calendars'] }]);
    expect(written[0].rule).toBe('already-written');
    expect(written[0].reason?.startsWith('You already generated a draft')).toBe(true);
    expect(written[0].reason).toContain('You already rank in the top 7');
  });

  it('survives the cached shape', () => {
    const [c] = groupIntoTopics([older('value calendars', 969, 14.5, 30, '/cat/calendars', { impressions: 233, position: 6.0 })]);
    c.topSevenNow = findTopSevenNow(c, index);
    const t = applyGuard(c, null);
    expect(expandTopic(compactTopic(t))).toEqual(t);
    const [d] = groupIntoTopics([recent('custom rubber ducks', 1503, 23.4)]);
    d.topSevenNow = findTopSevenNow(d, index);
    const u = applyGuard(d, null);
    expect(expandTopic(compactTopic(u))).toEqual(u);
    // Nothing in the top 7 means nothing stored.
    const plain = applyGuard(groupIntoTopics([recent('custom pens', 12, 15)])[0], null);
    expect(compactTopic(plain)).not.toHaveProperty('topSevenNow');
    expect(compactTopic(plain)).not.toHaveProperty('window');
  });
});

describe('the packed cache shape', () => {
  const build = (): Topic[] => {
    const hit = { sharedTokens: ['drink', 'tokens'], postTitle: 'Free Drink Tokens', postHref: '/blog/free-drink-tokens' };
    const candidates = groupIntoTopics([
      recent('drink tokens', 758, 12.2, '/blog/free-drink-tokens'),
      recent('drink token ideas', 40, 15, '/blog/free-drink-tokens'),
      recent('custom matchbooks', 720, 12, '/cat/matches'),
      recent('custom match books', 44, 14, '/cat/matches'),
      older('value calendars', 969, 14.5, 30, '/cat/calendars', { impressions: 233, position: 6.0 }),
      older('promotional megaphones', 300, 14, 365, null),
    ]);
    const index = buildTopSevenIndex([{ query: 'value calendars', position: 6, impressions: 233, page: '/cat/calendars' }]);
    for (const c of candidates) c.topSevenNow = findTopSevenNow(c, index);
    return candidates.map((c) => applyGuard(c, c.query === 'drink tokens' ? hit : null));
  };

  it('round-trips exactly, writing each post and page once', () => {
    const topics = build();
    const compact = topics.map(compactTopic);
    const packed = packTopics(compact);
    expect(unpackTopics(packed)).toEqual(compact);
    expect(unpackTopics(packed).map((c) => expandTopic(c))).toEqual(topics);
    expect(packed.posts).toEqual([{ title: 'Free Drink Tokens', href: '/blog/free-drink-tokens' }]);
    expect(new Set(packed.pages).size).toBe(packed.pages.length);
    expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(compact).length);
  });

  const snapshot = (topics: Topic[]): TopicPoolSnapshot => ({
    generatedAt: '2026-10-01T10:00:00.000Z',
    property: 'https://www.perfectimprints.com/',
    window: { start: '2026-07-04', end: '2026-10-01', days: 90 },
    floor: 10,
    longWindow: { start: '2025-06-09', end: '2026-10-01', days: 480, floor: 55 },
    band: { low: 8, high: 40 },
    threshold: 2,
    publishedPosts: 1,
    gsc: { allQueries: 6, poolQueries: 4, queryPages: 1, queryPagePages: 1, queryPageRows: 6, longQueries: 6, longPoolQueries: 2, longQueryPages: 1, addedQueries: 2, pageRequests: 1, pageRequestRows: 2, requests: 8 },
    topics,
    buildMs: 1,
  });

  it('within budget nothing is dropped and the bytes are recorded', () => {
    const entry = packSnapshot(snapshot(build()));
    expect(entry.omittedOlderTopics).toBe(0);
    expect(entry.cacheBytes).toBe(JSON.stringify({ ...entry, cacheBytes: 0 }).length);
    const back = unpackSnapshot(entry);
    expect(back.topics).toEqual(build());
    expect(back.cacheBytes).toBe(entry.cacheBytes);
  });

  it('over budget it drops OLDER topics only, fewest 16-month impressions first, and counts them', () => {
    const full = packSnapshot(snapshot(build()));
    const entry = packSnapshot(snapshot(build()), full.cacheBytes - 1);
    expect(entry.omittedOlderTopics).toBeGreaterThan(0);
    expect(entry.cacheBytes).toBeLessThan(full.cacheBytes);
    const kept = unpackSnapshot(entry).topics;
    // The recent topics are all still there; the first older topic gone is the smallest one.
    expect(kept.filter((t) => t.window === 'recent')).toHaveLength(2);
    expect(kept.map((t) => t.query)).not.toContain('promotional megaphones');
    // Squeezed to nothing: every older topic goes, no recent one ever does.
    const tiny = packSnapshot(snapshot(build()), 10);
    expect(tiny.omittedOlderTopics).toBe(2);
    expect(unpackSnapshot(tiny).topics.map((t) => t.window)).toEqual(['recent', 'recent']);
  });
});
