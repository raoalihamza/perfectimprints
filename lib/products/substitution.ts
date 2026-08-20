import { isHiddenSku, normalizeSku } from './hidden-skus';

/**
 * Where each product goes in a grid once hiding and replacement are applied
 * (HIDE-110).
 *
 * A slot is either a Geiger SKU still to be resolved, or an already-built
 * replacement card standing in the position of the Geiger product it
 * superseded. Keeping this as a pure planning step (rather than filtering a
 * resolved list) is what lets the replacement land in the ORIGINAL position
 * instead of being appended somewhere else.
 *
 * Pure and dependency-free so the rule is unit-testable on its own; the shared
 * `mergeCategoryProducts` is the only caller, and it cannot be tested directly
 * because it reads the catalog off disk.
 */
export type ProductSlot<TProduct> =
  | { kind: 'sku'; sku: string }
  | { kind: 'product'; product: TProduct };

export interface PlanProductSlotsInput<TProduct> {
  /** Candidate SKUs in display order, before hiding is applied. */
  skus: readonly string[];
  /**
   * Per-category removals: `categoryOverride.hiddenSkus` plus
   * `productPlacement.removeFromCategories`. Matched on the exact stored
   * string, which is how that feature has always behaved.
   */
  perCategoryRemove: ReadonlySet<string>;
  /** Site-wide hides plus every SKU claimed by a published product page. */
  hiddenEverywhere: ReadonlySet<string>;
  /** Normalized SKU to the card that replaces it. */
  replacementBySku?: ReadonlyMap<string, TProduct>;
  /** Identity of a replacement card, used to render each page at most once. */
  identify: (product: TProduct) => string;
}

/**
 * Rules, in the order they apply:
 *
 *  1. A SKU seen twice is kept once, at its first position (unchanged).
 *  2. A PER-CATEGORY removal drops the product and never substitutes. If
 *     Patrick hid a product from this category because it does not belong
 *     here, his own version of the same product does not belong here either.
 *  3. A SITE-WIDE hide substitutes when a replacement exists, and drops
 *     otherwise. The replacement takes the hidden product's exact position.
 *  4. One page may replace several Geiger SKUs, so it can be claimed more than
 *     once in a single grid. It renders ONCE, at the first position it was
 *     claimed for. The grid is then genuinely shorter, and every count derived
 *     from the result reflects that rather than overstating it.
 */
export function planProductSlots<TProduct>(
  input: PlanProductSlotsInput<TProduct>,
): ProductSlot<TProduct>[] {
  const { skus, perCategoryRemove, hiddenEverywhere, replacementBySku, identify } = input;
  const slots: ProductSlot<TProduct>[] = [];
  const seenSku = new Set<string>();
  const seenReplacement = new Set<string>();

  for (const sku of skus) {
    if (seenSku.has(sku)) continue;
    seenSku.add(sku);
    if (perCategoryRemove.has(sku)) continue;
    if (isHiddenSku(sku, hiddenEverywhere)) {
      const replacement = replacementBySku?.get(normalizeSku(sku));
      if (!replacement) continue;
      const id = identify(replacement);
      if (seenReplacement.has(id)) continue;
      seenReplacement.add(id);
      slots.push({ kind: 'product', product: replacement });
      continue;
    }
    slots.push({ kind: 'sku', sku });
  }

  return slots;
}
