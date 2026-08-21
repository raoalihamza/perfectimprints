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
 * What remains here is the BEHAVIOURAL record of that finding: the exact URL
 * shape the image host rejects and the exact one it accepts. The structural
 * guard that every loader still decodes moved to decode-product.test.ts when
 * SNIP-130 replaced the seven hand-written three-field decodes with one shared
 * helper covering all four entity-bearing fields; keeping a second copy here
 * would have left two lists of loaders to drift apart.
 */

const RAW_URL =
  'https://imgsirv.geiger.com/master/102385/web/102385_1.jpg?format=webp&amp;thumbnail=275&amp;w=275&amp;h=275';
const WORKING_URL =
  'https://imgsirv.geiger.com/master/102385/web/102385_1.jpg?format=webp&thumbnail=275&w=275&h=275';

describe('Geiger image URL decoding', () => {
  it('turns the scraped URL into the one the image host accepts', () => {
    expect(decodeHtmlEntities(RAW_URL)).toBe(WORKING_URL);
  });

  it('leaves an already-decoded URL untouched, so decoding twice is harmless', () => {
    expect(decodeHtmlEntities(WORKING_URL)).toBe(WORKING_URL);
  });

  it('does not disturb a Sanity CDN URL, which never carries entities', () => {
    const sanity =
      'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1501.jpg?w=400&fit=max';
    expect(decodeHtmlEntities(sanity)).toBe(sanity);
  });
});
