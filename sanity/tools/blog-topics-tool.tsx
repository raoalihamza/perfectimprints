/**
 * "Blog Topics" Studio tool (AUTO-110, Stage 1 of the blog automation
 * module). A dedicated top-level Studio tab, like Site Refresh and Bulk
 * Upload, where Patrick sees the actual list of search terms the blog
 * engine would write about, judges it, blocks what he does not want, and
 * generates a draft from any term he picks. NOTHING here runs on its own.
 *
 *   - The list is the opportunity pool from HIS Search Console: every search
 *     his site already shows for at position 8 to 40 with at least 10
 *     impressions in 90 days, grouped into topics. The figures are
 *     IMPRESSIONS and clicks from Search Console, labelled as such; they are
 *     not "search volume" (that arrives with the paid keyword source, AUTO-120).
 *   - Each topic shows whether the cannibalization guard passed it or
 *     excluded it, and why (the existing post it overlaps with, or the post
 *     of his that already ranks for it).
 *   - The "Block" tick box blocks THAT ONE TOPIC (AUTO-116; it used to write a
 *     word block, so ticking "custom pens" hid 77 topics). "Block a word"
 *     blocks every topic containing a word, and shows the full list before it
 *     writes. Both write to Global Settings > Blog Automation (the negative
 *     keyword screen) through the cookie-authed Studio client, in Patrick's
 *     browser: into the published document AND the draft if one is open, the
 *     Q-155 rule, so a later publish from an open draft cannot silently
 *     un-block it. Terms are normalised on write and compare, and removed by
 *     `_key`, so a term saved with a stray space can always be unblocked.
 *   - "Generate draft" calls the existing /api/sanity/generate-blog route
 *     with the same body the document action sends and, only once the post
 *     has come back, creates the blogPost DRAFT with everything in it
 *     (AUTO-116: nothing is created before, so a closed tab leaves nothing).
 *     It never publishes and sets no publish date (that is stamped on Publish).
 *   - AUTO-119: topics that differ only by spacing ("custom match books",
 *     "custom matchbooks") arrive as ONE row, the other spelling named under
 *     the term. And each row shows its "closest wording": the other topics
 *     and the published post worded most like it, scored 0 to 100. That
 *     column is ADVISORY. It is fetched separately, after the list, and
 *     nothing reads it but the renderer: no topic is hidden, excluded,
 *     merged or reordered because of a score, and if the figures cannot be
 *     had the tab says so in one line and works exactly as before.
 *   - AUTO-117: that create also stores the topic on the draft
 *     (`sourceTopic`), and the guard reads it back, drafts included, on every
 *     pool call. So a topic leaves the usable list the moment its draft
 *     exists, not when it is published, and not when Google ranks it. Just
 *     before calling the AI, the tab re-reads the drafts live, so a draft made
 *     in another tab (or by Stage 2) since the list loaded is caught too.
 *   - AUTO-121: the list also holds the searches in the band over the last
 *     16 MONTHS (the account holds that much) that the last 90 days did not
 *     qualify. Every row shows its 90-day figures (the ones it always showed;
 *     "none" when Google reported nothing in 90 days), its 16-month figures,
 *     and when it was LAST SEEN, and a "Seen" filter separates the two: the
 *     default view is exactly the 90-day list as before. "Last seen" is a
 *     fact from Search Console, shown in words, with no colour and no label
 *     such as "stale"; a topic last seen a year ago is Patrick's to judge.
 *     One more rule, "already ranking": a topic that already sits in the top
 *     7 on average over the last 90 days is excluded and says so; a search
 *     with its words in the top 7 is mentioned on the row as information.
 *   - AUTO-123: a "Searches a month (Google Ads)" column, the search volume
 *     Patrick was promised, read from the committed file
 *     data/blog-automation/search-volumes.json that Ali refreshes a few times
 *     a year through Patrick's DataForSEO account (nothing on the server calls
 *     any keyword API). Labelled so it cannot be read as impressions. A row
 *     says "not looked up" (nobody fetched it yet), "no figure from Google
 *     Ads" (fetched, Google had none) or the number, 0 included (a real
 *     answer: no demand for that exact wording). The notice above the table
 *     says how many topics have a figure and how old the figures are. It is
 *     ADVISORY like the closest-wording column: it changes no state, no
 *     count and no default order; "Searches a month" is an offered sort,
 *     never the default, and with the file missing the tab is exactly what
 *     it was.
 *
 * Auth: the same nonce handshake the nine generate routes use
 * (useGenerateAuthFetch), so one Studio session serves this tab and every
 * Generate button. Studio-only: plain React + the `sanity` client, no
 * @sanity/ui; the only lib import is the PURE topic-pool module (types +
 * the negative keyword rule), never the server-side builder.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient, useCurrentUser, type Tool } from 'sanity';
import { useRouter } from 'sanity/router';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';
import {
  WRITTEN_TOPICS_QUERY,
  applyNegativeKeywords,
  applyWrittenTopics,
  buildSourceTopicRecord,
  findWrittenTopic,
  writtenSentence,
  writtenTopicSources,
  alsoRankingSentence,
  blockedSentence,
  blockScopeOf,
  compareTopics,
  countTopics,
  seenDaysLabel,
  normalizeBlockTerm,
  rulesBlockingTopic,
  sameBlockRule,
  topicBlockRule,
  topicsBlockedByWord,
  type BlockRule,
  type Topic,
  type TopicCounts,
  type WrittenTopicDoc,
  type WrittenTopicSource,
} from '../../lib/blog-automation/topic-pool';
import {
  expandSimilarity,
  type CompactTopicSimilarity,
  type TopicSimilarity,
  type TopicSimilarityResult,
} from '../../lib/blog-automation/topic-similarity';
import {
  buildVolumeIndex,
  dayWords,
  lookupVolume,
  monthWords,
  summarizeSearchVolumeFile,
  volumeCellWords,
  type SearchVolumeFile,
  type VolumeIndex,
  type VolumeLookup,
} from '../../lib/blog-automation/search-volume';
import { slugifyTitle } from '../actions/blog-generate-plan';

// Theme CSS variables so the panel is readable in light AND dark Studio themes.
const FG = 'var(--card-fg-color, #1a1a1a)';
const MUTED = 'var(--card-muted-fg-color, #6b7280)';
const BORDER = 'var(--card-border-color, #ced2d9)';
const GREEN = '#16a34a';
const RED = '#e11f1e';
const AMBER = '#d97706';
const BLUE = '#3b82f6';

const card: React.CSSProperties = {
  maxWidth: 1240,
  margin: '0 auto',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  color: FG,
};
const primaryBtn: React.CSSProperties = {
  background: GREEN,
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '6px 12px',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
  whiteSpace: 'nowrap',
};
const secondaryBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: FG,
  borderRadius: 4,
  padding: '6px 12px',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
  whiteSpace: 'nowrap',
};
const disabledBtn: React.CSSProperties = { ...primaryBtn, background: '#9ca3af', cursor: 'default' };
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: `2px solid ${BORDER}`,
  fontSize: 12,
  color: MUTED,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: `1px solid ${BORDER}`,
  fontSize: 13,
  verticalAlign: 'top',
};
// The Studio's own card background, not `transparent`: a native <select> with
// a transparent background paints its option list in the browser's default
// colours, which in the dark theme is unreadable (dark text on a dark popup).
const CARD_BG = 'var(--card-bg-color, #ffffff)';
const input: React.CSSProperties = {
  font: 'inherit',
  fontSize: 13,
  padding: '6px 8px',
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  background: CARD_BG,
  color: FG,
};
const select: React.CSSProperties = { ...input, cursor: 'pointer' };
/** Options do not inherit the select's colours in every browser; set both explicitly. */
const option: React.CSSProperties = { background: CARD_BG, color: FG };

