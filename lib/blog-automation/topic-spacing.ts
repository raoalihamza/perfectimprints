/**
 * The ORDER topics are taken in, spaced by product (FIX-920 Part 4). PURE: no
 * Sanity, no fs, no network, so the scheduler (the next ticket), the measuring
 * scripts and vitest share one rule. Nothing calls it yet: the Blog Topics tab
 * still lists topics by impressions, which is a sort Patrick reads and must
 * stay what it says. This is the order a SCHEDULER takes them in.
 *
 * WHY. The default order is impressions, most first (`compareTopics`), and
 * impressions cluster by product: three of the first seven usable topics are
 * pens ("custom pens", "promotional pens plymouth logo printing", "business
 * pens"). Measured over the 2,121 usable topics on 2026-10-13, in that order
 * (440 distinct products; pens are 111 topics, bags 86): of the first 60
 * topics (a month at two posts a day) 8 are about a product written within
 * the previous seven posts and 7 are pens; of the first 730 (a year) 62 are,
 * 14 of them straight after a post on the same product, and the worst week
 * (14 posts) holds 5 posts on one product. AUTO-205 varied the post's SHAPE
 * and nobody had looked at its subject.
 *
 * THE RULE. Walk the queue in its own order and take the first topic whose
 * product has not been written in the last PRODUCT_SPACING_GAP posts. When
 * every topic left is too recent, take the first one anyway: the rule yields,
 * it never stalls and never drops a topic. So the order is the impressions
 * order with repeats pushed back, and nothing else moves.
 *
 * THE PRODUCT is `productKeyOf`: the head noun of the category the topic
 * resolved to ("pens" gives pen, "tote-bags" and "duffle-gym-bags" give bag),
 * else the topic's own product noun ("foam footballs" gives football). The
 * category comes first because the topic's last word is often not its
 * product ("promotional pens plymouth logo printing"). Two names for one
 * product are two keys ("flying discs" and "frisbees"): the rule spaces
 * words, not meanings.
 *
 * THE GAP is 7, measured on that pool. At 7 no product repeats within seven
 * posts anywhere in the 2,121, no week holds more than two posts on one
 * product, 70 of the first 730 topics are pushed back (median 5 places, worst
 * 21, one of them by more than a week) and the rule never has to yield. At 14
 * (a product at most once a week) pens start to queue: 33 of the first 730
 * are pushed back more than a month of posts, the worst by 98 places, and 3
 * of the first 60 leave the first 60. At 1 (never twice running) the 62
 * near-repeats a year are all still there. The table is in CLAUDE.md.
 *
 * SHAPE. Product spacing does not disturb the shape rotation and does not
 * help it either: the first 730 repeat the previous post's shape 259 times
 * with it and 265 without. So the same walk can also prefer a different
 * SHAPE from the previous post (`shapeOf`), choosing among the first
 * SHAPE_LOOKAHEAD topics that pass the product rule. At 4 the repeats fall
 * to 31 of 729 (longest run 4, from 7), the product spacing is untouched,
 * and the worst delay moves from 21 places to 23. The product rule is
 * applied first: a topic is only ever looked at for its shape once its
 * product is allowed.
 */

import { productPhraseTokens } from '../ai/match-tokens';
import { stem } from '../ai/place-internal-links';

/** No product twice within this many posts. Spelled once. */
export const PRODUCT_SPACING_GAP = 7;

/** How many topics that pass the product rule are looked at for one whose shape differs from the previous post's. */
export const SHAPE_LOOKAHEAD = 4;

/**
 * The product a topic is about, as a spacing key, or null when the topic
 * names no product at all (it is then never held back). `category` is the
 * root the topic resolved to (`resolveCategoryForKeywords`), when there is
 * one.
 */
export function productKeyOf(query: string, category?: string | null): string | null {
  if (category) {
    const words = category.split(/[^a-z0-9]+/i).filter(Boolean);
    const head = words[words.length - 1];
    if (head) return stem(head);
  }
  const tokens = productPhraseTokens(query);
  return tokens.length > 0 ? stem(tokens[tokens.length - 1]) : null;
}

