import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { categoryTag } from '@/lib/sanity/cache-tags';
import {
  PRODUCT_PAGE_CARD_FIELDS,
  productPageToGeigerProduct,
  type ProductPageCard,
} from './product-pages';
import type { CategoryOverrideAddedProduct } from './category-overrides';
import type { GeigerProduct } from '@/lib/product-types';

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
      { next: { tags: [categoryTag(categorySlug)].filter(Boolean), revalidate: false } },
    );
    return {
      addSkus: (res?.addSkus ?? []).map((s) => String(s).trim()).filter(Boolean),
      removeSkus: (res?.removeSkus ?? []).map((s) => String(s).trim()).filter(Boolean),
    };
  } catch {
    return EMPTY;
  }
}

export interface CategoryPlacedProductPages {
  /** Normalized cards (with `detailUrl` → /products/<slug>) for the grid merge. */
  products: GeigerProduct[];
  /** The raw docs in the override-added union shape, for buildAddedAttrOverlay. */
  overlayDocs: CategoryOverrideAddedProduct[];
}

const EMPTY_PLACED: CategoryPlacedProductPages = { products: [], overlayDocs: [] };

/**
 * Product-side category placement of productPages (P2-CP-004 batch 4): every
 * published productPage whose `addToCategories` contains this category slug —
 * the product-form complement to `categoryOverride.addedProducts` (batch 3).
 *
 * STATIC-SAFETY / FRESHNESS: tagged `categoryTag(slug)` on the non-CDN
 * `cachedClient` (never no-store) — the SAME tag as this category's override +
 * SKU-placement reads — so `/cat/<slug>` stays statically prerenderable and the
 * webhook's productPage branch (which busts each slug in `addToCategories`)
 * refreshes attach/detach AND content edits of an attached product in seconds.
 * Deliberately NOT tagged PRODUCT_PAGES_TAG (that would re-render every placed
 * category on every unrelated productPage publish).
 *
 * Best-effort: returns empty on failure so the category still renders.
 */
export async function getPlacedProductPagesForCategory(
  categorySlug: string,
): Promise<CategoryPlacedProductPages> {
  if (!categorySlug) return EMPTY_PLACED;
  try {
    const docs =
      (await cachedClient.fetch<(ProductPageCard & { _type: 'productPage' })[]>(
        `*[_type == "productPage" && defined(slug.current) && $slug in addToCategories]
          | order(title asc) { _type, ${PRODUCT_PAGE_CARD_FIELDS} }`,
        { slug: categorySlug },
        { next: { tags: [categoryTag(categorySlug)].filter(Boolean), revalidate: false } },
      )) ?? [];
    const valid = docs.filter((d) => d?.slug);
    return {
      products: valid.map(productPageToGeigerProduct),
      overlayDocs: valid,
    };
  } catch {
    return EMPTY_PLACED;
  }
}