const API_URL = '/api/sanity/blog-topics';
const GENERATE_URL = '/api/sanity/generate-blog';
const SETTINGS_ID = 'globalSettings';
const SETTINGS_DRAFT_ID = 'drafts.globalSettings';
const PAGE_SIZE = 50;
const DEFAULT_WORD_COUNT = 1500;

type StateFilter = 'all' | 'usable' | 'excluded' | 'blocked';
/** AUTO-121: the default is the 90-day list, exactly what the tab showed before. */
type SeenFilter = 'recent' | 'older' | 'all';
/** 'volume' (AUTO-123) is offered, never the default, and always tie-broken by `compareTopics`. */
type SortKey = 'impressions' | 'longImpressions' | 'clicks' | 'position' | 'longPosition' | 'volume' | 'query';
type Template = 'list' | 'single';

interface NegativeKeywordEntry extends BlockRule {
  _key: string;
  addedAt?: string;
  note?: string;
}

/** A stored entry as the panel uses it: term normalised, scope read ('word' when missing). */
function toEntry(raw: { _key?: string; term?: unknown; scope?: unknown; addedAt?: string; note?: string }): NegativeKeywordEntry {
  return {
    _key: raw._key ?? '',
    term: normalizeBlockTerm(raw.term),
    scope: blockScopeOf(raw.scope),
    addedAt: raw.addedAt,
    note: raw.note,
  };
}

interface PoolResponse {
  ok: boolean;
  error?: string;
  hint?: string;
  generatedAt: string;
  property: string;
  window: { start: string; end: string; days: number };
  /** AUTO-121: the wider window and its floor. */
  longWindow?: { start: string; end: string; days: number; floor: number };
  floor: number;
  band: { low: number; high: number };
  threshold: number;
  publishedPosts: number;
  gsc: { allQueries: number; poolQueries: number; longQueries?: number; addedQueries?: number };
  buildMs: number;
  /** AUTO-121: the stored entry's size, older topics trimmed to fit, and a sentence when the cache is not keeping it. */
  cacheBytes?: number;
  omittedOlderTopics?: number;
  cacheWarning?: string | null;
  writtenDocuments: number;
  counts: TopicCounts;
  topics: Topic[];
  /** AUTO-123: the committed search-volume file, or null when it is missing. Read by the volume column and the volume sort, nothing else. */
  searchVolumes?: SearchVolumeFile | null;
}

/** The advisory figures (AUTO-119): loading, shown, or unavailable with a reason. Never affects state. */
type SimilarityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: TopicSimilarityResult }
  | { status: 'unavailable'; message: string };

interface GeneratedBlogResponse {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: unknown[];
  suggestedLinks: { label: string; href: string; reason: string }[];
  error?: string;
}

