/**
 * Client-side search runtime (M5-502 / M3-309 / M5-507 hybrid).
 *
 * Nothing here runs until the user opens search. The index loads in TWO stages
 * so search is never blocked on the slower source:
 *   1. Static Geiger bulk (`/search-index.json`) — edge-cached, fast. Search
 *      becomes usable the moment this resolves.
 *   2. Live Sanity delta (`/api/search-index`) — fetched in the BACKGROUND and
 *      merged in when it arrives, upgrading the index for the next query. A cold
 *      Sanity route (4 GROQ queries + serverless cold start) therefore no longer
 *      gates the first search; static results show immediately and Sanity-managed
 *      content (blogs/videos/custom) folds in a moment later. Best-effort: if the
 *      live route is down, search still works on the static bulk.
 *
 * Fuse.js is pulled via a dynamic `import('fuse.js')` on first use so it stays
 * OUT of the initial route bundle. Keys are weighted title-primary; the Fuse
 * index is rebuilt lazily whenever the item set changes (≤ 2 times: after static,
 * after the live merge).
 */

import type FuseClass from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import type { SearchIndexFile, SearchItem } from './types';
import { SEARCH_INDEX_ROUTE } from './constants';
import { buildHiddenSkuSet, filterHiddenSkuItems } from './hidden-skus';

export type { SearchItem, SearchItemType } from './types';

export interface SearchResult extends SearchItem {
  refIndex: number;
  score: number;
}

// Static Geiger bulk (categories + products + brands), baked at build time.
const STATIC_INDEX_URL = '/search-index.json';
// Live Sanity delta (blogs + videos + custom categories + custom products),
// served fresh by app/api/search-index (1-week revalidate + webhook-busted).
const SANITY_INDEX_URL = SEARCH_INDEX_ROUTE;

const FUSE_OPTIONS: IFuseOptions<SearchItem> = {
  keys: [
    { name: 'title', weight: 0.8 },
    { name: 'brand', weight: 0.2 },
    // Video category title — lets a video be found by its category, ranked below
    // a real category page (title-matched at 0.8) so pages still win.
    { name: 'category', weight: 0.3 },
    // Item number / SKU (P2 batch 2 — Patrick's request). Numeric-ish queries
    // barely match any title, so an exact/partial SKU hit naturally dominates;
    // 0.5 keeps a strong SKU match ranked high without letting a coincidental
    // digit overlap outrank a real name match on word queries (SKUs are digits
    // + short suffixes, so name/brand searches don't hit this key at all).
    { name: 'sku', weight: 0.5 },
  ],
  threshold: 0.32,
  ignoreLocation: true,
  includeScore: true,
};

// Mutable module state. The two sources are kept SEPARATE and `items` is derived
// from them (merge, then drop anything on the search hide list), so a late-
// arriving delta can recompute without having lost the static bulk. `fuse`/
// `rootFuse` are nulled on every change so the next search rebuilds against the
// current items.
let staticReady: Promise<SearchItem[]> | null = null;
let staticItems: SearchItem[] = [];
let liveItems: SearchItem[] = [];
/** SKUs hidden from search (Q-170). Arrives with the live delta, empty until then. */
let hiddenSkus: ReadonlySet<string> = new Set<string>();
let items: SearchItem[] = [];
let fuse: FuseClass<SearchItem> | null = null;
let rootFuse: FuseClass<SearchItem> | null = null;
/** Lazy per-type indexes for the Q-180 priority-group guarantee (see search()). */
const typeFuses = new Map<string, FuseClass<SearchItem>>();
let fuseCtorPromise: Promise<typeof FuseClass> | null = null;

/**
 * Root category page = `/cat/<slug>` with no further segments (modifiers/facets
 * have 2+ segments). Roots are the "main" category landing pages and should
 * outrank their own modifier/facet children in search — see `search()`.
 */
function isRootCategory(item: SearchItem): boolean {
  return item.type === 'category' && /^\/cat\/[^/]+$/.test(item.url);
}

/**
 * Only promote a root when it's a strong match (Fuse score ≤ this). Tuned from
 * real scores: a category-name query scores the root ~0.10–0.15, while a
 * modifier-specific query ("closeout beer accessories") scores the root ~0.6, so
 * this cleanly promotes "beer accessories" → root without hijacking the former.
 */
