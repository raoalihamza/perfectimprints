import fs from 'node:fs';
import path from 'node:path';
import { decodeHtmlEntities } from './text-utils';
import type { GeigerProduct } from './product-types';
import type {
  RushProductsFacetSection,
  RushProductsFacetValue,
} from './rush-products-filter';
import { augmentAggregator } from './products/augment';
import { getGeigerProductsBySkus } from './products/lookup';
import {
  customProductToGeigerProduct,
  type CustomProductDoc,
} from './sanity/queries/custom-products';

export type {
  RushProductsFacetSection,
  RushProductsFacetValue,
  RushProductsFilterState,
} from './rush-products-filter';
export { applyRushProductsFilters } from './rush-products-filter';

const RUSH_PRODUCTS_FILE = path.join(process.cwd(), 'data', 'geiger', 'rush-products.json');

interface RushProductsFile {
  scrapedAt: string;
  totalRushProducts: number;
  products: GeigerProduct[];
  facets: RushProductsFacetSection[];
}

export interface RushProductsData {
  scrapedAt: string | null;
  products: GeigerProduct[];
  /** Synthetic "Category" section + everything Searchspring returned. */
  facets: RushProductsFacetSection[];
}

interface RawScrapedRushProducts {
  scrapedAt: string | null;
  products: GeigerProduct[];
  scrapedFacets: RushProductsFacetSection[];
}

let _rawCache: RawScrapedRushProducts | null = null;

function readScraped(): RawScrapedRushProducts {
  if (_rawCache) return _rawCache;
  if (!fs.existsSync(RUSH_PRODUCTS_FILE)) {
    _rawCache = { scrapedAt: null, products: [], scrapedFacets: [] };
    return _rawCache;
  }
  const raw = fs.readFileSync(RUSH_PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as RushProductsFile;

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
 * with the visible grid. Mirrors applyHiddenSkus in lib/new-products.ts.
 */
export function applyHiddenSkus(
  data: RushProductsData,
  hiddenSkus: string[],
): RushProductsData {
  if (!hiddenSkus || hiddenSkus.length === 0) return data;
  const hidden = new Set(hiddenSkus.map((s) => s.trim()).filter(Boolean));
  if (hidden.size === 0) return data;

  const products = data.products.filter((p) => !hidden.has(p.sku));
  const facets: RushProductsFacetSection[] = [];
  for (const section of data.facets) {
    const values: RushProductsFacetValue[] = [];
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
 * Returns the scraped-only rush-products view. For the full Sanity-augmented
 * view used by /rush-products, call `getAugmentedRushProductsData()` instead.
 */
export function getRushProductsData(): RushProductsData {
  return getAugmentedRushProductsData({ pinnedSkus: [], customDocs: [] });
}

export interface AugmentRushProductsInput {
  pinnedSkus?: string[];
  customDocs?: CustomProductDoc[];
}

/**
 * Returns the rush-products data with Sanity-controlled additions merged in.
 * Same pattern as `getAugmentedNewProductsData`. See that function's docstring.
 */
export function getAugmentedRushProductsData(
  input: AugmentRushProductsInput = {},
): RushProductsData {
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
    facets: augmented.facets as RushProductsFacetSection[],
  };
}

/**
 * Convenience helper for the homepage Rush Products rail. Reads the
 * scraped-only view (no Sanity augmentation, no async work) so the rail
 * stays a sync server-component call — mirrors `getNewProducts`.
 */
export function getRushProducts(limit = 12): GeigerProduct[] {
  return getRushProductsData().products.slice(0, limit);
}
