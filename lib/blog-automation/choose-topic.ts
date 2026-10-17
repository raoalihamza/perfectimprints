/**
 * Which topic the scheduler writes next (AUTO-208, Part 4). The queue is the
 * Blog Topics tab's own list (the cached pool snapshot, then the live written
 * topics, then Patrick's live blocks, then `state === 'usable'`, in
 * `compareTopics` order, the tab's default), walked by the ORDER RULE FIX-920
 * built and measured in lib/blog-automation/topic-spacing.ts: no product
 * twice within PRODUCT_SPACING_GAP (7) posts, and among the first
 * SHAPE_LOOKAHEAD (4) topics that pass the product rule, prefer one whose
 * title shape differs from the post written last. The product rule runs
 * first; a topic is looked at for its shape only once its product is
 * allowed (that is how `spaceTopics` is written, and this module calls it
 * rather than re-stating it).
 *
 * WHAT IS COMPUTED, AND FOR HOW MANY TOPICS. `spaceTopics` wants a key and a
 * shape for every topic it is handed. The product key needs the category the
 * topic resolves to (one resolver call, cheap once the index is loaded); the
 * SHAPE needs the catalogue depth (`measureTopicDepth`, about 0.17 s a topic
 * with the reads memoised), which over 2,000 topics would be six minutes a
 * firing. The scheduler needs ONE pick, and with a gap of 7 at most seven
 * products are held back, so the candidates are always near the head of the
 * queue. So the keys are resolved for a growing window from the head until
 * SHAPE_LOOKAHEAD topics pass the product rule (or the queue runs out), the
 * depth and shape are measured for THOSE candidates only, and `spaceTopics`
 * is called on that window with the keys and shapes it needs, `limit: 1`.
 * Because the candidates are defined exactly the way `spaceTopics` defines
 * them (the first `lookahead` topics in queue order whose key is not among
 * the recent keys), the pick is byte-for-byte what the full-queue call would
 * make, and lib/blog-automation/choose-topic.test.ts proves it by replaying
 * a queue pick by pick against one call over the whole queue.
 *
 * THE SHAPE is what the generator WILL choose (`chooseTitleShape` with the
 * measured depth, 'auto'), and the measured depth is handed on to the
 * generator so it is not measured twice and the shape the look-ahead saw is
 * the shape the post gets (AUTO-205's depth check and idea count are the
 * generator's own, untouched; this module only measures first).
 *
 * THE RECENT POSTS: the product keys of the last `gap` posts generated from a
 * topic (the scheduler's AND the tab's: every post with a `sourceTopic`
 * record, drafts included, newest first, de-duplicated by document), oldest
 * first as `spaceTopics` wants them; and the shape of the scheduler's last
 * finished run (the tab records no shape). A manual post with no record is
 * not spaced against; it never was in FIX-920's measurement either.
 *
 * Pure apart from the injected reads: no Sanity, no fs, no next/*.
 */
import { chooseTitleShape, type TitleShape } from './blog-shape';
import type { TopicDepth } from './topic-depth';
import { applyNegativeKeywords, applyWrittenTopics, compareTopics, type BlockRule, type Topic, type WrittenTopicSource } from './topic-pool';
import { PRODUCT_SPACING_GAP, SHAPE_LOOKAHEAD, productKeyOf, spaceTopics } from './topic-spacing';

/** How many more topics the key window grows by when the candidates are not yet found. */
export const KEY_WINDOW_STEP = 40;

export interface RecentPosts {
  /** Product keys of the recent generated posts, OLDEST first (only the last `gap` matter). */
  keys: (string | null)[];
  /** The shape of the post written last, or null. */
  shape: TitleShape | null;
}

export interface ChooseTopicDeps {
  /** The pool snapshot's topics (guard applied, blocks not). */
  poolTopics: () => Promise<readonly Topic[]>;
  /** The drafts and posts that record a topic, read live. */
  writtenSources: () => Promise<readonly WrittenTopicSource[]>;
  /** Patrick's blocks, read live. */
  blockRules: () => Promise<readonly (BlockRule | string)[]>;
  /** The root category a search resolves to (the strips' resolver). */
  categoryFor: (query: string) => Promise<string | null>;
  /** The catalogue depth behind a topic, with the strips' own dials. */
  depthFor: (query: string) => Promise<TopicDepth>;
  recentPosts: () => Promise<RecentPosts>;
}