function newKey(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const tail = uuid ? uuid.replace(/-/g, '').slice(0, 12) : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${tail}`;
}

function newDocumentId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

/** "custom mini footballs" becomes "Custom Mini Footballs"; the AI refines it further. */
function titleCase(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const fmt = (n: number): string => n.toLocaleString('en-US');

function stateLabel(t: Topic): { text: string; color: string } {
  if (t.state === 'blocked') return { text: 'Blocked', color: MUTED };
  if (t.state === 'excluded') return { text: 'Excluded', color: AMBER };
  return { text: 'Usable', color: GREEN };
}

function BlogTopicsComponent() {
  const client = useClient({ apiVersion: '2024-10-01' });
  const currentUser = useCurrentUser();
  const router = useRouter();
  const authFetch = useGenerateAuthFetch();

  const [pool, setPool] = useState<PoolResponse | null>(null);
  const [baseTopics, setBaseTopics] = useState<Topic[]>([]);
  const [liveBlocked, setLiveBlocked] = useState<NegativeKeywordEntry[]>([]);
  const [loading, setLoading] = useState<'pool' | 'refresh' | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [similarity, setSimilarity] = useState<SimilarityState>({ status: 'idle' });

  const [filter, setFilter] = useState<StateFilter>('usable');
  const [seenFilter, setSeenFilter] = useState<SeenFilter>('recent');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('impressions');
  const [page, setPage] = useState(1);
  const [template, setTemplate] = useState<Template>('list');

  const [busy, setBusy] = useState<Record<string, 'blocking' | 'generating'>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<Record<string, { id: string; title: string }>>({});
  // AUTO-117: drafts this tab has created or found since the list loaded, so a
  // row leaves the usable list at once without waiting for the next pool call.
  const [localWritten, setLocalWritten] = useState<WrittenTopicSource[]>([]);
  const [createdDrafts, setCreatedDrafts] = useState<{ id: string; title: string; query: string }[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── The live negative keyword list (read straight from the dataset, so a
  //    block shows at once; the route's copy rides SETTINGS_TAG and catches up
  //    within seconds through the webhook) ───────────────────────────────────
  const readBlocked = useCallback(async () => {
    try {
      const entries = await client.fetch<Parameters<typeof toEntry>[0][] | null>(
        `*[_id == $id][0].blogAutomation.negativeKeywords[]{ _key, term, scope, addedAt, note }`,
        { id: SETTINGS_ID },
      );
      // Normalised here (AUTO-116): a term saved with a stray space used to be
      // shown and compared untrimmed, so it could never be unblocked.
      if (mounted.current) setLiveBlocked((entries ?? []).filter(Boolean).map(toEntry).filter((e) => e.term));
    } catch {
      /* keep the last list; the route's own copy still applies */
    }
  }, [client]);

  // ── Load the pool (cached for a day on the server) ─────────────────────────
  const loadPool = useCallback(
    async (refresh: boolean) => {
      setLoading(refresh ? 'refresh' : 'pool');
      setError(null);
      try {
        if (refresh) {
          const r = await authFetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh' }),
          });
          const rd = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
          if (!r.ok) throw Object.assign(new Error(rd.error || `Could not clear the cached list (${r.status}).`), { hint: rd.hint });
        }
        const res = await authFetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pool' }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<PoolResponse>;
        if (!res.ok || !data.ok || !Array.isArray(data.topics)) {
          throw Object.assign(new Error(data.error || `Could not read the topic list (${res.status}).`), { hint: data.hint });
        }
        if (!mounted.current) return;
        setPool(data as PoolResponse);
        // Strip the server's block verdicts; the live list below is applied
        // instead. The already-written verdict (AUTO-117) stays: the server
        // read the drafts live on this very call.
        setBaseTopics(applyNegativeKeywords(data.topics, []));
        setLocalWritten([]);
        setPage(1);
        await readBlocked();
      } catch (e) {
        if (!mounted.current) return;
        const err = e as Error & { hint?: string };
        setError({
          message: err.message || 'Could not read the topic list.',
          hint:
            err.hint ||
            (err.message && /401|sign in|Session expired/i.test(err.message)
              ? 'Reload the Studio and sign in again, then open this tab.'
              : 'Press "Try again". If it keeps failing, tell Ali what the message says.'),
        });
      } finally {
        if (mounted.current) setLoading(null);
      }
    },
    [authFetch, readBlocked],
  );

  useEffect(() => {
    void loadPool(false);
  }, [loadPool]);

  // ── The advisory closest-wording figures (AUTO-119). Asked for AFTER the
  //    list has loaded, never awaited by it, and never used for anything but
  //    the "Closest wording" column: a failure here changes nothing else.
  const generatedAt = pool?.generatedAt ?? null;
  useEffect(() => {
    if (!generatedAt) return;
    let live = true;
    setSimilarity({ status: 'loading' });
    void (async () => {
      try {
        const res = await authFetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'similar' }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<CompactTopicSimilarity> & { ok?: boolean; error?: string };
        if (!live || !mounted.current) return;
        // Figures for another snapshot (a Refresh in between) are not shown against this list.
        if (!res.ok || !data.ok || !Array.isArray(data.rows) || data.generatedAt !== generatedAt) {
          setSimilarity({ status: 'unavailable', message: data.error || 'The closest-wording figures are not available right now.' });
          return;
        }
        setSimilarity({ status: 'ready', data: expandSimilarity(data as CompactTopicSimilarity) });
      } catch {
        if (live && mounted.current) setSimilarity({ status: 'unavailable', message: 'The closest-wording figures are not available right now.' });
      }
    })();
    return () => {
      live = false;
    };
  }, [authFetch, generatedAt]);

  /** Clicking a closest topic only finds it in the list; it changes nothing. */
  const showTopic = useCallback((query: string) => {
    setFilter('all');
    setSearch(query);
  }, []);

  // ── Derived list: live blocks on top of the guard, then filter / search / sort
  const topics = useMemo(
    () => applyNegativeKeywords(applyWrittenTopics(baseTopics, localWritten), liveBlocked),
    [baseTopics, localWritten, liveBlocked],
  );
  const counts = useMemo(() => countTopics(topics), [topics]);

  // AUTO-123: the search-volume figures, indexed once per response. Built
  // AFTER the states and counts above and read only by the volume cell, the
  // volume sort and the notice: a missing file gives an empty index and
  // changes nothing else.
  const volumeIndex = useMemo(() => buildVolumeIndex(pool?.searchVolumes), [pool]);
  const volumeCovered = useMemo(() => topics.filter((t) => lookupVolume(t, volumeIndex) !== null).length, [topics, volumeIndex]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = topics.filter((t) => (filter === 'all' ? true : t.state === filter));
    if (seenFilter !== 'all') list = list.filter((t) => (seenFilter === 'recent' ? t.window !== 'older' : t.window === 'older'));
    if (q) {
      list = list.filter(
        (t) =>
          t.query.includes(q) ||
          t.variants.some((v) => v.includes(q)) ||
          (t.matchedPost?.title ?? '').toLowerCase().includes(q) ||
          (t.page ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    // A topic with no 90-day position sorts after every topic that has one.
    const pos = (t: Topic) => t.position ?? Number.POSITIVE_INFINITY;
    switch (sort) {
      case 'longImpressions':
        sorted.sort((a, b) => b.long.impressions - a.long.impressions || compareTopics(a, b));
        break;
      case 'clicks':
        sorted.sort((a, b) => b.clicks - a.clicks || compareTopics(a, b));
        break;
      case 'position':
        sorted.sort((a, b) => pos(a) - pos(b) || compareTopics(a, b));
        break;
      case 'longPosition':
        sorted.sort((a, b) => a.long.position - b.long.position || compareTopics(a, b));
        break;
      case 'volume': {
        // AUTO-123: a chosen sort, never the default. A topic with no figure
        // (not looked up, or no figure from Google) sorts after every topic
        // with one, and ties fall back to the default order, so volume is
        // never the only order applied.
        const vol = (t: Topic) => lookupVolume(t, volumeIndex)?.volume ?? -1;
        sorted.sort((a, b) => vol(b) - vol(a) || compareTopics(a, b));
        break;
      }
      case 'query':
        sorted.sort((a, b) => a.query.localeCompare(b.query));
        break;
      default:
        sorted.sort(compareTopics);
    }
    return sorted;
  }, [topics, filter, seenFilter, search, sort, volumeIndex]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filter, seenFilter, search, sort]);

  // ── Block / unblock: Global Settings > Blog Automation ─────────────────────
  /**
   * Write one block (AUTO-116). The term is normalised on write, and a block
   * that is already stored (same scope, same words ignoring case and spaces,
   * the resolver's de-duplication rule) is not written twice. Into the
   * published document AND the draft if one is open, the Q-155 rule.
   */
  const writeBlock = useCallback(
    async (rule: BlockRule) => {
      const term = normalizeBlockTerm(rule.term);
      if (!term) return;
      const docs = await client.fetch<{ _id: string; entries: Parameters<typeof toEntry>[0][] | null }[]>(
        `*[_id in [$id, $draft]]{ _id, "entries": blogAutomation.negativeKeywords[]{ _key, term, scope } }`,
        { id: SETTINGS_ID, draft: SETTINGS_DRAFT_ID },
      );
      const ids = docs.length > 0 ? docs.map((d) => d._id) : [SETTINGS_ID];
      let tx = client.transaction();
      let any = false;
      for (const id of ids) {
        const existing = (docs.find((d) => d._id === id)?.entries ?? []).filter(Boolean).map(toEntry);
        if (existing.some((e) => sameBlockRule(e, { term, scope: rule.scope }))) continue;
        const entry = { _key: newKey('nk'), _type: 'negativeKeyword', term, scope: rule.scope, addedAt: new Date().toISOString() };
        any = true;
        tx = tx
          .patch(id, (p) => p.setIfMissing({ blogAutomation: {} }))
          .patch(id, (p) => p.setIfMissing({ 'blogAutomation.negativeKeywords': [] }))
          .patch(id, (p) => p.insert('after', 'blogAutomation.negativeKeywords[-1]', [entry]));
      }
      if (any) await tx.commit();
    },
    [client],
  );

  /**
   * Remove blocks (AUTO-116): every stored entry, in the published document
   * and the draft, that means the same block as one of `rules`, compared
   * ignoring case and stray spaces and removed by `_key`. So a term saved by
   * hand as " imprinted sunglasses " is found and removed.
   */
  const removeBlocks = useCallback(
    async (rules: readonly BlockRule[]) => {
      if (rules.length === 0) return;
      const docs = await client.fetch<{ _id: string; entries: Parameters<typeof toEntry>[0][] | null }[]>(
        `*[_id in [$id, $draft]]{ _id, "entries": blogAutomation.negativeKeywords[]{ _key, term, scope } }`,
        { id: SETTINGS_ID, draft: SETTINGS_DRAFT_ID },
      );
      let tx = client.transaction();
      let any = false;
      for (const doc of docs) {
        const keys = (doc.entries ?? [])
          .filter(Boolean)
          .map(toEntry)
          .filter((e) => e._key && rules.some((r) => sameBlockRule(e, r)))
          .map((e) => e._key);
        if (keys.length === 0) continue;
        any = true;
        tx = tx.patch(doc._id, (p) => p.unset(keys.map((k) => `blogAutomation.negativeKeywords[_key=="${k}"]`)));
      }
      if (any) await tx.commit();
    },
    [client],
  );

  const clearBusy = useCallback((key: string) => {
    setBusy((b) => {
      const next = { ...b };
      delete next[key];
      return next;
    });
  }, []);

  /** The tick box: blocks THIS topic only (AUTO-116; it used to write a word block). */
  const blockTopic = useCallback(
    async (topic: Topic) => {
      setBusy((b) => ({ ...b, [topic.key]: 'blocking' }));
      setRowErrors((r) => ({ ...r, [topic.key]: '' }));
      try {
        await writeBlock(topicBlockRule(topic));
        await readBlocked();
      } catch (e) {
        setRowErrors((r) => ({ ...r, [topic.key]: `Could not save the block: ${e instanceof Error ? e.message : 'unknown error'}. Try again.` }));
      } finally {
        clearBusy(topic.key);
      }
    },
    [clearBusy, readBlocked, writeBlock],
  );

  /**
   * Unticking. A topic block for this topic is simply removed. A WORD block
   * that also covers the topic is removed only after Patrick confirms, with
   * the other topics it would bring back named, because removing it unblocks
   * all of them.
   */
  const unblockTopic = useCallback(
    async (topic: Topic) => {
      const matching = rulesBlockingTopic(topic, liveBlocked);
      const topicRules = matching.filter((r) => r.scope === 'topic');
      const wordRules = matching.filter((r) => r.scope === 'word');
      const toRemove: BlockRule[] = [...topicRules];
      if (wordRules.length > 0) {
        const lines = wordRules.map((r) => {
          const others = topicsBlockedByWord(baseTopics, r.term).filter((t) => t.key !== topic.key);
          const shown = others.slice(0, 15).map((t) => `  ${t.query}`);
          const more = others.length > 15 ? [`  and ${others.length - 15} more`] : [];
          return [
            `"${r.term}" blocks every topic containing those words. Removing it also brings back ${others.length} other topic${others.length === 1 ? '' : 's'}:`,
            ...shown,
            ...more,
          ].join('\n');
        });
        const ok = window.confirm(
          `This topic is blocked by a word block, not just by itself.\n\n${lines.join('\n\n')}\n\nRemove the word block? (You can block it again at any time.)`,
        );
        if (ok) toRemove.push(...wordRules);
      }
      if (toRemove.length === 0) return;
      setBusy((b) => ({ ...b, [topic.key]: 'blocking' }));
      setRowErrors((r) => ({ ...r, [topic.key]: '' }));
      try {
        await removeBlocks(toRemove);
        await readBlocked();
      } catch (e) {
        setRowErrors((r) => ({ ...r, [topic.key]: `Could not remove the block: ${e instanceof Error ? e.message : 'unknown error'}. Try again.` }));
      } finally {
        clearBusy(topic.key);
      }
    },
    [baseTopics, clearBusy, liveBlocked, readBlocked, removeBlocks],
  );

  // ── "Block a word": preview first, write only after Patrick has seen the list
  const [wordInput, setWordInput] = useState('');
  const [wordPreview, setWordPreview] = useState<{ term: string; topics: Topic[] } | null>(null);
  const [wordBusy, setWordBusy] = useState(false);
  const [wordError, setWordError] = useState('');

  const previewWord = useCallback(() => {
    const term = normalizeBlockTerm(wordInput);
    setWordError('');
    setWordPreview(term ? { term, topics: topicsBlockedByWord(baseTopics, term) } : null);
  }, [baseTopics, wordInput]);

  const confirmWordBlock = useCallback(async () => {
    if (!wordPreview) return;
    setWordBusy(true);
    setWordError('');
    try {
      await writeBlock({ term: wordPreview.term, scope: 'word' });
      await readBlocked();
      setWordPreview(null);
      setWordInput('');
    } catch (e) {
      setWordError(`Could not save the word block: ${e instanceof Error ? e.message : 'unknown error'}. Try again.`);
    } finally {
      setWordBusy(false);
    }
  }, [readBlocked, wordPreview, writeBlock]);

  const removeWordBlock = useCallback(
    async (entry: NegativeKeywordEntry) => {
      setWordBusy(true);
      setWordError('');
      try {
        await removeBlocks([entry]);
        await readBlocked();
      } catch (e) {
        setWordError(`Could not remove the word block: ${e instanceof Error ? e.message : 'unknown error'}. Try again.`);
      } finally {
        setWordBusy(false);
      }
    },
    [readBlocked, removeBlocks],
  );

  const wordBlocks = useMemo(() => liveBlocked.filter((e) => e.scope === 'word'), [liveBlocked]);

  // ── Generate a draft from a topic ──────────────────────────────────────────
  // AUTO-116: the AI writes FIRST and the draft is created only once the post
  // exists, in one call, with everything in it. Before, an empty draft was
  // created up front and deleted on failure, so a tab closed during the one
  // to two minute wait left an empty titled draft behind. Now a closed tab,
  // a crash or a failure leaves nothing, and because the draft does not exist
  // until it is complete there is nothing to type into while the AI writes.
  // No publish date is set: it is stamped when Publish is pressed.
  // AUTO-117: the draft records its topic (`sourceTopic`) in the same create,
  // and just before the AI is called the drafts are re-read live, so a draft
  // made since the list loaded (another tab, another person, Stage 2) is
  // caught before a second one is written. That check failing stops the
  // generation: a guard that could not look is not a guard.
  const generateDraft = useCallback(
    async (topic: Topic) => {
      setBusy((b) => ({ ...b, [topic.key]: 'generating' }));
      setRowErrors((r) => ({ ...r, [topic.key]: '' }));
      let liveWritten: WrittenTopicSource[];
      try {
        liveWritten = writtenTopicSources((await client.fetch<WrittenTopicDoc[] | null>(WRITTEN_TOPICS_QUERY)) ?? []);
      } catch (e) {
        if (mounted.current) {
          setRowErrors((r) => ({
            ...r,
            [topic.key]: `Could not check whether this topic already has a draft (${e instanceof Error ? e.message : 'unknown error'}). Nothing was generated. Try again.`,
          }));
          clearBusy(topic.key);
        }
        return;
      }
      const already = findWrittenTopic(topic, liveWritten) ?? topic.writtenAs;
      if (already) {
        // Found live but not in the loaded list: show it on the row too.
        if (mounted.current && !topic.writtenAs) setLocalWritten((w) => [...w, ...liveWritten]);
        if (!window.confirm(`${writtenSentence(already)}\n\nGenerate another draft from this topic anyway?`)) {
          clearBusy(topic.key);
          return;
        }
      } else if (topic.state === 'excluded') {
        const why = topic.reason ? `\n\n${topic.reason}` : '';
        if (!window.confirm(`This topic was excluded because it overlaps with a post you already have.${why}\n\nGenerate a draft anyway?`)) {
          clearBusy(topic.key);
          return;
        }
      }
      const documentId = newDocumentId();
      const draftId = `drafts.${documentId}`;
      const title = titleCase(topic.query);
      const record = buildSourceTopicRecord(topic, new Date().toISOString());
      try {
        const res = await authFetch(GENERATE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, template, keywords: [topic.query], wordCount: DEFAULT_WORD_COUNT }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<GeneratedBlogResponse>;
        const aiTitle = typeof data.title === 'string' ? data.title.trim() : '';
        const slug = slugifyTitle(aiTitle);
        if (!res.ok || !Array.isArray(data.body) || data.body.length === 0 || !aiTitle || !slug) {
          throw new Error(data.error || `The AI did not return a post (${res.status}). Try again.`);
        }
        const suggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: newKey('ail'),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));
        await client.create({
          _id: draftId,
          _type: 'blogPost',
          // Title and slug from the same AI title, so they match.
          title: aiTitle,
          slug: { _type: 'slug', current: slug },
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          excerpt: data.excerpt,
          body: data.body,
          aiSuggestedLinks: suggestedLinks,
          aiTemplate: template,
          aiTopicKeywords: [topic.query],
          aiWordCount: DEFAULT_WORD_COUNT,
          // AUTO-117: the topic this draft came from. Read only in Studio; the
          // guard reads it back on every pool call, drafts included.
          sourceTopic: record,
        });
        if (mounted.current) {
          setGenerated((g) => ({ ...g, [topic.key]: { id: documentId, title: aiTitle } }));
          setLocalWritten((w) => [
            ...w,
            { documentId, title: aiTitle, status: 'draft', via: 'recorded', queries: record.variants },
          ]);
          setCreatedDrafts((d) => [...d, { id: documentId, title: aiTitle, query: topic.query }]);
        }
      } catch (e) {
        if (mounted.current) {
          setRowErrors((r) => ({
            ...r,
            [topic.key]: `${e instanceof Error ? e.message : 'Generation failed.'} No draft was created.`,
          }));
        }
      } finally {
        if (mounted.current) clearBusy(topic.key);
      }
    },
    [authFetch, clearBusy, client, template],
  );

  const openDraft = useCallback(
    (id: string) => {
      router.navigateIntent('edit', { id, type: 'blogPost' });
    },
    [router],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const filterBtn = (key: StateFilter, label: string, n: number) => (
    <button
      type="button"
      key={key}
      onClick={() => setFilter(key)}
      style={{
        ...secondaryBtn,
        ...(filter === key ? { borderColor: BLUE, color: BLUE } : {}),
      }}
    >
      {label} ({fmt(n)})
    </button>
  );

  return (
    <div style={card}>
      <div>
        <h1 style={{ fontSize: 22, margin: 0, color: FG }}>Blog Topics</h1>
        <p style={{ color: MUTED, fontSize: 14 }}>
          The search terms your site already shows up for on Google (position {pool?.band.low ?? 8} to{' '}
          {pool?.band.high ?? 40}, at least {pool?.floor ?? 10} impressions in the last {pool?.window.days ?? 90} days,
          or at least {pool?.longWindow?.floor ?? 55} impressions over the last 16 months), grouped into topics, from{' '}
          <strong>your own Search Console</strong>. The numbers are <strong>impressions and clicks</strong> Google
          reported for your site; each row shows them for the last 90 days and for the last 16
          months, and says when the search was last seen. <strong>Searches a month (Google Ads)</strong> is a
          different number: how many people search for the term each month, from Google Ads, looked up a few times a
          year rather than daily (the line above the table says how old the figures are). Use <strong>Seen</strong> to switch between the searches seen
          in the last 90 days (the list as before) and the older ones the 16 months add. Each topic says
          whether it passed the overlap check or was excluded, and why. Tick <strong>Block</strong> to keep that one
          topic off this list; use <strong>Block a word</strong> below to keep every topic containing a word off it,
          after seeing which ones. Both are saved under Global Settings, Blog Automation, and both can be undone. Press{' '}
          <strong>Generate draft</strong> to write a post from any term. Drafts are never published by this tab; you
          review and publish them yourself. Nothing here runs on its own.
        </p>
      </div>

      {!currentUser ? (
        <div style={{ fontSize: 13, color: RED }}>You need to be signed in to the Studio to see the topic list.</div>
      ) : null}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void loadPool(true)}
          disabled={loading !== null}
          style={loading !== null ? disabledBtn : primaryBtn}
          title="Clears the saved list and reads Search Console again. Takes a minute or two."
        >
          {loading === 'refresh' ? 'Reading Search Console…' : 'Refresh from Search Console'}
        </button>
        {pool && (
          <span style={{ fontSize: 13, color: MUTED }}>
            Last read {new Date(pool.generatedAt).toLocaleString()} for {pool.window.start} to {pool.window.end}
            {pool.longWindow ? ` and the 16 months from ${pool.longWindow.start}` : ''}.{' '}
            {fmt(pool.gsc.allQueries)} searches seen in 90 days
            {pool.gsc.longQueries !== undefined ? ` (${fmt(pool.gsc.longQueries)} over 16 months)` : ''},{' '}
            {fmt(pool.gsc.poolQueries)} in range, {fmt(counts.topics)} topics ({fmt(counts.recent)} seen in the last 90
            days, {fmt(counts.older)} added by the 16 months), checked against {fmt(pool.publishedPosts)} published posts
            and, just now, {fmt(pool.writtenDocuments ?? 0)} drafts and posts written from a topic. The search figures
            are kept for a day; Google itself only updates them daily. Your drafts are checked every time this tab
            loads.
          </span>
        )}
      </div>

      {pool?.cacheWarning && <div style={{ fontSize: 13, color: AMBER }}>{pool.cacheWarning}</div>}
      {pool && (pool.omittedOlderTopics ?? 0) > 0 && (
        <div style={{ fontSize: 13, color: AMBER }}>
          {fmt(pool.omittedOlderTopics ?? 0)} of the older topics (the ones with the fewest impressions over 16 months)
          are not in this list, because the saved list has a size limit. Every topic seen in the last 90 days is here.
          Ali: the packed entry is {((pool.cacheBytes ?? 0) / 1024 / 1024).toFixed(2)} MB against the cache budget.
        </div>
      )}

      {loading === 'pool' && !pool && (
        <div style={{ fontSize: 13, color: MUTED }}>
          Reading your Search Console data. The first read of the day takes a minute or two (it reads about
          30,000 search terms); after that this tab opens instantly.
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, color: RED, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>{error.message}</div>
          {error.hint && <div style={{ color: FG }}>{error.hint}</div>}
          <div>
            <button type="button" onClick={() => void loadPool(false)} style={secondaryBtn} disabled={loading !== null}>
              Try again
            </button>
          </div>
        </div>
      )}

      {createdDrafts.length > 0 && (
        <div style={{ border: `1px solid ${GREEN}`, borderRadius: 6, padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 600 }}>Drafts created from this tab</div>
          <div style={{ color: MUTED }}>
            Each topic has moved to Excluded, because it now has a draft. It stays there while the draft exists, even
            before you publish it. Delete the draft and the topic comes back.
          </div>
          {createdDrafts.map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openDraft(d.id)} style={secondaryBtn}>
                Open draft
              </button>
              <span>
                <strong>{d.title}</strong> <span style={{ color: MUTED }}>from "{d.query}"</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {pool && (
        <>
          <WordBlockPanel
            input={wordInput}
            onInput={(v) => {
              setWordInput(v);
              // A preview only ever describes the exact words it was made for.
              if (wordPreview && normalizeBlockTerm(v) !== wordPreview.term) setWordPreview(null);
            }}
            onPreview={previewWord}
            preview={wordPreview}
            onCancel={() => setWordPreview(null)}
            onConfirm={() => void confirmWordBlock()}
            busy={wordBusy}
            error={wordError}
            blocks={wordBlocks}
            countFor={(term) => topicsBlockedByWord(baseTopics, term).length}
            onRemove={(e) => void removeWordBlock(e)}
          />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {filterBtn('usable', 'Usable', counts.usable)}
            {filterBtn('excluded', 'Excluded', counts.excluded)}
            {filterBtn('blocked', 'Blocked', counts.blocked)}
            {filterBtn('all', 'All', counts.topics)}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a term, post or page…"
              style={{ ...input, minWidth: 240 }}
              aria-label="Find a topic"
            />
            <label style={{ fontSize: 13, color: MUTED, display: 'flex', gap: 6, alignItems: 'center' }}>
              Seen
              <select
                value={seenFilter}
                onChange={(e) => setSeenFilter(e.target.value as SeenFilter)}
                style={select}
                aria-label="Which searches to show"
                title="The 16 months add searches the last 90 days did not qualify (too few impressions in 90 days, or outside position 8 to 40 in them). Each row says when it was last seen."
              >
                <option value="recent" style={option}>In the 90-day list ({fmt(counts.recent)})</option>
                <option value="older" style={option}>Added by the 16 months ({fmt(counts.older)})</option>
                <option value="all" style={option}>All ({fmt(counts.topics)})</option>
              </select>
            </label>
            <label style={{ fontSize: 13, color: MUTED, display: 'flex', gap: 6, alignItems: 'center' }}>
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={select}>
                <option value="impressions" style={option}>Impressions, 90 days (most first)</option>
                <option value="longImpressions" style={option}>Impressions, 16 months (most first)</option>
                <option value="clicks" style={option}>Clicks, 90 days (most first)</option>
                <option value="position" style={option}>Position, 90 days (closest to page 1 first)</option>
                <option value="longPosition" style={option}>Position, 16 months (closest to page 1 first)</option>
                <option value="volume" style={option}>Searches a month, Google Ads (most first)</option>
                <option value="query" style={option}>Term (A to Z)</option>
              </select>
            </label>
            <label style={{ fontSize: 13, color: MUTED, display: 'flex', gap: 6, alignItems: 'center' }}>
              Draft style
              <select value={template} onChange={(e) => setTemplate(e.target.value as Template)} style={select}>
                <option value="list" style={option}>List post ("10 ideas…") with products under each idea</option>
                <option value="single" style={option}>Single-topic post with one product row</option>
              </select>
            </label>
          </div>

          <SimilarityNotice state={similarity} topics={counts.topics} />
          <VolumeNotice file={pool.searchVolumes ?? null} covered={volumeCovered} topics={counts.topics} />

          <div style={{ fontSize: 13, color: MUTED }}>
            Showing {visible.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to{' '}
            {Math.min(currentPage * PAGE_SIZE, visible.length)} of {fmt(visible.length)}
            {filter !== 'all' ? ` ${filter}` : ''} topic{visible.length === 1 ? '' : 's'}
            {search.trim() ? ` matching "${search.trim()}"` : ''}
            {seenFilter === 'recent' ? ' in the 90-day list' : seenFilter === 'older' ? ' added by the 16 months' : ''}.
            Excluded so far: {fmt(counts.excludedBySharedTokens)} for sharing keywords with an existing post,{' '}
            {fmt(counts.excludedByRankingPage)} because your post already ranks, {fmt(counts.excludedByBoth)} for both,{' '}
            {fmt(counts.excludedAlreadyWritten)} because you already have a draft or post from them,{' '}
            {fmt(counts.excludedAlreadyRanking)} because you already rank in the top 7 for them.
          </div>

          <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Block</th>
                  <th style={th}>Search term</th>
                  <th style={{ ...th, textAlign: 'right' }}>Impressions (90 days)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Clicks (90 days)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Avg. position (90 days)</th>
                  <th
                    style={{ ...th, textAlign: 'right' }}
                    title="Google Ads Keyword Planner's average monthly searches for the exact term in the United States, looked up by hand a few times a year, not daily. Different from impressions: impressions count how often your site appeared; this counts how many people search. 'not looked up' means nobody has fetched it yet; 0 means Google reports no demand for that exact wording."
                  >
                    Searches a month (Google Ads)
                  </th>
                  <th style={{ ...th, textAlign: 'right' }} title="The same three figures over the last 16 months: impressions, clicks, average position.">
                    Over 16 months
                  </th>
                  <th style={th} title="The most recent stretch in which Google showed your site for any of the topic's searches.">
                    Last seen
                  </th>
                  <th style={th}>Page ranking now</th>
                  <th style={th}>Check</th>
                  <th style={th} title="Advisory only: how alike the wording is, 0 to 100. Nothing is hidden or changed because of it.">
                    Closest wording (your call)
                  </th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td style={td} colSpan={12}>
                      <em style={{ color: MUTED }}>No topics match.</em>
                    </td>
                  </tr>
                )}
                {rows.map((t) => {
                  const label = stateLabel(t);
                  const rowBusy = busy[t.key];
                  const done = generated[t.key];
                  const isBlocked = t.state === 'blocked';
                  // The advisory figures for this row (AUTO-119); read here and nowhere else.
                  const figures = similarity.status === 'ready' ? similarity.data.byKey[t.key] : undefined;
                  return (
                    <tr key={t.key} style={isBlocked ? { opacity: 0.6 } : undefined}>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isBlocked}
                          disabled={rowBusy !== undefined}
                          onChange={() => void (isBlocked ? unblockTopic(t) : blockTopic(t))}
                          aria-label={isBlocked ? `Unblock ${t.query}` : `Block ${t.query}`}
                          title={
                            isBlocked
                              ? 'Untick to allow this topic again'
                              : 'Tick to keep this one topic off the list (other topics are not affected)'
                          }
                        />
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{t.query}</div>
                        {t.variants.length > 1 && (
                          <div style={{ fontSize: 12, color: MUTED }} title={t.variants.slice(1).join('\n')}>
                            + {t.variants.length - 1} similar search{t.variants.length - 1 === 1 ? '' : 'es'}
                          </div>
                        )}
                        {t.spacingGroups && t.spacingGroups.length > 0 && (
                          <div style={{ fontSize: 12, color: MUTED }}>
                            Also spelled: {t.spacingGroups.map((g) => `"${g.query}"`).join(', ')} (the same words spaced differently, so one topic)
                          </div>
                        )}
                      </td>
                      {t.position === null ? (
                        <td style={{ ...td, textAlign: 'right', color: MUTED }} colSpan={3}>
                          <em>none in the last 90 days</em>
                        </td>
                      ) : (
                        <>
                          <td style={{ ...td, textAlign: 'right' }}>{fmt(t.impressions)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{fmt(t.clicks)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{t.position.toFixed(1)}</td>
                        </>
                      )}
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <VolumeCell lookup={lookupVolume(t, volumeIndex)} query={t.query} />
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div>{fmt(t.long.impressions)} impr.</div>
                        <div style={{ fontSize: 12, color: MUTED }}>
                          {fmt(t.long.clicks)} clicks, pos. {t.long.position.toFixed(1)}
                        </div>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{seenDaysLabel(t.seenDays)}</td>
                      <td style={td}>
                        {t.page ? (
                          <a
                            href={t.page.startsWith('/') ? `https://www.perfectimprints.com${t.page}` : t.page}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: BLUE, wordBreak: 'break-all' }}
                          >
                            {t.page}
                          </a>
                        ) : (
                          <em style={{ color: MUTED }}>none</em>
                        )}
                      </td>
                      <td style={{ ...td, maxWidth: 360 }}>
                        <div style={{ color: label.color, fontWeight: 600 }}>{label.text}</div>
                        {isBlocked && t.blockedBy && <div style={{ fontSize: 12, color: MUTED }}>{blockedSentence(t.blockedBy, t.blockedScope ?? 'word')}</div>}
                        {!isBlocked && t.reason && <div style={{ fontSize: 12, color: MUTED }}>{t.reason}</div>}
                        {t.writtenAs && (
                          <button
                            type="button"
                            onClick={() => openDraft(t.writtenAs!.documentId)}
                            style={{ ...secondaryBtn, marginTop: 4, padding: '2px 8px', fontSize: 12 }}
                          >
                            {t.writtenAs.status === 'draft' ? 'Open the draft' : 'Open the post'}
                          </button>
                        )}
                        {!isBlocked && !t.reason && t.matchedPost && t.sharedTokens.length > 0 && (
                          <div style={{ fontSize: 12, color: MUTED }}>
                            Closest existing post shares only "{t.sharedTokens.join(', ')}": {t.matchedPost.title}
                          </div>
                        )}
                        {!isBlocked && t.topSevenNow && t.rule !== 'already-ranking' && (
                          <div style={{ fontSize: 12, color: MUTED }}>{alsoRankingSentence(t.topSevenNow)}</div>
                        )}
                        {rowErrors[t.key] && <div style={{ fontSize: 12, color: RED }}>{rowErrors[t.key]}</div>}
                      </td>
                      <td style={{ ...td, maxWidth: 280 }}>
                        <ClosestWording figures={figures} notCovered={similarity.status === 'ready' && figures === undefined} onShowTopic={showTopic} />
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {done ? (
                          <button type="button" onClick={() => openDraft(done.id)} style={secondaryBtn} title={done.title}>
                            Open draft
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void generateDraft(t)}
                            disabled={isBlocked || rowBusy !== undefined}
                            style={isBlocked || rowBusy !== undefined ? disabledBtn : primaryBtn}
                            title={isBlocked ? 'Unblock the topic first' : 'Creates a draft blog post you review and publish yourself'}
                          >
                            {rowBusy === 'generating' ? 'Writing… (1 to 2 min)' : rowBusy === 'blocking' ? 'Saving…' : 'Generate draft'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <button type="button" onClick={() => setPage(1)} disabled={currentPage === 1} style={secondaryBtn}>
                First
              </button>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} style={secondaryBtn}>
                Previous
              </button>
              <span style={{ color: MUTED }}>
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                style={secondaryBtn}
              >
                Next
              </button>
              <button type="button" onClick={() => setPage(pageCount)} disabled={currentPage === pageCount} style={secondaryBtn}>
                Last
              </button>
            </div>
          )}

          <p style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            How a topic is judged: it is <strong>excluded</strong> when you already have a draft or post generated from
            it (or written for it as a topic keyword), even one you have not published; when it shares{' '}
            {pool.threshold} or more meaningful words with a post you already published; when the page Google
            already ranks for it is one of your blog posts; or when the topic itself already sits in your top 7 on
            average over the last 90 days (a search you already win is not an opportunity). A search with the same
            words that ranks in your top 7 is mentioned on the row for information. A <strong>usable</strong> topic
            has none of these yet. You can still generate a draft for an excluded
            topic if you disagree; the tab will ask first. Blocking is yours alone and always reversible: a topic you
            ticked comes back when you untick it, and a word block comes back when you press Remove beside it above.
            Both can also be removed under Global Settings, Blog Automation.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One line above the table explaining the closest-wording column, or saying
 * it is unavailable. The wording is fixed on purpose: a score is how alike
 * two phrases are worded, never a verdict, and a measured example of two
 * different posts scoring 90 (AUTO-119 report, 2026-09-28) is quoted so it
 * cannot be read as one.
 */
