/**
 * The blog opportunity pool and its cannibalization guard (AUTO-110). PURE:
 * no fetch, no Sanity, no fs, so vitest covers every rule and the route,
 * the measuring script and the Studio panel cannot disagree about what a
 * "usable" topic is.
 *
 * What AUTO-100 established, implemented here and not re-derived:
 *
 *   - The pool is every Search Console query of the last 90 days whose average
 *     position is 8 to 40 (striking distance) with at least 10 impressions
 *     (about one showing a week). Queries are grouped into TOPICS by their
 *     sorted significant tokens, plurals folded, so "custom mini footballs"
 *     and "mini football custom" are one row.
 *   - The guard is TWO rules. Rule one: the EXISTING internal-links detector
 *     (`suggestLinksForKind('blog', ...)`) names the tokens a query shares
 *     with the best-matching published post; at or above the threshold the
 *     topic is excluded, because the post exists already. Rule two: a query
 *     whose top ranking page in Search Console is already one of Patrick's
 *     /blog/ posts is excluded too, which catches what the tokenizer misses
 *     ("thunder sticks" against "thundersticks"). The near-generic words
 *     (NEAR_GENERIC_WORDS) are stripped from the query BEFORE it reaches the
 *     detector, so "products" or "gift" alone can never make a match.
 *   - The threshold is `CANNIBALIZATION_THRESHOLD`, the ONE place the number
 *     lives. Ali tunes it here after watching the panel for a few weeks.
 *   - Negative keywords (Patrick's blocked topics, globalSettings.blogAutomation)
 *     are applied LAST and on every request, never inside the cached pool.
 *     Each carries a scope (AUTO-116): 'topic' blocks one topic, 'word'
 *     blocks every topic containing the words.
 *   - A third exclusion (AUTO-117): a topic that already has a draft or a post
 *     written from it, read from the documents on every request (drafts
 *     included), never from the cached snapshot. See "Topics already written".
 *   - The spacing merge (AUTO-119): topics that differ only by spacing
 *     ("custom match books" and "custom matchbooks") are one topic, by exact
 *     string equality of `spacingKey`. No similarity score decides anything
 *     here; the advisory "closest wording" figures live in
 *     topic-similarity.ts and never touch a topic's state.
 *   - The wider window (AUTO-121): the account holds 16 months, and a search
 *     in the band over those 16 months with at least POOL_LONG_IMPRESSIONS_FLOOR
 *     impressions joins the pool even when the last 90 days did not qualify it.
 *     Every topic carries BOTH sets of figures (the last 90 days, which can be
 *     empty, and the 16 months), when it was last seen, and which window put
 *     it in the list. The 90-day pool and its figures are exactly what they
 *     were; the wider window only ADDS rows. "Added by the 16 months" is not
 *     "old": a search seen last week with 4 impressions, or one at position 6
 *     now, is added this way when its 16-month average is in the band; the
 *     row's own figures and its last-seen value say which.
 *   - The top-7 check (AUTO-121, rule 'already-ranking'): a topic whose OWN
 *     impressions-weighted average position over the last 90 days is under 8,
 *     with at least the 90-day floor of impressions, is not an opportunity:
 *     its 16-month average put it in the band, but it is already won now.
 *     That is the pool's own band test applied to the topic's 90-day figures,
 *     so it needs nothing stored and cannot be tipped by one small wording.
 *     Any search with the topic's words in the top 7 (its own or a different
 *     wording) is ALSO named on the row, as information that decides nothing
 *     (measured 2026-10-01: the winning wording is usually the small one,
 *     "rubber duck" at 2.1 with 49 impressions against "custom rubber ducks"
 *     with 1,503 at 23, and "for imprint" at 2.4 with 20 against "custom
 *     imprint" with 432 at 19, so a rule on the wording would hide real
 *     topics; the weighted average keeps both usable).
 *
 * Every excluded topic carries its reason and the rule that fired.
 */

import { NEAR_GENERIC_WORDS, NON_SIGNIFICANT_MATCH_WORDS } from '../ai/brand-voice';

// -- The numbers, each in one place -------------------------------------------

/** Days of Search Console history the pool covers (AUTO-100: 90). */
export const POOL_WINDOW_DAYS = 90;
/** Impressions in the window a query needs to enter the pool (AUTO-100: 10). */
export const POOL_IMPRESSIONS_FLOOR = 10;
/**
 * The wider window (AUTO-121): 16 months of 30 days, inside Google's 16-month
 * retention with a margin, and a FIXED length so the scaled floor below keeps
 * meaning the same rate. Data on the property goes back exactly 496 days
 * (measured 2026-10-01: the first day with data was 2025-05-23).
 */
export const POOL_LONG_WINDOW_DAYS = 480;
/**
 * The floor for the wider window: the 90-day floor at the same RATE, 10 per 90
 * days is 53.3 per 480 days, rounded up to the nearest five. A search with 10
 * impressions in 16 months is not the "one showing a week" AUTO-100 chose 10
 * to mean. Measured 2026-10-01 (band 8 to 40, keys not in the 90-day pool):
 * floor 10 gives 6,887 added topics, 30 gives 3,313, 55 gives 2,062, 100
 * gives 1,252 (AUTO-120's 1,261). The full table is in the AUTO-121 report.
 */
export const POOL_LONG_IMPRESSIONS_FLOOR = 55;
/**
 * The windows a topic's "last seen" is measured in, days back from today. The
 * smallest window in which any of the topic's searches had an impression is
 * its `seenDays`; a topic seen in none of them was seen only in the rest of
 * the 16 months and carries POOL_LONG_WINDOW_DAYS.
 */
export const SEEN_WINDOWS_DAYS = [30, 90, 180, 365] as const;
export type SeenDays = (typeof SEEN_WINDOWS_DAYS)[number] | typeof POOL_LONG_WINDOW_DAYS;
/** The striking-distance band, average position inclusive (AUTO-100: 8 to 40). */
export const POOL_POSITION_LOW = 8;
export const POOL_POSITION_HIGH = 40;
/**
 * Rule one's threshold: a topic sharing this many significant tokens with an
 * existing published post is excluded. AUTO-100 measured 1 as mostly false
 * positives and 2 as mostly real duplicates. THE ONE PLACE this number lives;
 * the route, the script and the panel all read it from here.
 */
export const CANNIBALIZATION_THRESHOLD = 2;
/** Site path prefix that marks "already one of Patrick's blog posts". */
export const BLOG_PATH_PREFIX = '/blog/';
/**
 * The exact API string of the Search Console property the pool reads: the
 * URL-prefix property, trailing slash included (AUTO-100). The domain property
 * also carries feeds.perfectimprints.com and the staging host, which must
 * never feed a blog topic pool for www. Lives here, in the pure module, so the
 * panel's host comparison and the client's request path derive from one
 * string; a wrong string returns HTTP 403 on this account, not an empty result.
 */
export const GSC_PROPERTY = 'https://www.perfectimprints.com/';
/** The host whose URLs are shortened to a path in the panel, from the property. */
export const SITE_HOST = new URL(GSC_PROPERTY).host;

// -- Tokens ---------------------------------------------------------------------

const NEAR_GENERIC: ReadonlySet<string> = new Set<string>(NEAR_GENERIC_WORDS);

/** Lowercase alphanumeric tokens of 3+ characters (the detector's tokenizer). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** Tokens minus the shared non-significant list (generic promo words + filler). */
export function significantTokens(text: string): string[] {
  return tokenize(text).filter((t) => !NON_SIGNIFICANT_MATCH_WORDS.has(t));
}

