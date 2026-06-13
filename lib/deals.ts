import fs from 'node:fs';
import path from 'node:path';
import { decodeHtmlEntities } from './text-utils';
import type { GeigerProduct } from './product-types';
import type { DealsFacetSection, DealsFacetValue } from './deals-filter';

// Re-export client-safe types + filter helper so server callers can import
// everything from "@/lib/deals" without crossing into the client-safe module.
export type {
  DealsFacetSection,
  DealsFacetValue,
  DealsFilterState,
} from './deals-filter';
export { applyDealsFilters } from './deals-filter';

const DEALS_FILE = path.join(process.cwd(), 'data', 'geiger', 'deals.json');

interface DealsFile {
  scrapedAt: string;
  totalDeals: number;
  products: GeigerProduct[];
  facets: DealsFacetSection[];
}

export interface DealsData {
  scrapedAt: string | null;
  products: GeigerProduct[];
  /** Synthetic "Category" section + everything Searchspring returned. */
  facets: DealsFacetSection[];
}

// Field name we use for the synthetic flat-top-level Category section. The
// scraper drops `ss_category_hierarchy` from the facet list, so this id is safe.
const CATEGORY_FIELD = 'category';
// Geiger's "Shop By" pseudo-department is just sale/brands/etc. — skip it.
const EXCLUDED_TOP_LEVELS = new Set(['Shop By']);

let _data: DealsData | null = null;

function buildCategorySection(products: GeigerProduct[]): DealsFacetSection | null {
  const labelBySlug = new Map<string, string>();
  const skusBySlug = new Map<string, string[]>();
  for (const p of products) {
    const seenForProduct = new Set<string>();
    for (const cp of p.category_paths || []) {
      const parts = cp.split(' > ');
      if (parts.length < 2) continue;
      const label = parts[1];
      if (EXCLUDED_TOP_LEVELS.has(label)) continue;
      const slug = slugify(label);
      if (seenForProduct.has(slug)) continue;
      seenForProduct.add(slug);
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
  return { field: CATEGORY_FIELD, label: 'Category', type: 'list', values };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Removes the given SKUs from the product list and re-derives every facet
 * section's value list (counts + sku arrays) so the sidebar stays consistent
 * with the visible grid. Drops values that become empty and sections that
 * become empty.
 *
 * Used by the /deals route to honor the `hiddenDealSkus` Sanity blocklist.
 */
export function applyHiddenSkus(data: DealsData, hiddenSkus: string[]): DealsData {
  if (!hiddenSkus || hiddenSkus.length === 0) return data;
  const hidden = new Set(hiddenSkus.map((s) => s.trim()).filter(Boolean));
  if (hidden.size === 0) return data;

  const products = data.products.filter((p) => !hidden.has(p.sku));
  const facets: DealsFacetSection[] = [];
  for (const section of data.facets) {
    const values: DealsFacetValue[] = [];
    for (const v of section.values) {
      const visibleSkus = v.skus.filter((s) => !hidden.has(s));
      if (visibleSkus.length === 0) continue;
      values.push({ ...v, skus: visibleSkus, count: visibleSkus.length });
    }
    if (values.length === 0) continue;
    facets.push({ ...section, values });
  }
  return { ...data, products, facets };
}

export function getDealsData(): DealsData {
  if (_data) return _data;
  if (!fs.existsSync(DEALS_FILE)) {
    _data = { scrapedAt: null, products: [], facets: [] };
    return _data;
  }
  const raw = fs.readFileSync(DEALS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as DealsFile;

  const products: GeigerProduct[] = parsed.products.map((p) => ({
    ...p,
    name: decodeHtmlEntities(p.name),
    description: p.description ? decodeHtmlEntities(p.description) : p.description,
  }));

  const facets: DealsFacetSection[] = [];
  const categorySection = buildCategorySection(products);
  if (categorySection) facets.push(categorySection);
  for (const f of parsed.facets) facets.push(f);

  _data = { scrapedAt: parsed.scrapedAt, products, facets };
  return _data;
}
