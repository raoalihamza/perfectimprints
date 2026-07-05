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
  features?: string[];
  types?: string[];
  madeInUsa?: boolean;
  ecoFriendly?: boolean;
  closeout?: boolean;
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
  features,
  types,
  madeInUsa,
  ecoFriendly,
  closeout,
  badges,
  displayOrder,
  placements,
  "parentCategory": parentCategory->{ "slug": slug.current, title }
`;

/**
 * "New item" signal for a custom product. There is deliberately NO separate
 * `newItem` field — the NEW badge and the "Show on /new-products" placement
 * already exist as new-ness signals, and both feed the normalized
 * `is_new_item`, which every New Items filter reads.
 */
export function customProductIsNewItem(doc: CustomProductDoc): boolean {
  return (doc.badges ?? []).includes('new') || doc.placements?.onNewProducts === true;
}

/** "Closeout" signal — the Closeout toggle or the CLOSEOUT badge. */
export function customProductIsCloseout(doc: CustomProductDoc): boolean {
  return doc.closeout === true || (doc.badges ?? []).includes('closeout');
}

/**
 * Every customProduct doc (any placement). Used by the Phase 2 AI engine's
 * related-products matcher (lib/ai/related-products.ts) so AI-suggested strips
 * can include Patrick's non-Geiger products, not just the scraped catalog. Runs
 * only inside the force-dynamic generate routes — not a render-path read, so no
 * cache tag is needed (same untagged CDN client as the placement reads above).
 */
export async function getAllCustomProducts(): Promise<CustomProductDoc[]> {
  try {
    return (
      (await client.fetch<CustomProductDoc[]>(
        `*[_type == "customProduct"] | order(displayOrder asc, title asc) { ${PROJECTION} }`,
      )) ?? []
    );
  } catch {
    return [];
  }
}

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

export interface CustomProductSearchEntry {
  title: string;
  /** externalUrl — routed through `affiliateUrl()` (product result) at click time. */
  url: string;
  brand?: string;
  /** Small thumbnail for the autocomplete overlay. */
  image?: string;
}

/**
 * Every custom product (any placement) as a search entry — title + external URL
 * (+ brand + thumbnail). Feeds the live Sanity search delta (M5-507 follow-up).
 * Custom products use the `product` result type, so they link straight to their
 * external/affiliate URL exactly like scraped Geiger products.
 */
export async function getCustomProductSearchEntries(): Promise<CustomProductSearchEntry[]> {
  try {
    const docs =
      (await client.fetch<{ title?: string; externalUrl?: string; brand?: string; image?: SanityImage }[]>(
        `*[_type == "customProduct" && defined(title) && defined(externalUrl)]{ title, externalUrl, brand, image }`,
      )) ?? [];
    return docs
      .map((d) => {
        const entry: CustomProductSearchEntry = {
          title: (d.title ?? '').trim(),
          url: d.externalUrl ?? '',
        };
        if (d.brand) entry.brand = d.brand.trim();
        if (d.image?.asset?._ref) {
          try {
            entry.image = urlForImage(d.image).width(80).height(80).fit('max').url();
          } catch {
            /* leave image unset */
          }
        }
        return entry;
      })
      .filter((e) => e.title && e.url);
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
    is_new_item: customProductIsNewItem(doc),
    is_on_sale: (doc.badges ?? []).includes('sale'),
    product_type_unigram: null,
    geiger_url: doc.externalUrl,
  };
}
