/**
 * Client-side search runtime (M5-502 / M3-309).
 *
 * Nothing here runs until the user actually opens search:
 *   - `loadSearchIndex()` fetches `/search-index.json` once and module-caches it.
 *   - Fuse.js is pulled via a dynamic `import('fuse.js')` the first time a query
 *     runs, so it stays OUT of the initial route bundle.
 *
 * Keys are weighted title-primary / brand-secondary; `ignoreLocation` makes
 * matches position-independent (good for long product names), `threshold 0.32`
 * keeps fuzzy matches tight enough to stay relevant.
 */

import type FuseClass from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import type { SearchIndexFile, SearchItem } from './types';

export type { SearchItem, SearchItemType } from './types';

export interface SearchResult extends SearchItem {
  refIndex: number;
  score: number;
}

const INDEX_URL = '/search-index.json';

const FUSE_OPTIONS: IFuseOptions<SearchItem> = {
  keys: [
    { name: 'title', weight: 0.8 },
    { name: 'brand', weight: 0.2 },
  ],
  threshold: 0.32,
  ignoreLocation: true,
  includeScore: true,
};

let indexPromise: Promise<SearchItem[]> | null = null;
let fusePromise: Promise<FuseClass<SearchItem>> | null = null;
let rootFusePromise: Promise<FuseClass<SearchItem>> | null = null;

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

/** Fetch + cache the prebuilt index. Safe to call repeatedly (deduped). */
export function loadSearchIndex(): Promise<SearchItem[]> {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`search index HTTP ${res.status}`);
        return res.json() as Promise<SearchIndexFile>;
      })
      .then((data) => data.items ?? [])
      .catch((err) => {
        indexPromise = null; // let a transient failure retry next time
        throw err;
      });
  }
  return indexPromise;
}

/** Warm the network fetch (e.g. on first input focus) without pulling Fuse. */
export function prefetchSearchIndex(): void {
  void loadSearchIndex().catch(() => {
    /* swallow — the real error surfaces when a query runs */
  });
}

async function getFuse(): Promise<FuseClass<SearchItem>> {
  if (!fusePromise) {
    fusePromise = (async () => {
      const [{ default: Fuse }, items] = await Promise.all([
        import('fuse.js'),
        loadSearchIndex(),
      ]);
      return new Fuse(items, FUSE_OPTIONS);
    })().catch((err) => {
      fusePromise = null;
      throw err;
    });
  }
  return fusePromise;
}

/**
 * A second, tiny Fuse over ONLY the ~465 root category pages. The main index
 * has thousands of facet pages that all contain the category name, so a root
 * can sit at rank 100+ by raw score even when it matches perfectly. Searching a
 * roots-only index finds the right root directly so we can promote it.
 */
async function getRootFuse(): Promise<FuseClass<SearchItem>> {
  if (!rootFusePromise) {
    rootFusePromise = (async () => {
      const [{ default: Fuse }, items] = await Promise.all([
        import('fuse.js'),
        loadSearchIndex(),
      ]);
      return new Fuse(items.filter(isRootCategory), FUSE_OPTIONS);
    })().catch((err) => {
      rootFusePromise = null;
      throw err;
    });
  }
  return rootFusePromise;
}

/**
 * Run a ranked search. Returns [] for an empty/whitespace query.
 *
 * When the query strongly matches a root category page, that root is promoted to
 * the front so the "main" category outranks its own modifier/facet children
 * (e.g. "beer accessories" → the root, above "Closeout …"). Consumers group by
 * type, so front-of-list = first in the Categories group.
 */
export async function search(query: string, limit = 10): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const [fuse, rootFuse] = await Promise.all([getFuse(), getRootFuse()]);

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
  if (rootHit && results[0]?.url !== rootHit.item.url) {
    const rootUrl = rootHit.item.url;
    const promoted: SearchResult = {
      ...rootHit.item,
      refIndex: rootHit.refIndex,
      score: rootHit.score ?? 1,
    };
    return [promoted, ...results.filter((r) => r.url !== rootUrl)].slice(0, limit);
  }

  return results;
}
