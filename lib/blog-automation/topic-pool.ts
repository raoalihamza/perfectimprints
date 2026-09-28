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
}

/** Group pool queries into topics, most impressions first. */
export function groupIntoTopics(queries: PoolQuery[]): TopicCandidate[] {
  const groups = new Map<string, PoolQuery[]>();
  for (const q of queries) {
    const key = topicKey(q.query) || q.query.toLowerCase().trim();
    const list = groups.get(key) ?? [];
    list.push(q);
    groups.set(key, list);
  }
  const topics: TopicCandidate[] = [];
  for (const [key, members] of groups) {
    members.sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));
    const rep = members[0];
    const impressions = members.reduce((n, m) => n + m.impressions, 0);
    const clicks = members.reduce((n, m) => n + m.clicks, 0);
    const weighted = members.reduce((n, m) => n + m.position * m.impressions, 0);
    topics.push({
      key,
      query: rep.query,
      variants: members.map((m) => m.query),
      clicks,
      impressions,
      position: impressions > 0 ? Math.round((weighted / impressions) * 10) / 10 : rep.position,
      page: rep.page,
      detectorInput: detectorInput(rep.query),
    });
  }
  topics.sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));
  return topics;
}

// -- The guard ------------------------------------------------------------------

export type TopicState = 'usable' | 'excluded' | 'blocked';
export type ExclusionRule = 'shared-tokens' | 'ranking-page' | 'both';

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
  state: TopicState;
  rule: ExclusionRule | null;
  reason: string | null;
  sharedTokens: string[];
  matchedPost: { title: string; href: string } | null;
  /** The negative keyword that blocked it, when state is 'blocked'. */
  blockedBy: string | null;
  /** Whether that block is for this topic only or for a word (AUTO-116); null when not blocked. */
  blockedScope: BlockScope | null;
}

export function applyGuard(
  candidate: TopicCandidate,
  hit: DetectorHit | null,
  threshold: number = CANNIBALIZATION_THRESHOLD,
): Topic {
  const decision = decideGuard(candidate, hit, threshold);
  return { ...candidate, ...decision, blockedBy: null, blockedScope: null };
}

/**
 * The cached shape of a topic: the candidate minus the detector input, plus
 * what the detector found. The verdict (state, rule, reason) is NOT stored;
 * `expandTopic` recomputes it from these fields on every read, so the reason
 * wording and the threshold can change without a Search Console refresh, and
 * the cached snapshot stays about a third smaller (measured in the AUTO-110
 * report against the data cache's 2 MB ceiling).
 */
export interface CompactTopic extends Omit<TopicCandidate, 'detectorInput'> {
  sharedTokens: string[];
  matchedPost: { title: string; href: string } | null;
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
  };
}

/** The guard's verdict, recomputed from the stored fields; identical to `applyGuard` at build time. */
export function expandTopic(compact: CompactTopic, threshold: number = CANNIBALIZATION_THRESHOLD): Topic {
  const hit: DetectorHit | null = compact.matchedPost
    ? { sharedTokens: compact.sharedTokens, postTitle: compact.matchedPost.title, postHref: compact.matchedPost.href }
    : null;
  return applyGuard({ ...compact, detectorInput: detectorInput(compact.query) }, hit, threshold);
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
  const t = normalizeBlockTerm(term);
  return topicKey(t) || t.toLowerCase();
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

/** Does this stored block (a plain string is a word block) block this topic? */
export function blockRuleMatches(topic: Pick<TopicCandidate, 'key' | 'query'>, rule: BlockRule | string): boolean {
  const r = toRule(rule);
  if (!r.term) return false;
  if (r.scope === 'topic') return topic.key === topicBlockKey(r.term);
  return negativeKeywordBlocks(topic.query, r.term);
}

/** Every stored block that blocks this topic, in stored order (unblocking must remove them all). */
export function rulesBlockingTopic<R extends BlockRule>(topic: Pick<TopicCandidate, 'key' | 'query'>, rules: readonly R[]): R[] {
  return rules.filter((r) => blockRuleMatches(topic, r));
}

/** The first block that blocks the query's topic, or null. A plain string is a word block. */
export function blockingTerm(query: string, terms: readonly (BlockRule | string)[]): string | null {
  const topic = { key: topicKey(query) || query.toLowerCase().trim(), query };
  for (const term of terms) if (blockRuleMatches(topic, term)) return toRule(term).term;
  return null;
}

/** What a word block would block today: the preview the panel shows BEFORE anything is written. */
export function topicsBlockedByWord<T extends Pick<TopicCandidate, 'key' | 'query'>>(topics: readonly T[], term: string): T[] {
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
  };
  for (const t of topics) {
    if (t.state === 'usable') counts.usable += 1;
    else if (t.state === 'blocked') counts.blocked += 1;
    else counts.excluded += 1;
    if (t.rule === 'shared-tokens') counts.excludedBySharedTokens += 1;
    else if (t.rule === 'ranking-page') counts.excludedByRankingPage += 1;
    else if (t.rule === 'both') counts.excludedByBoth += 1;
  }
  return counts;
}
