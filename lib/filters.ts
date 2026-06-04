import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { GeigerProduct } from './categories';
import { getAllCategoryUrls } from './pi-urls';
import {
  FACET_REGISTRY,
  MIN_QTY_BUCKETS,
  type FilterContext,
  type FilterState,
  type RefineByCounts,
  type SidebarData,
  type SortMode,
} from './filter-types';

export * from './filter-types';

const ROOT = process.cwd();
const MEMBERSHIPS_FILE = path.join(ROOT, 'data', 'geiger', 'facet-memberships.json');
const MAPPINGS_FILE = path.join(ROOT, 'data', 'mappings', 'pi-to-geiger.json');

// ---------------------------------------------------------------------------
// Memberships loader (cached)
// ---------------------------------------------------------------------------

interface MembershipsFile {
  memberships: Record<string, string[]>;
}

let _memberships: Map<string, Set<string>> | null = null;

function loadMemberships(): Map<string, Set<string>> {
  if (_memberships) return _memberships;
  const raw = fs.readFileSync(MEMBERSHIPS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as MembershipsFile;
  const map = new Map<string, Set<string>>();
  for (const [url, skus] of Object.entries(parsed.memberships)) {
    map.set(url, new Set(skus));
  }
  _memberships = map;
  return map;
}

export function getMembershipSkus(url: string): Set<string> | null {
  const memberships = loadMemberships();
  return memberships.get(url) ?? null;
}

// ---------------------------------------------------------------------------
// Mappings loader (cached)
// ---------------------------------------------------------------------------

interface MappingEntry {
  geigerCategoryPath: string;
  geigerSlug: string;
  matchType: string;
  confidence: number;
}

interface MappingsFile {
  mappings: Record<string, MappingEntry>;
}

let _mappings: Record<string, MappingEntry> | null = null;

function loadMappings(): Record<string, MappingEntry> {
  if (_mappings) return _mappings;
  const raw = fs.readFileSync(MAPPINGS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as MappingsFile;
  _mappings = parsed.mappings;
  return _mappings;
}

export function getFilterContextForRoot(rootSlug: string): FilterContext {
  const mappings = loadMappings();
  const entry = mappings[rootSlug];
  if (!entry) return null;
  const path = entry.geigerCategoryPath;
  if (path.includes('> Apparel') || path.includes('> T-Shirts') || path.includes('> Polos')) {
    return 'apparel';
  }
  if (path.includes('> Drinkware')) return 'drinkware';
  if (path.includes('> Office & Technology > Tech Accessories') || path.includes('> Technology')) {
    return 'tech';
  }
  if (path.includes('> Writing Instruments')) return 'writing';
  return null;
}

// ---------------------------------------------------------------------------
// Static URL set
// ---------------------------------------------------------------------------

let _staticUrlSet: Set<string> | null = null;

function loadStaticUrlSet(): Set<string> {
  if (_staticUrlSet) return _staticUrlSet;
  const set = new Set<string>();
  for (const u of getAllCategoryUrls()) {
    set.add(u.url);
  }
  _staticUrlSet = set;
  return set;
}

export function staticFacetUrlExists(
  rootSlug: string,
  facetType: string,
  facetValue: string
): string | null {
  const url = `/cat/${rootSlug}/${facetType}/${facetValue}`;
  return loadStaticUrlSet().has(url) ? url : null;
}

// ---------------------------------------------------------------------------
// Sidebar derivation
// ---------------------------------------------------------------------------

function valueToLabel(value: string): string {
  const words = value.split('-').filter(Boolean);
  return words
    .map((w) => {
      if (w.length <= 2) return w.toUpperCase();
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

export function buildSidebarData(rootSlug: string, baseSkus: string[]): SidebarData {
  const memberships = loadMemberships();
  const baseSet = new Set(baseSkus);
  const context = getFilterContextForRoot(rootSlug);

  const rootPrefix = `/cat/${rootSlug}/`;
  const facetUrls: { url: string; facetType: string; facetValue: string }[] = [];
  for (const url of memberships.keys()) {
    if (!url.startsWith(rootPrefix)) continue;
    const rest = url.slice(rootPrefix.length).split('/');
    if (rest.length !== 2) continue;
    facetUrls.push({ url, facetType: rest[0], facetValue: rest[1] });
  }

  const sectionsByKey = new Map<string, SidebarData['sections'][number]>();
  for (const ft of FACET_REGISTRY) {
    if (ft.context && ft.context !== context) continue;
    sectionsByKey.set(ft.key, { key: ft.key, label: ft.label, values: [] });
  }

  for (const f of facetUrls) {
    const section = sectionsByKey.get(f.facetType);
    if (!section) continue;
    const facetSkus = memberships.get(f.url);
    if (!facetSkus) continue;
    let count = 0;
    for (const sku of facetSkus) {
      if (baseSet.has(sku)) count++;
    }
    if (count === 0) continue;
    section.values.push({
      value: f.facetValue,
      label: valueToLabel(f.facetValue),
      count,
      staticUrl: staticFacetUrlExists(rootSlug, f.facetType, f.facetValue),
    });
  }

  for (const section of sectionsByKey.values()) {
    section.values.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  const sections = [...sectionsByKey.values()].filter((s) => s.values.length > 0);

  const refineUrl = (suffix: string) => memberships.get(`/cat/${rootSlug}/${suffix}`);
  const intersectCount = (skus: Set<string> | undefined): number => {
    if (!skus) return 0;
    let n = 0;
    for (const s of skus) if (baseSet.has(s)) n++;
    return n;
  };
  const refineBy: RefineByCounts = {
    madeInUsa: intersectCount(memberships.get(`/cat/${rootSlug}/special-feature/made-in-usa`)),
    ecoFriendly: intersectCount(refineUrl('eco-friendly')),
    deals: intersectCount(refineUrl('closeout')),
    newItems: 0,
  };

  return {
    rootSlug,
    baseSkuCount: baseSkus.length,
    context,
    sections,
    price: null,
    minQtyBuckets: [],
    refineBy,
  };
}

export function enrichSidebarWithProductStats(
  sidebar: SidebarData,
  products: GeigerProduct[]
): SidebarData {
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const p of products) {
    const v = p.low_price;
    if (v == null) continue;
    if (v < pMin) pMin = v;
    if (v > pMax) pMax = v;
  }
  sidebar.price = pMin <= pMax ? { min: Math.floor(pMin), max: Math.ceil(pMax) } : null;

  sidebar.minQtyBuckets = MIN_QTY_BUCKETS.map((bucket) => {
    let count = 0;
    for (const p of products) {
      if (p.min_qty == null) continue;
      if (p.min_qty < bucket.min) continue;
      if (bucket.max != null && p.min_qty > bucket.max) continue;
      count++;
    }
    return { bucket, count };
  }).filter((b) => b.count > 0);

  let newCount = 0;
  for (const p of products) {
    if (p.is_new_item) newCount++;
  }
  sidebar.refineBy.newItems = newCount;

  return sidebar;
}

// ---------------------------------------------------------------------------
// Server-side filter application
// ---------------------------------------------------------------------------

export function applyFiltersAndSort(
  products: GeigerProduct[],
  state: FilterState,
  rootSlug: string
): GeigerProduct[] {
  let result = products;

  for (const [facetType, values] of Object.entries(state.facets)) {
    if (values.length === 0) continue;
    const unionSet = new Set<string>();
    for (const value of values) {
      const url = `/cat/${rootSlug}/${facetType}/${value}`;
      const skus = getMembershipSkus(url);
      if (!skus) continue;
      for (const s of skus) unionSet.add(s);
    }
    if (unionSet.size === 0) return [];
    result = result.filter((p) => unionSet.has(p.sku));
  }

  const intersectWithUrl = (url: string) => {
    const skus = getMembershipSkus(url);
    if (!skus) return [];
    return result.filter((p) => skus.has(p.sku));
  };
  if (state.madeInUsa) {
    result = intersectWithUrl(`/cat/${rootSlug}/special-feature/made-in-usa`);
  }
  if (state.ecoFriendly) {
    result = intersectWithUrl(`/cat/${rootSlug}/eco-friendly`);
  }
  if (state.deals) {
    result = intersectWithUrl(`/cat/${rootSlug}/closeout`);
  }

  if (state.newOnly) {
    result = result.filter((p) => p.is_new_item);
  }

  if (state.minQtyBuckets.length > 0) {
    const buckets = MIN_QTY_BUCKETS.filter((b) => state.minQtyBuckets.includes(b.key));
    result = result.filter((p) => {
      if (p.min_qty == null) return false;
      for (const b of buckets) {
        if (p.min_qty >= b.min && (b.max == null || p.min_qty <= b.max)) return true;
      }
      return false;
    });
  }

  if (state.priceMin != null || state.priceMax != null) {
    const lo = state.priceMin ?? -Infinity;
    const hi = state.priceMax ?? Infinity;
    result = result.filter((p) => {
      const v = p.low_price;
      if (v == null) return false;
      return v >= lo && v <= hi;
    });
  }

  return sortProducts(result, state.sort);
}

function sortProducts(products: GeigerProduct[], sort: SortMode): GeigerProduct[] {
  if (sort === 'best-sellers') return products;
  const arr = [...products];
  switch (sort) {
    case 'price-asc':
      arr.sort((a, b) => (a.low_price ?? Infinity) - (b.low_price ?? Infinity));
      break;
    case 'price-desc':
      arr.sort((a, b) => (b.low_price ?? -Infinity) - (a.low_price ?? -Infinity));
      break;
    case 'moq-asc':
      arr.sort((a, b) => (a.min_qty ?? Infinity) - (b.min_qty ?? Infinity));
      break;
    case 'newest':
      arr.sort((a, b) => Number(b.is_new_item) - Number(a.is_new_item));
      break;
  }
  return arr;
}
