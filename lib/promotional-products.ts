import 'server-only';

import { getAllProducts } from '@/lib/categories';
import { buildSearchFacets } from '@/lib/search/build-facets';
import { applyDealsFilters, type DealsFacetSection, type DealsFilterState } from '@/lib/deals-filter';
import { PRODUCTS_PER_PAGE, type GeigerProduct } from '@/lib/product-types';

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

export type PromoSort = 'featured' | 'price-asc' | 'price-desc' | 'minqty-asc';

export const PROMO_SORTS: { value: PromoSort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'minqty-asc', label: 'Min Qty: Low to High' },
];

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
export function getPromoClientFacets(): DealsFacetSection[] {
  return getFacets().map((f) => ({
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
): PromoResult {
  const all = getProducts();
  const filtered = applyDealsFilters(all, getFacets(), state);
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
