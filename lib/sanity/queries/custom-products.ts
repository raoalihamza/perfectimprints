import 'server-only';

import { client, urlForImage } from '@/lib/sanity/client';
import type { SanityImage } from '@/lib/sanity/types';
import type { GeigerProduct } from '@/lib/product-types';

export interface CustomProductDoc {
  _id: string;
  title: string;
  description?: string;
  externalUrl: string;
  image?: SanityImage;
  brand?: string;
  lowPrice?: number;
  highPrice?: number;
  msrp?: number;
  minQty?: number;
  productionTime?: number;
  colors?: string[];
  material?: string;
  badges?: string[];
  displayOrder?: number;
  placements?: { onDeals?: boolean; onNewProducts?: boolean; onRush?: boolean };
  parentCategory?: { slug?: string; title?: string };
}

const PROJECTION = `
  _id,
  title,
  description,
  externalUrl,
  image,
  brand,
  lowPrice,
  highPrice,
  msrp,
  minQty,
  productionTime,
  colors,
  material,
  badges,
  displayOrder,
  placements,
  "parentCategory": parentCategory->{ "slug": slug.current, title }
`;

export async function getCustomProductsForDeals(): Promise<CustomProductDoc[]> {
  try {
    return (
      (await client.fetch<CustomProductDoc[]>(
        `*[_type == "customProduct" && placements.onDeals == true] | order(displayOrder asc, title asc) { ${PROJECTION} }`,
      )) ?? []
    );
  } catch {
    return [];
  }
}

export async function getCustomProductsForNewProducts(): Promise<CustomProductDoc[]> {
  try {
    return (
      (await client.fetch<CustomProductDoc[]>(
        `*[_type == "customProduct" && placements.onNewProducts == true] | order(displayOrder asc, title asc) { ${PROJECTION} }`,
      )) ?? []
    );
  } catch {
    return [];
  }
}

export async function getCustomProductsForRushProducts(): Promise<CustomProductDoc[]> {
  try {
    return (
      (await client.fetch<CustomProductDoc[]>(
        `*[_type == "customProduct" && placements.onRush == true] | order(displayOrder asc, title asc) { ${PROJECTION} }`,
      )) ?? []
    );
  } catch {
    return [];
  }
}

/**
 * Normalize a Sanity customProduct into the GeigerProduct contract so it can
 * be rendered by ProductCard alongside scraped Geiger products without any
 * branching in the UI.
 *
 * Conventions:
 * - `sku` is prefixed with `custom-` + Sanity `_id` so it never collides with
 *   real Geiger SKUs even if Patrick types a numeric title.
 * - `geiger_url` carries the customProduct.externalUrl. `affiliateUrl()` only
 *   rewrites Geiger hosts, so non-Geiger URLs pass through unchanged.
 * - `is_new_item` / `is_on_sale` are derived from the badges array so the
 *   existing ribbon logic in ProductCard works without changes.
 * - `category_paths` synthesizes `Home > <parentCategory.title>` so the
 *   downstream synthetic Category facet section auto-includes custom products.
 */
export function customProductToGeigerProduct(doc: CustomProductDoc): GeigerProduct {
  let imageUrl: string | null = null;
  if (doc.image?.asset?._ref) {
    try {
      imageUrl = urlForImage(doc.image).width(400).fit('max').url();
    } catch {
      imageUrl = null;
    }
  }

  const badges = (doc.badges ?? []).map((tag) => ({
    tag,
    value: tag.toUpperCase(),
  }));

  const category_paths: string[] = [];
  if (doc.parentCategory?.title) {
    category_paths.push(`Home > ${doc.parentCategory.title}`);
  }

  const lowPrice = doc.lowPrice ?? null;
  const highPrice = doc.highPrice ?? doc.lowPrice ?? null;

  return {
    sku: `custom-${doc._id}`,
    name: doc.title,
    brand: doc.brand ?? null,
    low_price: lowPrice,
    high_price: highPrice,
    msrp: doc.msrp ?? null,
    min_qty: doc.minQty ?? null,
    imageUrl,
    description: doc.description ?? '',
    category_paths,
    badges,
    is_new_item:
      (doc.badges ?? []).includes('new') || doc.placements?.onNewProducts === true,
    is_on_sale: (doc.badges ?? []).includes('sale'),
    product_type_unigram: null,
    geiger_url: doc.externalUrl,
  };
}
