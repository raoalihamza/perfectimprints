/**
 * The 24-hour cache around the blog opportunity pool (AUTO-110). The ONLY
 * file in lib/blog-automation that imports next/cache, so the pool builder
 * and the guard stay runnable under tsx for the measuring script.
 *
 * Why a day: Search Console data updates once a day (and lags two to three
 * days), so re-pulling the rows every time Patrick opens the panel would cost
 * a minute of his time and several Google calls for the same answer. The
 * entry carries BLOG_TOPICS_TAG; the panel's "Refresh from Search Console"
 * button asks the route to expire that tag with `{ expire: 0 }` (a hard
 * miss, so the next pool call rebuilds; `'max'` would hand back the old pool
 * once more), and no webhook touches it because no Sanity publish changes
 * what Search Console reports. The negative keyword list is NOT in this
 * cache: the route reads it per request through the SETTINGS_TAG-tagged
 * `getSiteSettings()`, so a block takes effect at once.
 *
 * What is cached is the PACKED snapshot (AUTO-121): each topic's figures plus
 * what the detector found, never the verdict, with every post and page
 * written once (`packTopics`). The route recomputes state, rule and reason
 * with `expandTopic` on every read, so the wording and the threshold can
 * change without a refresh.
 *
 * The 2 MB ceiling, and why a failed write cannot be silent here (AUTO-121).
 * The data cache refuses an entry over about 2 MB and says so only in the
 * server log; the function then rebuilds on every call, which on this pool
 * is a minute of Search Console pulls per panel open with nothing on the
 * panel to show why. So the entry is kept under CACHE_ENTRY_BUDGET_BYTES by
 * construction: the packed snapshot is measured before it is returned, and
 * if it is over budget the OLDER topics (the ones the wider window added)
 * with the fewest 16-month impressions are dropped until it fits, and the
 * count dropped is stored on the snapshot, which the route returns and the
 * panel shows. The 90-day pool is never trimmed. Measured 2026-10-01 on the
 * live pool: see CACHE_ENTRY_BUDGET_BYTES. The route watches for the other
 * way a write can fail (a rebuild on every call) and reports it.
 */

import { unstable_cache } from 'next/cache';
import { BLOG_TOPICS_TAG } from '../sanity/cache-tags';
import { GEMINI_EMBEDDING_DIMENSIONS, GEMINI_EMBEDDING_MODEL } from '../ai/gemini';
import { loadLinkDocsForKind } from '../ai/internal-links';
import { buildTopicPoolSnapshot, type TopicPoolSnapshot } from './build-topic-pool';
import { buildTopicSimilarity, SIMILARITY_MAX_TOPICS } from './build-topic-similarity';
import type { CompactTopicSimilarity } from './topic-similarity';
import {
  BLOG_PATH_PREFIX,
  CANNIBALIZATION_THRESHOLD,
  POOL_IMPRESSIONS_FLOOR,
  POOL_LONG_IMPRESSIONS_FLOOR,
  POOL_LONG_WINDOW_DAYS,
  POOL_POSITION_HIGH,
  POOL_POSITION_LOW,
  POOL_WINDOW_DAYS,
  compactTopic,
  expandTopic,
  packTopics,
  unpackTopics,
  type PackedTopics,
  type Topic,
} from './topic-pool';

export const TOPIC_POOL_CACHE_SECONDS = 24 * 60 * 60;

/**
 * The largest packed snapshot this module will hand to the data cache, as the
 * length of its JSON. Next refuses an entry over 2 MB (2,097,152 bytes) and
 * serialises it with its own framing, so the budget sits well under: 1.6 MB
 * leaves about 0.5 MB for that framing and for the pool growing between
 * deploys. Measured 2026-10-01 on the live pool (4,415 topics): packed
 * 940,545 bytes (0.90 MB), compact 2,124,973 bytes (2.03 MB, which the cache
 * would have refused), so the packing is what makes the wider window fit and
 * the trim is the guarantee, not the expectation.
 */
export const CACHE_ENTRY_BUDGET_BYTES = 1_600_000;

export interface PackedTopicPoolSnapshot extends Omit<TopicPoolSnapshot, 'topics'> {
  packed: PackedTopics;
  /** Bytes of this entry's JSON as stored, so the route and the script can watch the budget. */
  cacheBytes: number;
  /** Older topics dropped to fit the budget (0 unless the pool has outgrown it); the panel says so. */
  omittedOlderTopics: number;
}

/**
 * Pack a built snapshot for the cache and enforce the budget: drop the
 * lowest-16-month-impression OLDER topics, never a 90-day one, until the
 * packed JSON fits. Pure over its input; exported so the measuring script
 * reports the same bytes the route stores.
 */
