import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { categoryTag } from '@/lib/sanity/cache-tags';
import { customProductToGeigerProduct, type CustomProductDoc } from './custom-products';
import {
  PRODUCT_PAGE_CARD_FIELDS,
  productPageToGeigerProduct,
  type ProductPageCard,
} from './product-pages';
import { resolveProductsBySku } from '@/lib/categories';
import { buildSkuSet, isHiddenSku } from '@/lib/products/hidden-skus';
import { planProductSlots } from '@/lib/products/substitution';
import { applyPinnedOrder } from '@/lib/products/pin-order';
import type { GeigerProduct } from '@/lib/product-types';

/**
 * One resolved `addedProducts` reference (P2-CP-004 batch 3): either a
 * customProduct (link-out card, the original M5-504 shape) or a productPage
 * (internal card linking to /products/<slug>). Discriminated by `_type`
 * (projected explicitly), routed through the matching normalizer in
 * `mergeCategoryProducts` and the matching branch in `buildAddedAttrOverlay`.
 */
export type CategoryOverrideAddedProduct =
  | ({ _type: 'customProduct' } & CustomProductDoc)
  | ({ _type: 'productPage' } & ProductPageCard);

export interface CategoryOverrideDoc {
  _id: string;
  categorySlug: string;
  forceCTA?: boolean;
  forceProducts?: boolean;
  /** When true, ignore baked `productSkus` — show only added SKUs/products. */
  replaceProducts?: boolean;
  /**
   * SKUs to show FIRST in the default view, in Patrick's arranged order
   * (Q-180 improvement 2). Reorder only - never adds or removes a product.
   */
  pinnedSkus?: string[];
  hiddenSkus?: string[];
  addedSkus?: string[];
  /** Resolved customProduct / productPage docs referenced by `addedProducts`. */
  addedProducts?: CategoryOverrideAddedProduct[];
}

const PROJECTION = `
  _id,
  "categorySlug": categorySlug,
  forceCTA,
  forceProducts,
  replaceProducts,
  pinnedSkus,
  hiddenSkus,
  addedSkus,
  "addedProducts": addedProducts[]->{
    _type,
    _type == "customProduct" => {
      _id,
      title,
      description,
      externalUrl,
      image,
      brand,
      lowPrice,
      highPrice,
      msrp,
      minQty,
      productionTime,
      colors,
      material,
      features,
      types,
      madeInUsa,
      ecoFriendly,
      closeout,
      badges,
      displayOrder,
      placements,
      "parentCategory": parentCategory->{ "slug": slug.current, title }
    },
    _type == "productPage" => {
      ${PRODUCT_PAGE_CARD_FIELDS}
    }
  }
`;

/**
 * Fetch the Sanity `categoryOverride` for a `/cat/...` slug (the path after
 * `/cat/`, e.g. `water-bottles` or `water-bottles/color/blue`). Returns null
 * when no override exists or Sanity is unavailable (best-effort — the category
 * still renders from the automatic rule).
 */
export async function getCategoryOverride(
  categorySlug: string,
): Promise<CategoryOverrideDoc | null> {
  if (!categorySlug) return null;
  try {
    // `order(_updatedAt desc)`: schema validation blocks NEW duplicates for a
    // slug, but pre-guard duplicates can exist (the `bags` incident) — if one
    // slips through, the most recently edited doc wins, matching editor intent,
    // instead of an arbitrary [0] pick silently ignoring the edited doc.
    const doc = await cachedClient.fetch<CategoryOverrideDoc | null>(
      `*[_type == "categoryOverride" && categorySlug == $slug] | order(_updatedAt desc)[0] { ${PROJECTION} }`,
      { slug: categorySlug },
      { next: { tags: [categoryTag(categorySlug)].filter(Boolean), revalidate: false } },
    );
    return doc ?? null;
  } catch {
    return null;
  }
}

