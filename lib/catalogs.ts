import { buildSkuSet, isHiddenSku } from '@/lib/products/hidden-skus';
import fs from 'node:fs';
import path from 'node:path';
import { decodeProductList } from './products/decode-product';
import type { GeigerProduct } from './product-types';
import type { DealsFacetSection, DealsFacetValue } from './deals-filter';
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
import type { CategoryOverrideAddedProduct } from './sanity/queries/category-overrides';

// ---------------------------------------------------------------------------
// Loader for data/geiger/catalogs.json (Phase I, P2-CAT-000) — the 7 Geiger
// themed catalogs behind the /shop-by-theme lead pages (P2-CAT-001). Mirrors
// lib/deals.ts, but the file holds MANY catalogs, so everything is keyed by the
// scraper's stable catalog slug (`catalogKey` on the Sanity catalogPage doc).
//
// The facet shape is identical to the deals scrape (per-value skus[]), so the
// client-safe DealsFacetSection types + applyDealsFilters are reused as-is —
// the gated page's filter sidebar is the same machinery as /deals.
// ---------------------------------------------------------------------------

// Re-export the client-safe types + filter helper so the catalog routes can
// import everything from "@/lib/catalogs" (same convention as lib/deals.ts).
export type {
  DealsFacetSection as CatalogFacetSection,
  DealsFacetValue as CatalogFacetValue,
  DealsFilterState as CatalogFilterState,
} from './deals-filter';
export { applyDealsFilters as applyCatalogFilters } from './deals-filter';

const CATALOGS_FILE = path.join(process.cwd(), 'data', 'geiger', 'catalogs.json');

interface CatalogsFileEntry {
  slug: string;
  title: string;
  source: unknown;
  browseUrl: string | null;
  pdf: unknown;
  totalProducts: number;
  products: GeigerProduct[];
  facets: DealsFacetSection[];
}

interface CatalogsFile {
  scrapedAt: string;
  catalogs: CatalogsFileEntry[];
}

export interface CatalogData {
  scrapedAt: string | null;
  /** Scraper title for the catalog (Sanity's `title` wins for display). */
  title: string | null;
  /** The digital-catalog viewer link (affiliate host for internal viewers). */
  browseUrl: string | null;
  products: GeigerProduct[];
  /** Synthetic "Category" section + everything Searchspring returned. */
  facets: DealsFacetSection[];
}

interface RawScrapedCatalog {
  scrapedAt: string | null;
  title: string | null;
  browseUrl: string | null;
  products: GeigerProduct[];
  /** Scraped facets exactly as the file delivered them — NO synthetic Category. */
  scrapedFacets: DealsFacetSection[];
}

let _fileCache: Map<string, RawScrapedCatalog> | null = null;

/**
 * Parse catalogs.json once per process and index by catalog slug. A missing
 * file (e.g. a fresh checkout before the Phase I scrape) yields an empty map —
 * every catalog then renders as manual-only (adds are the whole grid).
 */
function readCatalogsFile(): Map<string, RawScrapedCatalog> {
  if (_fileCache) return _fileCache;
  const map = new Map<string, RawScrapedCatalog>();
  if (fs.existsSync(CATALOGS_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(CATALOGS_FILE, 'utf8')) as CatalogsFile;
    for (const entry of parsed.catalogs ?? []) {
      if (!entry?.slug) continue;
      map.set(entry.slug, {
        scrapedAt: parsed.scrapedAt ?? null,
        title: entry.title ?? null,
        browseUrl: entry.browseUrl ?? null,
        // Decoded at the loader like every other product source. The gated
        // catalog pages render through the shared ProductGrid -> ProductCard,
        // whose render-time patch was removed by IMG-100, so without this all
        // 1,043 catalog images would 400 at the image host and the two
        // entity-bearing brands here would render as `W&amp;P`-style text.
        products: decodeProductList(entry.products ?? []),
        scrapedFacets: entry.facets ?? [],
      });
    }
  }
  _fileCache = map;
  return map;
}

/**
 * The scraped-only view of one catalog (no Sanity augmentation). An unknown
 * key returns an empty catalog rather than throwing — the two manual-only
 * catalogs (Retail Collective, Trend Talk) ship with source:null and an empty
 * product list, and render from Patrick's adds alone.
 */