export function packSnapshot(snapshot: TopicPoolSnapshot, budgetBytes: number = CACHE_ENTRY_BUDGET_BYTES): PackedTopicPoolSnapshot {
  const { topics, ...rest } = snapshot;
  const kept: Topic[] = [...topics];
  let omitted = 0;
  for (;;) {
    const packed = packTopics(kept.map(compactTopic));
    const entry: PackedTopicPoolSnapshot = { ...rest, packed, cacheBytes: 0, omittedOlderTopics: omitted };
    const bytes = JSON.stringify(entry).length;
    if (bytes <= budgetBytes) return { ...entry, cacheBytes: bytes };
    // Over budget: drop the older topic with the fewest 16-month impressions.
    let drop = -1;
    for (let i = kept.length - 1; i >= 0; i--) {
      const t = kept[i];
      if (t.window !== 'older') continue;
      if (drop === -1 || t.long.impressions < kept[drop].long.impressions) drop = i;
    }
    if (drop === -1) {
      // Only 90-day topics left and still over budget: store what there is
      // rather than nothing; the route reports the bytes and warns.
      return { ...entry, cacheBytes: bytes };
    }
    kept.splice(drop, 1);
    omitted += 1;
  }
}

export function unpackSnapshot(entry: PackedTopicPoolSnapshot): TopicPoolSnapshot & { cacheBytes: number; omittedOlderTopics: number } {
  const { packed, ...rest } = entry;
  return { ...rest, topics: unpackTopics(packed).map((t) => expandTopic(t, entry.threshold)) };
}

/**
 * The key parts name every number that shapes the pool, so changing the
 * floor, the band or the wider window in topic-pool.ts is itself a cache miss
 * (the threshold is applied at read time by `expandTopic`, so tuning it needs
 * no refresh).
 */
const getCachedPackedSnapshot: () => Promise<PackedTopicPoolSnapshot> = unstable_cache(
  async () => packSnapshot(await buildTopicPoolSnapshot()),
  [
    'blog-topic-pool',
    `days=${POOL_WINDOW_DAYS}`,
    `floor=${POOL_IMPRESSIONS_FLOOR}`,
    `band=${POOL_POSITION_LOW}-${POOL_POSITION_HIGH}`,
    // AUTO-119: the grouping changed shape (spacing merge, spacingGroups), so
    // a snapshot cached before the deploy is not read back after it.
    'grouping=spacing-v1',
    // AUTO-121: the wider window and the packed shape.
    `long=${POOL_LONG_WINDOW_DAYS}/${POOL_LONG_IMPRESSIONS_FLOOR}`,
    'shape=packed-v1',
  ],
  { tags: [BLOG_TOPICS_TAG], revalidate: TOPIC_POOL_CACHE_SECONDS },
);

/** The pool with the guard's verdict recomputed at the CURRENT threshold. */
export async function getCachedTopicPoolSnapshot(): Promise<TopicPoolSnapshot & { cacheBytes: number; omittedOlderTopics: number }> {
  const packed = await getCachedPackedSnapshot();
  return unpackSnapshot({ ...packed, threshold: CANNIBALIZATION_THRESHOLD });
}

/**
 * The advisory "closest wording" figures (AUTO-119), cached per pool
 * snapshot: the snapshot's `generatedAt` is part of the key, so a Refresh
 * (a new snapshot) computes new figures once and every other panel open is a
 * cache read. Same tag and lifetime as the pool, so Refresh expires both.
 *
 * AUTO-121: at most SIMILARITY_MAX_TOPICS topics are embedded, taken in the
 * snapshot's order (every topic seen in the last 90 days first, then the
 * older ones by 16-month impressions), so the build stays inside its
 * deadline; topics past the cap simply have no figures and the panel says so.
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
        topics: snapshot.topics.slice(0, SIMILARITY_MAX_TOPICS).map((t) => ({ key: t.key, query: t.query })),
        posts: docs
          .filter((d) => d.title && d.slug)
          .map((d) => ({ title: String(d.title), href: `${BLOG_PATH_PREFIX}${d.slug}` })),
      });
    },
    ['blog-topic-similarity', snapshot.generatedAt, `model=${GEMINI_EMBEDDING_MODEL}`, `dims=${GEMINI_EMBEDDING_DIMENSIONS}`, `cap=${SIMILARITY_MAX_TOPICS}`],
    { tags: [BLOG_TOPICS_TAG], revalidate: TOPIC_POOL_CACHE_SECONDS },
  );
  // Returned compact (about 350 KB); the panel expands it with the pure
  // `expandSimilarity`, which would otherwise triple what crosses the wire.
  return compute();
}
