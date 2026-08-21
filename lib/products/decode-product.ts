/**
 * The one place a scraped Geiger product's HTML entities are decoded (SNIP-130).
 *
 * PURE + CLIENT-SAFE: no fs, no Sanity, no `server-only`. It exists so the rule
 * "decode at the loader, never at the render site" (CLAUDE.md section 17) has a
 * single implementation instead of seven near-identical `map()` bodies.
 *
 * WHY A SHARED HELPER RATHER THAN ANOTHER COPIED LINE. Geiger's Searchspring
 * feed stores HTML entities directly in its values, and exactly four fields
 * carry them (audited across all 9,602 records in products.json, deals.json,
 * new-products.json, rush-products.json and catalogs.json):
 *
 *   imageUrl     9,602 records   fixed by IMG-100
 *   description  9,538 records   fixed long ago
 *   name         1,119 records   fixed long ago
 *   brand           32 records   MISSED BY BOTH, fixed here
 *
 * `brand` was missed because every loader hand-wrote its own three-field decode
 * and nobody re-audited the field list when a loader was copied. That is the
 * same failure IMG-100 hit from the other direction: it fixed four loaders for
 * one field, and left one field unfixed in seven loaders. Enumerating the
 * fields ONCE removes the class of bug rather than its latest instance.
 *
 * WHAT WAS SHOWING. `brand` reaches the visitor twice on every product card:
 * as the badge over the image, and as `brand.name` in the ItemList JSON-LD. So
 * shoppers on /brands/cutter-buck read "Cutter &amp; Buck" on all 16 cards
 * while the page heading (which comes from the clean brands.json) read
 * "Cutter & Buck", and Google was told the wrong brand name. The other four
 * affected brands are Travis & Wells, W&P, M&M's and Port & Co.
 *
 * THE SOURCE FILES ARE NOT WRONG. Searchspring publishes these values with
 * entities in them and the scraper stores what it is given; decoding at the
 * boundary where the site reads them is the project's chosen layer. Nothing in
 * scripts/scrapers needs changing.
 *
 * IF A NEW ENTITY-BEARING FIELD EVER APPEARS, add it here and every surface
 * gets it at once. Do NOT patch it at a render site: a card-level patch is what
 * hid the IMG-100 gap for months, because it made every visible grid look right
 * while a non-card consumer of the same field stayed broken.
 */

import type { GeigerProduct } from '../product-types';
import { decodeHtmlEntities } from '../text-utils';

/**
 * The scraped product fields that carry HTML entities, for the guard test and
 * for anyone auditing this again. Keep in step with `decodeProductEntities`.
 */
export const ENTITY_BEARING_PRODUCT_FIELDS = ['name', 'description', 'imageUrl', 'brand'] as const;

/**
 * A copy of the product with every entity-bearing field decoded.
 *
 * Null and empty values are passed through UNCHANGED rather than becoming the
 * empty string `decodeHtmlEntities` returns for them: `brand`, `description`
 * and `imageUrl` are all nullable on `GeigerProduct`, and callers distinguish
 * "no brand" from "empty brand" (lib/brands.ts skips a product with no brand
 * rather than filing it under an empty slug). `name` is non-nullable, so it is
 * decoded unconditionally exactly as before.
 *
 * Decoding is idempotent, so calling this on an already-decoded product is
 * harmless.
 */
export function decodeProductEntities<T extends GeigerProduct>(product: T): T {
  return {
    ...product,
    name: decodeHtmlEntities(product.name),
    description: product.description
      ? decodeHtmlEntities(product.description)
      : product.description,
    imageUrl: product.imageUrl ? decodeHtmlEntities(product.imageUrl) : product.imageUrl,
    brand: product.brand ? decodeHtmlEntities(product.brand) : product.brand,
  };
}

/** `decodeProductEntities` over a list, for the loaders that map a whole file. */
export function decodeProductList<T extends GeigerProduct>(products: T[]): T[] {
  return products.map(decodeProductEntities);
}
