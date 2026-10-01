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
 * Steps, each the AUTO-100 script's, widened by AUTO-121:
 *   1. Token from the service account key (read-only scope).
 *   2. The query rows for the 90-day window (band + floor gives the 90-day
 *      pool, exactly as before) AND for the 16-month window (band + the
 *      scaled floor gives the wider pool), plus the query rows of the 30, 180
 *      and 365-day windows, which only say when a search was last seen. The
 *      pulls are independent and run in parallel; the 16-month one is the
 *      slowest (7 pages, about 34 s measured 2026-10-01).
 *   3. Query x page rows for the 90-day window (the ranking page of every
 *      90-day search, as before). The 16-month query x page pull is NOT made:
 *      it is 318,000 rows over 14 pages and 178 s. Instead the ranking pages
 *      of the wider pool's topics are fetched for exactly those searches with
 *      the regex-filtered request (gsc-client.ts), about 24 small requests.
 *   4. Group into topics, merging topics that differ only by spacing (AUTO-119).
 *      A search the wider window adds joins the 90-day topic with its key when
 *      one exists (adding its 16-month figures), else makes an 'older' topic.
 *   5. The top-7 index (AUTO-121): every 90-day search at position under 8
 *      with at least the floor of impressions, so each topic learns whether
 *      one of its own searches, or a different wording of its words, is
 *      already in the top 7.
 *   6. Rule one: the EXISTING detector, `suggestLinksForKind('blog', ...)`,
 *      with the published blog list loaded ONCE and passed in, so the topics
 *      cost one Sanity read, not one each. The query reaches the detector with
 *      the generic, filler and near-generic words stripped (`detectorInput`).
 *   7. Rule two, the top-7 rule and the verdict: `applyGuard` in topic-pool.ts.
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
  type SaRow,
} from './gsc-client';
import {
  CANNIBALIZATION_THRESHOLD,
  POOL_IMPRESSIONS_FLOOR,
  POOL_LONG_IMPRESSIONS_FLOOR,
  POOL_LONG_WINDOW_DAYS,
  POOL_POSITION_HIGH,
  POOL_POSITION_LOW,
  POOL_WINDOW_DAYS,
  SEEN_WINDOWS_DAYS,
  applyGuard,
  buildTopSevenIndex,
  detectorInput,
  findTopSevenNow,
  groupIntoTopics,
  isPoolQuery,
  seenDaysOf,
  sharedTokensFromReason,
  sitePath,
  topPageByQuery,
  topicQueries,
  type DetectorHit,
  type PoolQuery,
  type Topic,
  type TopicCandidate,
  type WindowFigures,
} from './topic-pool';

export interface TopicPoolSnapshot {
  /** When this snapshot was built (UTC ISO). The panel shows it as "Last read". */
  generatedAt: string;
  property: string;
  window: { start: string; end: string; days: number };
  floor: number;
  /** The wider window and its scaled floor (AUTO-121). */
  longWindow: { start: string; end: string; days: number; floor: number };
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
    /** The wider window (AUTO-121): query rows over 16 months, its band + floor, and the searches it added to the pool. */
    longQueries: number;
    longPoolQueries: number;
    longQueryPages: number;
    addedQueries: number;
    /** Regex-filtered query x page requests made for the added topics' ranking pages, and the rows they returned. */
    pageRequests: number;
    pageRequestRows: number;
    /** Every Search Analytics request made, for the panel's status line. */
    requests: number;
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
  /**
   * Receives every raw row pulled (AUTO-121), so the measuring script can
   * tabulate other floors, the staleness distribution and the top-7 check
   * without a second pull.
   */
  onRaw?: (raw: RawPulls) => void;
  /** Wider-window overrides (tests and the measuring script). */
  longDays?: number;
  longFloor?: number;
}

/** The raw rows of one build (AUTO-121), handed to `onRaw`. */
export interface RawPulls {
  /** Query rows per window, keyed by days back (30, 90, 180, 365 and the wider window). */
  queriesByWindow: Map<number, SaRow[]>;
  /** Query x page rows over the 90-day window. */
  queryPages90: SaRow[];
  /** Query x page rows fetched for the added topics' searches over the wider window. */
  queryPagesLong: SaRow[];
}

