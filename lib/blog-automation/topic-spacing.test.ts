/**
 * FIX-920 Part 4: the order topics are taken in, spaced by product.
 *
 * The default order is impressions, and three of the first seven usable
 * topics are pens. The rule: take the first topic in the queue whose product
 * was not written in the last PRODUCT_SPACING_GAP posts; yield when nothing
 * else is left; optionally prefer a different title shape among the first
 * few topics that pass. Measured figures are in CLAUDE.md (FIX-920).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stableHash } from './blog-shape';
import { clusterStats, PRODUCT_SPACING_GAP, productKeyOf, SHAPE_LOOKAHEAD, spaceTopics } from './topic-spacing';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

interface T { q: string; key: string | null; shape: string }
const t = (q: string, key: string | null, shape = 'guide'): T => ({ q, key, shape });
const keyOf = (x: T) => x.key;
const shapeOf = (x: T) => x.shape;
const names = (list: T[]) => list.map((x) => x.q);

/**
 * Positions where a product repeats inside the gap although a topic with an
 * allowed product was still waiting: a broken rule. A repeat with nothing
 * else left to take is the rule yielding, which it must.
 */
function unforcedRepeats(out: T[], gap: number): number {
  let bad = 0;
  for (let i = 1; i < out.length; i += 1) {
    const recent = out.slice(Math.max(0, i - gap), i).map(keyOf);
    if (out[i].key === null || !recent.includes(out[i].key)) continue;
    if (out.slice(i).some((x) => x.key === null || !recent.includes(x.key))) bad += 1;
  }
  return bad;
}

/** The head of the real queue on 2026-10-13, with the products and shapes it measured. */
const HEAD: T[] = [
  t('custom pens', 'pen', 'guide'),
  t('custom flying discs', 'disc', 'guide'),
  t('imprinted promotional products', 'product', 'question'),
  t('promotional matches', 'match', 'guide'),
  t('promotional pens plymouth logo printing', 'pen', 'list'),
  t('wholesale megaphones', 'megaphone', 'guide'),
  t('business pens', 'pen', 'guide'),
  t('promotional pedometers', 'pedometer', 'question'),
  t('custom matchbooks', 'match', 'question'),
  t('custom sunscreen', 'sunscreen', 'list'),
  t('custom bike bottles', 'bottle', 'question'),
  t('promotional hand fans', 'fan', 'list'),
  t('promotional coasters', 'coaster', 'list'),
  t('custom toothpicks', 'toothpick', 'question'),
  t('custom acrylic tumblers', 'tumbler', 'question'),
  t('custom imprint', 'match', 'guide'),
  t('custom noise makers', 'maker', 'question'),
  t('branded clipboards', 'clipboard', 'question'),
  t('foam footballs', 'football', 'question'),
  t('promotional tool kits', 'kit', 'guide'),
];

describe('productKeyOf: the product a topic is about', () => {
  it('is the head noun of the category it resolved to, whatever the topic ends in', () => {
    expect(productKeyOf('custom pens', 'pens')).toBe('pen');
    expect(productKeyOf('promotional pens plymouth logo printing', 'pens')).toBe('pen');
    expect(productKeyOf('ink pens with logo', 'pens')).toBe('pen');
    expect(productKeyOf('custom tote bags', 'tote-bags')).toBe('bag');
    expect(productKeyOf('custom gym bags for team members', 'duffle-gym-bags')).toBe('bag');
    expect(productKeyOf('imprinted sports bottles', 'water-bottles')).toBe('bottle');
    expect(productKeyOf('custom matchbooks', 'matches')).toBe('match');
    expect(productKeyOf('promotional matches', 'matches')).toBe('match');
  });
  it('is the topic own product noun when it resolved to no category', () => {
    expect(productKeyOf('foam footballs', null)).toBe('football');
    expect(productKeyOf('small footballs')).toBe('football');
    expect(productKeyOf('custom bike bottles', null)).toBe('bottle');
    // A trailing "with ..." or "for ..." is not the product.
    expect(productKeyOf('frisbees with logo', null)).toBe('frisbee');
  });
  it('is null when the topic names no product at all, and such a topic is never held back', () => {
    expect(productKeyOf('custom promotional', null)).toBeNull();
    expect(productKeyOf('', null)).toBeNull();
    const out = spaceTopics([t('a', null), t('b', null), t('c', null)], { keyOf });
    expect(names(out)).toEqual(['a', 'b', 'c']);
  });
});

