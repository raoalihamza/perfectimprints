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
 *
 * Every excluded topic carries its reason and the rule that fired.
 */

import { NEAR_GENERIC_WORDS, NON_SIGNIFICANT_MATCH_WORDS } from '../ai/brand-voice';

// -- The numbers, each in one place -------------------------------------------

/** Days of Search Console history the pool covers (AUTO-100: 90). */
export const POOL_WINDOW_DAYS = 90;
/** Impressions in the window a query needs to enter the pool (AUTO-100: 10). */
export const POOL_IMPRESSIONS_FLOOR = 10;
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

export interface PoolQuery {
  query: string;
  clicks: number;
  impressions: number;
  /** Average position in the window. */
  position: number;
  /** The path of the page that ranks for this query (top page by clicks, then impressions), or null. */
  page: string | null;
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

export interface TopicCandidate {
  /** The grouping key (or the raw query when the key is empty). */
  key: string;
  /** The representative query: the group's member with the most impressions. */
  query: string;
  /** Every member query, most impressions first. */
  variants: string[];
  /** Summed over the group. */
  clicks: number;
  impressions: number;
  /** Impressions-weighted average position over the group. */
  position: number;
  /** The representative query's ranking page. */
  page: string | null;
  /** What rule one sends to the detector. */
  detectorInput: string;
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

const byImpressions = (a: PoolQuery, b: PoolQuery): number => b.impressions - a.impressions || a.query.localeCompare(b.query);

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
    const weighted = members.reduce((n, m) => n + m.position * m.impressions, 0);
    topics.push({
      key: queryTopicKey(rep.query),
      query: rep.query,
      variants: members.map((m) => m.query),
      clicks,
      impressions,
      position: impressions > 0 ? Math.round((weighted / impressions) * 10) / 10 : rep.position,
      page: rep.page,
      detectorInput: detectorInput(rep.query),
      spacingGroups: ordered.slice(1).map((g) => ({
        key: queryTopicKey(g[0].query),
        query: g[0].query,
        page: g[0].page,
        sharedTokens: [],
        matchedPost: null,
      })),
    });
  }
  topics.sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));
  return topics;
}

// -- The guard ------------------------------------------------------------------

export type TopicState = 'usable' | 'excluded' | 'blocked';
/**
 * Why a topic is excluded. The first three are the AUTO-110 guard, decided
 * from the cached Search Console snapshot. 'already-written' (AUTO-117) is
 * decided on every request from the documents themselves: a draft or post
 * whose recorded source topic, or topic keyword, is this topic.
 */
export type ExclusionRule = 'shared-tokens' | 'ranking-page' | 'both' | 'already-written';

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
  return { ...candidate, spacingGroups: groups, ...decision, blockedBy: null, blockedScope: null, writtenAs: null };
}

/**
 * The cached shape of a topic: the candidate minus the detector input, plus
 * what the detector found. The verdict (state, rule, reason) is NOT stored;
 * `expandTopic` recomputes it from these fields on every read, so the reason
 * wording and the threshold can change without a Search Console refresh, and
 * the cached snapshot stays about a third smaller (measured in the AUTO-110
 * report against the data cache's 2 MB ceiling).
 */
export interface CompactTopic extends Omit<TopicCandidate, 'detectorInput' | 'spacingGroups'> {
  sharedTokens: string[];
  matchedPost: { title: string; href: string } | null;
  /** Only present when the topic merged other spellings (AUTO-119), so the cached entry stays small. */
  spacingGroups?: SpacingGroup[];
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
    ...(topic.spacingGroups.length > 0 ? { spacingGroups: topic.spacingGroups } : {}),
  };
}

/** The guard's verdict, recomputed from the stored fields; identical to `applyGuard` at build time. */
export function expandTopic(compact: CompactTopic, threshold: number = CANNIBALIZATION_THRESHOLD): Topic {
  const hit: DetectorHit | null = compact.matchedPost
    ? { sharedTokens: compact.sharedTokens, postTitle: compact.matchedPost.title, postHref: compact.matchedPost.href }
    : null;
  return applyGuard(
    { ...compact, detectorInput: detectorInput(compact.query), spacingGroups: compact.spacingGroups ?? [] },
    hit,
    threshold,
  );
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
  };
  for (const t of topics) {
    if (t.state === 'usable') counts.usable += 1;
    else if (t.state === 'blocked') counts.blocked += 1;
    else counts.excluded += 1;
    if (t.rule === 'shared-tokens') counts.excludedBySharedTokens += 1;
    else if (t.rule === 'ranking-page') counts.excludedByRankingPage += 1;
    else if (t.rule === 'both') counts.excludedByBoth += 1;
    else if (t.rule === 'already-written') counts.excludedAlreadyWritten += 1;
  }
  return counts;
}
