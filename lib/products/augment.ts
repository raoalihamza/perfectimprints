import 'server-only';

import type { GeigerProduct } from '../product-types';
import {
  customProductIsCloseout,
  customProductIsNewItem,
  type CustomProductDoc,
} from '../sanity/queries/custom-products';

/**
 * Aggregator facet shape shared by /deals and /new-products. Structurally
 * identical to DealsFacetSection and NewProductsFacetSection — both routes
 * accept this type interchangeably (TypeScript structural typing).
 */
export interface AggregatorFacetValue {
  id: string;
  value: string | null;
  label: string;
  count: number;
  type: 'value' | 'range';
  low: string | null;
  high: string | null;
  skus: string[];
}

export interface AggregatorFacetSection {
  field: string;
  label: string;
  type: string;
  values: AggregatorFacetValue[];
}

export interface AugmentInputs {
  scrapedAt: string | null;
  scrapedProducts: GeigerProduct[];
  /** Scraped facets WITHOUT the synthetic Category section — augment rebuilds Category last. */
  scrapedFacets: AggregatorFacetSection[];
  /** Pinned Geiger SKUs already resolved to products. Empty/unknown SKUs dropped by caller. */
  pinnedProducts: GeigerProduct[];
  /** Custom (non-Geiger) products already normalized to the GeigerProduct shape. */
  customProducts: GeigerProduct[];
  /** Original customProduct docs from Sanity — used to inject filter-tag data. */
  customDocs: CustomProductDoc[];
}

export interface AugmentedAggregatorData {
  scrapedAt: string | null;
  products: GeigerProduct[];
  facets: AggregatorFacetSection[];
}

const CATEGORY_FIELD = 'category';
const EXCLUDED_TOP_LEVELS = new Set(['Shop By']);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildCategorySection(products: GeigerProduct[]): AggregatorFacetSection | null {
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
      if (seen.has(slug)) continue;
      seen.add(slug);
      labelBySlug.set(slug, label);
      const list = skusBySlug.get(slug) || [];
      list.push(p.sku);
      skusBySlug.set(slug, list);
    }
  }
  const values: AggregatorFacetValue[] = [...skusBySlug.entries()]
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

function deepCloneFacets(facets: AggregatorFacetSection[]): AggregatorFacetSection[] {
  return facets
    .filter((s) => s.field !== CATEGORY_FIELD)
    .map((s) => ({ ...s, values: s.values.map((v) => ({ ...v, skus: [...v.skus] })) }));
}

function upsertSection(
  facets: AggregatorFacetSection[],
  field: string,
  label: string,
): AggregatorFacetSection {
  let section = facets.find((s) => s.field === field);
  if (!section) {
    section = { field, label, type: 'list', values: [] };
    facets.push(section);
  }
  return section;
}

function upsertValue(
  section: AggregatorFacetSection,
  rawValue: string,
): AggregatorFacetValue {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error('upsertValue: rawValue must not be empty');
  }
  // Case-insensitive id match so "Blue" and "blue" share a bucket.
  const id = trimmed;
  const existing = section.values.find(
    (v) => v.id.toLowerCase() === id.toLowerCase(),
  );
  if (existing) return existing;
  const created: AggregatorFacetValue = {
    id,
    value: trimmed,
    label: trimmed,
    count: 0,
    type: 'value',
    low: null,
    high: null,
    skus: [],
  };
  section.values.push(created);
  return created;
}

function pushSkuOnce(value: AggregatorFacetValue, sku: string): void {
  if (!value.skus.includes(sku)) {
    value.skus.push(sku);
    value.count = value.skus.length;
  }
}

function injectCustomProductTags(
  facets: AggregatorFacetSection[],
  doc: CustomProductDoc,
  customSku: string,
): void {
  if (doc.brand && doc.brand.trim()) {
    const section = upsertSection(facets, 'brand', 'Brand');
    const value = upsertValue(section, doc.brand);
    pushSkuOnce(value, customSku);
  }
  for (const rawColor of doc.colors ?? []) {
    if (!rawColor || !rawColor.trim()) continue;
    const section = upsertSection(facets, 'colors', 'Color');
    const value = upsertValue(section, rawColor);
    pushSkuOnce(value, customSku);
  }
  if (doc.material && doc.material.trim()) {
    const section = upsertSection(facets, 'material', 'Material');
    const value = upsertValue(section, doc.material);
    pushSkuOnce(value, customSku);
  }
  for (const rawFeature of doc.features ?? []) {
    if (!rawFeature || !rawFeature.trim()) continue;
    const section = upsertSection(facets, 'feature', 'Feature');
    const value = upsertValue(section, rawFeature);
    pushSkuOnce(value, customSku);
  }
  for (const rawType of doc.types ?? []) {
    if (!rawType || !rawType.trim()) continue;
    const section = upsertSection(facets, 'type', 'Type');
    const value = upsertValue(section, rawType);
    pushSkuOnce(value, customSku);
  }
  // Refine By uses Geiger's exact human-readable vocabulary ("Made in the USA" /
  // "Eco Friendly" / "Deals") so custom flags merge with the scraped values.
  if (doc.madeInUsa === true) {
    const section = upsertSection(facets, 'refine_by', 'Refine By');
    pushSkuOnce(upsertValue(section, 'Made in the USA'), customSku);
  }
  if (doc.ecoFriendly === true) {
    const section = upsertSection(facets, 'refine_by', 'Refine By');
    pushSkuOnce(upsertValue(section, 'Eco Friendly'), customSku);
  }
  if (customProductIsCloseout(doc)) {
    const section = upsertSection(facets, 'refine_by', 'Refine By');
    pushSkuOnce(upsertValue(section, 'Deals'), customSku);
  }
  // Searchspring models new-ness as an is_new_item facet with the value "Yes".
  if (customProductIsNewItem(doc)) {
    const section = upsertSection(facets, 'is_new_item', 'New Items');
    pushSkuOnce(upsertValue(section, 'Yes'), customSku);
  }
}

/**
 * Merges custom (non-Geiger) products + pinned Geiger SKUs into the base
 * scraped aggregator data. Re-derives the synthetic Category facet section
 * and injects custom-product filter tags (brand/colors/material/feature/type
 * plus the Made-in-USA / Eco / Closeout / New-Items flags) into the existing
 * scraped facets so filter behavior is consistent.
 *
 * Final product order: custom (Sanity editorial picks) → newly pinned Geiger
 * SKUs (not already in the scrape) → scraped Geiger deals/new-products.
 *
 * Pure function: no I/O, no globals. Caller resolves all async inputs first.
 */
export function augmentAggregator(input: AugmentInputs): AugmentedAggregatorData {
  const scrapedSkus = new Set(input.scrapedProducts.map((p) => p.sku));
  const newPinned = input.pinnedProducts.filter((p) => !scrapedSkus.has(p.sku));

  const facets = deepCloneFacets(input.scrapedFacets);

  for (const doc of input.customDocs) {
    const customSku = `custom-${doc._id}`;
    injectCustomProductTags(facets, doc, customSku);
  }

  const products = [...input.customProducts, ...newPinned, ...input.scrapedProducts];

  const finalFacets: AggregatorFacetSection[] = [];
  const categorySection = buildCategorySection(products);
  if (categorySection) finalFacets.push(categorySection);
  for (const f of facets) finalFacets.push(f);

  return {
    scrapedAt: input.scrapedAt,
    products,
    facets: finalFacets,
  };
}