function SimilarityNotice({ state, topics }: { state: SimilarityState; topics: number }) {
  if (state.status === 'idle') return null;
  const covered = state.status === 'ready' ? state.data.topicsCovered : null;
  return (
    <div style={{ fontSize: 12, color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 6, padding: 8 }}>
      <strong style={{ color: FG }}>Closest wording</strong> shows, for each topic, the other topics and the published
      post whose wording is most like it, scored 0 to 100. A high score means the words are alike, not that the posts
      would be the same: &quot;custom engraved sunglasses&quot; and &quot;custom printed sunglasses&quot; score 90 and
      are two different posts, because engraving and printing are different jobs. It is information for you. Nothing is hidden, excluded, merged or reordered because
      of these numbers; you decide, and you can generate any topic whatever it shows.{' '}
      {state.status === 'loading' && <em>Working out the figures; the first time each day this takes a minute or two.</em>}
      {covered !== null && covered < topics && (
        <em>
          Worked out for {covered.toLocaleString('en-US')} of the {topics.toLocaleString('en-US')} topics: every topic
          seen in the last 90 days, then the older ones with the most impressions; the rest say so in the column.
        </em>
      )}
      {state.status === 'unavailable' && (
        <em>
          {state.message} Everything else in this tab works as normal; they are tried again the next time the tab
          opens.
        </em>
      )}
    </div>
  );
}

