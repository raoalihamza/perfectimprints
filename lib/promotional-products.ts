import 'server-only';

import { getAllProducts } from '@/lib/categories';
import { buildSearchFacets } from '@/lib/search/build-facets';
import { applyDealsFilters, type DealsFacetSection, type DealsFilterState } from '@/lib/deals-filter';
import { PRODUCTS_PER_PAGE, type GeigerProduct } from '@/lib/product-types';
import type { PromoSort } from '@/lib/promotional-products-sorts';
import { buildSkuSet, filterHiddenSkuItems } from '@/lib/products/hidden-skus';

/**
 * Server-side data layer for the /promotional-products browse-all page (M5-506).
 *
 * Reuses the same faceted infra as /search (getAllProducts + buildSearchFacets +
 * applyDealsFilters), but filters/sorts/paginates on the SERVER so the ~7,957
 * product catalog NEVER ships to the client — only the current page of products
 * + sku-stripped facets cross the wire. The full catalog is baked JSON, so the
 * product list and facets are computed once per server process and reused.
 */

let _products: GeigerProduct[] | null = null;
let _facets: DealsFacetSection[] | null = null;

function getProducts(): GeigerProduct[] {
  if (!_products) _products = getAllProducts();
  return _products;
}

/** Category / Price / Brand / Min Qty facets over the full catalog (with skus). */
function getFacets(): DealsFacetSection[] {
  if (!_facets) _facets = buildSearchFacets(getProducts());
  return _facets;
}

// HIDE-100. The unfiltered products and facets above are memoized once per
// server process because building facets over ~7,957 products is not something
// to redo per request. The site-wide hide list is tiny and changes only when
// Patrick publishes, so the filtered view gets its own single-entry memo keyed
// by the list. When nothing is hidden (the overwhelmingly common case) the
// original memoized objects are returned untouched and this costs nothing.
let _hiddenKey: string | null = null;
let _visibleProducts: GeigerProduct[] | null = null;
let _visibleFacets: DealsFacetSection[] | null = null;

function getVisible(hiddenSkus: string[]): {
  products: GeigerProduct[];
  facets: DealsFacetSection[];
} {
  const hidden = buildSkuSet(hiddenSkus);
  if (hidden.size === 0) return { products: getProducts(), facets: getFacets() };

  const key = [...hidden].sort().join('|');
  if (key !== _hiddenKey || !_visibleProducts || !_visibleFacets) {
    _visibleProducts = filterHiddenSkuItems(getProducts(), hidden);
    // Facets are rebuilt from the VISIBLE list rather than filtered, so every
    // count in the sidebar matches the grid instead of drifting by the number
    // of hidden products.
    _visibleFacets = buildSearchFacets(_visibleProducts);
    _hiddenKey = key;
  }
  return { products: _visibleProducts, facets: _visibleFacets };
}

function sortProducts(products: GeigerProduct[], sort: PromoSort): GeigerProduct[] {
  if (sort === 'featured') return products;
  const copy = [...products];
  const num = (v: number | null, fallback: number) => (v == null ? fallback : v);
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => num(a.low_price, Infinity) - num(b.low_price, Infinity));
    case 'price-desc':
      return copy.sort((a, b) => num(b.low_price, -Infinity) - num(a.low_price, -Infinity));
    case 'minqty-asc':
      return copy.sort((a, b) => num(a.min_qty, Infinity) - num(b.min_qty, Infinity));
    default:
      return copy;
  }
}

/** Facets with each value's `skus` emptied — safe to send to the client sidebar
 *  (it only needs id/label/count; filtering already happened server-side). */
export function getPromoClientFacets(hiddenSkus: string[] = []): DealsFacetSection[] {
  return getVisible(hiddenSkus).facets.map((f) => ({
    ...f,
    values: f.values.map((v) => ({ ...v, skus: [] })),
  }));
}

export interface PromoResult {
  products: GeigerProduct[]; // current page only
  page: number;
  totalPages: number;
  totalMatched: number;
  totalAll: number;
  isFiltered: boolean;
}

/** Run filters + sort + pagination entirely on the server. */
export function getPromoResult(
  state: DealsFilterState,
  sort: PromoSort,
  page: number,
  hiddenSkus: string[] = [],
): PromoResult {
  const { products: all, facets } = getVisible(hiddenSkus);
  const filtered = applyDealsFilters(all, facets, state);
  const sorted = sortProducts(filtered, sort);

  const totalMatched = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalMatched / PRODUCTS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PRODUCTS_PER_PAGE;

  const isFiltered = Object.values(state).some((v) => v.length > 0);

  return {
    products: sorted.slice(start, start + PRODUCTS_PER_PAGE),
    page: safePage,
    totalPages,
    totalMatched,
    totalAll: all.length,
    isFiltered,
  };
}
