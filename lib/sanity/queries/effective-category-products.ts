import { getCategoryContent, getProductsForCategorySlug } from '@/lib/categories';
import type { GeigerProduct } from '@/lib/product-types';
import { getCategoryControlSets } from '@/lib/sanity/queries/owned-categories';
import { getCustomCategoryBySlug } from '@/lib/sanity/queries/custom-categories';
import { customProductToGeigerProduct } from '@/lib/sanity/queries/custom-products';
import {
  getPlacedProductPagesForCategory,
  getPlacementSkusForCategory,
} from '@/lib/sanity/queries/product-placements';
import { getCategoryOverride, mergeCategoryProducts } from '@/lib/sanity/queries/category-overrides';

/**
 * What a category ACTUALLY shows, for readers that are not the category page.
 *
 * HIDE-000 found the defect this exists to remove: `matchRelatedProducts` built
 * a product page's Related Products strip from
 * `getProductsForCategorySlug()`, a pure disk read of the baked JSON. So the
 * strip pulled from Patrick's curated category while ignoring the curation of
 * it, and four of the eight cards on
 * `/products/soft-loop-halloween-trick-or-treat-bags` were products he had
 * explicitly hidden from `bags/theme/halloween`.
 *
 * The fix is not a second filter bolted onto the matcher: it is to make that
 * reader resolve the category the SAME way the category page does. This
 * function mirrors `app/cat/[...slug]/page.tsx` step for step, including:
 *
 *   - owned-slug precedence (a published `customCategory` wins over baked JSON)
 *   - the edited-set gate, so an untouched category pays no per-slug fetch
 *   - `mergeCategoryProducts`, the one function that applies hides, adds,
 *     placements, replaceProducts and pinned order
 *
 * Anything that resolves a category's products should call this rather than
 * reading the baked file directly, or the same class of bug comes back.
 *
 * STATICNESS: every read here is a tag-cached, non-CDN fetch
 * (`category-control-sets`, `cat:<slug>`), never `no-store`, so callers on
 * static routes such as `/products/<slug>` stay statically prerendered. As a
 * bonus, the `cat:<slug>` tag means a category-override publish also refreshes
 * the product pages whose strips are drawn from that category.
 */
export interface EffectiveCategoryOptions {
  /**
   * Return ONLY the Geiger products of the category, dropping the non-Geiger
   * items (customProduct / productPage cards) that the category page also shows.
   *
   * Used by `matchRelatedProducts`, whose callers decide separately whether they
   * want custom products (the `/products/<slug>` carousel deliberately passes
   * `includeCustom: false`). Without this the curation fix would ALSO start
   * pulling custom products into strips through the category branch, which is a
   * different decision from the one HIDE-100 is making. Removal only.
   */
  geigerOnly?: boolean;
}

export async function getEffectiveCategoryProducts(
  categorySlug: string,
  hiddenEverywhereSkus: string[] = [],
  options: EffectiveCategoryOptions = {},
  replacementBySku?: ReadonlyMap<string, GeigerProduct>,
): Promise<GeigerProduct[]> {
  const slug = categorySlug.trim();
  if (!slug) return [];

  // Baked content is keyed by the file slug (slashes become double underscores).
  const content = getCategoryContent(slug.split('/').join('__'));

  const { owned, edited } = await getCategoryControlSets();
  // `!content` mirrors the page's fallback for a customCategory published moments
  // ago that the cached owned set has not picked up yet.
  const custom = owned.has(slug) || !content ? await getCustomCategoryBySlug(slug) : null;

  if (!custom && !content) return [];

  const isEdited = edited.has(slug);
  const [override, placement, placedPages] =
    isEdited || custom
      ? await Promise.all([
          getCategoryOverride(slug),
          getPlacementSkusForCategory(slug),
          getPlacedProductPagesForCategory(slug),
        ])
      : [null, { addSkus: [], removeSkus: [] }, { products: [], overlayDocs: [] }];

  const geigerOnly = options.geigerOnly === true;
  const merged = mergeCategoryProducts({
    replacementBySku,
    bakedSkus: custom ? (custom.productSkus ?? []) : content?.productSkus || [],
    override,
    placementAddSkus: placement.addSkus,
    placementRemoveSkus: placement.removeSkus,
    extraCustomProducts:
      geigerOnly || !custom ? undefined : custom.customProducts.map(customProductToGeigerProduct),
    placedProductPages: geigerOnly ? [] : placedPages.products,
    hiddenEverywhereSkus,
  });

  // The non-Geiger cards carry synthetic `custom-<id>` SKUs. Dropping them by
  // that prefix also covers `override.addedProducts`, which mergeCategoryProducts
  // folds in from the override itself and no input flag can suppress.
  //
  // HIDE-110 exception: a card that got here by REPLACING a Geiger product is
  // kept even under `geigerOnly`. It is not a custom product being smuggled in;
  // it is standing in for a Geiger product that was already there and that the
  // caller already wanted. Dropping it would reintroduce the gap this feature
  // exists to fill.
  if (!geigerOnly) return merged;
  const substituted = new Set<string>();
  if (replacementBySku) for (const card of replacementBySku.values()) substituted.add(card.sku);
  return merged.filter((p) => !p.sku.startsWith('custom-') || substituted.has(p.sku));
}

/**
 * Baked-only fallback, used when the Sanity reads above are unavailable (the
 * offline verifier, or Sanity being down during a generate run). Deliberately
 * separate and deliberately named, so a caller that lands here is choosing the
 * degraded answer rather than getting it silently.
 */
export function getBakedCategoryProducts(categorySlug: string): GeigerProduct[] {
  return getProductsForCategorySlug(categorySlug.trim().split('/').join('__'));
}
