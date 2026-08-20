import { buildSkuSet, isHiddenSku } from '@/lib/products/hidden-skus';
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
import {
  productPageAsCustomDoc,
  productPageToGeigerProduct,
  type ProductPageCard,
} from './sanity/queries/product-pages';

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
  // HIDE-100: matching moved to the shared normalized rule so the aggregator
  // hide lists and the site-wide list behave identically (trimmed,
  // case-insensitive, internal spaces preserved). Strictly more forgiving than
  // the previous exact match, so nothing that was hidden before can reappear.
  const hidden = buildSkuSet(hiddenSkus);
  if (hidden.size === 0) return data;

  const products = data.products.filter((p) => !isHiddenSku(p.sku, hidden));
  const facets: NewProductsFacetSection[] = [];
  for (const section of data.facets) {
    const values: NewProductsFacetValue[] = [];
    for (const v of section.values) {
      const visibleSkus = v.skus.filter((s) => !isHiddenSku(s, hidden));
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
  /**
   * Sanity productPage docs with the "Show on /new-products" toggle on
   * (P2-CP-001). Normalized to internal-link cards (detailUrl →
   * /products/<slug>) and placed FIRST — before custom products, pins, and the
   * scraped feed — with their filter tags (brand/color/material/feature/type +
   * Made-in-USA/Eco/Closeout/New-Items) injected like custom products.
   */
  productPageDocs?: ProductPageCard[];
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
  const productPageDocs = input.productPageDocs ?? [];
  // Product pages ride the same augment lane as custom products: their
  // synthetic `custom-<_id>` SKU matches what injectCustomProductTags keys, so
  // the CustomProductDoc-shaped view below lines the filters up. Prepending
  // puts them first in the final grid order.
  const customProducts = [
    ...productPageDocs.map(productPageToGeigerProduct),
    ...customDocs.map(customProductToGeigerProduct),
  ];
  const allCustomDocs = [...productPageDocs.map(productPageAsCustomDoc), ...customDocs];

  const augmented = augmentAggregator({
    scrapedAt: base.scrapedAt,
    scrapedProducts: base.products,
    scrapedFacets: base.scrapedFacets,
    pinnedProducts,
    customProducts,
    customDocs: allCustomDocs,
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
export function getNewProducts(limit = 12, hiddenSkus: string[] = []): GeigerProduct[] {
  // HIDE-000 follow-up: this used to slice straight off the data with NO hide
  // list applied, so a product hidden from the aggregator page still showed in
  // the home rail and the control looked inert. Filtering happens BEFORE the
  // slice, so hiding one product backfills from the rest instead of leaving a
  // short rail with a gap in it.
  const products = getNewProductsData().products;
  const hidden = buildSkuSet(hiddenSkus);
  const visible =
    hidden.size === 0 ? products : products.filter((p) => !isHiddenSku(p.sku, hidden));
  return visible.slice(0, limit);
}