/** Crude plural fold so "bottles" and "bottle" group together. */
export function singularToken(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith('es') && /(s|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/**
 * The grouping key: sorted, plural-folded significant tokens. Empty for a
 * query made only of generic words ("custom promotional products"); callers
 * fall back to the raw query so such a query is its own topic.
 */
export function topicKey(query: string): string {
  const set = new Set(significantTokens(query).map(singularToken));
  return [...set].sort().join(' ');
}

/**
 * The spacing key (AUTO-119): the same plural-folded significant tokens as
 * `topicKey`, in the order they were typed, with NOTHING between them. So
 * "custom match books", "custom matchbooks" and "custom match-books" all
 * become `matchbook`, and "yard sticks" and "yardsticks" both `yardstick`.
 * Hyphens count as spaces already (the tokenizer splits on them).
 *
 * Why a second key rather than a change to `topicKey`: the topic key is
 * sorted so word order does not split a topic ("mini football custom" and
 * "custom mini footballs" are one row), and a sorted key cannot also ignore
 * spacing ("match books" sorts to "book match", which no joining turns into
 * "matchbook") without a dictionary of compound words. So `topicKey` stays
 * exactly as it was, every stored record and block keeps meaning what it
 * meant, and `groupIntoTopics` merges two topics when any search of one has
 * the same spacing key as any search of the other.
 *
 * Deliberately NOT covered: spelling variants ("koozies" and "coozies",
 * "thunderstix" and "thundersticks"), which differ by letters, not spaces. A
 * rule loose enough to merge those would merge words that are genuinely
 * different, so those stay separate rows for Patrick to judge; the advisory
 * "closest wording" column (topic-similarity.ts) shows them side by side.
 */
export function spacingKey(query: string): string {
  const joined = significantTokens(query).map(singularToken).join('');
  return joined || queryTopicKey(query).replace(/\s+/g, '');
}

/**
 * What rule one hands the detector: the significant tokens with the
 * near-generic words removed as well. The detector folds plurals on the TITLE
 * side, so the query side is left as typed apart from the stripping.
 */
export function detectorInput(query: string): string {
  return significantTokens(query)
    .filter((t) => !NEAR_GENERIC.has(t))
    .join(' ');
}

/**
 * The shared tokens named in a detector reason string
 * ("Existing blog post sharing the keywords: gifts, truck, drivers"). The
 * format caps the list at three, which is why AUTO-100 reported 3+.
 */
export function sharedTokensFromReason(reason: string | undefined): string[] {
  if (!reason) return [];
  const afterColon = reason.split(': ')[1] ?? '';
  return afterColon.split(', ').map((t) => t.trim()).filter(Boolean);
}

// -- Pages ----------------------------------------------------------------------

/** A www URL as its path; anything else verbatim; undefined as null. */
export function sitePath(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host === SITE_HOST ? u.pathname : url;
  } catch {
    return url;
  }
}

export function isBlogPath(path: string | null): boolean {
  return typeof path === 'string' && path.startsWith(BLOG_PATH_PREFIX);
}

/** Which section of the site a path belongs to, for the panel's summary. */
export function sectionOfPath(path: string | null): string {
  if (path === null) return 'none';
  if (path === '/') return 'home';
  const seg = path.split('/')[1];
  return ['cat', 'blog', 'products', 'brands', 'videos', 'services', 'shop-by-theme'].includes(seg)
    ? `/${seg}/`
    : 'other';
}

// -- The pool -------------------------------------------------------------------

/** Clicks, impressions and average position over one window. */
export interface WindowFigures {
  impressions: number;
  clicks: number;
  position: number;
}

/** Which window put a query (or a topic) in the pool (AUTO-121). */
export type PoolWindow = 'recent' | 'older';

export interface PoolQuery {
  query: string;
  /**
   * The LAST 90 DAYS: exactly what these three fields have always been.
   * A query the wider window added may have no 90-day row at all; then
   * clicks and impressions are 0 and position is null.
   */
  clicks: number;
  impressions: number;
  /** Average position over the last 90 days, or null when Google reported nothing in them. */
  position: number | null;
  /** The path of the page that ranks for this query (top page by clicks, then impressions), or null. */
  page: string | null;
  /**
   * The 16-month figures (AUTO-121). Optional on input: a query built without
   * them is taken to have the same figures over 16 months as over 90 days,
   * so every pre-AUTO-121 caller and fixture means what it meant.
   */
  long?: WindowFigures;
  /** The smallest window (days back) in which this query had an impression. Default 90. */
  seenDays?: SeenDays;
  /** Which pool the query qualified through. Default 'recent'. */
  window?: PoolWindow;
}

export interface PoolOptions {
  floor?: number;
  positionLow?: number;
  positionHigh?: number;
}

/** The band and the impressions floor, AUTO-100's Part 3. */
export function isPoolQuery(
  row: { impressions: number; position: number },
  opts: PoolOptions = {},
): boolean {
  const floor = opts.floor ?? POOL_IMPRESSIONS_FLOOR;
  const low = opts.positionLow ?? POOL_POSITION_LOW;
  const high = opts.positionHigh ?? POOL_POSITION_HIGH;
  return row.position >= low && row.position <= high && row.impressions >= floor;
}

/** The 90-day figures of a query, or the empty figures for one Google reported nothing for in 90 days. */
export function recentFiguresOf(q: Pick<PoolQuery, 'impressions' | 'clicks' | 'position'>): { impressions: number; clicks: number; position: number | null } {
  return { impressions: q.impressions, clicks: q.clicks, position: q.position };
}

/** The 16-month figures of a query: its own when given, else its 90-day figures (the pre-AUTO-121 meaning). */
export function longFiguresOf(q: PoolQuery): WindowFigures {
  if (q.long) return q.long;
  return { impressions: q.impressions, clicks: q.clicks, position: q.position ?? 0 };
}

/**
 * The smallest window in which a search had an impression, from the sets of
 * queries Google reported anything for in each window (AUTO-121). A search in
 * none of them was seen only earlier in the 16 months.
 */
export function seenDaysOf(query: string, seenIn: ReadonlyMap<number, ReadonlySet<string>>): SeenDays {
  for (const days of SEEN_WINDOWS_DAYS) {
    if (seenIn.get(days)?.has(query)) return days;
  }
  return POOL_LONG_WINDOW_DAYS;
}

/** The panel's words for a `seenDays` value. */
export function seenDaysLabel(seenDays: SeenDays): string {
  switch (seenDays) {
    case 30:
      return 'in the last 30 days';
    case 90:
      return '1 to 3 months ago';
    case 180:
      return '3 to 6 months ago';
    case 365:
      return '6 to 12 months ago';
    default:
      return 'over a year ago';
  }
}

/**
 * The top page per query from query x page rows: most clicks, then most
 * impressions (AUTO-100's rule).
 */
export function topPageByQuery(
  rows: { keys: string[]; clicks: number; impressions: number }[],
): Map<string, string> {
  const best = new Map<string, { page: string; clicks: number; impressions: number }>();
  for (const r of rows) {
    const [query, page] = r.keys;
    if (!query || !page) continue;
    const cur = best.get(query);
    if (!cur || r.clicks > cur.clicks || (r.clicks === cur.clicks && r.impressions > cur.impressions)) {
      best.set(query, { page, clicks: r.clicks, impressions: r.impressions });
    }
  }
  const out = new Map<string, string>();
  for (const [q, v] of best) out.set(q, v.page);
  return out;
}

/**
 * One of the other spellings folded into a topic by the spacing merge
 * (AUTO-119): the group of searches that had its own row before, keyed and
 * represented exactly as that row was. The guard is decided for it too (see
 * `applyGuard`), and blocks and written records match it, so merging can
 * never make a topic MORE usable than any of its parts was.
 */
export interface SpacingGroup {
  /** Its own `queryTopicKey`, the key its row had before the merge. */
  key: string;
  /** Its own representative search (its member with the most impressions). */
  query: string;
  /** That search's ranking page. */
  page: string | null;
  /** What the detector found for that search (filled by the builder). */
  sharedTokens: string[];
  matchedPost: { title: string; href: string } | null;
}

/**
 * A search with this topic's words that ranks in the top 7 over the last 90
 * days (AUTO-121). `own` is true when it is one of the topic's own searches
 * (the same wording), which is the case that excludes; false when it is a
 * different wording with the same words, which is only shown.
 */
export interface TopSevenNow {
  query: string;
  position: number;
  impressions: number;
  page: string | null;
  own: boolean;
}

export interface TopicCandidate {
  /** The grouping key (or the raw query when the key is empty). */
  key: string;
  /** The representative query: the group's member with the most impressions. */
  query: string;
  /** Every member query, most impressions first. */
  variants: string[];
  /** Summed over the group, over the LAST 90 DAYS (0 when none of the searches was seen in them). */
  clicks: number;
  impressions: number;
  /** Impressions-weighted average position over the group in the last 90 days; null when nothing was seen in them. */
  position: number | null;
  /** The representative query's ranking page. */
  page: string | null;
  /** What rule one sends to the detector. */
  detectorInput: string;
  /** The same three figures over the 16 months (AUTO-121). Optional on a hand-built candidate; always set on a Topic. */
  long?: WindowFigures;
  /** When any of the topic's searches was last seen (AUTO-121). Default 90. */
  seenDays?: SeenDays;
  /** 'recent' when any search qualified through the 90-day pool, else 'older' (AUTO-121). Default 'recent'. */
  window?: PoolWindow;
  /** The top-7 search with these words in the last 90 days, if any (AUTO-121). Default null. */
  topSevenNow?: TopSevenNow | null;
  /**
   * The other spellings merged into this topic (AUTO-119), most impressions
   * first; empty for almost every topic. `key`, `query` and `page` above are
   * the main spelling's, so a topic that merged nothing is exactly what it was.
   * Optional on a candidate (a hand-built one may leave it out); always set on
   * a `Topic`.
   */
  spacingGroups?: SpacingGroup[];
}

/** Every key a topic answers to: its own and its merged spellings' (AUTO-119). */
export function topicKeys(topic: Pick<TopicCandidate, 'key'> & { spacingGroups?: readonly Pick<SpacingGroup, 'key'>[] }): string[] {
  return [topic.key, ...(topic.spacingGroups ?? []).map((g) => g.key)];
}

/** Every representative search a topic answers to: its own and its merged spellings' (AUTO-119). */
export function topicQueries(topic: Pick<TopicCandidate, 'query'> & { spacingGroups?: readonly Pick<SpacingGroup, 'query'>[] }): string[] {
  return [topic.query, ...(topic.spacingGroups ?? []).map((g) => g.query)];
}

export interface GroupOptions {
  /** Merge topics that differ only by spacing (AUTO-119). Default true; false reproduces the AUTO-110 grouping, for the measuring script. */
  mergeSpacing?: boolean;
}

/**
 * The key a query's topic is grouped under: `topicKey`, or the lower-cased
 * query itself when the query is made only of generic words. THE one place
 * this fallback lives: `groupIntoTopics`, the topic block rule and the
 * written-topic record (AUTO-117) all key through it, so a stored search is
 * matched to a row exactly the way the row was built.
 */
export function queryTopicKey(query: string): string {
  const q = query.trim().replace(/\s+/g, ' ');
  return topicKey(q) || q.toLowerCase();
}

/** Most 90-day impressions first, then most 16-month impressions, then A to Z; the representative rule. */
const byImpressions = (a: PoolQuery, b: PoolQuery): number =>
  b.impressions - a.impressions || longFiguresOf(b).impressions - longFiguresOf(a).impressions || a.query.localeCompare(b.query);

/** Topics in the panel's default order: 90-day impressions, then 16-month impressions, then A to Z. */
export function compareTopics(a: Pick<TopicCandidate, 'impressions' | 'long' | 'query'>, b: Pick<TopicCandidate, 'impressions' | 'long' | 'query'>): number {
  return b.impressions - a.impressions || (b.long?.impressions ?? 0) - (a.long?.impressions ?? 0) || a.query.localeCompare(b.query);
}

/**
 * Group pool queries into topics, most impressions first.
 *
 * Step one is the AUTO-110 grouping, unchanged: queries sharing a
 * `queryTopicKey` form one group. Step two (AUTO-119, on by default) merges
 * groups that differ only by spacing: two groups become one topic when any
 * search of one has the same `spacingKey` as any search of the other
 * (transitively, so "thunder sticks noise maker", "thunderstick noisemakers"
 * and "thunder sticks noisemakers" end up together). Exact string equality
 * only: no similarity score and no threshold takes part in this.
 *
 * The merged topic's key, search and page are those of its highest-impression
 * search's group, the way a topic's representative has always been chosen,
 * and the other groups are kept, key and page intact, as `spacingGroups`.
 */
export function groupIntoTopics(queries: PoolQuery[], opts: GroupOptions = {}): TopicCandidate[] {
  const groups = new Map<string, PoolQuery[]>();
  for (const q of queries) {
    const key = queryTopicKey(q.query);
    const list = groups.get(key) ?? [];
    list.push(q);
    groups.set(key, list);
  }
  for (const members of groups.values()) members.sort(byImpressions);

  // Union the groups that share a spacing key (union-find over group keys).
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const k of groups.keys()) parent.set(k, k);
  if (opts.mergeSpacing !== false) {
    const firstBySpacing = new Map<string, string>();
    for (const [k, members] of groups) {
      for (const m of members) {
        const s = spacingKey(m.query);
        const other = firstBySpacing.get(s);
        if (other === undefined) firstBySpacing.set(s, k);
        else if (find(other) !== find(k)) parent.set(find(k), find(other));
      }
    }
  }
  const clusters = new Map<string, string[]>();
  for (const k of groups.keys()) {
    const r = find(k);
    const list = clusters.get(r) ?? [];
    list.push(k);
    clusters.set(r, list);
  }

  const topics: TopicCandidate[] = [];
  for (const keys of clusters.values()) {
    // The groups in the order of their best search, so the first is the main spelling.
    const ordered = keys.map((k) => groups.get(k)!).sort((a, b) => byImpressions(a[0], b[0]));
    const members = ordered.flat().sort(byImpressions);
    const main = ordered[0];
    const rep = main[0];
    const impressions = members.reduce((n, m) => n + m.impressions, 0);
    const clicks = members.reduce((n, m) => n + m.clicks, 0);
    // The 90-day position is averaged over the members Google reported in the
    // last 90 days; with none it is null (AUTO-121), never a made-up number.
    const seen = members.filter((m) => m.position !== null && m.impressions > 0);
    const seenImpressions = seen.reduce((n, m) => n + m.impressions, 0);
    const weighted = seen.reduce((n, m) => n + (m.position as number) * m.impressions, 0);
    const position =
      seenImpressions > 0 ? Math.round((weighted / seenImpressions) * 10) / 10 : (rep.position ?? null);
    const longs = members.map(longFiguresOf);
    const longImpressions = longs.reduce((n, l) => n + l.impressions, 0);
    const longWeighted = longs.reduce((n, l) => n + l.position * l.impressions, 0);
    const long: WindowFigures = {
      impressions: longImpressions,
      clicks: longs.reduce((n, l) => n + l.clicks, 0),
      position: longImpressions > 0 ? Math.round((longWeighted / longImpressions) * 10) / 10 : longFiguresOf(rep).position,
    };
    const seenDays = members.reduce<SeenDays>((best, m) => Math.min(best, m.seenDays ?? 90) as SeenDays, POOL_LONG_WINDOW_DAYS);
    const window: PoolWindow = members.some((m) => (m.window ?? 'recent') === 'recent') ? 'recent' : 'older';
    topics.push({
      key: queryTopicKey(rep.query),
      query: rep.query,
      variants: members.map((m) => m.query),
      clicks,
      impressions,
      position,
      page: rep.page,
      detectorInput: detectorInput(rep.query),
      long,
      seenDays,
      window,
      topSevenNow: null,
      spacingGroups: ordered.slice(1).map((g) => ({
        key: queryTopicKey(g[0].query),
        query: g[0].query,
        page: g[0].page,
        sharedTokens: [],
        matchedPost: null,
      })),
    });
  }
  topics.sort(compareTopics);
  return topics;
}

