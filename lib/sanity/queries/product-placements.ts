import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { categoryTag } from '@/lib/sanity/cache-tags';

export interface CategoryPlacementSkus {
  /** SKUs to add to this category (from productPlacement.addToCategories). */
  addSkus: string[];
  /** SKUs to remove from this category (from productPlacement.removeFromCategories). */
  removeSkus: string[];
}

const EMPTY: CategoryPlacementSkus = { addSkus: [], removeSkus: [] };

/**
 * Resolve the product-side placements that target a single category slug
 * (the `/cat/...` path after `/cat/`). Returns the SKUs attached to and the
 * SKUs detached from this category by any `productPlacement` doc.
 *
 * Best-effort: returns empty lists if Sanity is unavailable so the category
 * still renders from its baked SKUs + any categoryOverride.
 */
export async function getPlacementSkusForCategory(
  categorySlug: string,
): Promise<CategoryPlacementSkus> {
  if (!categorySlug) return EMPTY;
  try {
    const res = await cachedClient.fetch<{ addSkus: string[]; removeSkus: string[] }>(
      `{
        "addSkus": *[_type == "productPlacement" && defined(sku) && $slug in addToCategories].sku,
        "removeSkus": *[_type == "productPlacement" && defined(sku) && $slug in removeFromCategories].sku
      }`,
      { slug: categorySlug },
      { next: { tags: [categoryTag(categorySlug)], revalidate: false } },
    );
    return {
      addSkus: (res?.addSkus ?? []).map((s) => String(s).trim()).filter(Boolean),
      removeSkus: (res?.removeSkus ?? []).map((s) => String(s).trim()).filter(Boolean),
    };
  } catch {
    return EMPTY;
  }
}