export interface SpacingOptions<T> {
  /** The topic's product key (`productKeyOf`); null is never held back. */
  keyOf: (topic: T) => string | null;
  /** Default PRODUCT_SPACING_GAP. 0 switches the product rule off. */
  gap?: number;
  /**
   * The product keys of the posts ALREADY written, oldest first, so a
   * scheduler's first pick of the day respects yesterday's posts. Only the
   * last `gap` matter.
   */
  recentKeys?: readonly (string | null)[];
  /** The topic's title shape, when shapes are to be varied as well. */
  shapeOf?: (topic: T) => string | null;
  /** The shape of the post written last, for the first pick. */
  recentShape?: string | null;
  /** Default SHAPE_LOOKAHEAD. */
  lookahead?: number;
  /** Stop after this many topics (a scheduler wants the next two, not 2,000). */
  limit?: number;
}

/**
 * The topics in the order to write them. Stable and deterministic: the same
 * queue and the same recent posts give the same order. Every topic of the
 * input is in the output exactly once (up to `limit`).
 */
export function spaceTopics<T>(topics: readonly T[], opts: SpacingOptions<T>): T[] {
  const gap = Math.max(0, Math.floor(opts.gap ?? PRODUCT_SPACING_GAP));
  const lookahead = Math.max(1, Math.floor(opts.lookahead ?? SHAPE_LOOKAHEAD));
  const limit = Math.min(topics.length, Math.max(0, Math.floor(opts.limit ?? topics.length)));
  const keys = topics.map(opts.keyOf);
  const shapes = opts.shapeOf ? topics.map(opts.shapeOf) : null;
  const taken = new Array<boolean>(topics.length).fill(false);
  const recent: (string | null)[] = gap > 0 ? [...(opts.recentKeys ?? [])].slice(-gap) : [];
  let lastShape = opts.recentShape ?? null;
  let first = 0; // every topic before this index is taken
  const out: T[] = [];

  while (out.length < limit) {
    while (first < topics.length && taken[first]) first += 1;
    if (first >= topics.length) break;
    // The first `lookahead` topics, in queue order, whose product is not recent.
    const candidates: number[] = [];
    for (let i = first; i < topics.length && candidates.length < (shapes ? lookahead : 1); i += 1) {
      if (taken[i]) continue;
      const key = keys[i];
      if (key !== null && recent.includes(key)) continue;
      candidates.push(i);
    }
    // Every topic left is too recent: the rule yields to the queue.
    let pick = candidates.length > 0 ? candidates[0] : first;
    if (shapes && lastShape !== null) {
      const other = candidates.find((i) => shapes[i] !== lastShape);
      if (other !== undefined) pick = other;
    }
    taken[pick] = true;
    out.push(topics[pick]);
    if (gap > 0) {
      recent.push(keys[pick]);
      if (recent.length > gap) recent.shift();
    }
    if (shapes) lastShape = shapes[pick];
  }
  return out;
}

/** How a sequence clusters, for the measuring scripts and the tests. */
export interface ClusterStats {
  /** Posts whose product equals the post right before. */
  adjacent: number;
  /** Posts whose product was written within the previous `window` posts. */
  withinWindow: number;
  /** The longest run of consecutive posts on one product. */
  longestRun: number;
  /** The most posts on one product inside any stretch of `window * 2` posts. */
  worstStretch: number;
}

export function clusterStats(keys: readonly (string | null)[], window: number = PRODUCT_SPACING_GAP): ClusterStats {
  let adjacent = 0;
  let withinWindow = 0;
  let longestRun = keys.length > 0 ? 1 : 0;
  let run = 1;
  for (let i = 1; i < keys.length; i += 1) {
    const k = keys[i];
    if (k !== null && k === keys[i - 1]) {
      adjacent += 1;
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else run = 1;
    if (k !== null && keys.slice(Math.max(0, i - window), i).includes(k)) withinWindow += 1;
  }
  let worstStretch = 0;
  const span = window * 2;
  const counts = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    if (k !== null) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      worstStretch = Math.max(worstStretch, counts.get(k)!);
    }
    const leaving = i - span + 1 >= 0 ? keys[i - span + 1] : null;
    if (i - span + 1 >= 0 && leaving !== null) counts.set(leaving, (counts.get(leaving) ?? 1) - 1);
  }
  return { adjacent, withinWindow, longestRun, worstStretch };
}
