/**
 * Build filter facets from an arbitrary matched product set (M5-502b).
 *
 * Unlike /deals, /new-products, /rush-products — which read per-facet-value SKU
 * memberships straight from a weekly Searchspring scrape — search queries are
 * arbitrary, so there is no pre-scraped facet data. We can only build facets
 * from fields that live ON the product object: Category (from category_paths),
 * Price (low_price), Brand, and Min Qty.
 *
 * Color / Material / Production Time are deliberately ABSENT: per CLAUDE.md
 * those attributes are NOT on the product object (they only exist in the
 * aggregated Searchspring facet arrays, captured per category URL), so they
 * cannot be derived for an ad-hoc result set without a runtime API call.
 *
 * Output is the client-safe `DealsFacetSection[]` shape, so the existing
 * `DealsFilterSidebar` + `applyDealsFilters` drive the UI unchanged.
 */

import type { GeigerProduct } from '@/lib/product-types';
import type { DealsFacetSection, DealsFacetValue } from '@/lib/deals-filter';

const EXCLUDED_TOP_LEVELS = new Set(['Shop By']);

interface RangeBucket {
  id: string;
  label: string;
  low: number;
  high: number | null; // null = open-ended (no upper bound)
}

const PRICE_BUCKETS: RangeBucket[] = [
  { id: 'price-lt-0_5', label: 'Less than $0.50', low: 0, high: 0.5 },
  { id: 'price-0_5-1', label: '$0.50 - $1.00', low: 0.5, high: 1 },
  { id: 'price-1-5', label: '$1.00 - $5.00', low: 1, high: 5 },
  { id: 'price-5-10', label: '$5.00 - $10.00', low: 5, high: 10 },
  { id: 'price-10-25', label: '$10.00 - $25.00', low: 10, high: 25 },
  { id: 'price-25-50', label: '$25.00 - $50.00', low: 25, high: 50 },
  { id: 'price-50-100', label: '$50.00 - $100.00', low: 50, high: 100 },
  { id: 'price-100-plus', label: '$100.00 or more', low: 100, high: null },
];

// `high` is the EXCLUSIVE upper bound (= next bucket's low) so boundary values
// like 50/100/250/500 land in exactly one bucket. The display text is in `label`.
const MIN_QTY_BUCKETS: RangeBucket[] = [
  { id: 'minqty-1-50', label: '1 - 50', low: 1, high: 51 },
  { id: 'minqty-51-100', label: '51 - 100', low: 51, high: 101 },
  { id: 'minqty-101-250', label: '101 - 250', low: 101, high: 251 },
  { id: 'minqty-251-500', label: '251 - 500', low: 251, high: 501 },
  { id: 'minqty-501-plus', label: '501 or more', low: 501, high: null },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function inBucket(value: number, b: RangeBucket): boolean {
  if (value < b.low) return false;
  if (b.high === null) return true;
  // Upper bound exclusive so a value never lands in two buckets.
  return value < b.high;
}

function buildCategory(products: GeigerProduct[]): DealsFacetSection | null {
  const labelBySlug = new Map<string, string>();
  const skusBySlug = new Map<string, string[]>();
  for (const p of products) {
    const seen = new Set<string>();
    for (const cp of p.category_paths || []) {
      const parts = cp.split(' > ');
      if (parts.length < 2) continue;
      const label = parts[1];
      if (EXCLUDED_TOP_LEVELS.has(label)) continue;
      const slug = slugify(label);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      labelBySlug.set(slug, label);
      const list = skusBySlug.get(slug) || [];
      list.push(p.sku);
      skusBySlug.set(slug, list);
    }
  }
  const values: DealsFacetValue[] = [...skusBySlug.entries()]
    .map(([slug, skus]) => ({
      id: slug,
      value: slug,
      label: labelBySlug.get(slug) || slug,
      count: skus.length,
      type: 'value' as const,
      low: null,
      high: null,
      skus,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (values.length === 0) return null;
  return { field: 'category', label: 'Category', type: 'list', values };
}

function buildBrand(products: GeigerProduct[]): DealsFacetSection | null {
  const skusByBrand = new Map<string, string[]>();
  for (const p of products) {
    const brand = p.brand?.trim();
    if (!brand) continue;
    const list = skusByBrand.get(brand) || [];
    list.push(p.sku);
    skusByBrand.set(brand, list);
  }
  const values: DealsFacetValue[] = [...skusByBrand.entries()]
    .map(([brand, skus]) => ({
      id: brand,
      value: brand,
      label: brand,
      count: skus.length,
      type: 'value' as const,
      low: null,
      high: null,
      skus,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (values.length === 0) return null;
  return { field: 'brand', label: 'Brand', type: 'list', values };
}

function buildRange(
  products: GeigerProduct[],
  field: string,
  label: string,
  buckets: RangeBucket[],
  pick: (p: GeigerProduct) => number | null,
): DealsFacetSection | null {
  const skusByBucket = new Map<string, string[]>();
  for (const p of products) {
    const v = pick(p);
    if (v == null || Number.isNaN(v)) continue;
    const bucket = buckets.find((b) => inBucket(v, b));
    if (!bucket) continue;
    const list = skusByBucket.get(bucket.id) || [];
    list.push(p.sku);
    skusByBucket.set(bucket.id, list);
  }
  const values: DealsFacetValue[] = buckets
    .filter((b) => skusByBucket.has(b.id))
    .map((b) => {
      const skus = skusByBucket.get(b.id) as string[];
      return {
        id: b.id,
        value: b.id,
        label: b.label,
        count: skus.length,
        type: 'range' as const,
        low: String(b.low),
        high: b.high === null ? null : String(b.high),
        skus,
      };
    });
  if (values.length === 0) return null;
  return { field, label, type: 'range', values };
}

/** Build Category / Price / Brand / Min Qty facets from a matched product set. */
export function buildSearchFacets(products: GeigerProduct[]): DealsFacetSection[] {
  const sections: (DealsFacetSection | null)[] = [
    buildCategory(products),
    buildRange(products, 'low_price', 'Price', PRICE_BUCKETS, (p) => p.low_price),
    buildBrand(products),
    buildRange(products, 'min_qty', 'Minimum Qty', MIN_QTY_BUCKETS, (p) => p.min_qty),
  ];
  return sections.filter((s): s is DealsFacetSection => s !== null);
}
