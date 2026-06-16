import fs from 'node:fs';
import path from 'node:path';
import { decodeHtmlEntities } from './text-utils';
import type { GeigerProduct } from './product-types';
import type {
  NewProductsFacetSection,
  NewProductsFacetValue,
} from './new-products-filter';
import { augmentAggregator } from './products/augment';
import { getGeigerProductsBySkus } from './products/lookup';
import {
  customProductToGeigerProduct,
  type CustomProductDoc,
} from './sanity/queries/custom-products';

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

interface RawScrapedNewProducts {
  scrapedAt: string | null;
  products: GeigerProduct[];
  scrapedFacets: NewProductsFacetSection[];
}

let _rawCache: RawScrapedNewProducts | null = null;

function readScraped(): RawScrapedNewProducts {
  if (_rawCache) return _rawCache;
  if (!fs.existsSync(NEW_PRODUCTS_FILE)) {
    _rawCache = { scrapedAt: null, products: [], scrapedFacets: [] };
    return _rawCache;
  }
  const raw = fs.readFileSync(NEW_PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as NewProductsFile;

  const products: GeigerProduct[] = parsed.products.map((p) => ({
    ...p,
    name: decodeHtmlEntities(p.name),
    description: p.description ? decodeHtmlEntities(p.description) : p.description,
  }));

  _rawCache = {
    scrapedAt: parsed.scrapedAt,
    products,
    scrapedFacets: parsed.facets,
  };
  return _rawCache;
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

/**
 * Returns the scraped-only new-products view. For the full Sanity-augmented
 * view used by /new-products, call `getAugmentedNewProductsData()` instead.
 */
export function getNewProductsData(): NewProductsData {
  return getAugmentedNewProductsData({ pinnedSkus: [], customDocs: [] });
}

export interface AugmentNewProductsInput {
  pinnedSkus?: string[];
  customDocs?: CustomProductDoc[];
}

/**
 * Returns the new-products data with Sanity-controlled additions merged in.
 * Same pattern as `getAugmentedDealsData`. See that function's docstring.
 */
export function getAugmentedNewProductsData(
  input: AugmentNewProductsInput = {},
): NewProductsData {
  const base = readScraped();
  const pinnedProducts = getGeigerProductsBySkus(input.pinnedSkus ?? []);
  const customDocs = input.customDocs ?? [];
  const customProducts = customDocs.map(customProductToGeigerProduct);

  const augmented = augmentAggregator({
    scrapedAt: base.scrapedAt,
    scrapedProducts: base.products,
    scrapedFacets: base.scrapedFacets,
    pinnedProducts,
    customProducts,
    customDocs,
  });

  return {
    scrapedAt: augmented.scrapedAt,
    products: augmented.products,
    facets: augmented.facets as NewProductsFacetSection[],
  };
}

/**
 * Convenience helper for the homepage "New and Trending" rail. Reads the
 * scraped-only view (no Sanity augmentation, no async work) so the rail
 * stays a sync server-component call.
 */
export function getNewProducts(limit = 12): GeigerProduct[] {
  return getNewProductsData().products.slice(0, limit);
}