export interface ChosenTopic {
  topic: Topic;
  /** The product key the pick was spaced by. */
  key: string | null;
  category: string | null;
  depth: TopicDepth;
  shape: TitleShape;
  /** 1-based position in the usable queue. */
  queuePosition: number;
  /** The candidates the look-ahead chose among, in queue order. */
  candidates: { query: string; key: string | null; shape: TitleShape }[];
  recent: RecentPosts;
  /** How many usable topics the queue held. */
  usable: number;
}

export interface ChooseTopicOptions {
  gap?: number;
  lookahead?: number;
  /** Tests: a different window step. */
  keyWindowStep?: number;
}

/** The usable queue in the tab's order: guard, then the live written topics, then the live blocks. */
export function usableQueue(pool: readonly Topic[], written: readonly WrittenTopicSource[], rules: readonly (BlockRule | string)[]): Topic[] {
  return applyNegativeKeywords(applyWrittenTopics(pool, written), rules)
    .filter((t) => t.state === 'usable')
    .sort(compareTopics);
}

interface Keyed {
  topic: Topic;
  index: number;
  key: string | null;
  category: string | null;
  depth?: TopicDepth;
  shape?: TitleShape;
}

/**
 * The next topic to write, or null when the usable queue is empty.
 */
export async function chooseNextTopic(deps: ChooseTopicDeps, opts: ChooseTopicOptions = {}): Promise<ChosenTopic | null> {
  const gap = Math.max(0, Math.floor(opts.gap ?? PRODUCT_SPACING_GAP));
  const lookahead = Math.max(1, Math.floor(opts.lookahead ?? SHAPE_LOOKAHEAD));
  const step = Math.max(1, Math.floor(opts.keyWindowStep ?? KEY_WINDOW_STEP));

  const [pool, written, rules] = await Promise.all([deps.poolTopics(), deps.writtenSources(), deps.blockRules()]);
  const queue = usableQueue(pool, written, rules);
  if (queue.length === 0) return null;
  const recent = await deps.recentPosts();
  const recentKeys = gap > 0 ? recent.keys.slice(-gap) : [];

  // 1) Keys for a growing window from the head, until `lookahead` topics pass the product rule.
  const keyed: Keyed[] = [];
  const candidates: Keyed[] = [];
  let i = 0;
  while (i < queue.length && candidates.length < lookahead) {
    const end = Math.min(queue.length, i + step);
    for (; i < end; i += 1) {
      const topic = queue[i];
      const category = await deps.categoryFor(topic.query);
      const key = productKeyOf(topic.query, category);
      const entry: Keyed = { topic, index: i, key, category };
      keyed.push(entry);
      if (key === null || !recentKeys.includes(key)) {
        candidates.push(entry);
        if (candidates.length >= lookahead) {
          i += 1;
          break;
        }
      }
    }
  }
  // Nothing passes: the rule yields to the head of the queue (spaceTopics does the same).
  const looked = candidates.length > 0 ? candidates : [keyed[0]];

  // 2) Depth and shape for the candidates only.
  for (const c of looked) {
    c.depth = await deps.depthFor(c.topic.query);
    c.shape = chooseTitleShape(c.topic.query, 'auto', { depth: c.depth.depth, variants: c.depth.variants, category: c.depth.category });
  }

  // 3) The order rule itself, on the window it needs, limit 1.
  const window = keyed.slice(0, Math.max(...looked.map((c) => c.index)) + 1);
  const picked = spaceTopics(window, {
    keyOf: (k) => k.key,
    shapeOf: (k) => k.shape ?? null,
    recentKeys: recent.keys,
    recentShape: recent.shape,
    gap,
    lookahead,
    limit: 1,
  })[0];
  const pick = looked.find((c) => c === picked) ?? looked[0];
  return {
    topic: pick.topic,
    key: pick.key,
    category: pick.category,
    depth: pick.depth!,
    shape: pick.shape!,
    queuePosition: pick.index + 1,
    candidates: looked.map((c) => ({ query: c.topic.query, key: c.key, shape: c.shape! })),
    recent,
    usable: queue.length,
  };
}