// -- The top-7 check (AUTO-121) ----------------------------------------------------

/** A 90-day search row as the top-7 index reads it. */
export interface TopSevenRow {
  query: string;
  position: number;
  impressions: number;
  page: string | null;
}

/**
 * The searches that rank in the top 7 over the last 90 days with at least the
 * 90-day floor of impressions (a position seen once is not a rank), indexed by
 * topic key and by spacing key so a topic finds every search with its words.
 */
export function buildTopSevenIndex(
  rows: readonly TopSevenRow[],
  opts: { floor?: number; positionLow?: number } = {},
): Map<string, TopSevenRow[]> {
  const floor = opts.floor ?? POOL_IMPRESSIONS_FLOOR;
  const low = opts.positionLow ?? POOL_POSITION_LOW;
  const index = new Map<string, TopSevenRow[]>();
  const add = (k: string, r: TopSevenRow) => {
    const list = index.get(k) ?? [];
    list.push(r);
    index.set(k, list);
  };
  for (const r of rows) {
    if (!(r.position < low) || r.impressions < floor) continue;
    add(`k:${queryTopicKey(r.query)}`, r);
    add(`s:${spacingKey(r.query)}`, r);
  }
  return index;
}

/**
 * The top-7 search for a topic, if any: one of its OWN searches first, else
 * the best-placed different wording with the same words. Shown on the row,
 * never decided on (the exclusion is `isAlreadyRanking`, over the topic's
 * own figures). Lowest position wins, then most impressions. "Own" means the
 * exact search (case aside), one of the searches grouped into the topic: the
 * spacing key is NOT used for it, because it also folds the generic words and
 * would call "rubber duck" an own search of "custom rubber ducks".
 */
