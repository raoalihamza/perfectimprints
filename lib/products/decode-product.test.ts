import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GeigerProduct } from '../product-types';
import {
  ENTITY_BEARING_PRODUCT_FIELDS,
  decodeProductEntities,
  decodeProductList,
} from './decode-product';

/**
 * SNIP-130. Geiger stores HTML entities directly in its Searchspring values.
 * Four fields carry them, and `brand` was the one nobody decoded: 30 of the
 * 8,185 records in products.json and 2 of the 1,043 in catalogs.json spell
 * their brand `Cutter &amp; Buck`, `Travis &amp; Wells`, `W&amp;P`,
 * `M&amp;M's` or `Port &amp; Co`.
 *
 * Unlike the image URLs IMG-100 fixed, this one is visible to shoppers: the
 * brand badge on the product card prints the raw value, so all 16 cards on
 * /brands/cutter-buck read "Cutter &amp; Buck" underneath a heading that read
 * "Cutter & Buck" (the heading comes from brands.json, which has no entities).
 * The same value went into the ItemList JSON-LD as `brand.name`, so Google was
 * told the wrong brand name too.
 *
 * These tests are behavioural AND structural on purpose. The realistic
 * regression is not "the helper stops working", it is "a loader is copied and
 * quietly stops calling it", which is precisely how both this bug and IMG-100
 * happened. Reading the source is the only way to assert that without importing
 * these server-only, fs-reading modules into vitest.
 */

const ROOT = path.resolve(__dirname, '..', '..');

/** Every loader that reads a scraped Geiger product file from disk. */
const PRODUCT_LOADERS = [
  'lib/categories.ts',
  'lib/products/lookup.ts',
  'lib/brands.ts',
  'lib/deals.ts',
  'lib/new-products.ts',
  'lib/rush-products.ts',
  'lib/catalogs.ts',
];

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function product(overrides: Partial<GeigerProduct> = {}): GeigerProduct {
  return {
    sku: '501014 90A',
    name: 'Vinyl Football',
    brand: 'BIC Graphic',
    low_price: 1.52,
    high_price: 2.84,
    msrp: 2.84,
    min_qty: 100,
    imageUrl: 'https://imgsirv.geiger.com/i.jpg?format=webp&thumbnail=275',
    description: 'A description.',
    category_paths: ['Home > Outdoor'],
    badges: [],
    is_new_item: false,
    is_on_sale: false,
    product_type_unigram: 'football',
    geiger_url: '/p/vinyl-football-510336?pid=208667',
    ...overrides,
  };
}

describe('decodeProductEntities', () => {
  it('decodes the brand name a shopper reads on the card', () => {
    expect(decodeProductEntities(product({ brand: 'Cutter &amp; Buck' })).brand).toBe(
      'Cutter & Buck',
    );
  });

  it.each([
    ['Cutter &amp; Buck', 'Cutter & Buck'],
    ['Travis &amp; Wells', 'Travis & Wells'],
    ['W&amp;P', 'W&P'],
    ["M&amp;M's", "M&M's"],
    ['Port &amp; Co', 'Port & Co'],
  ])('decodes the real catalog brand %s', (raw, expected) => {
    expect(decodeProductEntities(product({ brand: raw })).brand).toBe(expected);
  });

  it('decodes all four entity-bearing fields in one pass', () => {
    const decoded = decodeProductEntities(
      product({
        name: '6&quot; Key Card Holder',
        brand: 'W&amp;P',
        description: 'Two 1&quot; stripes &amp; a handle.',
        imageUrl: 'https://imgsirv.geiger.com/i.jpg?format=webp&amp;w=275',
      }),
    );
    expect(decoded.name).toBe('6" Key Card Holder');
    expect(decoded.brand).toBe('W&P');
    expect(decoded.description).toBe('Two 1" stripes & a handle.');
    expect(decoded.imageUrl).toBe('https://imgsirv.geiger.com/i.jpg?format=webp&w=275');
  });

  it('preserves null rather than turning it into an empty string', () => {
    // `decodeHtmlEntities` returns '' for null, and callers distinguish the two:
    // lib/brands.ts skips a product with no brand rather than filing it under an
    // empty slug, and the ItemList serializer omits the key entirely.
    const decoded = decodeProductEntities(
      product({ brand: null, description: null, imageUrl: null }),
    );
    expect(decoded.brand).toBeNull();
    expect(decoded.description).toBeNull();
    expect(decoded.imageUrl).toBeNull();
  });

  it('is idempotent, so decoding an already-decoded product is harmless', () => {
    const once = decodeProductEntities(product({ brand: 'Cutter &amp; Buck' }));
    expect(decodeProductEntities(once)).toEqual(once);
  });

  it('leaves an ampersand that was never encoded alone', () => {
    expect(decodeProductEntities(product({ brand: 'Cutter & Buck' })).brand).toBe('Cutter & Buck');
  });

  it('returns a copy, never the input object', () => {
    const input = product();
    expect(decodeProductEntities(input)).not.toBe(input);
  });

  it('carries every other field through untouched', () => {
    const input = product({ brand: 'W&amp;P' });
    const decoded = decodeProductEntities(input);
    expect(decoded.sku).toBe(input.sku);
    expect(decoded.low_price).toBe(input.low_price);
    expect(decoded.min_qty).toBe(input.min_qty);
    expect(decoded.geiger_url).toBe(input.geiger_url);
    expect(decoded.category_paths).toEqual(input.category_paths);
  });

  it('decodes a whole list', () => {
    const out = decodeProductList([product({ brand: 'W&amp;P' }), product({ brand: null })]);
    expect(out.map((p) => p.brand)).toEqual(['W&P', null]);
  });

  it('names exactly the fields the helper decodes', () => {
    expect([...ENTITY_BEARING_PRODUCT_FIELDS]).toEqual([
      'name',
      'description',
      'imageUrl',
      'brand',
    ]);
  });
});

describe('every product loader decodes at the loader', () => {
  it.each(PRODUCT_LOADERS)('%s routes its products through the shared helper', (rel) => {
    expect(read(rel)).toMatch(/decodeProduct(Entities|List)\(/);
  });

  it.each(PRODUCT_LOADERS)('%s no longer hand-rolls a partial field list', (rel) => {
    // The whole point of the shared helper is that no loader keeps its own
    // enumeration of which fields to decode. A hand-written `name:
    // decodeHtmlEntities(...)` inside a loader is how `brand` was missed seven
    // times over. `lib/brands.ts` still imports the primitive for
    // `slugifyBrandName`, which is a different job, so this checks the product
    // field assignments rather than the import.
    const src = read(rel);
    expect(src).not.toMatch(/\bname:\s*decodeHtmlEntities\(/);
    expect(src).not.toMatch(/\bimageUrl:\s*[a-zA-Z.]*\s*\?\s*decodeHtmlEntities\(/);
  });

  it('ProductCard still does no entity decoding of its own', () => {
    // The card is shared by roughly ten surfaces. A local patch here hides a
    // loader bug from every one of them, which is exactly how the image-URL gap
    // went unnoticed until a non-card consumer read the same field. The brand
    // badge is rendered from `product.brand` verbatim, and must stay that way.
    const src = read('components/category/ProductCard.tsx');
    expect(src).not.toContain('decodeHtmlEntities');
    expect(src).not.toMatch(/replace\(\s*\/&amp;\/g/);
  });
});
