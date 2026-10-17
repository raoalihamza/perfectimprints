/**
 * AUTO-208 Part 4: the scheduler's choice is FIX-920's order rule, applied
 * one pick at a time. The REAL `chooseNextTopic` over fake reads, with the
 * real `spaceTopics`, `productKeyOf` and `chooseTitleShape` underneath, and
 * the proof that picking one topic at a time (what a scheduler does, each
 * firing seeing the previous posts) reproduces, pick for pick, the single
 * `spaceTopics` call over the whole queue that FIX-920 measured.
 */
import { describe, expect, it, vi } from 'vitest';
import { chooseNextTopic, usableQueue, type ChooseTopicDeps, type RecentPosts } from './choose-topic';
import type { TopicDepth } from './topic-depth';
import { queryTopicKey, type Topic } from './topic-pool';
import { PRODUCT_SPACING_GAP, SHAPE_LOOKAHEAD, productKeyOf, spaceTopics } from './topic-spacing';
import { chooseTitleShape, stableHash } from './blog-shape';

/** A usable topic with only what the queue and the choice read, keyed the way the pool keys it. */
function topic(query: string, impressions: number, extra: Partial<Topic> = {}): Topic {
  return {
    key: queryTopicKey(query),
    query,
    variants: [query],
    clicks: 0,
    impressions,
    position: 20,
    page: null,
    detectorInput: query,
    long: { impressions, clicks: 0, position: 20 },
    seenDays: 90,
    window: 'recent',
    topSevenNow: null,
    spacingGroups: [],
    state: 'usable',
    rule: null,
    reason: null,
    sharedTokens: [],
    matchedPost: null,
    blockedBy: null,
    blockedScope: null,
    writtenAs: null,
    ...extra,
  };
}

/** A category per topic: the last word of the query, so "custom pens" and "business pens" share a product. */
const categoryOf = async (q: string) => {
  const words = q.split(' ');
  return `${words[words.length - 1]}`;
};
/** A depth that carries a list for most topics; "thin" topics cannot. */
const depthOf = async (q: string): Promise<TopicDepth> => {
  const thin = q.includes('thin');
  return { category: await categoryOf(q), supply: thin ? 3 : 40, categorySize: thin ? 3 : 40, depth: thin ? 3 : 40, variants: [] };
};

function deps(queue: Topic[], recent: RecentPosts, written: ChooseTopicDeps['writtenSources'] = async () => [], rules: ChooseTopicDeps['blockRules'] = async () => []): ChooseTopicDeps {
  return {
    poolTopics: async () => queue,
    writtenSources: written,
    blockRules: rules,
    categoryFor: categoryOf,
    depthFor: depthOf,
    recentPosts: async () => recent,
  };
}

const HEAD = [
  topic('custom pens', 2875),
  topic('custom flying discs', 1024),
  topic('imprinted promotional products', 822),
  topic('promotional matches', 788),
  topic('promotional pens plymouth logo printing', 765),
  topic('wholesale megaphones', 748),
  topic('business pens', 707),
  topic('promotional pedometers', 674),
  topic('custom matchbooks', 645),
  topic('custom sunscreen', 616),
  topic('custom bike bottles', 581),
  topic('promotional hand fans', 578),
];

