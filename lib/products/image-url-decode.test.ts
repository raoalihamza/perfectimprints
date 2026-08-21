import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { decodeHtmlEntities } from '../text-utils';

/**
 * IMG-100. Geiger's scraped product records carry a literal `&amp;` between the
 * query parameters of `imageUrl`. The image host does NOT tolerate that: it
 * returns HTTP 400 with `Additional properties not allowed: amp;thumbnail,
 * amp;w, amp;h`, so an undecoded URL is a broken image rather than a large one.
 *
 * Four loaders were missing the decode that lib/categories.ts and
 * lib/products/lookup.ts already had, and `ProductCard` masked all four with a
 * local render-time patch. IMG-100 fixed the loaders and deleted the patch.
 *
 * These tests are deliberately structural as well as behavioural. The realistic
 * regression is not "the helper stops working", it is "someone edits a loader's
 * map() and drops the line", which nothing else would catch now that the card no
 * longer covers for it. Reading the source is the only way to assert that
 * without importing these server-only modules into vitest.
 */

const ROOT = path.resolve(__dirname, '..', '..');

const RAW_URL =
  'https://imgsirv.geiger.com/master/102385/web/102385_1.jpg?format=webp&amp;thumbnail=275&amp;w=275&amp;h=275';
const WORKING_URL =
  'https://imgsirv.geiger.com/master/102385/web/102385_1.jpg?format=webp&thumbnail=275&w=275&h=275';

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

describe('Geiger image URL decoding', () => {
  it('turns the scraped URL into the one the image host accepts', () => {
    expect(decodeHtmlEntities(RAW_URL)).toBe(WORKING_URL);
  });

  it('leaves an already-decoded URL untouched, so decoding twice is harmless', () => {
    expect(decodeHtmlEntities(WORKING_URL)).toBe(WORKING_URL);
  });

  it('does not disturb a Sanity CDN URL, which never carries entities', () => {
    const sanity = 'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1501.jpg?w=400&fit=max';
    expect(decodeHtmlEntities(sanity)).toBe(sanity);
  });

  it.each(PRODUCT_LOADERS)('%s decodes imageUrl at the loader', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/decodeHtmlEntities\(\s*(?:p|product)\.imageUrl\s*\)/);
  });

  it('ProductCard does no entity decoding of its own', () => {
    // The card is shared by roughly ten surfaces. A local patch here hides a
    // loader bug from every one of them, which is exactly how this went
    // unnoticed until a non-card consumer read the same field.
    const src = read('components/category/ProductCard.tsx');
    expect(src).not.toContain('decodeImageUrl');
    expect(src).not.toMatch(/replace\(\s*\/&amp;\/g/);
  });
});
