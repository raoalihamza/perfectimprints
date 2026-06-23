import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { categoryTag } from '@/lib/sanity/cache-tags';
import { customProductToGeigerProduct, type CustomProductDoc } from './custom-products';
import { resolveProductsBySku } from '@/lib/categories';
import type { GeigerProduct } from '@/lib/product-types';

export interface CategoryOverrideDoc {
  _id: string;
  categorySlug: string;
  forceCTA?: boolean;
  forceProducts?: boolean;
  hiddenSkus?: string[];
  addedSkus?: string[];
  /** Resolved customProduct docs referenced by `addedProducts`. */
  addedProducts?: CustomProductDoc[];
}

const PROJECTION = `
  _id,
  "categorySlug": categorySlug,
  forceCTA,
  forceProducts,
  hiddenSkus,
  addedSkus,
  "addedProducts": addedProducts[]->{
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
    badges,
    displayOrder,
    placements,
    "parentCategory": parentCategory->{ "slug": slug.current, title }
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
    const doc = await cachedClient.fetch<CategoryOverrideDoc | null>(
      `*[_type == "categoryOverride" && categorySlug == $slug][0] { ${PROJECTION} }`,
      { slug: categorySlug },
      { next: { tags: [categoryTag(categorySlug)], revalidate: false } },
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
}

function trimList(list: string[] | undefined): string[] {
  return (list ?? []).map((s) => String(s).trim()).filter(Boolean);
}

/**
 * Unified category product resolver (M5-504 Part 3). Merges both editing
 * directions into the final ordered product list for a category:
 *
 *   1. baked `productSkus`
 *   2. + `categoryOverride.addedSkus` / `addedProducts`
 *   3. + every `productPlacement` whose `addToCategories` includes this slug
 *   4. − `categoryOverride.hiddenSkus`
 *   5. − every `productPlacement` whose `removeFromCategories` includes this slug
 *
 * Conflict rule: **removal wins over add** (a SKU both attached and hidden stays
 * hidden). De-duped by SKU. SKUs resolved live via `resolveProductsBySku`, so
 * placements survive a Geiger re-scrape; custom products via
 * `customProductToGeigerProduct`. Reuses the lookup layer — no duplication.
 *
 * Display order: custom/added products first (editorial picks), then placement
 * adds, then baked Geiger products.
 */
export function mergeCategoryProducts(input: MergeCategoryProductsInput): GeigerProduct[] {
  const { override } = input;

  // Removal set wins over everything (override hides + placement removes).
  const remove = new Set([
    ...trimList(override?.hiddenSkus),
    ...trimList(input.placementRemoveSkus),
  ]);

  // Geiger SKUs in display order: override adds → placement adds → baked.
  const addSkus = trimList(override?.addedSkus);
  const placementAdds = trimList(input.placementAddSkus);
  const bakedSkus = trimList(input.bakedSkus);
  const orderedSkus: string[] = [];
  const seenSku = new Set<string>();
  for (const sku of [...addSkus, ...placementAdds, ...bakedSkus]) {
    if (remove.has(sku) || seenSku.has(sku)) continue;
    seenSku.add(sku);
    orderedSkus.push(sku);
  }
  const geigerProducts = resolveProductsBySku(orderedSkus);

  // Custom (non-Geiger) products: override.addedProducts + any extras passed in.
  const customProducts: GeigerProduct[] = [
    ...(input.extraCustomProducts ?? []),
    ...(override?.addedProducts ?? []).map(customProductToGeigerProduct),
  ].filter((p) => !remove.has(p.sku));

  // Final de-dupe across custom + Geiger (custom first).
  const out: GeigerProduct[] = [];
  const seen = new Set<string>();
  for (const p of [...customProducts, ...geigerProducts]) {
    if (seen.has(p.sku)) continue;
    seen.add(p.sku);
    out.push(p);
  }
  return out;
}
