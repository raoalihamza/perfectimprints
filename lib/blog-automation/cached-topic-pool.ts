/**
 * The 24-hour cache around the blog opportunity pool (AUTO-110). The ONLY
 * file in lib/blog-automation that imports next/cache, so the pool builder
 * and the guard stay runnable under tsx for the measuring script.
 *
 * Why a day: Search Console data updates once a day (and lags two to three
 * days), so re-pulling 30,000 rows every time Patrick opens the panel would
 * cost a minute of his time and several Google calls for the same answer.
 * The entry carries BLOG_TOPICS_TAG; the panel's "Refresh from Search
 * Console" button asks the route to expire that tag with `{ expire: 0 }` (a
 * hard miss, so the next pool call rebuilds; `'max'` would hand back the old
 * pool once more), and no webhook touches it because no Sanity publish
 * changes what Search Console reports. The negative keyword list is NOT in
 * this cache: the route reads it per request through the SETTINGS_TAG-tagged
 * `getSiteSettings()`, so a block takes effect at once.
 *
 * What is cached is the COMPACT snapshot: each topic's figures plus what the
 * detector found, never the verdict. The route recomputes state, rule and
 * reason with `expandTopic` on every read, so the wording and the threshold
 * can change without a refresh, and the entry stays well under the data
 * cache's 2 MB ceiling (the AUTO-110 report records both sizes).
 */

import { unstable_cache } from 'next/cache';
import { BLOG_TOPICS_TAG } from '../sanity/cache-tags';
import { GEMINI_EMBEDDING_DIMENSIONS, GEMINI_EMBEDDING_MODEL } from '../ai/gemini';
import { loadLinkDocsForKind } from '../ai/internal-links';
import { buildTopicPoolSnapshot, type TopicPoolSnapshot } from './build-topic-pool';
import { buildTopicSimilarity } from './build-topic-similarity';
import type { CompactTopicSimilarity } from './topic-similarity';
import {
  BLOG_PATH_PREFIX,
  CANNIBALIZATION_THRESHOLD,
  POOL_IMPRESSIONS_FLOOR,
  POOL_POSITION_HIGH,
  POOL_POSITION_LOW,
  POOL_WINDOW_DAYS,
  compactTopic,
  expandTopic,
  type CompactTopic,
} from './topic-pool';

export const TOPIC_POOL_CACHE_SECONDS = 24 * 60 * 60;

export interface CompactTopicPoolSnapshot extends Omit<TopicPoolSnapshot, 'topics'> {
  topics: CompactTopic[];
}

export function compactSnapshot(snapshot: TopicPoolSnapshot): CompactTopicPoolSnapshot {
  return { ...snapshot, topics: snapshot.topics.map(compactTopic) };
}

export function expandSnapshot(compact: CompactTopicPoolSnapshot): TopicPoolSnapshot {
  return { ...compact, topics: compact.topics.map((t) => expandTopic(t, compact.threshold)) };
}

/**
 * The key parts name every number that shapes the pool, so changing the
 * floor or the band in topic-pool.ts is itself a cache miss (the threshold is
 * applied at read time by `expandTopic`, so tuning it needs no refresh).
 */
const getCachedCompactSnapshot: () => Promise<CompactTopicPoolSnapshot> = unstable_cache(
  async () => compactSnapshot(await buildTopicPoolSnapshot()),
  [
    'blog-topic-pool',
    `days=${POOL_WINDOW_DAYS}`,
    `floor=${POOL_IMPRESSIONS_FLOOR}`,
    `band=${POOL_POSITION_LOW}-${POOL_POSITION_HIGH}`,
    // AUTO-119: the grouping changed shape (spacing merge, spacingGroups), so
    // a snapshot cached before the deploy is not read back after it.
    'grouping=spacing-v1',
  ],
  { tags: [BLOG_TOPICS_TAG], revalidate: TOPIC_POOL_CACHE_SECONDS },
);

/** The pool with the guard's verdict recomputed at the CURRENT threshold. */
export async function getCachedTopicPoolSnapshot(): Promise<TopicPoolSnapshot> {
  const compact = await getCachedCompactSnapshot();
  return expandSnapshot({ ...compact, threshold: CANNIBALIZATION_THRESHOLD });
}

/**
 * The advisory "closest wording" figures (AUTO-119), cached per pool
 * snapshot: the snapshot's `generatedAt` is part of the key, so a Refresh
 * (a new snapshot) computes new figures once and every other panel open is a
 * cache read. Same tag and lifetime as the pool, so Refresh expires both.
 *
 * A failure is NOT cached (unstable_cache stores only a returned value), so the
 * next panel open simply tries again; the pool itself never waits for this and
 * never reads it (the route serves it from a separate action).
 */
export async function getCachedTopicSimilarity(
  snapshot: Pick<TopicPoolSnapshot, 'generatedAt' | 'topics'>,
): Promise<CompactTopicSimilarity> {
  const compute = unstable_cache(
    async (): Promise<CompactTopicSimilarity> => {
      const docs = await loadLinkDocsForKind('blog');
      return buildTopicSimilarity({
        generatedAt: snapshot.generatedAt,
        topics: snapshot.topics.map((t) => ({ key: t.key, query: t.query })),
        posts: docs
          .filter((d) => d.title && d.slug)
          .map((d) => ({ title: String(d.title), href: `${BLOG_PATH_PREFIX}${d.slug}` })),
      });
    },
    ['blog-topic-similarity', snapshot.generatedAt, `model=${GEMINI_EMBEDDING_MODEL}`, `dims=${GEMINI_EMBEDDING_DIMENSIONS}`],
    { tags: [BLOG_TOPICS_TAG], revalidate: TOPIC_POOL_CACHE_SECONDS },
  );
  // Returned compact (about 350 KB); the panel expands it with the pure
  // `expandSimilarity`, which would otherwise triple what crosses the wire.
  return compute();
}