export interface MergeCategoryProductsInput {
  /** SKUs baked into the category JSON (empty for a customCategory). */
  bakedSkus: string[];
  /** categoryOverride for this slug (hiddenSkus / addedSkus / addedProducts). */
  override: CategoryOverrideDoc | null;
  /** SKUs attached via productPlacement.addToCategories for this slug. */
  placementAddSkus?: string[];
  /** SKUs detached via productPlacement.removeFromCategories for this slug. */
  placementRemoveSkus?: string[];
  /**
   * Extra custom (non-Geiger) products to prepend — e.g. a customCategory's own
   * `customProduct`s (attached via `parentCategory`). Already normalized.
   */
  extraCustomProducts?: GeigerProduct[];
  /**
   * productPages placed into this category from the PRODUCT side via
   * `productPage.addToCategories` (P2-CP-004 batch 4) — already normalized
   * through `productPageToGeigerProduct` (they carry `detailUrl`). De-duped by
   * SKU against the category-side `override.addedProducts`, so a product
   * attached both ways renders once.
   */
  placedProductPages?: GeigerProduct[];
  /**
   * Site-wide hidden SKUs (HIDE-100), i.e. `globalSettings.hiddenProducts.skus`.
   * Removed from EVERY category, on top of this category's own
   * `override.hiddenSkus`. Compared case-insensitively on trimmed text (the
   * shared rule in `lib/products/hidden-skus.ts`), unlike the per-category
   * removal set, which matches the exact stored string.
   *
   * Passed in rather than read here so this function stays pure and both render
   * paths (the static /cat page and /api/category-products) keep sharing it.
   */
  hiddenEverywhereSkus?: string[];
  /**
   * Normalized Geiger SKU to the product-page card that REPLACES it (HIDE-110,
   * `productPage.replacesGeigerSkus`). When a SKU is hidden site-wide and has a
   * replacement, the replacing card takes its slot instead of leaving a gap.
   *
   * Deliberately NOT applied to a per-category hide or a placement removal: if
   * Patrick hid a product from THIS category because it does not belong here,
   * his own version of the same product does not belong here either. Only the
   * site-wide hide substitutes.
   */
  replacementBySku?: ReadonlyMap<string, GeigerProduct>;
}

function trimList(list: string[] | undefined): string[] {
  return (list ?? []).map((s) => String(s).trim()).filter(Boolean);
}

/**
 * Unified category product resolver (M5-504 Part 3). Merges both editing
 * directions into the final ordered product list for a category:
 *
 *   1. baked `productSkus` (ignored when `categoryOverride.replaceProducts`)
 *   2. + `categoryOverride.addedSkus` / `addedProducts`
 *   3. + every `productPlacement` whose `addToCategories` includes this slug
 *      and every `productPage` placed here via its own `addToCategories`
 *      (`placedProductPages`, P2-CP-004 batch 4)
 *   4. − `categoryOverride.hiddenSkus`
 *   5. − every `productPlacement` whose `removeFromCategories` includes this slug
 *
 * Conflict rule: **removal wins over add** (a SKU both attached and hidden stays
 * hidden). De-duped by SKU. SKUs resolved live via `resolveProductsBySku`, so
 * placements survive a Geiger re-scrape; custom products via
 * `customProductToGeigerProduct`. Reuses the lookup layer — no duplication.
 *
 * `replaceProducts`: when the override turns it on, the baked `productSkus` are
 * treated as empty so the grid shows ONLY what Patrick adds (Added SKUs / Added
 * Products / placement adds), minus hides/removes. Used to fix empty/off-topic
 * categories whose Geiger fallback set is wrong.
 *
 * Display order: custom/added products first (editorial picks), then placement
 * adds, then baked Geiger products - and finally `override.pinnedSkus` moves
 * its matches to the very front in Patrick's arranged order (Q-180: reorder
 * only, membership untouched; see lib/products/pin-order.ts).
 */
