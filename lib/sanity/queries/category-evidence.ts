import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { CATEGORY_CONTROL_TAG } from '@/lib/sanity/cache-tags';

/**
 * Patrick's curation of every category, in ONE read (FIX-911).
 *
 * The category resolver (lib/ai/category-resolver.ts) needs to know what
 * each of the 465 roots actually shows, because 137 of them are curated and
 * 94 of those are `replaceProducts` overrides: the caps root is 0 baked
 * products and 73 curated ones, wine-openers is 60 baked and 3 curated.
 * Asking `getEffectiveCategoryProducts` once per root costs about 420
 * requests; this is the same information in one.
 *
 * It is used for EVIDENCE only (which root is a phrase about), assembled by
 * the pure `assembleCategoryEvidence` in lib/ai/category-evidence.ts. The
 * products a strip shows still come from `getEffectiveCategoryProducts`, the
 * one function that resolves a category for display.
 *
 * Tag-cached like every other category read (never `no-store`), so a caller
 * on a static route would stay static; today only the generate routes call
 * it. Returns null when Sanity is unavailable, and the resolver then works
 * from the baked lists alone.
 */
export interface CategoryCuration {
  /** Newest first, so the first override for a slug is the one the page uses. */
  overrides: {
    categorySlug?: string;
    forceCTA?: boolean;
    forceProducts?: boolean;
    replaceProducts?: boolean;
    hiddenSkus?: string[] | null;
    addedSkus?: string[] | null;
    added?: ({ _id?: string; _type?: string; title?: string; brand?: string; slug?: string } | null)[] | null;
  }[];
  placements: { sku?: string; addToCategories?: string[] | null; removeFromCategories?: string[] | null }[];
  pages: { _id?: string; title?: string; brand?: string; addToCategories?: string[] | null }[];
  owned: {
    slug?: string;
    productSkus?: string[] | null;
    custom?: { _id?: string; title?: string; brand?: string }[] | null;
  }[];
}

const CURATION_QUERY = `{
  "overrides": *[_type == "categoryOverride" && defined(categorySlug)] | order(_updatedAt desc) {
    categorySlug,
    forceCTA,
    forceProducts,
    replaceProducts,
    hiddenSkus,
    addedSkus,
    "added": addedProducts[]->{ _id, _type, title, brand, "slug": slug.current }
  },
  "placements": *[_type == "productPlacement" && defined(sku)]{ sku, addToCategories, removeFromCategories },
  "pages": *[_type == "productPage" && defined(slug.current) && count(addToCategories) > 0]{ _id, title, brand, addToCategories },
  "owned": *[_type == "customCategory" && defined(slug.current)]{
    "slug": slug.current,
    productSkus,
    "custom": *[_type == "customProduct" && references(^._id)]{ _id, title, brand }
  }
}`;

export async function getCategoryCuration(): Promise<CategoryCuration | null> {
  try {
    const res = await cachedClient.fetch<Partial<CategoryCuration> | null>(
      CURATION_QUERY,
      {},
      { next: { tags: [CATEGORY_CONTROL_TAG], revalidate: false } },
    );
    if (!res) return null;
    return {
      overrides: res.overrides ?? [],
      placements: res.placements ?? [],
      pages: res.pages ?? [],
      owned: res.owned ?? [],
    };
  } catch {
    return null;
  }
}
