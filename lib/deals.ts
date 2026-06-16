import fs from 'node:fs';
import path from 'node:path';
import { decodeHtmlEntities } from './text-utils';
import type { GeigerProduct } from './product-types';
import type { DealsFacetSection, DealsFacetValue } from './deals-filter';
import { augmentAggregator } from './products/augment';
import { getGeigerProductsBySkus } from './products/lookup';
import {
  customProductToGeigerProduct,
  type CustomProductDoc,
} from './sanity/queries/custom-products';

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

interface RawScrapedDeals {
  scrapedAt: string | null;
  products: GeigerProduct[];
  /** Scraped facets exactly as the file delivered them — NO synthetic Category. */
  scrapedFacets: DealsFacetSection[];
}

let _rawCache: RawScrapedDeals | null = null;

function readScraped(): RawScrapedDeals {
  if (_rawCache) return _rawCache;
  if (!fs.existsSync(DEALS_FILE)) {
    _rawCache = { scrapedAt: null, products: [], scrapedFacets: [] };
    return _rawCache;
  }
  const raw = fs.readFileSync(DEALS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as DealsFile;

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
 * with the visible grid. Drops values that become empty and sections that
 * become empty.
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

/**
 * Returns the scraped-only deals view (Geiger's auto-scraped deals + synthetic
 * Category section). For the full Sanity-augmented view used by /deals, call
 * `getAugmentedDealsData()` instead.
 */
export function getDealsData(): DealsData {
  return getAugmentedDealsData({ pinnedSkus: [], customDocs: [] });
}

export interface AugmentDealsInput {
  pinnedSkus?: string[];
  customDocs?: CustomProductDoc[];
}

/**
 * Returns the deals data with Sanity-controlled additions merged in:
 *  - `pinnedSkus[]` — Geiger SKUs to promote even when Geiger's deals scrape
 *    did not include them (looked up against products.json).
 *  - `customDocs[]` — non-Geiger custom products (any vendor) flagged with
 *    `placements.onDeals == true` in Studio.
 *
 * Order on the page: custom (editorial picks) → newly-pinned Geiger SKUs →
 * scraped Geiger deals. The synthetic Category facet section is rebuilt to
 * include all sources, and custom-product filter tags (brand/colors/material)
 * are injected into the corresponding facet sections so the filter sidebar
 * stays consistent.
 */
export function getAugmentedDealsData(input: AugmentDealsInput = {}): DealsData {
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
    facets: augmented.facets as DealsFacetSection[],
  };
}