export function mergeCategoryProducts(input: MergeCategoryProductsInput): GeigerProduct[] {
  const { override } = input;

  // Removal set wins over everything (override hides + placement removes).
  const remove = new Set([
    ...trimList(override?.hiddenSkus),
    ...trimList(input.placementRemoveSkus),
  ]);

  // Site-wide hides (HIDE-100) are a SECOND removal rule, not merged into the
  // set above: this one is case-insensitive, and folding it in would silently
  // change how the existing per-category list matches. One predicate is used
  // everywhere `remove` was consulted, so the two rules can never disagree
  // about a product and "removal wins over add" still holds for both.
  const hiddenEverywhere = buildSkuSet(input.hiddenEverywhereSkus);
  const isRemoved = (sku: string): boolean =>
    remove.has(sku) || isHiddenSku(sku, hiddenEverywhere);

  // Geiger SKUs in display order: override adds → placement adds → baked.
  // When `replaceProducts` is on, the baked set is ignored entirely.
  const addSkus = trimList(override?.addedSkus);
  const placementAdds = trimList(input.placementAddSkus);
  const bakedSkus = override?.replaceProducts ? [] : trimList(input.bakedSkus);

  // HIDE-110: plan ORDERED SLOTS before resolving, so a product page that
  // replaced a hidden Geiger product takes its exact position rather than the
  // grid simply losing an item. The rule itself is the pure, unit-tested
  // `planProductSlots`; this function only resolves what it decided.
  const slots = planProductSlots<GeigerProduct>({
    skus: [...addSkus, ...placementAdds, ...bakedSkus],
    perCategoryRemove: remove,
    hiddenEverywhere,
    replacementBySku: input.replacementBySku,
    identify: (p) => p.sku,
  });

  // Resolve every remaining Geiger SKU in ONE pass (the lookup is a shared
  // index), then rebuild the list in slot order.
  const resolvedBySku = new Map(
    resolveProductsBySku(slots.flatMap((s) => (s.kind === 'sku' ? [s.sku] : []))).map((p) => [
      p.sku,
      p,
    ]),
  );
  const geigerProducts: GeigerProduct[] = [];
  for (const slot of slots) {
    if (slot.kind === 'product') {
      geigerProducts.push(slot.product);
      continue;
    }
    const resolved = resolvedBySku.get(slot.sku);
    if (resolved) geigerProducts.push(resolved);
  }

  // Added (non-baked) products: override.addedProducts + any extras passed in.
  // customProduct refs normalize to affiliate link-out cards; productPage refs
  // (P2-CP-004 batch 3) normalize via productPageToGeigerProduct, which sets
  // `detailUrl` so ProductCard renders an internal /products/<slug> link. A
  // dangling/unpublished reference derefs to null and is dropped.
  const customProducts: GeigerProduct[] = [
    ...(input.extraCustomProducts ?? []),
    ...(override?.addedProducts ?? [])
      .filter(
        (doc): doc is CategoryOverrideAddedProduct =>
          // Drop null derefs; a productPage without a slug can't link anywhere.
          Boolean(doc?._type) && (doc._type !== 'productPage' || Boolean(doc.slug)),
      )
      .map((doc) =>
        doc._type === 'productPage'
          ? productPageToGeigerProduct(doc)
          : customProductToGeigerProduct(doc),
      ),
    // Product-side placements last within the added block (editorial override
    // picks stay first); the sku de-dupe below collapses both-ways attaches.
    ...(input.placedProductPages ?? []),
  ].filter((p) => !isRemoved(p.sku));

  // Final de-dupe across custom + Geiger (custom first).
  const out: GeigerProduct[] = [];
  const seen = new Set<string>();
  for (const p of [...customProducts, ...geigerProducts]) {
    if (seen.has(p.sku)) continue;
    seen.add(p.sku);
    out.push(p);
  }

  // Pinned SKUs last (Q-180 improvement 2): a pure REORDER of the finished
  // list - pinned products move to the front in Patrick's arranged order.
  // Running after hides/removes and the de-dupe means hiding always wins and a
  // pin can never resurrect or add a product. Because BOTH render paths (the
  // static /cat page and /api/category-products) assemble their list through
  // this one function, they cannot disagree about the default order.
  return applyPinnedOrder(out, override?.pinnedSkus);
}
