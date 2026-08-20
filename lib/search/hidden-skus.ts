/**
 * Hide-a-SKU-from-site-search (Q-170 improvement 2).
 *
 * Patrick sometimes needs one Geiger product gone from SEARCH without hiding it
 * anywhere else. This module is the definition of what "hidden from search"
 * means, shared by every search read path so they cannot drift:
 *
 *   1. `lib/search/load-index.ts`, the client index behind the header
 *      autocomplete overlay AND the "Also matching" strip on /search.
 *   2. `lib/search/server-search.ts`, the server-side Fuse over the full
 *      catalog that produces the /search results grid and its facets.
 *
 * SCOPE, stated once: `globalSettings.siteSearch.hiddenSkus` is a SEARCH
 * VISIBILITY control and nothing else. It does not touch category pages, the
 * aggregators, the sitemap, or any product grid. It is read-time only, so an
 * edit takes effect without a redeploy, and removing a SKU from the list brings
 * the product straight back.
 *
 * HIDE-100: the separate site-wide list `globalSettings.hiddenProducts.skus`
 * ALSO hides from search, because "everywhere" includes search. The search read
 * paths therefore consume the UNION of the two lists, built once by
 * `searchHiddenSkuList()` in `lib/sanity/queries/global-settings.ts`. The scope
 * of the search-only list above is unchanged.
 *
 * The primitives below moved to `lib/products/hidden-skus.ts` in HIDE-100 so
 * the site-wide list and the search list share one definition of normalization
 * and comparison. They are re-exported here under their original names, so
 * every existing call site and test is byte-identical. Do not reimplement them.
 *
 * Still safe everywhere: the module it re-exports from is pure and
 * dependency-free, so the client bundle is unaffected. The import is RELATIVE,
 * not the `@/` alias, because this chain is unit-tested and the vitest setup
 * here resolves no path aliases (same reason lib/ai/related-products.ts does it).
 */

export {
  normalizeSku as normalizeSearchSku,
  buildSkuSet as buildHiddenSkuSet,
  isHiddenSku as isSearchHiddenSku,
  filterHiddenSkuItems,
} from '../products/hidden-skus';
