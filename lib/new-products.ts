import fs from 'node:fs';
import path from 'node:path';
import { decodeHtmlEntities } from './text-utils';
import type { GeigerProduct } from './product-types';
import type {
  NewProductsFacetSection,
  NewProductsFacetValue,
} from './new-products-filter';

export type {
  NewProductsFacetSection,
  NewProductsFacetValue,
  NewProductsFilterState,
} from './new-products-filter';
export { applyNewProductsFilters } from './new-products-filter';

const NEW_PRODUCTS_FILE = path.join(process.cwd(), 'data', 'geiger', 'new-products.json');

interface NewProductsFile {
  scrapedAt: string;
  totalNewProducts: number;
  products: GeigerProduct[];
  facets: NewProductsFacetSection[];
}

export interface NewProductsData {
  scrapedAt: string | null;
  products: GeigerProduct[];
  /** Synthetic "Category" section + everything Searchspring returned. */
  facets: NewProductsFacetSection[];
}

const CATEGORY_FIELD = 'category';
const EXCLUDED_TOP_LEVELS = new Set(['Shop By']);

let _data: NewProductsData | null = null;

function buildCategorySection(products: GeigerProduct[]): NewProductsFacetSection | null {
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
  const values: NewProductsFacetValue[] = [...skusBySlug.entries()]
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
 * with the visible grid. Mirrors applyHiddenSkus in lib/deals.ts.
 */
export function applyHiddenSkus(
  data: NewProductsData,
  hiddenSkus: string[],
): NewProductsData {
  if (!hiddenSkus || hiddenSkus.length === 0) return data;
  const hidden = new Set(hiddenSkus.map((s) => s.trim()).filter(Boolean));
  if (hidden.size === 0) return data;

  const products = data.products.filter((p) => !hidden.has(p.sku));
  const facets: NewProductsFacetSection[] = [];
  for (const section of data.facets) {
    const values: NewProductsFacetValue[] = [];
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

export function getNewProductsData(): NewProductsData {
  if (_data) return _data;
  if (!fs.existsSync(NEW_PRODUCTS_FILE)) {
    _data = { scrapedAt: null, products: [], facets: [] };
    return _data;
  }
  const raw = fs.readFileSync(NEW_PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as NewProductsFile;

  const products: GeigerProduct[] = parsed.products.map((p) => ({
    ...p,
    name: decodeHtmlEntities(p.name),
    description: p.description ? decodeHtmlEntities(p.description) : p.description,
  }));

  const facets: NewProductsFacetSection[] = [];
  const categorySection = buildCategorySection(products);
  if (categorySection) facets.push(categorySection);
  for (const f of parsed.facets) facets.push(f);

  _data = { scrapedAt: parsed.scrapedAt, products, facets };
  return _data;
}

/**
 * Convenience helper for the homepage "New and Trending" rail. Returns the
 * first `limit` products sorted as Searchspring delivered them (the scraper
 * preserves Geiger's own "Best Sellers" ordering on the New Products feed).
 */
export function getNewProducts(limit = 12): GeigerProduct[] {
  return getNewProductsData().products.slice(0, limit);
}
