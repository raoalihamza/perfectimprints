// Filtered category products API (M5-504 hybrid restore).
//
// The `/cat/<slug>` page is statically prerendered and never reads
// `searchParams` (a Dynamic API that would force the whole route off static
// generation). Faceted filtering needs server-only membership data, so it lives
// here instead: the client (CategoryShell) calls this dynamic route when a
// filter/sort is applied and renders the result with client-side pagination.
//
// GET ?slug=<cat slug>&<filter params> → { products, totalProducts }.
// Returns the FULL filtered + sorted list (client paginates).

import { getHiddenProductContext } from '@/lib/products/site-wide-hidden';
import { NextResponse } from 'next/server';
import { getCategoryContent } from '@/lib/categories';
import { getCategoryOverride, mergeCategoryProducts } from '@/lib/sanity/queries/category-overrides';
import {
  getPlacedProductPagesForCategory,
  getPlacementSkusForCategory,
} from '@/lib/sanity/queries/product-placements';
import { getCategoryControlSets } from '@/lib/sanity/queries/owned-categories';
import { getCustomCategoryBySlug } from '@/lib/sanity/queries/custom-categories';
import { customProductToGeigerProduct } from '@/lib/sanity/queries/custom-products';
import {
  applyFiltersAndSort,
  buildAddedAttrOverlay,
  isStateEmpty,
  parseFilterState,
} from '@/lib/filters';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug) {
    return NextResponse.json({ products: [], totalProducts: 0 });
  }

  // Rebuild the filter-params record from the query string (drop our own `slug`).
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    if (key === 'slug' || key === 'page') continue;
    const all = url.searchParams.getAll(key);
    record[key] = all.length > 1 ? all : all[0];
  }

  const rootSlug = slug.split('/')[0];
  const fileSlug = slug.split('/').join('__');
  const content = getCategoryContent(fileSlug);

  // Sanity-owned customCategory (pushed/custom page): its grid is the doc's OWN
  // product set (productSkus + attached customProducts + override/placement
  // edits), NOT the baked JSON's — mirror renderCustomCategory exactly so the
  // filtered results match the grid the customer is looking at. Owned-set check
  // first (one shared tag-cached read); the !content fallback covers a page
  // published moments ago that the cached owned set hasn't picked up yet (same
  // two entry points as the page route).
  const { owned } = await getCategoryControlSets();
  const custom =
    owned.has(slug) || !content ? await getCustomCategoryBySlug(slug) : null;

  if (custom) {
    const [override, placement, placedPages, hidden] = await Promise.all([
      getCategoryOverride(slug),
      getPlacementSkusForCategory(slug),
      getPlacedProductPagesForCategory(slug),
      getHiddenProductContext(),
    ]);
    const allProducts = mergeCategoryProducts({
      bakedSkus: custom.productSkus ?? [],
      override,
      hiddenEverywhereSkus: hidden.hiddenSkus,
      replacementBySku: hidden.replacementBySku,
      placementAddSkus: placement.addSkus,
      placementRemoveSkus: placement.removeSkus,
      extraCustomProducts: custom.customProducts.map(customProductToGeigerProduct),
      placedProductPages: placedPages.products,
    });
    // Hand-picked grid → always curated-mode filtering (attribute overlay), the
    // same build the page's sidebar uses so the two can never disagree.
    const overlay = buildAddedAttrOverlay(allProducts, [
      ...(override?.addedProducts ?? []),
      ...placedPages.overlayDocs,
      ...hidden.replacementOverlayDocs,
      ...custom.customProducts.map((d) => ({ ...d, _type: 'customProduct' as const })),
    ]);
    const state = parseFilterState(record);
    const filtered = isStateEmpty(state)
      ? allProducts
      : applyFiltersAndSort(allProducts, state, rootSlug, overlay);
    return NextResponse.json({ products: filtered, totalProducts: filtered.length });
  }

  if (!content) {
    return NextResponse.json({ products: [], totalProducts: 0 });
  }

  const [override, placement, placedPages, hidden] = await Promise.all([
    getCategoryOverride(slug),
    getPlacementSkusForCategory(slug),
    getPlacedProductPagesForCategory(slug),
    getHiddenProductContext(),
  ]);
  const allProducts = mergeCategoryProducts({
    bakedSkus: content.productSkus || [],
    override,
    hiddenEverywhereSkus: hidden.hiddenSkus,
    replacementBySku: hidden.replacementBySku,
    placementAddSkus: placement.addSkus,
    placementRemoveSkus: placement.removeSkus,
    placedProductPages: placedPages.products,
  });

  // Replace-products (curated) mode: fold the added products' own attributes in
  // so a facet selection keeps them instead of dropping them (they aren't in the
  // scraped facet memberships). Mirrors the page's sidebar build so the two agree.
  const curated = override?.replaceProducts === true;
  // HIDE-110: a substituted product-page card is not in this category's scraped
  // facet memberships, so without an overlay it would disappear the moment a
  // visitor clicked any filter. Its own tags are folded in so it behaves like
  // the Geiger product it replaced. `curated` is deliberately NOT changed by
  // this: that flag is what nulls each facet value's staticUrl, and flipping it
  // on an ordinary category would swap its SEO facet links for client-side
  // filtering. The overlay argument alone has no effect on those links.
  const overlay =
    curated || hidden.replacementOverlayDocs.length > 0
      ? buildAddedAttrOverlay(allProducts, [
          ...(override?.addedProducts ?? []),
          ...placedPages.overlayDocs,
          ...hidden.replacementOverlayDocs,
        ])
      : undefined;

  const state = parseFilterState(record);
  const filtered = isStateEmpty(state)
    ? allProducts
    : applyFiltersAndSort(allProducts, state, rootSlug, overlay);

  return NextResponse.json({ products: filtered, totalProducts: filtered.length });
}
