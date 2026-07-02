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

import { NextResponse } from 'next/server';
import { getCategoryContent } from '@/lib/categories';
import { getCategoryOverride, mergeCategoryProducts } from '@/lib/sanity/queries/category-overrides';
import { getPlacementSkusForCategory } from '@/lib/sanity/queries/product-placements';
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

  const fileSlug = slug.split('/').join('__');
  const content = getCategoryContent(fileSlug);
  if (!content) {
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
  const [override, placement] = await Promise.all([
    getCategoryOverride(slug),
    getPlacementSkusForCategory(slug),
  ]);
  const allProducts = mergeCategoryProducts({
    bakedSkus: content.productSkus || [],
    override,
    placementAddSkus: placement.addSkus,
    placementRemoveSkus: placement.removeSkus,
  });

  // Replace-products (curated) mode: fold the added products' own attributes in
  // so a facet selection keeps them instead of dropping them (they aren't in the
  // scraped facet memberships). Mirrors the page's sidebar build so the two agree.
  const curated = override?.replaceProducts === true;
  const overlay = curated ? buildAddedAttrOverlay(allProducts, override?.addedProducts) : undefined;

  const state = parseFilterState(record);
  const filtered = isStateEmpty(state)
    ? allProducts
    : applyFiltersAndSort(allProducts, state, rootSlug, overlay);

  return NextResponse.json({ products: filtered, totalProducts: filtered.length });
}
