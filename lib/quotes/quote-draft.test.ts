import { describe, expect, it } from 'vitest';

import {
  DRAFT_QUOTE_VALID_DAYS,
  buildDraftQuote,
  isoDayFrom,
  parseQuantity,
  stripDecorationAnnotation,
  type DraftQuoteProduct,
  type DraftQuoteSubmission,
} from './quote-draft';

const NOW = new Date('2026-08-01T12:00:00.000Z');

/**
 * A product with three tiers and two decoration methods, one of which carries
 * its own setup charge. Every expected number below is worked out by hand from
 * these values rather than from the pricing helpers.
 */
const PRODUCT: DraftQuoteProduct = {
  _id: 'product-abc',
  title: 'Custom Stainless Bottle',
  imageUrl: 'https://example.com/bottle.jpg',
  descriptionPlain: 'A 20 oz double-wall stainless steel bottle.',
  pricingTiers: [
    { minQty: 50, price: 8 },
    { minQty: 250, price: 6.5 },
    { minQty: 500, price: 5 },
  ],
  setupCharge: 60,
  decorationMethods: [
    { method: 'Pad Print', upcharge: 0.5 },
    { method: 'Laser Engraving', upcharge: 1, setupCharge: 0 },
  ],
};

const SUBMISSION: DraftQuoteSubmission = {
  firstName: 'Dana',
  lastName: 'Reed',
  email: 'dana@example.com',
  phone: '555-0100',
  company: 'Reed Events',
  quantityNeeded: '300',
  dateNeeded: '09/15/2026',
  selectedColor: 'Navy',
  selectedSize: 'One Size',
  selectedDecoration: 'Pad Print (+$0.50/unit)',
  comments: 'Logo in white please.',
  shippingZip: '32547',
};

function build(overrides: Partial<DraftQuoteSubmission> = {}) {
  return buildDraftQuote({
    submission: { ...SUBMISSION, ...overrides },
    product: PRODUCT,
    token: 'a'.repeat(32),
    repEmail: 'patrick@perfectimprints.com',
    now: NOW,
  });
}

describe('stripDecorationAnnotation', () => {
  it('removes the per-unit upcharge the quote form appends', () => {
    expect(stripDecorationAnnotation('Pad Print (+$0.50/unit)')).toBe('Pad Print');
    expect(stripDecorationAnnotation('Screen Print, 2 Colors (+$1.25/unit)')).toBe(
      'Screen Print, 2 Colors',
    );
  });

  it('leaves a plain method name alone', () => {
    expect(stripDecorationAnnotation('Embroidery')).toBe('Embroidery');
  });

  it('keeps parentheses that are part of the method name', () => {
    expect(stripDecorationAnnotation('Full Color (Digital)')).toBe('Full Color (Digital)');
  });

  it('returns null for nothing', () => {
    expect(stripDecorationAnnotation('')).toBeNull();
    expect(stripDecorationAnnotation(undefined)).toBeNull();
    expect(stripDecorationAnnotation(12)).toBeNull();
  });
});

describe('parseQuantity', () => {
  it('reads a plain number', () => {
    expect(parseQuantity('300')).toBe(300);
  });

  it('reads a number a human typed with separators or words', () => {
    expect(parseQuantity('1,500')).toBe(1500);
    expect(parseQuantity('250 units')).toBe(250);
  });

  it('returns null when there is no usable number', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('lots')).toBeNull();
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity(undefined)).toBeNull();
  });
});

describe('isoDayFrom', () => {
  it('returns the calendar day, and the offset day', () => {
    expect(isoDayFrom(NOW, 0)).toBe('2026-08-01');
    expect(isoDayFrom(NOW, 30)).toBe('2026-08-31');
  });
});

