/**
 * Build the blog opportunity pool from Search Console (AUTO-110). SERVER
 * ONLY: reads GSC_SERVICE_ACCOUNT_JSON_B64, calls Google, and reads the
 * published blog list through the internal-links detector's own tagged fetch.
 *
 * This module deliberately imports nothing from `next/*`, so the read-only
 * measuring script (scripts/blog-automation/verify-topic-pool.ts) can run the
 * identical build under tsx and report the guard's real numbers; the 24-hour
 * cache around it lives in cached-topic-pool.ts, the only file that touches
 * next/cache.
 *
 * Steps, each the AUTO-100 script's:
 *   1. Token from the service account key (read-only scope).
 *   2. Every query row for the URL-prefix property over the window, paginated
 *      to an empty page. Band + floor gives the pool.
 *   3. Query x page rows for the same window; the top page per pool query.
 *   4. Group into topics.
 *   5. Rule one: the EXISTING detector, `suggestLinksForKind('blog', ...)`,
 *      with the published blog list loaded ONCE and passed in, so 2,400 topics
 *      cost one Sanity read, not 2,400. The query reaches the detector with the
 *      generic, filler and near-generic words stripped (`detectorInput`).
 *   6. Rule two + the verdict: `applyGuard` in topic-pool.ts.
 *
 * Negative keywords are NOT applied here (the snapshot is cached for a day;
 * a block must take effect at once). The route applies them per request.
 */

import { loadLinkDocsForKind, suggestLinksForKind } from '../ai/internal-links';
import {
  GscError,
  URL_PREFIX_PROPERTY,
  createGscClient,
  daysAgo,
  decodeServiceAccount,
  getAccessToken,
  type SaRequestLog,
} from './gsc-client';
import {
  CANNIBALIZATION_THRESHOLD,
  POOL_IMPRESSIONS_FLOOR,
  POOL_POSITION_HIGH,
  POOL_POSITION_LOW,
  POOL_WINDOW_DAYS,
  applyGuard,
  groupIntoTopics,
  isPoolQuery,
  sharedTokensFromReason,
  sitePath,
  topPageByQuery,
  type DetectorHit,
  type PoolQuery,
  type Topic,
} from './topic-pool';

export interface TopicPoolSnapshot {
  /** When this snapshot was built (UTC ISO). The panel shows it as "Last read". */
  generatedAt: string;
  property: string;
  window: { start: string; end: string; days: number };
  floor: number;
  band: { low: number; high: number };
  threshold: number;
  /** Published blog posts the detector scored against. */
  publishedPosts: number;
  gsc: {
    allQueries: number;
    poolQueries: number;
    queryPages: number;
    queryPagePages: number;
    queryPageRows: number;
  };
  /** Guard applied, negative keywords NOT applied (state is usable or excluded). */
  topics: Topic[];
  /** Wall-clock of the build, so the route's maxDuration can be judged. */
  buildMs: number;
}

export interface BuildTopicPoolOptions {
  /** Override the key (tests); default reads process.env. */
  serviceAccountB64?: string;
  onRequest?: (entry: SaRequestLog) => void;
  days?: number;
  floor?: number;
  positionLow?: number;
  positionHigh?: number;
  threshold?: number;
  /**
   * Receives the per-QUERY pool (with each query's own ranking page) before
   * grouping. The measuring script uses it to report the guard per query, the
   * way AUTO-100 counted, beside the per-topic figures the panel shows.
   */
  onPool?: (queries: PoolQuery[]) => void;
}

export async function buildTopicPoolSnapshot(opts: BuildTopicPoolOptions = {}): Promise<TopicPoolSnapshot> {
  const started = Date.now();
  const days = opts.days ?? POOL_WINDOW_DAYS;
  const floor = opts.floor ?? POOL_IMPRESSIONS_FLOOR;
  const positionLow = opts.positionLow ?? POOL_POSITION_LOW;
  const positionHigh = opts.positionHigh ?? POOL_POSITION_HIGH;
  const threshold = opts.threshold ?? CANNIBALIZATION_THRESHOLD;

  // 1. The connection. The key never leaves decodeServiceAccount.
  const sa = decodeServiceAccount(opts.serviceAccountB64 ?? process.env.GSC_SERVICE_ACCOUNT_JSON_B64);
  const token = await getAccessToken(sa);
  const gsc = createGscClient(token, { onRequest: opts.onRequest });

  // 2. Every query row, then the band + floor.
  const start = daysAgo(days - 1);
  const end = daysAgo(0);
  const byQuery = await gsc.searchAnalyticsAll(URL_PREFIX_PROPERTY, {
    startDate: start,
    endDate: end,
    dimensions: ['query'],
    dataState: 'all',
    type: 'web',
  });
  const poolRows = byQuery.rows.filter((r) => isPoolQuery(r, { floor, positionLow, positionHigh }));

  // 3. The ranking page per pool query.
  const byQueryPage = await gsc.searchAnalyticsAll(URL_PREFIX_PROPERTY, {
    startDate: start,
    endDate: end,
    dimensions: ['query', 'page'],
    dataState: 'all',
    type: 'web',
  });
  const topPage = topPageByQuery(byQueryPage.rows);
  const queries: PoolQuery[] = poolRows.map((r) => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    position: Math.round(r.position * 10) / 10,
    page: sitePath(topPage.get(r.keys[0])),
  }));

  opts.onPool?.(queries);

  // 4. Topics.
  const candidates = groupIntoTopics(queries);

  // 5 + 6. The guard. One read of the published blog list for the whole pool.
  const blogDocs = await loadLinkDocsForKind('blog');
  const topics: Topic[] = [];
  for (const candidate of candidates) {
    let hit: DetectorHit | null = null;
    if (candidate.detectorInput) {
      const [best] = await suggestLinksForKind('blog', [candidate.detectorInput], 1, undefined, blogDocs);
      if (best) {
        hit = { sharedTokens: sharedTokensFromReason(best.reason), postTitle: best.label, postHref: best.href };
      }
    }
    topics.push(applyGuard(candidate, hit, threshold));
  }

  return {
    generatedAt: new Date().toISOString(),
    property: URL_PREFIX_PROPERTY,
    window: { start, end, days },
    floor,
    band: { low: positionLow, high: positionHigh },
    threshold,
    publishedPosts: blogDocs.length,
    gsc: {
      allQueries: byQuery.rows.length,
      poolQueries: poolRows.length,
      queryPages: byQuery.pages,
      queryPagePages: byQueryPage.pages,
      queryPageRows: byQueryPage.rows.length,
    },
    topics,
    buildMs: Date.now() - started,
  };
}

/**
 * A GscError as the two strings a caller may repeat: what happened and what
 * to do. Anything else is reduced to a generic sentence when its message
 * could carry key material.
 */
export function describePoolError(err: unknown): { message: string; hint: string; status: number } {
  if (err instanceof GscError) {
    return {
      message: err.message,
      hint: err.hint,
      status: err.message.includes('is not set') || err.message.includes('does not decode') || err.message.includes('not to a service account') ? 500 : 502,
    };
  }
  const raw = err instanceof Error ? err.message : String(err);
  const safe = raw.includes('private_key') || raw.includes('BEGIN ') ? 'an error mentioning key material was suppressed' : raw;
  return {
    message: `Could not build the topic pool: ${safe}`,
    hint: 'Try again in a minute. If it keeps failing, Ali: run `pnpm auto:verify-topic-pool` from the production repo, which prints the same failure with its cause.',
    status: 502,
  };
}
