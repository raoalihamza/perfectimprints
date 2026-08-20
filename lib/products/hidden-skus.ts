/**
 * Product visibility rules (HIDE-100).
 *
 * ONE definition of "is this SKU hidden", shared by every surface that can show
 * a Geiger product. It exists because the site has two different hide controls
 * that are easy to confuse:
 *
 *   1. `categoryOverride.hiddenSkus` - hides a product from ONE category page.
 *      Patrick uses this when an item lands in a category it does not belong in.
 *      Unchanged by HIDE-100 and deliberately not routed through this module:
 *      it is applied by `mergeCategoryProducts` against the exact stored string.
 *
 *   2. `globalSettings.hiddenProducts.skus` - hides a product EVERYWHERE.
 *      Patrick uses this when he has built his own `/products/<slug>` page for
 *      the same item and does not want the plain Geiger card competing with it.
 *      That is the list this module is for.
 *
 * The primitives here were MOVED DOWN from `lib/search/hidden-skus.ts` (Q-170),
 * which now re-exports them under its original names so every existing search
 * call site is byte-identical. Same pattern as `lib/products/product-page-pricing.ts`.
 * There is one definition of normalization and comparison; do not write a second.
 *
 * Deliberately pure and dependency-free: imported by client modules, server
 * modules, route handlers, Studio-independent code and the tests.
 */

/**
 * Compare SKUs case-insensitively on trimmed text.
 *
 * Geiger SKUs are mostly digits but some carry a suffix after a space (for
 * example "501014 90A"), and Patrick may paste one in either case, so a naive
 * `===` would silently fail to hide a product he thought he had hidden.
 * Internal whitespace is PRESERVED (it is part of the real item number); only
 * the ends are trimmed.
 */
export function normalizeSku(sku: string | null | undefined): string {
  return typeof sku === 'string' ? sku.trim().toUpperCase() : '';
}

/** Build the lookup set once per read path. Blank and duplicate entries are dropped. */
export function buildSkuSet(
  skus: readonly (string | null | undefined)[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!skus) return out;
  for (const raw of skus) {
    const normalized = normalizeSku(raw);
    if (normalized) out.add(normalized);
  }
  return out;
}

/** True when this SKU is on the given hidden set. */
export function isHiddenSku(sku: string | null | undefined, hidden: ReadonlySet<string>): boolean {
  if (hidden.size === 0) return false;
  const normalized = normalizeSku(sku);
  return normalized !== '' && hidden.has(normalized);
}

/**
 * Drop hidden entries from any list of objects carrying an optional `sku`.
 *
 * Entries WITHOUT a sku are always kept: categories, brands, blogs, videos and
 * FAQs have no SKU to hide by. A `customProduct` or `productPage` carries only
 * the synthetic `custom-<id>` id, which Patrick can never pick in the SKU
 * picker, so his own products can never be hidden by this list by accident.
 * The filter can only ever remove a real, user-facing Geiger item number.
 *
 * Returns the original array reference when nothing is hidden, so the
 * overwhelmingly common empty-list case costs no allocation on any surface.
 */
export function filterHiddenSkuItems<T extends { sku?: string | null }>(
  items: readonly T[],
  hidden: ReadonlySet<string>,
): T[] {
  if (hidden.size === 0) return items as T[];
  return items.filter((item) => !isHiddenSku(item.sku, hidden));
}

/**
 * Drop hidden SKUs from a plain list of SKU strings, preserving order.
 *
 * Used where a surface holds SKUs rather than resolved products (for example a
 * category's baked `productSkus`, or a facet value's membership list).
 */
export function filterHiddenSkuList(
  skus: readonly string[],
  hidden: ReadonlySet<string>,
): string[] {
  if (hidden.size === 0) return skus as string[];
  return skus.filter((sku) => !isHiddenSku(sku, hidden));
}
