/**
 * AUTO-119 part 1: topics that differ only by spacing are one topic, and
 * nothing Patrick has stored changes meaning because of it.
 *
 *   - "custom match books" / "custom matchbooks" / "custom match-books" merge;
 *     spelling variants ("koozies" / "coozies") deliberately do not.
 *   - The per-query key (`queryTopicKey`) is unchanged, so every stored record
 *     and block still keys exactly as it did; a merged topic answers to every
 *     one of its spellings' keys.
 *   - A merged topic is excluded when ANY spelling was (the tokenizer blind
 *     spot the merge exists for), and the verdict survives the cached shape.
 *   - A pool with no spacing variants groups byte for byte as before.
 */
import { describe, expect, it } from 'vitest';

import {
  applyGuard,
  applyNegativeKeywords,
  applyWrittenTopics,
  blockRuleMatches,
  buildSourceTopicRecord,
  compactTopic,
  expandTopic,
  findWrittenTopic,
  groupIntoTopics,
  queryTopicKey,
  spacingKey,
  topicBlockRule,
  topicKeys,
  topicsBlockedByWord,
  writtenTopicSources,
  type PoolQuery,
  type Topic,
} from './topic-pool';

const q = (query: string, impressions: number, page: string | null = '/cat/matches'): PoolQuery => ({
  query,
  clicks: 0,
  impressions,
  position: 15,
  page,
});

describe('spacingKey', () => {
  it('ignores spaces and hyphens between words, and plurals', () => {
    expect(spacingKey('custom matchbooks')).toBe('matchbook');
    expect(spacingKey('custom match books')).toBe('matchbook');
    expect(spacingKey('custom match-books')).toBe('matchbook');
    expect(spacingKey('custom yard sticks')).toBe(spacingKey('custom yardsticks'));
    expect(spacingKey('engraved sun glasses')).toBe(spacingKey('engraved sunglasses'));
  });

  it('leaves spelling variants alone: they differ by letters, not spaces', () => {
    expect(spacingKey('custom koozies')).not.toBe(spacingKey('custom coozies'));
    expect(spacingKey('thunderstix')).not.toBe(spacingKey('thunder sticks'));
  });

  it('does not change the per-query key, which records and blocks rely on', () => {
    expect(queryTopicKey('custom match books')).toBe('book match');
    expect(queryTopicKey('custom matchbooks')).toBe('matchbook');
  });
});

describe('groupIntoTopics with the spacing merge', () => {
  const pool = [
    q('custom matchbooks', 720),
    q('custom match books', 44, '/cat/matches-2'),
    q('matchbooks custom', 48),
    q('custom toothpicks', 375, '/cat/toothpicks'),
  ];

  it('merges the spellings into one topic whose main spelling is the highest-impression search', () => {
    const topics = groupIntoTopics(pool);
    expect(topics).toHaveLength(2);
    const t = topics[0];
    expect(t.key).toBe('matchbook');
    expect(t.query).toBe('custom matchbooks');
    expect(t.page).toBe('/cat/matches');
    expect(t.impressions).toBe(720 + 44 + 48);
    expect(t.variants).toEqual(['custom matchbooks', 'matchbooks custom', 'custom match books']);
    expect(t.spacingGroups).toEqual([
      { key: 'book match', query: 'custom match books', page: '/cat/matches-2', sharedTokens: [], matchedPost: null },
    ]);
    expect(topicKeys(t)).toEqual(['matchbook', 'book match']);
  });

  it('merges transitively, and word order still never splits a topic', () => {
    const topics = groupIntoTopics([
      q('thunder sticks noise maker', 58),
      q('thunderstick noisemakers', 112),
      q('thunder sticks noisemakers', 35),
      q('noisemakers thunderstick', 20),
    ]);
    expect(topics).toHaveLength(1);
    expect(topics[0].query).toBe('thunderstick noisemakers');
    expect(topicKeys(topics[0]).sort()).toEqual(['maker noise stick thunder', 'noisemaker stick thunder', 'noisemaker thunderstick']);
  });

  it('mergeSpacing: false reproduces the AUTO-110 grouping', () => {
    expect(groupIntoTopics(pool, { mergeSpacing: false })).toHaveLength(3);
  });

  it('a pool with no spacing variants groups exactly as before', () => {
    const plain = [q('custom pens', 900), q('pens custom', 50), q('custom mugs', 300)];
    expect(groupIntoTopics(plain)).toEqual(groupIntoTopics(plain, { mergeSpacing: false }));
    expect(groupIntoTopics(plain).every((t) => t.spacingGroups!.length === 0)).toBe(true);
  });
});