describe('buildDraftQuote', () => {
  it('never assigns a quote number', () => {
    const { doc } = build();
    expect(doc).not.toHaveProperty('quoteNumber');
  });

  it('stores the token as the slug so the link exists the moment it is published', () => {
    const { doc } = build();
    expect(doc.slug).toEqual({ _type: 'slug', current: 'a'.repeat(32) });
  });

  it('dates the quote today and expires it 30 days out', () => {
    const { doc } = build();
    expect(doc.quoteDate).toBe('2026-08-01');
    expect(doc.expiryDate).toBe(isoDayFrom(NOW, DRAFT_QUOTE_VALID_DAYS));
  });

  it('prices the line from the PRODUCT, at the tier the quantity earns', () => {
    // 300 units falls in the 250+ tier at $6.50, plus the Pad Print upcharge of
    // $0.50 per unit, so the stored unit cost is $7.00. Pad Print has no setup
    // charge of its own, so the product's flat $60 applies.
    const { doc } = build();
    const line = (doc.lineItems as Record<string, unknown>[])[0];
    expect(line.unitCost).toBe(7);
    expect(line.setupCharge).toBe(60);
    expect(line.quantity).toBe(300);
    expect(line.decorationMethod).toBe('Pad Print');
  });

  it('honours a decoration whose own setup charge is explicitly zero', () => {
    // Laser Engraving sets setupCharge 0, which means "no setup fee" and
    // cancels the flat $60. Unit cost is the $6.50 tier plus its $1 upcharge.
    const { doc } = build({ selectedDecoration: 'Laser Engraving (+$1.00/unit)' });
    const line = (doc.lineItems as Record<string, unknown>[])[0];
    expect(line.unitCost).toBe(7.5);
    expect(line.setupCharge).toBe(0);
  });

  it('IGNORES anything price-like the browser might have sent', () => {
    // The form posts a formatted display string; nothing numeric crosses the
    // wire. Even if a crafted request added one, the builder's only inputs are
    // the fields below, so there is nowhere for it to land.
    const { doc } = build();
    const serialized = JSON.stringify(doc);
    expect(serialized).not.toContain('estimatedTotal');
    expect(serialized).not.toContain('$');
  });

  it('references the product so Patrick can pull fresh details later', () => {
    const { doc } = build();
    const line = (doc.lineItems as Record<string, unknown>[])[0];
    expect(line.product).toEqual({ _type: 'reference', _ref: 'product-abc' });
    expect(line._type).toBe('quoteOwnProductLine');
  });

  it('carries the customer block across', () => {
    const { doc } = build();
    expect(doc.customerCompany).toBe('Reed Events');
    expect(doc.customerName).toBe('Dana Reed');
    expect(doc.customerEmail).toBe('dana@example.com');
    expect(doc.customerPhone).toBe('555-0100');
    expect(doc.repEmail).toBe('patrick@perfectimprints.com');
  });

  it('puts the selection and the customer note on the line, not into pricing', () => {
    const { doc } = build();
    const line = (doc.lineItems as Record<string, unknown>[])[0];
    expect(line.note).toContain('Color: Navy');
    expect(line.note).toContain('Size: One Size');
    expect(line.note).toContain('Needed by: 09/15/2026');
    expect(line.note).toContain('Ship to zip: 32547');
    expect(line.note).toContain('Logo in white please.');
  });

  it('still builds a usable draft when the quantity is unusable, and warns', () => {
    const { doc, warnings } = build({ quantityNeeded: 'a few hundred' });
    const line = (doc.lineItems as Record<string, unknown>[])[0];
    expect(line).not.toHaveProperty('quantity');
    expect(warnings.join(' ')).toMatch(/no usable quantity/i);
  });

  it('warns when the quantity is below the product minimum', () => {
    const { warnings } = build({ quantityNeeded: '10' });
    expect(warnings.join(' ')).toMatch(/below this product's minimum/i);
  });

  it('warns when the decoration is not one this product offers', () => {
    const { warnings } = build({ selectedDecoration: 'Sublimation' });
    expect(warnings.join(' ')).toMatch(/not one of this product's decoration methods/i);
  });

  it('survives a submission with almost nothing in it', () => {
    const { doc } = buildDraftQuote({
      submission: { email: 'someone@example.com' },
      product: PRODUCT,
      token: 'b'.repeat(32),
      now: NOW,
    });
    expect(doc.customerEmail).toBe('someone@example.com');
    expect(doc).not.toHaveProperty('customerCompany');
    expect(doc).not.toHaveProperty('repEmail');
    expect((doc.lineItems as unknown[]).length).toBe(1);
  });

  it('leaves the cost blank rather than inventing one when a product has no tiers', () => {
    const { doc, warnings } = buildDraftQuote({
      submission: SUBMISSION,
      product: { _id: 'no-price', title: 'Unpriced Thing' },
      token: 'c'.repeat(32),
      now: NOW,
    });
    const line = (doc.lineItems as Record<string, unknown>[])[0];
    expect(line).not.toHaveProperty('unitCost');
    expect(warnings.join(' ')).toMatch(/no pricing tiers/i);
  });
});
