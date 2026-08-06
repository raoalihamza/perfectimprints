/**
 * Pin-to-top ordering for a category grid (Q-180 improvement 2).
 *
 * Pure and dependency-free so it is unit-testable and safe to import anywhere.
 * Its ONLY caller is `mergeCategoryProducts` (lib/sanity/queries/category-overrides.ts),
 * the single place both category render paths - the static /cat page and the
 * filtered /api/category-products route - assemble a category's product list.
 * Keeping the pin rule here (and applying it there) is what makes the two paths
 * structurally unable to disagree about the default order.
 *
 * The rule, deliberately narrow (Patrick chose pin-to-top, not full reordering):
 *   - Products whose SKU is in `pinnedSkus` move to the FRONT of the list, in
 *     the order Patrick arranged the pins. Everything else keeps its existing
 *     relative order.
 *   - This is a REORDER ONLY. A pinned SKU that is not already in the list is
 *     ignored, never added - pinning changes presentation, not membership, so
 *     facet counts, filter options and the total count are untouched. (To add a
 *     product, Patrick uses Added SKUs; to remove one, Hidden SKUs - and since
 *     hides are applied before this runs, hiding always wins over pinning.)
 *   - Duplicate pin entries keep their first position; blank entries are ignored.
 *
 * Downstream behavior this yields for free:
 *   - Pagination: pinned items are at the front, so they land on page 1 of both
 *     the server path pagination and the client pagination.
 *   - Filtering: a filter that a pinned product does not match drops it like any
 *     other product (the filter runs over the merged list).
 *   - Sorting: the default sort ("Best Sellers") preserves input order, so pins
 *     stay first; an explicit visitor-chosen sort re-orders the whole list and
 *     wins over the pins.
 */
export function applyPinnedOrder<T extends { sku: string }>(
  products: T[],
  pinnedSkus: string[] | undefined | null,
): T[] {
  const pins = (pinnedSkus ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (pins.length === 0 || products.length === 0) return products;

  const rank = new Map<string, number>();
  pins.forEach((sku, i) => {
    if (!rank.has(sku)) rank.set(sku, i);
  });

  const pinned: T[] = [];
  const rest: T[] = [];
  for (const p of products) {
    if (rank.has(p.sku)) pinned.push(p);
    else rest.push(p);
  }
  if (pinned.length === 0) return products;

  // Stable by pin rank - Patrick's arranged order, not the list's.
  pinned.sort((a, b) => (rank.get(a.sku) ?? 0) - (rank.get(b.sku) ?? 0));
  return [...pinned, ...rest];
}