function readScrapedCatalog(catalogKey: string): RawScrapedCatalog {
  return (
    readCatalogsFile().get(catalogKey) ?? {
      scrapedAt: null,
      title: null,
      browseUrl: null,
      products: [],
      scrapedFacets: [],
    }
  );
}

/** The scraped digital-catalog viewer link for a catalog key (may be null). */
export function getCatalogBrowseUrl(catalogKey: string): string | null {
  return readScrapedCatalog(catalogKey).browseUrl;
}

/** First N scraped products of a catalog — the landing page's static preview strip. */
export function getCatalogPreviewProducts(catalogKey: string, limit = 4): GeigerProduct[] {
  return readScrapedCatalog(catalogKey).products.slice(0, limit);
}

/**
 * Removes the given SKUs from the product list and re-derives every facet
 * section's value list (counts + sku arrays) so the sidebar stays consistent
 * with the visible grid. Mirrors applyHiddenSkus in lib/deals.ts.
 */
export function applyHiddenSkus(data: CatalogData, hiddenSkus: string[]): CatalogData {
  if (!hiddenSkus || hiddenSkus.length === 0) return data;
  // HIDE-100: matching moved to the shared normalized rule so the aggregator
  // hide lists and the site-wide list behave identically (trimmed,
  // case-insensitive, internal spaces preserved). Strictly more forgiving than
  // the previous exact match, so nothing that was hidden before can reappear.
  const hidden = buildSkuSet(hiddenSkus);
  if (hidden.size === 0) return data;

  const products = data.products.filter((p) => !isHiddenSku(p.sku, hidden));
  const facets: DealsFacetSection[] = [];
  for (const section of data.facets) {
    const values: DealsFacetValue[] = [];
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

export interface AugmentCatalogInput {
  /** The scraper's stable catalog slug (catalogPage.catalogKey). */
  catalogKey: string;
  /** Geiger SKUs to add (catalogPage.addedSkus) — resolved against products.json. */
  addedSkus?: string[];
  /**
   * The catalogPage's resolved `addedProducts` references — customProduct
   * (affiliate link-out card) and/or productPage (internal /products/<slug>
   * card, carries `detailUrl`). Both join the filter sidebar with their own
   * Brand/Color/Material/Feature/Type tags, same as on /new-products.
   */
  addedProducts?: CategoryOverrideAddedProduct[];
  /** Scraped/added Geiger SKUs to remove (catalogPage.hiddenSkus). */
  hiddenSkus?: string[];
}

/**
 * One catalog's gated-page data with the Sanity catalogPage levers merged in:
 * synced scrape (from catalogs.json) + addedSkus + addedProducts − hiddenSkus,
 * with the synthetic Category section rebuilt and custom filter tags injected —
 * the same `augmentAggregator` lane /deals, /new-products, and /rush-products
 * use. Order: added products (editorial picks) → newly-added Geiger SKUs →
 * scraped catalog products.
 *
 * A manual-only catalog (empty synced base) works unchanged: the adds are the
 * whole grid, and the facets are derived entirely from the added products.
 */
export function getAugmentedCatalogData(input: AugmentCatalogInput): CatalogData {
  const base = readScrapedCatalog(input.catalogKey);
  const pinnedProducts = getGeigerProductsBySkus(input.addedSkus ?? []);

  // Split the reference union and normalize each side (drop null derefs and
  // productPages without a slug — they couldn't link anywhere).
  const added = (input.addedProducts ?? []).filter(
    (doc): doc is CategoryOverrideAddedProduct =>
      Boolean(doc?._type) && (doc._type !== 'productPage' || Boolean(doc.slug)),
  );
  const productPageDocs = added.filter(
    (d): d is { _type: 'productPage' } & ProductPageCard => d._type === 'productPage',
  );
  const customDocs = added.filter(
    (d): d is { _type: 'customProduct' } & CustomProductDoc => d._type === 'customProduct',
  );

  // Product pages ride the same augment lane as custom products (the
  // /new-products pattern): their synthetic `custom-<_id>` SKU matches what
  // injectCustomProductTags keys, so the CustomProductDoc-shaped view lines
  // the filters up. Prepending puts them first in the final grid order.
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

  return applyHiddenSkus(
    {
      scrapedAt: augmented.scrapedAt,
      title: base.title,
      browseUrl: base.browseUrl,
      products: augmented.products,
      facets: augmented.facets as DealsFacetSection[],
    },
    input.hiddenSkus ?? [],
  );
}