export async function buildTopicPoolSnapshot(opts: BuildTopicPoolOptions = {}): Promise<TopicPoolSnapshot> {
  const started = Date.now();
  const days = opts.days ?? POOL_WINDOW_DAYS;
  const floor = opts.floor ?? POOL_IMPRESSIONS_FLOOR;
  const longDays = opts.longDays ?? POOL_LONG_WINDOW_DAYS;
  const longFloor = opts.longFloor ?? POOL_LONG_IMPRESSIONS_FLOOR;
  const positionLow = opts.positionLow ?? POOL_POSITION_LOW;
  const positionHigh = opts.positionHigh ?? POOL_POSITION_HIGH;
  const threshold = opts.threshold ?? CANNIBALIZATION_THRESHOLD;

  // 1. The connection. The key never leaves decodeServiceAccount.
  const sa = decodeServiceAccount(opts.serviceAccountB64 ?? process.env.GSC_SERVICE_ACCOUNT_JSON_B64);
  const token = await getAccessToken(sa);
  let requests = 0;
  const gsc = createGscClient(token, {
    onRequest: (e) => {
      requests += 1;
      opts.onRequest?.(e);
    },
  });

  // 2 + 3. The pulls, in parallel: they are independent and the 16-month one
  // is the long pole. Each is "every row until an empty page".
  const end = daysAgo(0);
  const start = daysAgo(days - 1);
  const longStart = daysAgo(longDays - 1);
  const windowDays = [...new Set<number>([...SEEN_WINDOWS_DAYS, days, longDays])].sort((a, b) => a - b);
  const pull = (d: number, dimensions: string[]) =>
    gsc.searchAnalyticsAll(URL_PREFIX_PROPERTY, {
      startDate: daysAgo(d - 1),
      endDate: end,
      dimensions,
      dataState: 'all',
      type: 'web',
    });
  const [queryPulls, byQueryPage] = await Promise.all([
    Promise.all(windowDays.map((d) => pull(d, ['query']))),
    pull(days, ['query', 'page']),
  ]);
  const queriesByWindow = new Map<number, SaRow[]>();
  windowDays.forEach((d, i) => queriesByWindow.set(d, queryPulls[i].rows));
  const byQuery = queryPulls[windowDays.indexOf(days)];
  const byQueryLong = queryPulls[windowDays.indexOf(longDays)];
  const seenIn = new Map<number, Set<string>>();
  for (const [d, rows] of queriesByWindow) seenIn.set(d, new Set(rows.map((r) => r.keys[0])));
  const longByQuery = new Map(byQueryLong.rows.map((r) => [r.keys[0], r]));
  const recentByQuery = new Map(byQuery.rows.map((r) => [r.keys[0], r]));
  const figuresOf = (r: SaRow): WindowFigures => ({ impressions: r.impressions, clicks: r.clicks, position: Math.round(r.position * 10) / 10 });

  // The 90-day pool, exactly as before, now carrying its 16-month figures.
  const poolRows = byQuery.rows.filter((r) => isPoolQuery(r, { floor, positionLow, positionHigh }));
  const topPage = topPageByQuery(byQueryPage.rows);
  const recentQueries: PoolQuery[] = poolRows.map((r) => {
    const long = longByQuery.get(r.keys[0]);
    return {
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      position: Math.round(r.position * 10) / 10,
      page: sitePath(topPage.get(r.keys[0])),
      long: long ? figuresOf(long) : figuresOf(r),
      seenDays: seenDaysOf(r.keys[0], seenIn),
      window: 'recent',
    };
  });
  const inRecentPool = new Set(recentQueries.map((q) => q.query));

  // The wider pool (AUTO-121): in the band over 16 months with the scaled
  // floor, and not already in the 90-day pool. Its 90-day figures are what
  // Google reported in the last 90 days, if anything.
  const longPoolRows = byQueryLong.rows.filter((r) => isPoolQuery(r, { floor: longFloor, positionLow, positionHigh }));
  const addedRows = longPoolRows.filter((r) => !inRecentPool.has(r.keys[0]));
  const olderQueries: PoolQuery[] = addedRows.map((r) => {
    const recent = recentByQuery.get(r.keys[0]);
    return {
      query: r.keys[0],
      clicks: recent?.clicks ?? 0,
      impressions: recent?.impressions ?? 0,
      position: recent ? Math.round(recent.position * 10) / 10 : null,
      // Filled below for the searches that end up representing an older topic.
      page: recent ? sitePath(topPage.get(r.keys[0])) : null,
      long: figuresOf(r),
      seenDays: seenDaysOf(r.keys[0], seenIn),
      window: 'older',
    };
  });

  // 4. Topics over the union. The ranking pages of the older topics'
  // representative searches (and merged spellings) over the 16 months are
  // fetched for exactly those searches, then the candidates are rebuilt so
  // each older topic carries its page.
  let candidates = groupIntoTopics([...recentQueries, ...olderQueries]);
  const needPages = new Set<string>();
  for (const c of candidates) {
    if (c.window !== 'older') continue;
    for (const q of topicQueries(c)) needPages.add(q);
  }
  let queryPagesLong: SaRow[] = [];
  let pageRequests = 0;
  if (needPages.size > 0) {
    const fetched = await gsc.searchAnalyticsForQueries(
      URL_PREFIX_PROPERTY,
      { startDate: longStart, endDate: end, dimensions: ['query', 'page'], dataState: 'all', type: 'web' },
      [...needPages],
    );
    queryPagesLong = fetched.rows;
    pageRequests = fetched.requests;
    const longTopPage = topPageByQuery(queryPagesLong);
    for (const q of olderQueries) {
      if (needPages.has(q.query)) q.page = sitePath(longTopPage.get(q.query)) ?? q.page;
    }
    candidates = groupIntoTopics([...recentQueries, ...olderQueries]);
  }

  // 5. The top-7 index over the 90-day rows at every position.
  const topSeven = buildTopSevenIndex(
    byQuery.rows.map((r) => ({ query: r.keys[0], position: r.position, impressions: r.impressions, page: sitePath(topPage.get(r.keys[0])) })),
    { floor, positionLow },
  );
  for (const c of candidates) c.topSevenNow = findTopSevenNow(c, topSeven);

  opts.onPool?.([...recentQueries, ...olderQueries]);
  opts.onRaw?.({ queriesByWindow, queryPages90: byQueryPage.rows, queryPagesLong });

  // 6 + 7. The guard. One read of the published blog list for the whole pool.
  const blogDocs = await loadLinkDocsForKind('blog');
  const topics = await guardCandidates(candidates, blogDocs, threshold);

  return {
    generatedAt: new Date().toISOString(),
    property: URL_PREFIX_PROPERTY,
    window: { start, end, days },
    floor,
    longWindow: { start: longStart, end, days: longDays, floor: longFloor },
    band: { low: positionLow, high: positionHigh },
    threshold,
    publishedPosts: blogDocs.length,
    gsc: {
      allQueries: byQuery.rows.length,
      poolQueries: poolRows.length,
      queryPages: byQuery.pages,
      queryPagePages: byQueryPage.pages,
      queryPageRows: byQueryPage.rows.length,
      longQueries: byQueryLong.rows.length,
      longPoolQueries: longPoolRows.length,
      longQueryPages: byQueryLong.pages,
      addedQueries: addedRows.length,
      pageRequests,
      pageRequestRows: queryPagesLong.length,
      requests,
    },
    topics,
    buildMs: Date.now() - started,
  };
}

