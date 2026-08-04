/**
 * Hide-a-SKU-from-site-search (Q-170 improvement 2).
 *
 * Patrick sometimes needs one Geiger product gone from SEARCH without hiding it
 * anywhere else. This module is the single definition of what "hidden" means,
 * shared by every search read path so they cannot drift:
 *
 *   1. `lib/search/load-index.ts`, the client index behind the header
 *      autocomplete overlay AND the "Also matching" strip on /search.
 *   2. `lib/search/server-search.ts`, the server-side Fuse over the full
 *      catalog that produces the /search results grid and its facets.
 *
 * Deliberately pure and dependency-free: it is imported by a client module, a
 * server module, a route handler and the tests, so it must stay safe everywhere.
 *
 * SCOPE, stated once: this is a SEARCH VISIBILITY control and nothing else. It
 * does not touch category pages, the aggregators, the sitemap, or any product
 * grid. It is read-time only, so an edit takes effect without a redeploy, and
 * removing a SKU from the list brings the product straight back.
 */

/**
 * Compare SKUs case-insensitively on trimmed text. Geiger SKUs are mostly
 * digits but some carry a suffix after a space (e.g. "501014 90A"), and Patrick
 * may paste one in either case, so a naive `===` would silently fail to hide a
 * product he thought he had hidden. Internal whitespace is preserved (it is part
 * of the real item number), only the ends are trimmed.
 */
export function normalizeSearchSku(sku: string | null | undefined): string {
  return typeof sku === 'string' ? sku.trim().toUpperCase() : '';
}

/** Build the lookup set once per read path. Blank/duplicate entries are dropped. */
export function buildHiddenSkuSet(skus: readonly (string | null | undefined)[] | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!skus) return out;
  for (const raw of skus) {
    const normalized = normalizeSearchSku(raw);
    if (normalized) out.add(normalized);
  }
  return out;
}

/** True when this SKU is on the hidden list. */
export function isSearchHiddenSku(
  sku: string | null | undefined,
  hidden: ReadonlySet<string>,
): boolean {
  if (hidden.size === 0) return false;
  const normalized = normalizeSearchSku(sku);
  return normalized !== '' && hidden.has(normalized);
}

/**
 * Drop hidden entries from any list of objects carrying an optional `sku`.
 *
 * Entries WITHOUT a sku are always kept: categories, brands, blogs, videos and
 * FAQs have no SKU to hide by, and a `customProduct` deliberately carries no sku
 * in the index (its only id is the synthetic `custom-<id>`, never indexed). So
 * the filter can only ever remove a real, user-facing item number.
 */
export function filterHiddenSkuItems<T extends { sku?: string | null }>(
  items: readonly T[],
  hidden: ReadonlySet<string>,
): T[] {
  if (hidden.size === 0) return items as T[];
  return items.filter((item) => !isSearchHiddenSku(item.sku, hidden));
}