const ROOT_PROMOTE_MAX_SCORE = 0.25;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchIndexFile(url: string): Promise<SearchIndexFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search index HTTP ${res.status} (${url})`);
  return (await res.json()) as SearchIndexFile;
}

/**
 * Merge two item lists, dropping duplicates by `type + url`. Sanity items are
 * passed first so a Sanity-authored category overriding a bulk slug wins.
 */
function dedupe(list: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  const out: SearchItem[] = [];
  for (const item of list) {
    const key = `${item.type} ${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function loadFuseCtor(): Promise<typeof FuseClass> {
  if (!fuseCtorPromise) {
    fuseCtorPromise = import('fuse.js')
      .then((m) => m.default)
      .catch((err) => {
        fuseCtorPromise = null;
        throw err;
      });
  }
  return fuseCtorPromise;
}

/**
 * Recompute the searchable set from whatever has arrived so far: Sanity delta
 * first (so an authored category overrides a bulk slug), then the static bulk,
 * then drop anything on the search hide list. Nulls the Fuse indexes so the next
 * search rebuilds. Cheap and idempotent, called at most twice per page.
 */
function recomputeItems(): void {
  const merged = dedupe([...liveItems, ...staticItems]);
  // Q-170: applied to the MERGED set on purpose. The hide list arrives with the
  // delta but the SKUs it names live in the static bulk, so filtering the delta
  // alone would hide nothing at all.
  items = filterHiddenSkuItems(merged, hiddenSkus);
  fuse = null;
  rootFuse = null;
  typeFuses.clear();
}

/**
 * Kick off loading (idempotent). Resolves as soon as the STATIC bulk is ready.
 * It does NOT wait for the live delta, which loads alongside it and upgrades the
 * index in place.
 *
 * The two fetches run in PARALLEL rather than the delta being chained behind the
 * static file. It still does not gate the first search (this promise resolves on
 * the static bulk either way), but it matters for the Q-170 hide list, which
 * travels on the delta: starting both at once means the list is usually in hand
 * by the time the much larger static file has finished parsing. See the honest
 * limitation noted on `search()`.
 */
function startLoading(): Promise<SearchItem[]> {
  if (!staticReady) {
    const liveRequest = fetchIndexFile(SANITY_INDEX_URL);

    staticReady = fetchIndexFile(STATIC_INDEX_URL)
      .then((file) => {
        staticItems = file.items ?? [];
        recomputeItems();
        return items;
      })
      .catch((err) => {
        staticReady = null; // let a transient failure retry next time
        throw err;
      });

    // Background: merge the live Sanity delta when it arrives. Best-effort:
    // failures leave search running on the static bulk.
    void liveRequest
      .then((file) => {
        liveItems = file.items ?? [];
        hiddenSkus = buildHiddenSkuSet(file.hiddenProductSkus);
        recomputeItems();
      })
      .catch(() => {
        /* live delta is best-effort */
      });
  }
  return staticReady;
}

/** Back-compat export. Resolves once the static bulk is ready (live merges in later). */
export function loadSearchIndex(): Promise<SearchItem[]> {
  return startLoading();
}

/** Warm the fetches + Fuse module (e.g. on first input focus). */
export function prefetchSearchIndex(): void {
  void startLoading().catch(() => {
    /* swallow — the real error surfaces when a query runs */
  });
  void loadFuseCtor().catch(() => {
    /* swallow */
  });
}

/**
 * Ensure the static bulk is loaded and the Fuse indexes are built against the
 * current item set (main index + a roots-only index for promotion). Rebuilds
 * only when the item set changed (fuse/rootFuse nulled).
 */
async function ensureFuses(): Promise<{
  fuse: FuseClass<SearchItem>;
  rootFuse: FuseClass<SearchItem>;
}> {
  await startLoading();
  const Fuse = await loadFuseCtor();
  if (!fuse) fuse = new Fuse(items, FUSE_OPTIONS);
  if (!rootFuse) rootFuse = new Fuse(items.filter(isRootCategory), FUSE_OPTIONS);
  return { fuse, rootFuse };
}

/**
 * Lazy Fuse index over ONLY the items of one type (Q-180). Built on first use
 * on the pages that pass `ensureType` (never for the header box), over a tiny
 * subset (all videos, or all blogs), and cleared whenever the item set changes.
 */
async function ensureTypeFuse(type: SearchItem['type']): Promise<FuseClass<SearchItem>> {
  await startLoading();
  const Fuse = await loadFuseCtor();
  let tf = typeFuses.get(type);
  if (!tf) {
    tf = new Fuse(
      items.filter((i) => i.type === type),
      FUSE_OPTIONS,
    );
    typeFuses.set(type, tf);
  }
  return tf;
}

/**
 * Pure merge for the priority-group guarantee: append type-scoped `extras`
 * (already ranked best-first) that the global result list does not carry,
 * skipping duplicates by url. Exported for unit tests.
 */
export function mergeEnsuredResults(
  results: SearchResult[],
  extras: SearchResult[],
  type: SearchItem['type'],
): SearchResult[] {
  const seen = new Set(results.filter((r) => r.type === type).map((r) => r.url));
  const missing = extras.filter((e) => e.type === type && !seen.has(e.url));
  return missing.length === 0 ? results : [...results, ...missing];
}

/**
 * Run a ranked search. Returns [] for an empty/whitespace query.
 *
 * When the query strongly matches a root category page, that root is promoted to
 * the front so the "main" category outranks its own modifier/facet children
 * (e.g. "beer accessories" → the root, above "Closeout …"). Consumers group by
 * type, so front-of-list = first in the Categories group.
 *
 * Q-170 honest limitation, stated rather than hidden: this never blocks on the
 * live delta, so a search fired in the gap between the static bulk resolving and
 * the delta resolving runs against an EMPTY hide list and can briefly surface a
 * hidden product in the overlay. It corrects itself on the next keystroke, the
 * two fetches now start together so the gap is usually negative (the delta is a
 * few KB, the static bulk is ~570 KB gzipped), and the /search results page is
 * filtered server-side and is never affected. Blocking the first search on a
 * cold Sanity route to close it would be a worse trade.
 */
export async function search(
  query: string,
  limit = 10,
  opts?: {
    /**
     * Q-180 priority-group guarantee, used ONLY by the blog/video index boxes
     * (the header box passes nothing and is untouched). The global top-`limit`
     * list over ~30k entries can crowd out every result of a small type - a
     * broad query like "custom" fills all 50 slots with categories/products,
     * so the Videos group had NOTHING to render even though matching videos
     * exist, which is exactly the "reads as broken" the improvement was meant
     * to fix. When set, the best `ensureCount` matches of this type (from a
     * tiny type-scoped index, same Fuse options) are appended if the global
     * list missed them. Global ranking is untouched - other groups see the
     * exact same results as before.
     */
    ensureType?: SearchItem['type'];
    ensureCount?: number;
  },
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const { fuse, rootFuse } = await ensureFuses();

  const results: SearchResult[] = fuse.search(q, { limit }).map((r) => ({
    ...r.item,
    refIndex: r.refIndex,
    score: r.score ?? 1,
  }));

  // Promote the best STRONG root match. The query must also match the title at a
  // word boundary so we don't promote a spurious fuzzy hit — e.g. "pens" is a
  // substring of "dis**pens**ary", which otherwise ties the real /cat/pens.
  const wordPrefix = new RegExp(`\\b${escapeRegExp(q.toLowerCase())}`);
  const rootHit = rootFuse
    .search(q, { limit: 8 })
    .find(
      (r) =>
        (r.score ?? 1) <= ROOT_PROMOTE_MAX_SCORE &&
        wordPrefix.test(r.item.title.toLowerCase()),
    );
  let out = results;
  if (rootHit && results[0]?.url !== rootHit.item.url) {
    const rootUrl = rootHit.item.url;
    const promoted: SearchResult = {
      ...rootHit.item,
      refIndex: rootHit.refIndex,
      score: rootHit.score ?? 1,
    };
    out = [promoted, ...results.filter((r) => r.url !== rootUrl)].slice(0, limit);
  }

  if (opts?.ensureType) {
    const want = Math.max(1, opts.ensureCount ?? 3);
    if (out.filter((r) => r.type === opts.ensureType).length < want) {
      const tf = await ensureTypeFuse(opts.ensureType);
      const extras: SearchResult[] = tf.search(q, { limit: want }).map((r) => ({
        ...r.item,
        refIndex: r.refIndex,
        score: r.score ?? 1,
      }));
      out = mergeEnsuredResults(out, extras, opts.ensureType);
    }
  }

  return out;
}