type BlogLinkDocs = Awaited<ReturnType<typeof loadLinkDocsForKind>>;

/** Rule one's detector for one search, against the preloaded blog list. */
async function detectorHit(input: string, blogDocs: BlogLinkDocs): Promise<DetectorHit | null> {
  if (!input) return null;
  const [best] = await suggestLinksForKind('blog', [input], 1, undefined, blogDocs);
  return best ? { sharedTokens: sharedTokensFromReason(best.reason), postTitle: best.label, postHref: best.href } : null;
}

/**
 * Steps 5 and 6 for a list of candidates: the detector for each topic's main
 * search AND for each merged spelling's own search (AUTO-119, stored on the
 * spelling so the cached snapshot can recompute the verdict), then
 * `applyGuard`. Exported so the measuring script can guard the pre-AUTO-119
 * grouping of the same pull and report the difference like for like.
 */
export async function guardCandidates(
  candidates: TopicCandidate[],
  blogDocs: BlogLinkDocs,
  threshold: number = CANNIBALIZATION_THRESHOLD,
): Promise<Topic[]> {
  const topics: Topic[] = [];
  for (const candidate of candidates) {
    const hit = await detectorHit(candidate.detectorInput, blogDocs);
    const spacingGroups = [];
    for (const g of candidate.spacingGroups ?? []) {
      const gh = await detectorHit(detectorInput(g.query), blogDocs);
      spacingGroups.push({
        ...g,
        sharedTokens: gh?.sharedTokens ?? [],
        matchedPost: gh ? { title: gh.postTitle, href: gh.postHref } : null,
      });
    }
    topics.push(applyGuard({ ...candidate, spacingGroups }, hit, threshold));
  }
  return topics;
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