describe('spaceTopics: no product twice within the gap', () => {
  it('the head of the real queue: the three pens of the first seven are spread, and nothing else moves out of order', () => {
    expect(clusterStats(HEAD.map(keyOf)).withinWindow).toBe(4); // pens twice, matches twice
    const out = spaceTopics(HEAD, { keyOf });
    expect(clusterStats(out.map(keyOf)).withinWindow).toBe(0);
    const pens = out.map((x, i) => (x.key === 'pen' ? i : -1)).filter((i) => i >= 0);
    expect(pens).toEqual([0, 8, 16]);
    // A topic that is not held back keeps its place relative to every other such topic.
    const others = out.filter((x) => x.key !== 'pen' && x.key !== 'match');
    expect(names(others)).toEqual(names(HEAD.filter((x) => x.key !== 'pen' && x.key !== 'match')));
  });

  it('is a permutation: every topic once, none dropped, and the same input gives the same order', () => {
    const out = spaceTopics(HEAD, { keyOf });
    expect(out).toHaveLength(HEAD.length);
    expect(new Set(names(out)).size).toBe(HEAD.length);
    expect([...names(out)].sort()).toEqual([...names(HEAD)].sort());
    expect(names(spaceTopics(HEAD, { keyOf }))).toEqual(names(out));
  });

  it('yields instead of stalling: when every topic left is too recent the queue order is taken', () => {
    const pens = [t('a pens', 'pen'), t('b pens', 'pen'), t('c pens', 'pen')];
    expect(names(spaceTopics(pens, { keyOf }))).toEqual(['a pens', 'b pens', 'c pens']);
    // One other topic is used where it helps; the rest still come out, in order.
    expect(names(spaceTopics([...pens, t('mugs', 'mug')], { keyOf, gap: 1 }))).toEqual(['a pens', 'mugs', 'b pens', 'c pens']);
  });

  it('a gap of 0 is the queue as given', () => {
    expect(names(spaceTopics(HEAD, { keyOf, gap: 0 }))).toEqual(names(HEAD));
  });

  it('respects the posts already written, so the first pick of a run is not yesterday product', () => {
    const next = spaceTopics(HEAD, { keyOf, recentKeys: ['pen', 'disc'], limit: 2 });
    expect(names(next)).toEqual(['imprinted promotional products', 'promotional matches']);
    // Only the last `gap` written posts count.
    const old = spaceTopics(HEAD, { keyOf, gap: 2, recentKeys: ['pen', 'mug', 'cap'], limit: 1 });
    expect(names(old)).toEqual(['custom pens']);
  });

  it('a limit returns the next posts without walking the whole queue order differently', () => {
    const all = spaceTopics(HEAD, { keyOf });
    expect(names(spaceTopics(HEAD, { keyOf, limit: 2 }))).toEqual(names(all).slice(0, 2));
    expect(names(spaceTopics(HEAD, { keyOf, limit: 9 }))).toEqual(names(all).slice(0, 9));
    expect(spaceTopics(HEAD, { keyOf, limit: 0 })).toEqual([]);
  });

  it('holds on a long queue with a dominant product: no repeat within the gap, nothing lost', () => {
    // 600 topics over 40 products, one of them (pens) a fifth of the first hundred.
    const queue: T[] = Array.from({ length: 600 }, (_, i) => {
      const h = stableHash(`topic-${i}`);
      const key = i < 100 && h % 5 === 0 ? 'pen' : `product-${h % 40}`;
      return t(`topic ${i}`, key, ['list', 'guide', 'question'][stableHash(`shape-${i}`) % 3]);
    });
    expect(clusterStats(queue.map(keyOf)).withinWindow).toBeGreaterThan(50);
    const out = spaceTopics(queue, { keyOf });
    expect(new Set(names(out)).size).toBe(600);
    // The rule may yield only at the very end, when few products are left.
    expect(clusterStats(out.slice(0, 560).map(keyOf)).withinWindow).toBe(0);
    expect(unforcedRepeats(out, PRODUCT_SPACING_GAP)).toBe(0);
    expect(unforcedRepeats(spaceTopics(queue, { keyOf, shapeOf }), PRODUCT_SPACING_GAP)).toBe(0);
  });
});

