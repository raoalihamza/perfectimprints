/**
 * Quote line pre-fill tests (Q-130). These rules decide what auto-fill writes
 * onto a customer quote, so the two things that must never regress are pinned
 * here: prices are computed through the shared configurator modules (never a
 * second formula), and nothing is invented when the data is missing.
 */

import { describe, expect, it } from 'vitest';
import {
  QUOTE_DESCRIPTION_MAX_CHARS,
  buildGeigerLineGuidance,
  buildGeigerLinePrefill,
  buildOwnProductPrefill,
  isBlank,
  truncateQuoteDescription,
  type OwnProductSource,
} from './quote-prefill';
import { estimateForQuantity } from '../products/quote-estimate';
import { productPageValidTiers } from '../products/product-page-pricing';
import { quoteCustomerUrl, httpsSiteOrigin } from './quote-link';

const product: OwnProductSource = {
  title: 'ZZ Test Tumbler',
  imageUrl: 'https://cdn.sanity.io/images/x/y/abc-800x800.jpg',
  descriptionPlain: 'A 20 oz double-wall stainless steel tumbler.',
  pricingTiers: [
    { minQty: 50, price: 12 },
    { minQty: 100, price: 10 },
    { minQty: 250, price: 8.5 },
  ],
  setupCharge: 60,
  decorationMethods: [
    { method: 'Laser Engrave', upcharge: 0.5, setupCharge: 45 },
    { method: 'Screen Print', upcharge: 0.25 },
    { method: 'Blank', upcharge: 0, setupCharge: 0 },
  ],
};

describe('truncateQuoteDescription', () => {
  it('returns null for empty or non-string input', () => {
    expect(truncateQuoteDescription(undefined)).toBeNull();
    expect(truncateQuoteDescription('')).toBeNull();
    expect(truncateQuoteDescription('   ')).toBeNull();
    expect(truncateQuoteDescription(42)).toBeNull();
  });

  it('keeps a short description untouched', () => {
    expect(truncateQuoteDescription('Short and sweet.')).toBe('Short and sweet.');
  });

  it('strips markup and collapses whitespace', () => {
    expect(truncateQuoteDescription('<p>Hello   <b>there</b></p>\n\nfriend')).toBe(
      'Hello there friend',
    );
  });

  it('cuts at a word boundary within the limit and marks the cut', () => {
    const long = `${'word '.repeat(200)}`;
    const out = truncateQuoteDescription(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(QUOTE_DESCRIPTION_MAX_CHARS + 3);
    expect(out!.endsWith('...')).toBe(true);
    // No dangling partial word before the marker.
    expect(out!.slice(0, -3).endsWith('word')).toBe(true);
  });

  it('honours a custom limit', () => {
    expect(truncateQuoteDescription('one two three four five', 9)).toBe('one two...');
  });
});

describe('isBlank', () => {
  it('treats null, undefined and whitespace as empty', () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank('  ')).toBe(true);
  });

  it('treats real values, including 0, as filled', () => {
    expect(isBlank('x')).toBe(false);
    expect(isBlank(0)).toBe(false);
  });
});

describe('buildGeigerLinePrefill', () => {
  it('fills only the display fields, never a price', () => {
    const out = buildGeigerLinePrefill({
      found: true,
      sku: '501003',
      name: 'Vinyl Football',
      brand: 'Geiger',
      imageUrl: 'https://imgsirv.geiger.com/a.jpg?w=275',
      description: 'A vinyl football.',
      lowPrice: 2.1,
      highPrice: 3.4,
      minQty: 250,
    });
    expect(out).toEqual({
      displayName: 'Vinyl Football',
      imageUrl: 'https://imgsirv.geiger.com/a.jpg?w=275',
      description: 'A vinyl football.',
    });
    expect(Object.keys(out)).not.toContain('unitCost');
  });

  it('degrades to nulls when the catalog has nothing', () => {
    expect(buildGeigerLinePrefill({ found: false })).toEqual({
      displayName: null,
      imageUrl: null,
      description: null,
    });
  });
});

describe('buildGeigerLineGuidance', () => {
  it('carries the reference figures through', () => {
    expect(
      buildGeigerLineGuidance({ brand: 'Geiger', lowPrice: 2.1, highPrice: 3.4, minQty: 250 }),
    ).toEqual({ brand: 'Geiger', lowPrice: 2.1, highPrice: 3.4, minQty: 250 });
  });

  it('drops unusable numbers rather than showing zeros', () => {
    expect(buildGeigerLineGuidance({ lowPrice: 0, highPrice: null, minQty: -5 })).toEqual({
      brand: null,
      lowPrice: null,
      highPrice: null,
      minQty: null,
    });
  });
});