describe('chooseNextTopic', () => {
  it('takes the head of the usable queue when nothing is recent', async () => {
    const r = await chooseNextTopic(deps(HEAD, { keys: [], shape: null }));
    expect(r?.topic.query).toBe('custom pens');
    expect(r?.queuePosition).toBe(1);
    expect(r?.key).toBe('pen');
    expect(r?.usable).toBe(HEAD.length);
    expect(r?.candidates.length).toBe(SHAPE_LOOKAHEAD);
  });

  it('holds a product written within the gap back: pens were just written, so the next pick is not a pens topic', async () => {
    const r = await chooseNextTopic(deps(HEAD, { keys: ['pen'], shape: null }));
    expect(r?.topic.query).toBe('custom flying discs');
    expect(r?.candidates.map((c) => c.query)).not.toContain('custom pens');
    expect(r?.candidates.map((c) => c.query)).not.toContain('business pens');
  });

  it('only the last PRODUCT_SPACING_GAP recent keys matter', async () => {
    const old = { keys: ['pen', ...new Array(PRODUCT_SPACING_GAP).fill('other')], shape: null };
    const r = await chooseNextTopic(deps(HEAD, old));
    expect(r?.topic.query).toBe('custom pens');
  });

  it('prefers a different shape among the look-ahead candidates, product rule first', async () => {
    const shapeOfHead = (q: string) => chooseTitleShape(q, 'auto', { depth: 40, variants: [], category: q.split(' ').pop() });
    const first = shapeOfHead('custom pens');
    const r = await chooseNextTopic(deps(HEAD, { keys: [], shape: first }));
    // The pick differs from the last shape when any of the four candidates does.
    const candidates = HEAD.slice(0, 6).filter((t) => true);
    const anyOther = candidates.slice(0, SHAPE_LOOKAHEAD).some((t) => shapeOfHead(t.query) !== first);
    if (anyOther) expect(r?.shape).not.toBe(first);
    else expect(r?.topic.query).toBe('custom pens');
    // Never a candidate whose product is recent, whatever its shape.
    const r2 = await chooseNextTopic(deps(HEAD, { keys: ['pen', 'disc', 'product', 'match'], shape: first }));
    for (const c of r2!.candidates) expect(['pen', 'disc', 'product', 'match']).not.toContain(c.key);
  });

  it('measures depth for the candidates only, and hands the chosen depth on', async () => {
    const depthFor = vi.fn(depthOf);
    const d = { ...deps(HEAD, { keys: [], shape: null }), depthFor };
    const r = await chooseNextTopic(d);
    expect(depthFor).toHaveBeenCalledTimes(SHAPE_LOOKAHEAD);
    expect(r?.depth.depth).toBe(40);
  });

  it('a thin topic gets the shape the generator would give it (a guide, not a list)', async () => {
    const r = await chooseNextTopic(deps([topic('thin koozie ideas', 500)], { keys: [], shape: null }));
    expect(r?.shape).toBe('guide');
  });

  it('yields to the head of the queue when every topic is recent (never stalls, never drops)', async () => {
    const r = await chooseNextTopic(deps(HEAD.slice(0, 3), { keys: ['pen', 'disc', 'product'], shape: null }));
    expect(r?.topic.query).toBe('custom pens');
  });

  it('returns null when the usable list is empty', async () => {
    expect(await chooseNextTopic(deps([], { keys: [], shape: null }))).toBeNull();
    const blocked = HEAD.map((t) => topic(t.query, t.impressions, { state: 'excluded', rule: 'ranking-page' }));
    expect(await chooseNextTopic(deps(blocked, { keys: [], shape: null }))).toBeNull();
  });

  it('applies the live written topics and the live blocks before choosing, in the tab\'s order', async () => {
    const written = async () => [{ queries: ['custom pens'], documentId: 'd1', title: 'Custom Pens', status: 'draft' as const, via: 'recorded' as const }];
    const rules = async () => [{ term: 'custom flying discs', scope: 'topic' as const }];
    const q = usableQueue(HEAD, await written(), await rules());
    expect(q.map((t) => t.query).slice(0, 2)).toEqual(['imprinted promotional products', 'promotional matches']);
    const r = await chooseNextTopic(deps(HEAD, { keys: [], shape: null }, written, rules));
    expect(r?.topic.query).toBe('imprinted promotional products');
  });

  it('grows the key window until the look-ahead is filled, so a long run of one product at the head is walked past', async () => {
    const pens = Array.from({ length: 50 }, (_, i) => topic(`style ${i} pens`, 1000 - i));
    const tail = [topic('custom koozies', 10), topic('custom coasters', 9), topic('custom clips', 8), topic('custom mugs', 7), topic('custom fans', 6)];
    const categoryFor = vi.fn(categoryOf);
    const r = await chooseNextTopic({ ...deps([...pens, ...tail], { keys: ['pen'], shape: null }), categoryFor }, { keyWindowStep: 10 });
    expect(r?.topic.query).toBe('custom koozies');
    // 50 pens + the 4 candidates, and not the whole queue.
    expect(categoryFor.mock.calls.length).toBe(54);
  });
});

describe('one pick at a time reproduces the whole-queue rule FIX-920 measured', () => {
  it('picking sequentially, each pick seeing the previous picks, equals spaceTopics over the full queue', async () => {
    // A seeded queue with clustered products and mixed shapes, like the real one.
    const products = ['pens', 'bags', 'bottles', 'koozies', 'hats', 'mugs', 'ornaments', 'balloons', 'coasters', 'fans', 'kits', 'clips'];
    const prefixes = ['custom', 'promotional', 'branded', 'bulk', 'logo', 'wholesale', 'cheap', 'best'];
    const queue: Topic[] = [];
    for (let i = 0; i < 120; i += 1) {
      const p = products[stableHash(`p${i}`) % products.length];
      const pre = prefixes[stableHash(`q${i}`) % prefixes.length];
      // `v<i>` keeps every query distinct (the generator otherwise repeats a combination).
      const q = `${pre} ${p} ${i % 3 === 0 ? 'ideas' : i % 3 === 1 ? 'guide' : 'thin'} v${i}`.replace(' thin', i % 5 === 0 ? ' thin' : '');
      queue.push(topic(q, 2000 - i));
    }
    // Keys and shapes exactly as the scheduler computes them.
    const keyed = await Promise.all(queue.map(async (t) => {
      const cat = await categoryOf(t.query);
      const depth = await depthOf(t.query);
      return { t, key: productKeyOf(t.query, cat), shape: chooseTitleShape(t.query, 'auto', { depth: depth.depth, variants: depth.variants, category: depth.category }) };
    }));
    const whole = spaceTopics(keyed, { keyOf: (k) => k.key, shapeOf: (k) => k.shape }).map((k) => k.t.query);

    // The scheduler: one pick per "firing", the picked topic leaves the pool
    // (in production the written-topics read removes it; here the synthetic
    // queries share topic keys, so the pool itself is narrowed), the recent
    // keys and shape roll forward.
    const picked: string[] = [];
    const recentKeys: (string | null)[] = [];
    let recentShape: string | null = null;
    const writtenNow = new Set<string>();
    for (let n = 0; n < queue.length; n += 1) {
      const r = await chooseNextTopic({
        poolTopics: async () => queue.filter((t) => !writtenNow.has(t.query)),
        writtenSources: async () => [],
        blockRules: async () => [],
        categoryFor: categoryOf,
        depthFor: depthOf,
        recentPosts: async () => ({ keys: recentKeys.slice(-PRODUCT_SPACING_GAP), shape: recentShape as never }),
      });
      if (!r) break;
      picked.push(r.topic.query);
      writtenNow.add(r.topic.query);
      recentKeys.push(r.key);
      recentShape = r.shape;
    }
    expect(picked).toEqual(whole);
    expect(picked.length).toBe(queue.length);
  });
});