/** The advisory cell (AUTO-119): neutral colour, no label such as "duplicate", nothing in it changes anything. */
function ClosestWording({
  figures,
  notCovered,
  onShowTopic,
}: {
  figures: TopicSimilarity | undefined;
  /** AUTO-121: the figures exist but this topic is past the cap; say so rather than show nothing. */
  notCovered?: boolean;
  onShowTopic: (query: string) => void;
}) {
  if (!figures) {
    return notCovered ? <em style={{ fontSize: 12, color: MUTED }}>not worked out for this topic (past the limit)</em> : null;
  }
  return (
    <div style={{ fontSize: 12, color: MUTED, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {figures.topics.map((n) => (
        <span key={n.key}>
          <button
            type="button"
            onClick={() => onShowTopic(n.query)}
            title="Find this topic in the list"
            style={{ background: 'none', border: 'none', padding: 0, color: BLUE, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
          >
            {n.query}
          </button>{' '}
          <span aria-label={`wording similarity ${n.score} out of 100`}>{n.score}</span>
        </span>
      ))}
      {figures.post && (
        <span>
          Post:{' '}
          <a
            href={`https://www.perfectimprints.com${figures.post.href}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: BLUE }}
          >
            {figures.post.title}
          </a>{' '}
          <span aria-label={`wording similarity ${figures.post.score} out of 100`}>{figures.post.score}</span>
        </span>
      )}
    </div>
  );
}

/**
 * One line above the table about the search-volume figures (AUTO-123): where
 * they come from, how many topics have one, and HOW OLD they are, because
 * they are refreshed by hand a few times a year, not daily, and Patrick must
 * be able to see that without asking. With no file at all it says the
 * figures have not been looked up yet, and the column reads "not looked up"
 * on every row; nothing else on the tab changes.
 */
function VolumeNotice({ file, covered, topics }: { file: SearchVolumeFile | null; covered: number; topics: number }) {
  const summary = summarizeSearchVolumeFile(file);
  const any = summary.withFigure + summary.withoutFigure > 0;
  return (
    <div style={{ fontSize: 12, color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 6, padding: 8 }}>
      <strong style={{ color: FG }}>Searches a month (Google Ads)</strong> is how many people search for the term each
      month, from Google Ads Keyword Planner (United States), looked up through your DataForSEO account.{' '}
      It is a different number from impressions: impressions count how often <em>your site</em> appeared for the
      search; searches a month count how many people are looking at all. A term with many searches and few
      impressions is one your site is barely showing for yet. A <strong>0</strong> is a real answer from Google (no
      demand for that exact wording), while <strong>not looked up</strong> means nobody has fetched that term yet.
      These figures do not change daily: Ali refreshes them a few times a year.{' '}
      {!any ? (
        <em>No search volumes have been looked up yet, so every row says &quot;not looked up&quot;. Everything else works as usual.</em>
      ) : (
        <em>
          Figures for {covered.toLocaleString('en-US')} of the {topics.toLocaleString('en-US')} topics in this list
          {summary.withoutFigure > 0 ? ` (${summary.withoutFigure.toLocaleString('en-US')} looked-up terms had no figure from Google)` : ''}
          . Looked up{' '}
          {summary.oldestLookup === summary.newestLookup
            ? `on ${dayWords(summary.newestLookup)}`
            : `between ${dayWords(summary.oldestLookup)} and ${dayWords(summary.newestLookup)}`}
          {summary.dataThrough
            ? summary.dataFrom && summary.dataFrom !== summary.dataThrough
              ? `; Google's own figures run to between ${monthWords(summary.dataFrom)} and ${monthWords(summary.dataThrough)}, depending on the term (hover a figure for its own month)`
              : `; Google's own figures run to ${monthWords(summary.dataThrough)}`
            : ''}
          .
        </em>
      )}
    </div>
  );
}

/**
 * The volume cell (AUTO-123). Three honest states, in words where there is no
 * figure: "not looked up", "no figure from Google Ads", or the number, 0
 * included. When the figure was looked up for another wording of the same
 * topic (a merged spelling, a member search, or the same words in another
 * order) that wording is named under it, so the figure is never silently
 * attributed to words it was not fetched for. The tooltip carries the lookup
 * day and the month Google's series runs to.
 */
function VolumeCell({ lookup, query }: { lookup: VolumeLookup | null; query: string }) {
  const words = volumeCellWords(lookup);
  if (lookup === null) return <em style={{ color: MUTED }}>{words}</em>;
  const title = `Looked up ${dayWords(lookup.fetchedAt)}${lookup.dataThrough ? `; Google's figures run to ${monthWords(lookup.dataThrough)}` : ''}`;
  return (
    <div title={title}>
      {lookup.volume === null ? <em style={{ color: MUTED }}>{words}</em> : <span>{words}</span>}
      {!lookup.exact && lookup.term !== query.trim().toLowerCase() && (
        <div style={{ fontSize: 12, color: MUTED, whiteSpace: 'normal' }}>for &quot;{lookup.term}&quot;</div>
      )}
    </div>
  );
}

/**
 * "Block a word" (AUTO-116). Deliberately separate from the tick box and
 * deliberately two-step: Preview lists EVERY topic the word would block, by
 * name, and only "Block these N topics" writes anything. A count alone would
 * say how much disappears without saying what.
 */
function WordBlockPanel(props: {
  input: string;
  onInput: (v: string) => void;
  onPreview: () => void;
  preview: { term: string; topics: Topic[] } | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string;
  blocks: NegativeKeywordEntry[];
  countFor: (term: string) => number;
  onRemove: (entry: NegativeKeywordEntry) => void;
}) {
  const { input: value, onInput, onPreview, preview, onCancel, onConfirm, busy, error, blocks, countFor, onRemove } = props;
  const canPreview = normalizeBlockTerm(value).length > 0 && !busy;
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Block a word</div>
      <div style={{ fontSize: 13, color: MUTED }}>
        Keeps every topic containing a word (or all the words of a phrase) off the list, today and in future. Press
        Preview first: you see exactly which topics it would block before anything is saved.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canPreview) onPreview();
          }}
          placeholder='A word or phrase, e.g. "paramedics"'
          style={{ ...input, minWidth: 260 }}
          aria-label="Word or phrase to block"
          disabled={busy}
        />
        <button type="button" onClick={onPreview} disabled={!canPreview} style={canPreview ? secondaryBtn : { ...secondaryBtn, opacity: 0.5, cursor: 'default' }}>
          Preview
        </button>
      </div>

      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13 }}>
            <strong>"{preview.term}"</strong> would block{' '}
            <strong>
              {fmt(preview.topics.length)} topic{preview.topics.length === 1 ? '' : 's'}
            </strong>{' '}
            in today&apos;s list{preview.topics.length > 0 ? ':' : '.'}
            {preview.topics.length === 0 && ' It would still block any future search containing these words.'}
          </div>
          {preview.topics.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 220, overflowY: 'auto', fontSize: 13 }}>
              {preview.topics.map((t) => (
                <li key={t.key}>
                  {t.query}
                  <span style={{ color: MUTED }}>
                    {' '}
                    ({fmt(t.impressions)} impressions{t.state === 'blocked' ? ', already blocked' : t.state === 'excluded' ? ', excluded' : ''})
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onConfirm} disabled={busy} style={busy ? disabledBtn : { ...primaryBtn, background: RED }}>
              {busy ? 'Saving…' : `Block ${preview.topics.length === 1 ? 'this topic' : `these ${fmt(preview.topics.length)} topics`}`}
            </button>
            <button type="button" onClick={onCancel} disabled={busy} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: RED }}>{error}</div>}

      {blocks.length > 0 && (
        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ color: MUTED }}>Your word blocks:</div>
          {blocks.map((b) => {
            const n = countFor(b.term);
            return (
              <div key={b._key || b.term} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>
                  <strong>"{b.term}"</strong>{' '}
                  <span style={{ color: MUTED }}>
                    blocks {fmt(n)} topic{n === 1 ? '' : 's'} today
                  </span>
                </span>
                <button type="button" onClick={() => onRemove(b)} disabled={busy} style={secondaryBtn}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const blogTopicsTool: Tool = {
  name: 'blog-topics',
  title: 'Blog Topics',
  component: BlogTopicsComponent,
};

export default blogTopicsTool;
