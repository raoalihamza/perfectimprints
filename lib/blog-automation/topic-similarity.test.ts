/**
 * AUTO-119 part 2: the "closest wording" figures are ADVISORY.
 *
 *   - The arithmetic: nearest topics exclude the topic itself, closest first,
 *     plus the closest post; scores shown 0 to 100.
 *   - No topic's state can change because of a score: the figures are built
 *     from each topic's key and search only, the pool and guard modules never
 *     import this one, and the route's `pool` branch never calls it. Asserted
 *     both behaviourally (every state and count identical whatever the
 *     figures say) and structurally (the imports), because either alone could
 *     be defeated by a later edit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyGuard, applyNegativeKeywords, applyWrittenTopics, countTopics, groupIntoTopics } from './topic-pool';
import {
  computeNeighbourRows,
  cosineSimilarity,
  displayScore,
  expandSimilarity,
  type CompactTopicSimilarity,
} from './topic-similarity';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
/** Source with comments removed, so a word in a comment cannot satisfy or trip a check. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the arithmetic', () => {
  it('scores 0 to 100 and never outside it', () => {
    expect(displayScore(0.859)).toBe(86);
    expect(displayScore(1.2)).toBe(100);
    expect(displayScore(-0.3)).toBe(0);
    expect(displayScore(Number.NaN)).toBe(0);
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 3])).toBeCloseTo(0);
  });

  it('lists the closest OTHER topics, closest first, and the closest post', () => {
    const topics = [
      [1, 0, 0],
      [0.9, 0.1, 0],
      [0, 1, 0],
      [0.7, 0.7, 0],
    ];
    const posts = [
      [0, 0, 1],
      [1, 0.05, 0],
    ];
    const rows = computeNeighbourRows(topics, posts, 2);
    // Topic 0: nearest is 1, then 3; never itself.
    expect(rows[0][0]).toBe(1);
    expect(rows[0][2]).toBe(3);
    expect(rows[0].filter((_, i) => i % 2 === 0 && i < 4)).not.toContain(0);
    // Closest post for topic 0 is post 1.
    expect(rows[0][4]).toBe(1);
    expect(rows[0][5]).toBeGreaterThan(0.99);
  });

  it('expands the compact entry into the per-topic figures the panel shows', () => {
    const compact: CompactTopicSimilarity = {
      generatedAt: 'g',
      model: 'm',
      dimensions: 3,
      texts: 3,
      calls: 1,
      promptTokens: 9,
      costUsd: 0,
      buildMs: 1,
      topicKeys: ['a', 'b'],
      topicQueries: ['custom a', 'custom b'],
      posts: [{ title: 'Post', href: '/blog/p' }],
      rows: [
        [1, 0.912, 0, 0.705],
        [0, 0.912, -1, 0],
      ],
    };
    const out = expandSimilarity(compact);
    expect(out.byKey.a).toEqual({ topics: [{ key: 'b', query: 'custom b', score: 91 }], post: { title: 'Post', href: '/blog/p', score: 71 } });
    expect(out.byKey.b.post).toBeNull();
    expect(out).not.toHaveProperty('rows');
  });
});

describe('no topic state changes because of a similarity score', () => {
  const candidates = groupIntoTopics([
    { query: 'custom sunglasses', clicks: 0, impressions: 900, position: 12, page: '/cat/sunglasses' },
    { query: 'custom engraved sunglasses', clicks: 0, impressions: 180, position: 14, page: '/cat/sunglasses' },
    { query: 'custom printed lens sunglasses', clicks: 0, impressions: 126, position: 16, page: '/cat/sunglasses' },
    { query: 'sunglasses tips', clicks: 0, impressions: 40, position: 20, page: '/blog/sunglasses-tips' },
  ]);

  it('the states and counts are identical whether the figures say every topic is a 99 duplicate or a 0 stranger', () => {
    const topics = candidates.map((c) => applyGuard(c, null));
    const settle = () => applyNegativeKeywords(applyWrittenTopics(topics, []), []);
    const baseline = settle();
    const n = topics.length;
    const identical = computeNeighbourRows(
      topics.map(() => [1, 0]),
      [[1, 0]],
    );
    const opposite = computeNeighbourRows(
      topics.map((_, i) => [Math.cos(i), Math.sin(i)]),
      [[0, 1]],
    );
    for (const rows of [identical, opposite]) {
      expect(rows).toHaveLength(n);
      // Nothing takes the figures as input: recomputing gives the same answer.
      expect(settle()).toEqual(baseline);
      expect(countTopics(settle())).toEqual(countTopics(baseline));
    }
    expect(baseline.map((t) => t.state)).toEqual(['usable', 'usable', 'usable', 'excluded']);
  });

  it('the pool, the guard and the drafts read never import the similarity code', () => {
    for (const rel of [
      'lib/blog-automation/topic-pool.ts',
      'lib/blog-automation/build-topic-pool.ts',
      'lib/blog-automation/written-topics.ts',
    ]) {
      expect(code(rel), rel).not.toMatch(/topic-similarity|build-topic-similarity|embedTexts/);
    }
  });

  it('the similarity code never reads or writes a topic state', () => {
    for (const rel of ['lib/blog-automation/topic-similarity.ts', 'lib/blog-automation/build-topic-similarity.ts']) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/\.state\b|\bstate:|applyGuard|applyNegativeKeywords|applyWrittenTopics|['"](usable|excluded|blocked)['"]/);
      expect(src, rel).not.toMatch(/from '\.\/topic-pool'/);
    }
  });

  it("the route's pool branch never calls the similarity; only the separate `similar` branch does", () => {
    const src = code('app/api/sanity/blog-topics/route.ts');
    const similarBranch = src.indexOf("if (action === 'similar')");
    const poolBranch = src.indexOf('getCachedTopicPoolSnapshot(),', similarBranch);
    expect(similarBranch).toBeGreaterThan(-1);
    expect(poolBranch).toBeGreaterThan(similarBranch);
    // Exactly one call site, and it sits before the pool branch begins.
    const calls = [...src.matchAll(/getCachedTopicSimilarity\(/g)].map((m) => m.index!);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeGreaterThan(similarBranch);
    expect(calls[0]).toBeLessThan(poolBranch);
  });

  it('in the panel the figures feed the Closest wording cell and nothing else', () => {
    const src = code('sanity/tools/blog-topics-tool.tsx');
    const uses = [...src.matchAll(/similarity\.data/g)];
    expect(uses).toHaveLength(1);
    expect(src).toMatch(/const figures = similarity\.status === 'ready' \? similarity\.data\.byKey\[t\.key\] : undefined;/);
    // And that value reaches exactly one component, the cell (AUTO-121 also tells it when the topic is past the cap).
    expect([...src.matchAll(/\{figures\}/g)]).toHaveLength(1);
    expect(src).toMatch(/<ClosestWording figures=\{figures\} notCovered=\{similarity\.status === 'ready' && figures === undefined\}/);
    // The derived list the states come from never mentions it.
    const derived = src.slice(src.indexOf('const topics = useMemo('), src.indexOf('const counts = useMemo('));
    expect(derived).not.toMatch(/similar/i);
  });
});