describe('buildOwnProductPrefill', () => {
  it('prices the quantity through the shared tier maths', () => {
    const out = buildOwnProductPrefill(product, { quantity: 120 });
    // 120 falls in the 100+ tier at $10.00.
    expect(out.tierMinQty).toBe(100);
    expect(out.tierPrice).toBe(10);
    expect(out.unitCost).toBe(10);
    expect(out.quantityUsed).toBe(120);
    expect(out.warnings).toEqual([]);
  });

  it('agrees exactly with estimateForQuantity (no second formula)', () => {
    const out = buildOwnProductPrefill(product, {
      quantity: 300,
      decorationMethod: 'Laser Engrave',
    });
    const shared = estimateForQuantity(productPageValidTiers(product), 300, 45, 0.5);
    expect(shared).not.toBeNull();
    expect(out.unitCost).toBe(shared!.unitPrice + shared!.decorationUpcharge);
    expect(out.setupCharge).toBe(shared!.setupCharge);
  });

  it('folds the decoration upcharge into the unit cost and reports both parts', () => {
    const out = buildOwnProductPrefill(product, {
      quantity: 100,
      decorationMethod: 'Screen Print',
    });
    expect(out.tierPrice).toBe(10);
    expect(out.decorationUpcharge).toBe(0.25);
    expect(out.unitCost).toBe(10.25);
    // Screen Print has no setup of its own, so the product default applies.
    expect(out.setupCharge).toBe(60);
  });

  it('lets a decoration method with an explicit 0 cancel the product setup fee', () => {
    const out = buildOwnProductPrefill(product, { quantity: 100, decorationMethod: 'Blank' });
    expect(out.setupCharge).toBe(0);
  });

  it('uses the method own setup charge over the product default', () => {
    const out = buildOwnProductPrefill(product, {
      quantity: 100,
      decorationMethod: 'Laser Engrave',
    });
    expect(out.setupCharge).toBe(45);
  });

  it('warns and clamps up when the quantity is under the minimum', () => {
    const out = buildOwnProductPrefill(product, { quantity: 10 });
    expect(out.quantityUsed).toBe(50);
    expect(out.unitCost).toBe(12);
    expect(out.warnings.join(' ')).toContain('below this product');
  });

  it('warns when there is no quantity yet', () => {
    const out = buildOwnProductPrefill(product, {});
    expect(out.quantityUsed).toBe(50);
    expect(out.warnings.join(' ')).toContain('no quantity yet');
  });

  it('warns when the typed decoration is not one of the product methods', () => {
    const out = buildOwnProductPrefill(product, {
      quantity: 100,
      decorationMethod: 'Hot Foil',
    });
    expect(out.warnings.join(' ')).toContain('not one of this product');
    expect(out.setupCharge).toBe(60);
  });

  it('returns no price and a warning when the product has no tiers', () => {
    const out = buildOwnProductPrefill({ title: 'No Prices', pricingTiers: [] }, { quantity: 100 });
    expect(out.unitCost).toBeNull();
    expect(out.setupCharge).toBeNull();
    expect(out.displayName).toBe('No Prices');
    expect(out.warnings.join(' ')).toContain('no pricing tiers');
  });

  it('ignores invalid tiers exactly as the product page does', () => {
    const out = buildOwnProductPrefill(
      { pricingTiers: [{ minQty: 0, price: 5 }, { minQty: 50, price: 0 }, { minQty: 100, price: 7 }] },
      { quantity: 100 },
    );
    expect(out.tierMinQty).toBe(100);
    expect(out.unitCost).toBe(7);
  });

  it('never throws on a half-filled draft', () => {
    expect(() => buildOwnProductPrefill(null, {})).not.toThrow();
    expect(() => buildOwnProductPrefill({}, { quantity: 'x' })).not.toThrow();
    expect(buildOwnProductPrefill(undefined, {}).warnings.length).toBe(1);
    expect(buildOwnProductPrefill({}, {}).unitCost).toBeNull();
  });

  it('reports the product minimum as reference, not as a price', () => {
    expect(buildOwnProductPrefill(product, { quantity: 100 }).minQty).toBe(50);
    expect(buildOwnProductPrefill({ ...product, minQty: 75 }, { quantity: 100 }).minQty).toBe(75);
  });

  it('offers the product decoration methods for the chooser', () => {
    const out = buildOwnProductPrefill(product, { quantity: 100 });
    expect(out.decorations.map((d) => d.method)).toEqual([
      'Laser Engrave',
      'Screen Print',
      'Blank',
    ]);
  });
});

describe('quoteCustomerUrl', () => {
  const token = 'a'.repeat(32);

  it('builds an https link containing the token', () => {
    expect(quoteCustomerUrl('https://www.perfectimprints.com', token)).toBe(
      `https://www.perfectimprints.com/quote/${token}`,
    );
  });

  it('forces https on a mis-set origin rather than trusting it', () => {
    expect(quoteCustomerUrl('http://dev.perfectimprints.com', token)).toBe(
      `https://dev.perfectimprints.com/quote/${token}`,
    );
    expect(quoteCustomerUrl('dev.perfectimprints.com', token)).toBe(
      `https://dev.perfectimprints.com/quote/${token}`,
    );
  });

  it('trims a trailing slash and falls back when the origin is missing', () => {
    expect(quoteCustomerUrl('https://x.com/', token)).toBe(`https://x.com/quote/${token}`);
    expect(httpsSiteOrigin('')).toBe('https://www.perfectimprints.com');
    expect(httpsSiteOrigin(undefined)).toBe('https://www.perfectimprints.com');
  });

  it('returns null with no token instead of a broken link', () => {
    expect(quoteCustomerUrl('https://x.com', '')).toBeNull();
    expect(quoteCustomerUrl('https://x.com', null)).toBeNull();
  });
});