describe('spaceTopics with shapes: a different shape preferred, the product rule first', () => {
  it('product spacing alone ignores shapes', () => {
    const a = spaceTopics(HEAD, { keyOf });
    const b = spaceTopics(HEAD, { keyOf, shapeOf, lookahead: 1 });
    expect(names(b)).toEqual(names(a));
  });

  it('picks, among the first topics whose product is allowed, one whose shape differs from the post before', () => {
    const out = spaceTopics(HEAD, { keyOf, shapeOf });
    let repeats = 0;
    for (let i = 1; i < out.length; i += 1) if (out[i].shape === out[i - 1].shape) repeats += 1;
    const plain = spaceTopics(HEAD, { keyOf });
    let before = 0;
    for (let i = 1; i < plain.length; i += 1) if (plain[i].shape === plain[i - 1].shape) before += 1;
    expect(repeats).toBeLessThan(before);
    // The product rule is never given up for a shape: a product repeats inside
    // the gap only where nothing else was left (the tail of a 20-topic queue).
    expect(unforcedRepeats(out, PRODUCT_SPACING_GAP)).toBe(0);
    expect(clusterStats(out.slice(0, 16).map(keyOf)).withinWindow).toBe(0);
    expect(new Set(names(out)).size).toBe(HEAD.length);
  });

  it('takes the first allowed topic when none of those looked at has another shape, and honours the last shape written', () => {
    const guides = [t('a', 'a'), t('b', 'b'), t('c', 'c')];
    expect(names(spaceTopics(guides, { keyOf, shapeOf }))).toEqual(['a', 'b', 'c']);
    const mixed = [t('g1', 'a', 'guide'), t('q1', 'b', 'question'), t('g2', 'c', 'guide')];
    expect(names(spaceTopics(mixed, { keyOf, shapeOf, recentShape: 'guide', limit: 1 }))).toEqual(['q1']);
    expect(names(spaceTopics(mixed, { keyOf, shapeOf, recentShape: 'question', limit: 1 }))).toEqual(['g1']);
  });

  it('never reaches past the look-ahead for a shape', () => {
    const queue = [t('g1', 'a', 'guide'), t('g2', 'b', 'guide'), t('g3', 'c', 'guide'), t('g4', 'd', 'guide'), t('q1', 'e', 'question')];
    // Two topics are looked at each time: q1 is taken only once it is one of them.
    expect(names(spaceTopics(queue, { keyOf, shapeOf, lookahead: 2 }))).toEqual(['g1', 'g2', 'g3', 'q1', 'g4']);
    // Four at a time: after g1 the question is in reach and is taken at once.
    expect(names(spaceTopics(queue, { keyOf, shapeOf, lookahead: 4 }))).toEqual(['g1', 'q1', 'g2', 'g3', 'g4']);
  });
});

describe('clusterStats', () => {
  it('counts adjacent repeats, repeats inside the window, the longest run and the worst stretch', () => {
    const keys = ['pen', 'pen', 'mug', 'pen', null, null, 'cap'];
    expect(clusterStats(keys, 2)).toEqual({ adjacent: 1, withinWindow: 2, longestRun: 2, worstStretch: 3 });
    expect(clusterStats([], 7)).toEqual({ adjacent: 0, withinWindow: 0, longestRun: 0, worstStretch: 0 });
    // A null key is never a repeat.
    expect(clusterStats([null, null, null], 7).withinWindow).toBe(0);
  });
});

describe('structure', () => {
  const src = read('lib/blog-automation/topic-spacing.ts');

  it('the gap and the look-ahead are the measured ones, spelled once', () => {
    expect(PRODUCT_SPACING_GAP).toBe(7);
    expect(SHAPE_LOOKAHEAD).toBe(4);
    expect(src.match(/export const PRODUCT_SPACING_GAP = \d+;/g)).toEqual(['export const PRODUCT_SPACING_GAP = 7;']);
    expect(src.match(/export const SHAPE_LOOKAHEAD = \d+;/g)).toEqual(['export const SHAPE_LOOKAHEAD = 4;']);
  });

  it('is pure: no Sanity, no disk, no network, no next', () => {
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual(["import { productPhraseTokens } from '../ai/match-tokens';", "import { stem } from '../ai/place-internal-links';"]);
    expect(src).not.toMatch(/\bfetch\(|node:fs|server-only|next\//);
  });

  it('the Blog Topics tab does not use it: the list Patrick reads stays sorted by the figure it shows', () => {
    expect(read('sanity/tools/blog-topics-tool.tsx')).not.toContain('topic-spacing');
    expect(read('lib/blog-automation/topic-pool.ts')).not.toContain('topic-spacing');
  });
});
