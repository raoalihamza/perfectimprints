/**
 * Client-safe types and pure helpers for the category filter sidebar.
 * Keep this file free of `fs` / node-only imports so it can be bundled
 * for the FilterSidebar client component.
 */

export type SortMode =
  | 'best-sellers'
  | 'price-asc'
  | 'price-desc'
  | 'moq-asc'
  | 'newest';

export const DEFAULT_SORT: SortMode = 'best-sellers';

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'best-sellers', label: 'Best Sellers' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'moq-asc', label: 'MOQ: Low to High' },
  { value: 'newest', label: 'Newest' },
];

export type FilterContext = 'apparel' | 'drinkware' | 'tech' | 'writing' | null;

export interface UniversalFacetType {
  key: string;
  label: string;
  context?: FilterContext;
}

export const FACET_REGISTRY: UniversalFacetType[] = [
  { key: 'color', label: 'Color' },
  { key: 'material', label: 'Material' },
  { key: 'brand', label: 'Brand' },
  { key: 'type', label: 'Type' },
  { key: 'feature', label: 'Feature' },
  { key: 'decoration', label: 'Decoration' },
  { key: 'size', label: 'Size' },
  { key: 'gender', label: 'Gender', context: 'apparel' },
  { key: 'sleeve-length', label: 'Sleeve Length', context: 'apparel' },
  { key: 'sleeve-style', label: 'Sleeve Style', context: 'apparel' },
  { key: 'fit', label: 'Fit', context: 'apparel' },
  { key: 'neckline', label: 'Neckline', context: 'apparel' },
  { key: 'style', label: 'Style', context: 'apparel' },
  { key: 'ounce-capacity', label: 'Ounces', context: 'drinkware' },
  { key: 'can-capacity', label: 'Can Capacity', context: 'drinkware' },
  { key: 'liter-capacity', label: 'Liter Capacity', context: 'drinkware' },
  { key: 'flash-drive-capacity', label: 'USB Size', context: 'tech' },
  { key: 'ink-color', label: 'Ink Color', context: 'writing' },
];

export interface MinQtyBucket {
  key: string;
  label: string;
  min: number;
  max: number | null;
}

export const MIN_QTY_BUCKETS: MinQtyBucket[] = [
  { key: '1-25', label: '1 – 25', min: 1, max: 25 },
  { key: '26-50', label: '26 – 50', min: 26, max: 50 },
  { key: '51-100', label: '51 – 100', min: 51, max: 100 },
  { key: '101-250', label: '101 – 250', min: 101, max: 250 },
  { key: '251-500', label: '251 – 500', min: 251, max: 500 },
  { key: '500-plus', label: '500+', min: 501, max: null },
];

export interface FacetValueOption {
  value: string;
  label: string;
  count: number;
  staticUrl: string | null;
}

export interface FacetSection {
  key: string;
  label: string;
  values: FacetValueOption[];
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface MinQtyBucketCount {
  bucket: MinQtyBucket;
  count: number;
}

export interface RefineByCounts {
  madeInUsa: number;
  ecoFriendly: number;
  deals: number;
  newItems: number;
}

export interface SidebarData {
  rootSlug: string;
  baseSkuCount: number;
  context: FilterContext;
  sections: FacetSection[];
  price: PriceRange | null;
  minQtyBuckets: MinQtyBucketCount[];
  refineBy: RefineByCounts;
}

export interface FilterState {
  facets: Record<string, string[]>;
  minQtyBuckets: string[];
  priceMin: number | null;
  priceMax: number | null;
  newOnly: boolean;
  madeInUsa: boolean;
  ecoFriendly: boolean;
  deals: boolean;
  sort: SortMode;
}

const KNOWN_FACET_KEYS = new Set(FACET_REGISTRY.map((f) => f.key));

export function emptyFilterState(): FilterState {
  return {
    facets: {},
    minQtyBuckets: [],
    priceMin: null,
    priceMax: null,
    newOnly: false,
    madeInUsa: false,
    ecoFriendly: false,
    deals: false,
    sort: DEFAULT_SORT,
  };
}

export function isStateEmpty(state: FilterState): boolean {
  return (
    Object.keys(state.facets).length === 0 &&
    state.minQtyBuckets.length === 0 &&
    state.priceMin == null &&
    state.priceMax == null &&
    !state.newOnly &&
    !state.madeInUsa &&
    !state.ecoFriendly &&
    !state.deals &&
    state.sort === DEFAULT_SORT
  );
}

type QueryParams = Record<string, string | string[] | undefined>;

function pickAll(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  }
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function pickOne(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export function parseFilterState(searchParams: QueryParams): FilterState {
  const state = emptyFilterState();
  for (const key of Object.keys(searchParams)) {
    if (KNOWN_FACET_KEYS.has(key)) {
      const values = pickAll(searchParams[key]);
      if (values.length > 0) state.facets[key] = values;
    }
  }
  state.minQtyBuckets = pickAll(searchParams['min-qty']);
  const pmin = pickOne(searchParams['price-min']);
  const pmax = pickOne(searchParams['price-max']);
  if (pmin) {
    const n = Number(pmin);
    if (!Number.isNaN(n)) state.priceMin = n;
  }
  if (pmax) {
    const n = Number(pmax);
    if (!Number.isNaN(n)) state.priceMax = n;
  }
  state.newOnly = pickOne(searchParams['new']) === '1';
  state.madeInUsa = pickOne(searchParams['made-in-usa']) === '1';
  state.ecoFriendly = pickOne(searchParams['eco']) === '1';
  state.deals = pickOne(searchParams['deals']) === '1';
  const sort = pickOne(searchParams['sort']);
  if (sort && SORT_OPTIONS.some((o) => o.value === sort)) {
    state.sort = sort as SortMode;
  }
  return state;
}

export function countActiveFilters(state: FilterState): number {
  let n = 0;
  for (const k of Object.keys(state.facets)) n += state.facets[k].length;
  n += state.minQtyBuckets.length;
  if (state.priceMin != null || state.priceMax != null) n += 1;
  if (state.newOnly) n += 1;
  if (state.madeInUsa) n += 1;
  if (state.ecoFriendly) n += 1;
  if (state.deals) n += 1;
  return n;
}

export function serializeFilterState(state: FilterState): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(state.facets)) {
    if (v.length > 0) params.set(k, v.join(','));
  }
  if (state.minQtyBuckets.length > 0) {
    params.set('min-qty', state.minQtyBuckets.join(','));
  }
  if (state.priceMin != null) params.set('price-min', String(state.priceMin));
  if (state.priceMax != null) params.set('price-max', String(state.priceMax));
  if (state.newOnly) params.set('new', '1');
  if (state.madeInUsa) params.set('made-in-usa', '1');
  if (state.ecoFriendly) params.set('eco', '1');
  if (state.deals) params.set('deals', '1');
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  return params.toString();
}