export function findTopSevenNow(
  topic: Pick<TopicCandidate, 'key' | 'variants'> & { spacingGroups?: readonly Pick<SpacingGroup, 'key'>[] },
  index: ReadonlyMap<string, readonly TopSevenRow[]>,
): TopSevenNow | null {
  const own = new Set(topic.variants.map((v) => v.toLowerCase()));
  const found = new Map<string, TopSevenRow>();
  for (const k of topicKeys(topic)) for (const r of index.get(`k:${k}`) ?? []) found.set(r.query, r);
  for (const v of topic.variants) for (const r of index.get(`s:${spacingKey(v)}`) ?? []) found.set(r.query, r);
  let best: TopSevenNow | null = null;
  for (const r of found.values()) {
    const candidate: TopSevenNow = { query: r.query, position: Math.round(r.position * 10) / 10, impressions: r.impressions, page: r.page, own: own.has(r.query.toLowerCase()) };
    if (
      !best ||
      (candidate.own && !best.own) ||
      (candidate.own === best.own && (candidate.position < best.position || (candidate.position === best.position && candidate.impressions > best.impressions)))
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * The AUTO-121 rule: the topic's own impressions-weighted average position
 * over the last 90 days is under the band (the top 7), with at least the
 * 90-day floor of impressions. The same test `isPoolQuery` applies to a
 * search, applied to the topic, from fields the compact shape already stores.
 */
export function isAlreadyRanking(
  topic: Pick<TopicCandidate, 'impressions' | 'position'>,
  opts: { floor?: number; positionLow?: number } = {},
): boolean {
  const floor = opts.floor ?? POOL_IMPRESSIONS_FLOOR;
  const low = opts.positionLow ?? POOL_POSITION_LOW;
  return topic.position !== null && topic.position < low && topic.impressions >= floor;
}

/** The panel's sentence for a topic already won. */
export function alreadyRankingSentence(topic: Pick<TopicCandidate, 'impressions' | 'position' | 'topSevenNow'>): string {
  const top = topic.topSevenNow ?? null;
  const best = top ? `, best for "${top.query}" at ${top.position.toFixed(1)}${top.page ? ` with ${top.page}` : ''}` : '';
  return `You already rank in the top 7 for this topic (average position ${(topic.position ?? 0).toFixed(1)} over ${topic.impressions.toLocaleString('en-US')} impressions in the last 90 days${best}), so it is not an opportunity.`;
}

/** The panel's note for a search with the topic's words in the top 7 (information only). */
export function alsoRankingSentence(top: TopSevenNow): string {
  return `You also rank in the top 7 for ${top.own ? 'the search' : 'the different wording'} "${top.query}" (position ${top.position.toFixed(1)}, ${top.impressions.toLocaleString('en-US')} impressions in the last 90 days${top.page ? `, ${top.page}` : ''}).`;
}

// -- The guard ------------------------------------------------------------------

export type TopicState = 'usable' | 'excluded' | 'blocked';
/**
 * Why a topic is excluded. The first three are the AUTO-110 guard, decided
 * from the cached Search Console snapshot. 'already-written' (AUTO-117) is
 * decided on every request from the documents themselves: a draft or post
 * whose recorded source topic, or topic keyword, is this topic.
 */
export type ExclusionRule = 'shared-tokens' | 'ranking-page' | 'both' | 'already-written' | 'already-ranking';

/** What the detector found for a topic: the best-matching published post. */
export interface DetectorHit {
  sharedTokens: string[];
  postTitle: string;
  postHref: string;
}

export interface GuardDecision {
  state: 'usable' | 'excluded';
  rule: ExclusionRule | null;
  /** A sentence for the panel; null when usable. */
  reason: string | null;
  sharedTokens: string[];
  matchedPost: { title: string; href: string } | null;
}

/**
 * AUTO-100's recommendation, exactly: excluded when the detector names at
 * least `threshold` shared tokens (rule one) OR the ranking page is already a
 * blog post (rule two). Both can fire; the reason then says so.
 */
export function decideGuard(
  candidate: Pick<TopicCandidate, 'page'>,
  hit: DetectorHit | null,
  threshold: number = CANNIBALIZATION_THRESHOLD,
): GuardDecision {
  const sharedTokens = hit?.sharedTokens ?? [];
  const byTokens = hit !== null && sharedTokens.length >= threshold;
  const byPage = isBlogPath(candidate.page);
  const matchedPost = hit ? { title: hit.postTitle, href: hit.postHref } : null;
  if (!byTokens && !byPage) {
    return { state: 'usable', rule: null, reason: null, sharedTokens, matchedPost };
  }
  const tokenSentence = hit
    ? `Shares ${sharedTokens.length} keyword${sharedTokens.length === 1 ? '' : 's'} (${sharedTokens.join(', ')}) with the existing post "${hit.postTitle}".`
    : '';
  const pageSentence = `Your post ${candidate.page} already ranks for this search.`;
  if (byTokens && byPage) {
    return { state: 'excluded', rule: 'both', reason: `${pageSentence} ${tokenSentence}`, sharedTokens, matchedPost };
  }
  if (byTokens) {
    return { state: 'excluded', rule: 'shared-tokens', reason: tokenSentence, sharedTokens, matchedPost };
  }
  return { state: 'excluded', rule: 'ranking-page', reason: pageSentence, sharedTokens, matchedPost };
}

export interface Topic extends TopicCandidate {
  spacingGroups: SpacingGroup[];
  long: WindowFigures;
  seenDays: SeenDays;
  window: PoolWindow;
  topSevenNow: TopSevenNow | null;
  state: TopicState;
  rule: ExclusionRule | null;
  reason: string | null;
  sharedTokens: string[];
  matchedPost: { title: string; href: string } | null;
  /** The negative keyword that blocked it, when state is 'blocked'. */
  blockedBy: string | null;
  /** Whether that block is for this topic only or for a word (AUTO-116); null when not blocked. */
  blockedScope: BlockScope | null;
  /** The draft or post already written from this topic (AUTO-117), or null. */
  writtenAs: WrittenTopicMatch | null;
}

/**
 * The guard for a topic. For a topic the spacing merge built from several
 * spellings (AUTO-119), the main spelling is decided first; if it passes, each
 * other spelling is decided with ITS OWN ranking page and ITS OWN detector hit
 * (stored on the group by the builder), and the first that is excluded
 * excludes the topic, with a reason naming that spelling. Measured on the live
 * pool (2026-09-28) this is exactly the tokenizer blind spot the merge exists
 * for: "custom powerbanks" passed only because "powerbanks" is one token, while
 * "custom branded power banks" shares two keywords with an existing post.
 */
export function applyGuard(
  candidate: TopicCandidate,
  hit: DetectorHit | null,
  threshold: number = CANNIBALIZATION_THRESHOLD,
): Topic {
  let decision = decideGuard(candidate, hit, threshold);
  const groups = candidate.spacingGroups ?? [];
  if (decision.state === 'usable') {
    for (const g of groups) {
      const groupHit: DetectorHit | null = g.matchedPost
        ? { sharedTokens: g.sharedTokens, postTitle: g.matchedPost.title, postHref: g.matchedPost.href }
        : null;
      const d = decideGuard(g, groupHit, threshold);
      if (d.state === 'excluded') {
        // State, rule and reason from the spelling that fired; the main
        // spelling's own detector hit stays in sharedTokens / matchedPost (the
        // compact snapshot stores it there, and the group keeps its own), so
        // `expandTopic` recomputes exactly this.
        decision = { ...decision, state: d.state, rule: d.rule, reason: `The same search spaced differently, "${g.query}": ${d.reason}` };
        break;
      }
    }
  }
  // AUTO-121: a topic already in the top 7 on average over the last 90 days
  // is not an opportunity. It is its own rule when the guard passed; when the
  // guard had already excluded the topic its sentence is appended, so nothing
  // is lost. The top-7 search named on the row never changes the state.
  const top = candidate.topSevenNow ?? null;
  if (isAlreadyRanking(candidate)) {
    const sentence = alreadyRankingSentence({ ...candidate, topSevenNow: top });
    decision =
      decision.state === 'usable'
        ? { ...decision, state: 'excluded', rule: 'already-ranking', reason: sentence }
        : { ...decision, reason: `${decision.reason} ${sentence}` };
  }
  return {
    ...candidate,
    spacingGroups: groups,
    long: candidate.long ?? { impressions: candidate.impressions, clicks: candidate.clicks, position: candidate.position ?? 0 },
    seenDays: candidate.seenDays ?? 90,
    window: candidate.window ?? 'recent',
    topSevenNow: top,
    ...decision,
    blockedBy: null,
    blockedScope: null,
    writtenAs: null,
  };
}

/**
 * The cached shape of a topic: the candidate minus the detector input, plus
 * what the detector found. The verdict (state, rule, reason) is NOT stored;
 * `expandTopic` recomputes it from these fields on every read, so the reason
 * wording and the threshold can change without a Search Console refresh, and
 * the cached snapshot stays about a third smaller (measured in the AUTO-110
 * report against the data cache's 2 MB ceiling).
 */
export interface CompactTopic extends Omit<TopicCandidate, 'detectorInput' | 'spacingGroups' | 'long' | 'seenDays' | 'window' | 'topSevenNow'> {
  sharedTokens: string[];
  matchedPost: { title: string; href: string } | null;
  /** Only present when the topic merged other spellings (AUTO-119), so the cached entry stays small. */
  spacingGroups?: SpacingGroup[];
  /** AUTO-121: the 16-month figures, when seen, which window, and the top-7 search (the last two only when not the default). */
  long: WindowFigures;
  seenDays: SeenDays;
  window?: PoolWindow;
  topSevenNow?: TopSevenNow;
}

export function compactTopic(topic: Topic): CompactTopic {
  return {
    key: topic.key,
    query: topic.query,
    variants: topic.variants,
    clicks: topic.clicks,
    impressions: topic.impressions,
    position: topic.position,
    page: topic.page,
    sharedTokens: topic.sharedTokens,
    matchedPost: topic.matchedPost,
    long: topic.long,
    seenDays: topic.seenDays,
    ...(topic.window !== 'recent' ? { window: topic.window } : {}),
    ...(topic.topSevenNow ? { topSevenNow: topic.topSevenNow } : {}),
    ...(topic.spacingGroups.length > 0 ? { spacingGroups: topic.spacingGroups } : {}),
  };
}

/** The guard's verdict, recomputed from the stored fields; identical to `applyGuard` at build time. */
export function expandTopic(compact: CompactTopic, threshold: number = CANNIBALIZATION_THRESHOLD): Topic {
  const hit: DetectorHit | null = compact.matchedPost
    ? { sharedTokens: compact.sharedTokens, postTitle: compact.matchedPost.title, postHref: compact.matchedPost.href }
    : null;
  return applyGuard(
    {
      ...compact,
      detectorInput: detectorInput(compact.query),
      spacingGroups: compact.spacingGroups ?? [],
      window: compact.window ?? 'recent',
      topSevenNow: compact.topSevenNow ?? null,
    },
    hit,
    threshold,
  );
}

// -- The packed snapshot (AUTO-121) ------------------------------------------------

/**
 * The shape the data cache stores. The compact topics carry the same post
 * (title + href) and the same page path hundreds of times over, and a key
 * that is always `queryTopicKey(query)` by construction; packing writes each
 * post and page once and drops the key. Measured 2026-10-01 on the live pool
 * (4,415 topics, 2,361 from the 90 days and 2,054 added by the 16 months):
 * compact 2,124,973 bytes (2.03 MB, OVER the 2 MB the data cache refuses,
 * silently), packed 940,545 bytes (0.90 MB); the 90-day pool alone packs to
 * 0.54 MB. The round trip is exact; `unpackTopics` returns the compact topics
 * byte for byte.
 */
export interface PackedTopics {
  posts: { title: string; href: string }[];
  pages: string[];
  rows: PackedTopic[];
}

export interface PackedTopic {
  q: string;
  /** Every member search, the representative first, exactly as the topic lists them. */
  v: string[];
  /** [impressions, clicks, position or null] over the last 90 days. */
  r: [number, number, number | null];
  /** [impressions, clicks, position] over the 16 months. */
  l: [number, number, number];
  /** Index into `pages`, or -1. */
  pg: number;
  s: SeenDays;
  /** 1 when the wider window added the topic. */
  o?: 1;
  st: string[];
  /** Index into `posts`, or -1. */
  mp: number;
  /** [query, position, impressions, page index, own] */
  t7?: [string, number, number, number, 0 | 1];
  /** Spacing groups: [query, page index, sharedTokens, post index] */
  sg?: [string, number, string[], number][];
}

function interner<T>(items: T[], keyOf: (t: T) => string): (item: T | null | undefined) => number {
  const index = new Map<string, number>();
  return (item) => {
    if (item === null || item === undefined) return -1;
    const k = keyOf(item);
    let i = index.get(k);
    if (i === undefined) {
      i = items.length;
      items.push(item);
      index.set(k, i);
    }
    return i;
  };
}

export function packTopics(topics: readonly CompactTopic[]): PackedTopics {
  const posts: { title: string; href: string }[] = [];
  const pages: string[] = [];
  const post = interner(posts, (p) => `${p.href}\n${p.title}`);
  const page = interner(pages, (p) => p);
  const rows = topics.map((t): PackedTopic => {
    const row: PackedTopic = {
      q: t.query,
      v: t.variants,
      r: [t.impressions, t.clicks, t.position],
      l: [t.long.impressions, t.long.clicks, t.long.position],
      pg: page(t.page),
      s: t.seenDays,
      st: t.sharedTokens,
      mp: post(t.matchedPost),
    };
    if (t.window === 'older') row.o = 1;
    if (t.topSevenNow) row.t7 = [t.topSevenNow.query, t.topSevenNow.position, t.topSevenNow.impressions, page(t.topSevenNow.page), t.topSevenNow.own ? 1 : 0];
    if (t.spacingGroups && t.spacingGroups.length > 0) {
      row.sg = t.spacingGroups.map((g) => [g.query, page(g.page), g.sharedTokens, post(g.matchedPost)]);
    }
    return row;
  });
  return { posts, pages, rows };
}

export function unpackTopics(packed: PackedTopics): CompactTopic[] {
  const page = (i: number): string | null => (i >= 0 ? packed.pages[i] ?? null : null);
  const post = (i: number): { title: string; href: string } | null => (i >= 0 ? packed.posts[i] ?? null : null);
  return packed.rows.map((row): CompactTopic => {
    const compact: CompactTopic = {
      key: queryTopicKey(row.q),
      query: row.q,
      variants: row.v,
      clicks: row.r[1],
      impressions: row.r[0],
      position: row.r[2],
      page: page(row.pg),
      sharedTokens: row.st,
      matchedPost: post(row.mp),
      long: { impressions: row.l[0], clicks: row.l[1], position: row.l[2] },
      seenDays: row.s,
    };
    if (row.o) compact.window = 'older';
    if (row.t7) compact.topSevenNow = { query: row.t7[0], position: row.t7[1], impressions: row.t7[2], page: page(row.t7[3]), own: row.t7[4] === 1 };
    if (row.sg) {
      compact.spacingGroups = row.sg.map(([query, pg, sharedTokens, mp]) => ({
        key: queryTopicKey(query),
        query,
        page: page(pg),
        sharedTokens,
        matchedPost: post(mp),
      }));
    }
    return compact;
  });
}

// -- Topics already written (AUTO-117) -------------------------------------------

/**
 * AUTO-115 measured the guard blind to its own output: a post generated and
 * published from "custom printed sunglasses" left all 2,423 topics exactly as
 * they were. Rule one cannot fire on a one-token topic (that query reduces to
 * `sunglasses`), rule two waits for Google to rank the new post, and the
 * detector reads PUBLISHED posts only, so a draft is invisible to both.
 *
 * So the guard now reads a RECORD instead of guessing: the topic a post was
 * generated from, stored on the post, matched to the row by the same key the
 * row was grouped under (`queryTopicKey`). A draft counts the moment it
 * exists, published or not, however few significant tokens the topic has.
 *
 * Two sources of that record, both stored on the document, neither inferred:
 *
 *   - 'recorded': `blogPost.sourceTopic`, written by the Blog Topics panel in
 *     the same create that makes the draft (and by Stage 2's scheduler, when
 *     it exists). Read only in Studio.
 *   - 'keyword': `blogPost.aiTopicKeywords`, the keywords a post was written
 *     for. The panel has stored `[topic.query]` there on every draft it made
 *     since AUTO-110, so drafts made before the record existed are still
 *     recognised; a keyword Patrick typed to steer a post is the same
 *     statement ("this post is about X") and is matched the same exact way.
 *
 * What it matches: an exact topic key, nothing looser. "custom printed
 * sunglasses" and "sunglasses custom" are one key (`sunglass`: the generic
 * words drop out), so both are covered; "engraved sunglasses" is another key
 * (`engraved sunglass`) and stays usable. Near synonyms are a Stage 2
 * scheduling question (measured in AUTO-117), not this rule's.
 */

/** The stored shape of `blogPost.sourceTopic`. */
export interface SourceTopicRecord {
  /** The topic's search term as the panel showed it. */
  query: string;
  /** The searches grouped into that topic, the representative first. */
  variants: string[];
  /** The grouping key at the time, for reading only; matching recomputes it from the searches. */
  key: string;
  /** When the record was written (UTC ISO). */
  recordedAt: string;
}

/** Variants kept on the record; a topic rarely has more, and they all share one key anyway. */
export const SOURCE_TOPIC_MAX_VARIANTS = 25;

function oneLine(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** What the panel (and later Stage 2) stores on the draft it creates from a topic. */
export function buildSourceTopicRecord(
  topic: Pick<TopicCandidate, 'key' | 'query' | 'variants'> & { spacingGroups?: readonly Pick<SpacingGroup, 'query'>[] },
  recordedAt: string,
): SourceTopicRecord {
  const query = oneLine(topic.query);
  // AUTO-119: each merged spelling's own search comes right after the main
  // one, so the record names every key the topic answers to even when the
  // topic has more than SOURCE_TOPIC_MAX_VARIANTS searches.
  const spellings = (topic.spacingGroups ?? []).map((g) => oneLine(g.query));
  const variants = [query, ...spellings, ...topic.variants.map(oneLine)]
    .filter((v, i, all) => v !== '' && all.indexOf(v) === i)
    .slice(0, SOURCE_TOPIC_MAX_VARIANTS);
  return { query, variants, key: topic.key, recordedAt };
}

/**
 * The read behind this rule: drafts and published posts that carry either
 * record. In the pure module so the server read (written-topics.ts) and the
 * panel's check just before it calls the AI run the SAME query through the
 * SAME parser. `versions.**` (Content Releases) is excluded; the parser
 * ignores any other dotted id as well. It returns drafts only through a
 * client that can see them (the server token, or a signed-in Studio).
 */
export const WRITTEN_TOPICS_QUERY = `*[_type == "blogPost" && !(_id in path("versions.**")) && (defined(sourceTopic.query) || count(aiTopicKeywords) > 0)]{ _id, title, "sourceTopic": sourceTopic{ query, variants }, aiTopicKeywords }`;

/** A blog document as read for this rule, drafts included. */
export interface WrittenTopicDoc {
  _id: string;
  title?: string | null;
  sourceTopic?: { query?: unknown; variants?: unknown } | null;
  aiTopicKeywords?: unknown;
}

/** One document (draft and published copy collapsed) and the searches it was written for. */
export interface WrittenTopicSource {
  /** The document id without the `drafts.` prefix. */
  documentId: string;
  title: string;
  status: 'draft' | 'published';
  via: 'recorded' | 'keyword';
  /** The searches this document covers; each is matched by its topic key. */
  queries: string[];
}

export interface WrittenTopicMatch {
  documentId: string;
  title: string;
  status: 'draft' | 'published';
  via: 'recorded' | 'keyword';
  /** The stored search that matched this topic. */
  matchedQuery: string;
}

const DRAFT_PREFIX = 'drafts.';

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map(oneLine)
    .filter(Boolean);
}

/**
 * The documents as sources. A draft and its published copy become ONE source
 * (published when the published copy exists, its title preferred, the
 * searches of both merged). A document with a recorded topic is 'recorded',
 * its recorded searches first; otherwise its topic keywords make it a
 * 'keyword' source; with neither it is not a source. Ids outside the plain
 * and `drafts.` namespaces (Content Releases versions) are ignored.
 */
export function writtenTopicSources(docs: readonly WrittenTopicDoc[]): WrittenTopicSource[] {
  const byId = new Map<string, { title: string; published: boolean; recorded: string[]; keywords: string[] }>();
  for (const doc of docs) {
    if (!doc || typeof doc._id !== 'string') continue;
    const isDraft = doc._id.startsWith(DRAFT_PREFIX);
    const baseId = isDraft ? doc._id.slice(DRAFT_PREFIX.length) : doc._id;
    if (!baseId || baseId.includes('.')) continue;
    const recordQuery = typeof doc.sourceTopic?.query === 'string' ? doc.sourceTopic.query : '';
    const recorded = strings([recordQuery, ...strings(doc.sourceTopic?.variants)]);
    // A keyword too vague to be a statement of topic is not a record (see isVagueTopicKeyword).
    const keywords = strings(doc.aiTopicKeywords).filter((k) => !isVagueTopicKeyword(k));
    const title = typeof doc.title === 'string' ? doc.title.trim() : '';
    const cur = byId.get(baseId) ?? { title: '', published: false, recorded: [], keywords: [] };
    if (!isDraft) cur.published = true;
    if (title && (!cur.title || !isDraft)) cur.title = title;
    cur.recorded.push(...recorded);
    cur.keywords.push(...keywords);
    byId.set(baseId, cur);
  }
  const out: WrittenTopicSource[] = [];
  for (const [documentId, v] of byId) {
    const via = v.recorded.length > 0 ? 'recorded' : 'keyword';
    const queries = [...v.recorded, ...v.keywords].filter((q, i, all) => all.indexOf(q) === i);
    if (queries.length === 0) continue;
    out.push({ documentId, title: v.title || 'Untitled post', status: v.published ? 'published' : 'draft', via, queries });
  }
  return out.sort((a, b) => a.documentId.localeCompare(b.documentId));
}

/**
 * Which source wins when several cover one topic: a published post over a
 * draft (the stronger statement), a recorded topic over a keyword, then the
 * document id (the sources arrive sorted), so the answer never depends on
 * read order.
 */
function sourceRank(s: WrittenTopicSource): number {
  return (s.status === 'published' ? 0 : 2) + (s.via === 'recorded' ? 0 : 1);
}

/**
 * A topic keyword too vague to claim a topic: its key is made only of the
 * near-generic words ("80's promotional products" keys to `product`, because
 * the tokenizer drops "80"). Measured on the live data (AUTO-117): exactly
 * that keyword would otherwise claim "promotional product ideas" for a post
 * about retro products. A RECORDED topic is never vague in this sense (it is
 * the exact row the panel showed), so the rule applies to keywords only.
 */
export function isVagueTopicKeyword(query: string): boolean {
  const tokens = topicKey(query).split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => NEAR_GENERIC.has(t));
}

interface RankedMatch {
  rank: number;
  match: WrittenTopicMatch;
}

function rankedWrittenIndex(sources: readonly WrittenTopicSource[]): Map<string, RankedMatch> {
  const index = new Map<string, RankedMatch>();
  for (const s of sources) {
    const rank = sourceRank(s);
    for (const q of s.queries) {
      const key = queryTopicKey(q);
      if (!key) continue;
      const cur = index.get(key);
      if (cur && cur.rank <= rank) continue;
      index.set(key, {
        rank,
        match: { documentId: s.documentId, title: s.title, status: s.status, via: s.via, matchedQuery: q },
      });
    }
  }
  return index;
}

/** Every stored search's topic key, to the best source covering it. */
export function writtenTopicIndex(sources: readonly WrittenTopicSource[]): Map<string, WrittenTopicMatch> {
  const out = new Map<string, WrittenTopicMatch>();
  for (const [k, v] of rankedWrittenIndex(sources)) out.set(k, v.match);
  return out;
}

type KeyedTopic = Pick<TopicCandidate, 'key'> & { spacingGroups?: readonly Pick<SpacingGroup, 'key'>[] };

/**
 * The best source for ANY of the topic's keys (AUTO-119): a record written
 * for "custom match books" before the spacing merge keys to `book match`,
 * which is one of the merged "custom matchbooks" topic's keys, so it still
 * excludes that topic. Ties go by the same rank as within one key.
 */
function bestWrittenMatch(topic: KeyedTopic, index: Map<string, RankedMatch>): WrittenTopicMatch | null {
  let best: RankedMatch | null = null;
  for (const k of topicKeys(topic)) {
    const m = index.get(k);
    if (m && (!best || m.rank < best.rank)) best = m;
  }
  return best?.match ?? null;
}

/** The draft or post already covering this topic, or null. */
export function findWrittenTopic(topic: KeyedTopic, sources: readonly WrittenTopicSource[]): WrittenTopicMatch | null {
  return bestWrittenMatch(topic, rankedWrittenIndex(sources));
}

/** The panel's sentence for an already-written topic. */
export function writtenSentence(match: WrittenTopicMatch): string {
  const title = `"${match.title}"`;
  const notYet = ' It counts even though it is not published yet.';
  if (match.via === 'recorded') {
    return match.status === 'draft'
      ? `You already generated a draft from this topic: ${title}.${notYet}`
      : `You already have a post generated from this topic: ${title}.`;
  }
  return match.status === 'draft'
    ? `Your draft ${title} was written for the keyword "${match.matchedQuery}".${notYet}`
    : `Your post ${title} was written for the keyword "${match.matchedQuery}".`;
}

/**
 * The AUTO-117 rule, applied on top of the guard and BEFORE the negative
 * keywords: a topic covered by a draft or post is excluded with rule
 * 'already-written'. That reason is shown FIRST, because it is a stored fact
 * about Patrick's own documents where the other two rules are inferences;
 * when the guard had also excluded the topic, its sentence follows, so
 * nothing it said is lost. A block still wins over this (it is Patrick's
 * explicit choice), and `applyNegativeKeywords` keeps this verdict underneath.
 * A topic already marked is left as it is, so the panel can re-apply with a
 * longer list (the draft it has just created) without doubling the sentence.
 */
export function applyWrittenTopics(topics: readonly Topic[], sources: readonly WrittenTopicSource[]): Topic[] {
  if (sources.length === 0) return [...topics];
  const index = rankedWrittenIndex(sources);
  return topics.map((t) => {
    if (t.writtenAs) return t;
    const match = bestWrittenMatch(t, index);
    if (!match) return t;
    const sentence = writtenSentence(match);
    return {
      ...t,
      state: t.state === 'blocked' ? 'blocked' : 'excluded',
      rule: 'already-written',
      reason: t.reason ? `${sentence} ${t.reason}` : sentence,
      writtenAs: match,
    };
  });
}

// -- Negative keywords ----------------------------------------------------------

/**
 * AUTO-116: a stored block has a SCOPE, because Patrick has two genuine
 * intentions and AUTO-115 found the panel serving only the wider one.
 *
 *   - 'topic': "keep THIS topic off the list". What the tick box writes. It
 *     matches the one topic whose grouping key (`topicKey`, the same key
 *     `groupIntoTopics` gives a query) equals the term's, so ticking "custom
 *     pens" blocks that one row, not every topic that mentions pens.
 *   - 'word': "keep every topic containing these words off the list". What the
 *     separate "Block a word" control writes, after showing the list. It is
 *     the AUTO-110 rule (`negativeKeywordBlocks`), unchanged.
 *
 * An entry stored with NO scope (every entry written before AUTO-116, and any
 * term typed by hand in Global Settings) is a 'word' block. That is what it
 * has always meant, what the field's help text has always said, and what
 * Patrick's "imprinted sunglasses" has been doing since 2026-09-26, so no
 * stored entry changes meaning on deploy.
 */
export type BlockScope = 'topic' | 'word';

export interface BlockRule {
  term: string;
  scope: BlockScope;
}

/**
 * The ONE normalisation of a stored term, applied on write AND on compare:
 * trimmed, inner whitespace collapsed to one space. Case is kept as written
 * (it is shown back to Patrick); every comparison lower-cases, the way
 * `resolveBlogAutomation` de-duplicates. A term saved with a stray space can
 * therefore always be matched and removed (AUTO-115's trim bug).
 */
export function normalizeBlockTerm(term: unknown): string {
  return typeof term === 'string' ? term.trim().replace(/\s+/g, ' ') : '';
}

/** A stored scope value as a scope. Anything but 'topic', including a missing value, is 'word'. */
export function blockScopeOf(raw: unknown): BlockScope {
  return raw === 'topic' ? 'topic' : 'word';
}

function toRule(rule: BlockRule | string): BlockRule {
  return typeof rule === 'string'
    ? { term: normalizeBlockTerm(rule), scope: 'word' }
    : { term: normalizeBlockTerm(rule.term), scope: blockScopeOf(rule.scope) };
}

/** What a tick writes for a topic: its own search, scoped to that topic. */
export function topicBlockRule(topic: Pick<TopicCandidate, 'query'>): BlockRule {
  return { term: normalizeBlockTerm(topic.query), scope: 'topic' };
}

/** The grouping key a topic-scoped term matches, computed exactly as `groupIntoTopics` keys a query. */
export function topicBlockKey(term: string): string {
  return queryTopicKey(normalizeBlockTerm(term));
}

/** Two stored entries mean the same block: same scope, same term ignoring case and stray spaces. */
export function sameBlockRule(a: BlockRule | string, b: BlockRule | string): boolean {
  const x = toRule(a);
  const y = toRule(b);
  return x.scope === y.scope && x.term.toLowerCase() === y.term.toLowerCase();
}

/** Plain tokens of 2+ characters, plural folded; nothing stripped. */
function blockTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .map(singularToken);
}

/**
 * The WORD rule (AUTO-110, unchanged): a term blocks a query when every
 * SIGNIFICANT token of the term (plural folded) appears in the query. So the
 * term "paramedics" blocks "fun facts about paramedics" and "paramedic gifts".
 * A whole search used as a word block ("fun facts about paramedics") blocks
 * its own topic AND every longer search containing all its words, which is
 * why the tick box no longer writes word blocks (AUTO-116: ticking "custom
 * pens" used to block 77 topics). A term made only of generic words ("custom
 * products") falls back to its plain tokens, so it blocks queries carrying
 * all of those words rather than everything.
 */
export function negativeKeywordBlocks(query: string, term: string): boolean {
  const significant = new Set(significantTokens(term).map(singularToken));
  const need = significant.size > 0 ? significant : new Set(blockTokens(term));
  if (need.size === 0) return false;
  const have = new Set(blockTokens(query));
  for (const t of need) if (!have.has(t)) return false;
  return true;
}

/** A topic as the block rules read it; `spacingGroups` is optional so a bare `{key, query}` still works. */
export type BlockableTopic = Pick<TopicCandidate, 'key' | 'query'> & {
  spacingGroups?: readonly Pick<SpacingGroup, 'key' | 'query'>[];
};

/**
 * Does this stored block (a plain string is a word block) block this topic?
 *
 * AUTO-119: a merged topic is checked through each of its spellings exactly
 * as that spelling's own row was checked before the merge (a topic block
 * against each spelling's key, a word block against each spelling's
 * representative search), so every block that blocked a row before the merge
 * still blocks the topic that row is now part of. The one consequence, stated
 * rather than hidden: a block that covered ONE spelling now covers the merged
 * topic as a whole, because it is one topic.
 */
export function blockRuleMatches(topic: BlockableTopic, rule: BlockRule | string): boolean {
  const r = toRule(rule);
  if (!r.term) return false;
  if (r.scope === 'topic') return topicKeys(topic).includes(topicBlockKey(r.term));
  return topicQueries(topic).some((q) => negativeKeywordBlocks(q, r.term));
}

/** Every stored block that blocks this topic, in stored order (unblocking must remove them all). */
export function rulesBlockingTopic<R extends BlockRule>(topic: BlockableTopic, rules: readonly R[]): R[] {
  return rules.filter((r) => blockRuleMatches(topic, r));
}

/** The first block that blocks the query's topic, or null. A plain string is a word block. */
export function blockingTerm(query: string, terms: readonly (BlockRule | string)[]): string | null {
  const topic = { key: queryTopicKey(query), query };
  for (const term of terms) if (blockRuleMatches(topic, term)) return toRule(term).term;
  return null;
}

/** What a word block would block today: the preview the panel shows BEFORE anything is written. */
export function topicsBlockedByWord<T extends BlockableTopic>(topics: readonly T[], term: string): T[] {
  const rule: BlockRule = { term: normalizeBlockTerm(term), scope: 'word' };
  return rule.term ? topics.filter((t) => blockRuleMatches(t, rule)) : [];
}

/** Apply Patrick's blocks on top of the guard; blocked wins over everything. A plain string is a word block. */
export function applyNegativeKeywords(topics: readonly Topic[], rules: readonly (BlockRule | string)[]): Topic[] {
  const normalized = rules.map(toRule).filter((r) => r.term);
  return topics.map((t) => {
    const hit = normalized.find((r) => blockRuleMatches(t, r)) ?? null;
    // The guard's own verdict is kept underneath (rule + reason), so unblocking
    // restores exactly what the guard said, not a blanket "usable".
    const guardState: TopicState = t.rule ? 'excluded' : 'usable';
    if (hit === null) {
      return t.state === 'blocked' ? { ...t, state: guardState, blockedBy: null, blockedScope: null } : t;
    }
    return { ...t, state: 'blocked', blockedBy: hit.term, blockedScope: hit.scope };
  });
}

/** The panel's sentence for a blocked topic; the guard's reason stays in `reason`. */
export function blockedSentence(term: string, scope: BlockScope = 'word'): string {
  return scope === 'topic'
    ? 'Blocked by you (this topic only).'
    : `Blocked by your word block "${term}", which blocks every topic containing it.`;
}

// -- Counts ---------------------------------------------------------------------

export interface TopicCounts {
  topics: number;
  usable: number;
  excluded: number;
  blocked: number;
  excludedBySharedTokens: number;
  excludedByRankingPage: number;
  excludedByBoth: number;
  /** Excluded because a draft or post already covers the topic (AUTO-117), whatever the guard said. */
  excludedAlreadyWritten: number;
  /** Excluded because the topic already ranks in the top 7 on average over the last 90 days (AUTO-121), the guard having passed it. */
  excludedAlreadyRanking: number;
  /** Topics seen in the last 90 days (the 90-day pool) and topics only the wider window added (AUTO-121). */
  recent: number;
  older: number;
}

export function countTopics(topics: readonly Topic[]): TopicCounts {
  const counts: TopicCounts = {
    topics: topics.length,
    usable: 0,
    excluded: 0,
    blocked: 0,
    excludedBySharedTokens: 0,
    excludedByRankingPage: 0,
    excludedByBoth: 0,
    excludedAlreadyWritten: 0,
    excludedAlreadyRanking: 0,
    recent: 0,
    older: 0,
  };
  for (const t of topics) {
    if (t.state === 'usable') counts.usable += 1;
    else if (t.state === 'blocked') counts.blocked += 1;
    else counts.excluded += 1;
    if (t.rule === 'shared-tokens') counts.excludedBySharedTokens += 1;
    else if (t.rule === 'ranking-page') counts.excludedByRankingPage += 1;
    else if (t.rule === 'both') counts.excludedByBoth += 1;
    else if (t.rule === 'already-written') counts.excludedAlreadyWritten += 1;
    else if (t.rule === 'already-ranking') counts.excludedAlreadyRanking += 1;
    if (t.window === 'older') counts.older += 1;
    else counts.recent += 1;
  }
  return counts;
}