describe('the guard on a merged topic', () => {
  const [candidate] = groupIntoTopics([q('custom powerbanks', 27, '/cat/power-banks-chargers'), q('custom branded power banks', 13, '/cat/power-banks-chargers')]);
  const withHit = {
    ...candidate,
    spacingGroups: candidate.spacingGroups!.map((g) => ({
      ...g,
      sharedTokens: ['power', 'banks'],
      matchedPost: { title: 'Power Banks Post', href: '/blog/power-banks' },
    })),
  };

  it('is excluded when a folded-in spelling was, with a reason naming that spelling', () => {
    const t = applyGuard(withHit, null);
    expect(t.state).toBe('excluded');
    expect(t.rule).toBe('shared-tokens');
    expect(t.reason).toContain('The same search spaced differently, "custom branded power banks"');
    expect(t.reason).toContain('Power Banks Post');
    // The main spelling's own detector result is kept where it was.
    expect(t.sharedTokens).toEqual([]);
    expect(t.matchedPost).toBeNull();
  });

  it('a ranking blog page on a folded-in spelling excludes too (rule two)', () => {
    const [c] = groupIntoTopics([q('custom noise makers', 283, '/cat/noise-makers'), q('custom noisemakers', 195, '/blog/noisemakers')]);
    const t = applyGuard(c, null);
    expect(t.state).toBe('excluded');
    expect(t.rule).toBe('ranking-page');
  });

  it('round-trips through the cached shape to the same verdict', () => {
    const t = applyGuard(withHit, null);
    expect(expandTopic(compactTopic(t))).toEqual(t);
    const plain = applyGuard(groupIntoTopics([q('custom pens', 10)])[0], null);
    expect(compactTopic(plain)).not.toHaveProperty('spacingGroups');
    expect(expandTopic(compactTopic(plain))).toEqual(plain);
  });
});

describe('records and blocks written before the merge still match', () => {
  const merged: Topic = applyGuard(groupIntoTopics([q('custom matchbooks', 720), q('custom match books', 44)])[0], null);

  it('a draft recorded under the old spelling excludes the merged topic', () => {
    const sources = writtenTopicSources([
      { _id: 'drafts.a', title: 'Match Books Post', sourceTopic: { query: 'custom match books', variants: ['custom match books'] } },
    ]);
    expect(findWrittenTopic(merged, sources)?.documentId).toBe('a');
    const [t] = applyWrittenTopics([merged], sources);
    expect(t.state).toBe('excluded');
    expect(t.rule).toBe('already-written');
  });

  it('a topic block and a word block written for the old spelling still block', () => {
    expect(blockRuleMatches(merged, { term: 'custom match books', scope: 'topic' })).toBe(true);
    expect(blockRuleMatches(merged, { term: 'match books', scope: 'word' })).toBe(true);
    expect(applyNegativeKeywords([merged], ['match books'])[0].state).toBe('blocked');
    expect(topicsBlockedByWord([merged], 'match books')).toHaveLength(1);
    // And the tick on the merged row writes its main search, which matches it.
    expect(blockRuleMatches(merged, topicBlockRule(merged))).toBe(true);
  });

  it('an unrelated block still does not block it', () => {
    expect(blockRuleMatches(merged, { term: 'custom toothpicks', scope: 'topic' })).toBe(false);
    expect(blockRuleMatches(merged, { term: 'toothpicks', scope: 'word' })).toBe(false);
  });

  it('a new record names every spelling, so it keeps matching whatever the grouping does next', () => {
    const record = buildSourceTopicRecord(merged, '2026-09-28T00:00:00.000Z');
    expect(record.variants.slice(0, 2)).toEqual(['custom matchbooks', 'custom match books']);
    const sources = writtenTopicSources([{ _id: 'x', title: 'X', sourceTopic: record }]);
    const unmerged = groupIntoTopics([q('custom matchbooks', 720), q('custom match books', 44)], { mergeSpacing: false }).map((c) => applyGuard(c, null));
    expect(applyWrittenTopics(unmerged, sources).every((t) => t.rule === 'already-written')).toBe(true);
  });
});
