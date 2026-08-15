import { describe, expect, it } from 'vitest';

import {
  availabilityLabel,
  availabilitySchemaUrl,
  buildMinimumOrderOffer,
  decoratedGoodsReturnPolicy,
} from './product-schema';
import type { DecorationOption } from './quote-estimate';

const SITE = 'https://www.perfectimprints.com';

const base = {
  minOrderQty: 100,
  decorations: [] as DecorationOption[],
  url: `${SITE}/products/x`,
  siteUrl: SITE,
};

describe('buildMinimumOrderOffer', () => {
  it("matches Patrick's worked example: 100 minimum at $2.00 plus $50 setup is $250", () => {
    const built = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 100, price: 2 }],
      flatSetupCharge: 50,
    });
    expect(built?.total).toBe(250);
    expect(built?.quantity).toBe(100);
    expect(built?.offer.price).toBe(250);
  });

  it('always states the quantity the price buys, in both places', () => {
    const offer = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 100, price: 2 }],
      flatSetupCharge: 50,
    })!.offer as Record<string, any>;
    expect(offer.eligibleQuantity).toEqual({
      '@type': 'QuantitativeValue',
      value: 100,
      unitCode: 'C62',
    });
    expect(offer.priceSpecification.referenceQuantity.value).toBe(100);
    expect(offer.priceSpecification.price).toBe(250);
  });

  it('is quantity times unit price when there is no setup charge', () => {
    const built = buildMinimumOrderOffer({
      ...base,
      minOrderQty: 288,
      tiers: [
        { minQty: 72, price: 5.75 },
        { minQty: 288, price: 4.99 },
      ],
    });
    // 288 falls in the second tier, so the price is that tier's, not the first.
    expect(built?.total).toBe(1437.12);
    expect(built?.quantity).toBe(288);
  });

  it("uses the default decoration's per-unit upcharge and its own setup charge", () => {
    const built = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 100, price: 2 }],
      flatSetupCharge: 50,
      decorations: [
        { method: 'Embroidery', upcharge: 0.5, setupCharge: 80 },
        { method: 'Pad Print', upcharge: 0, setupCharge: 0 },
      ],
    });
    // First method is the page default: 100 x (2 + 0.50) + 80.
    expect(built?.total).toBe(330);
  });

  it('honours an explicit zero setup charge on the default decoration', () => {
    const built = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 100, price: 2 }],
      flatSetupCharge: 50,
      decorations: [{ method: 'Blank', upcharge: 0, setupCharge: 0 }],
    });
    expect(built?.total).toBe(200);
  });

  it('rounds to cents rather than emitting a floating-point tail', () => {
    const built = buildMinimumOrderOffer({
      ...base,
      minOrderQty: 3,
      tiers: [{ minQty: 3, price: 0.1 }],
    });
    expect(built?.total).toBe(0.3);
  });

  it('returns null when there is no usable tier, so no price is invented', () => {
    expect(buildMinimumOrderOffer({ ...base, tiers: [] })).toBeNull();
  });

  it('clamps a minimum below the first tier up to that tier', () => {
    const built = buildMinimumOrderOffer({
      ...base,
      minOrderQty: 1,
      tiers: [{ minQty: 50, price: 3 }],
    });
    expect(built?.quantity).toBe(50);
    expect(built?.total).toBe(150);
  });

  it('carries condition, availability and the return policy on the offer', () => {
    const offer = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 100, price: 2 }],
      availability: 'OutOfStock',
    })!.offer as Record<string, any>;
    expect(offer.itemCondition).toBe('https://schema.org/NewCondition');
    expect(offer.availability).toBe('https://schema.org/OutOfStock');
    expect(offer.hasMerchantReturnPolicy.returnPolicyCategory).toBe(
      'https://schema.org/MerchantReturnNotPermitted',
    );
  });

  it('includes shipping details only when they were supplied', () => {
    const withOut = buildMinimumOrderOffer({ ...base, tiers: [{ minQty: 1, price: 1 }] })!.offer;
    expect(withOut).not.toHaveProperty('shippingDetails');
    const withIn = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 1, price: 1 }],
      shippingDetails: { '@type': 'OfferShippingDetails' },
    })!.offer;
    expect(withIn).toHaveProperty('shippingDetails');
  });
});

describe('availability', () => {
  it('falls back to in stock for blank or unrecognised values', () => {
    expect(availabilitySchemaUrl(undefined)).toBe('https://schema.org/InStock');
    expect(availabilitySchemaUrl('')).toBe('https://schema.org/InStock');
    expect(availabilitySchemaUrl('nonsense')).toBe('https://schema.org/InStock');
  });

  it('maps each stored value to its schema.org enum', () => {
    expect(availabilitySchemaUrl('Discontinued')).toBe('https://schema.org/Discontinued');
    expect(availabilitySchemaUrl('LimitedAvailability')).toBe(
      'https://schema.org/LimitedAvailability',
    );
  });

  it('shows a page note only for a non-default availability', () => {
    expect(availabilityLabel('InStock')).toBeNull();
    expect(availabilityLabel(undefined)).toBeNull();
    expect(availabilityLabel('OutOfStock')).toBe('Currently out of stock');
  });
});

describe('decoratedGoodsReturnPolicy', () => {
  it('says returns are not permitted and links to the full policy', () => {
    const p = decoratedGoodsReturnPolicy(SITE) as Record<string, any>;
    expect(p.returnPolicyCategory).toBe('https://schema.org/MerchantReturnNotPermitted');
    expect(p.merchantReturnLink).toBe(`${SITE}/returns`);
    expect(p.applicableCountry).toBe('US');
  });

  it('never states a returns window or a restocking fee (blank-goods terms)', () => {
    const p = decoratedGoodsReturnPolicy(SITE);
    expect(p).not.toHaveProperty('merchantReturnDays');
    expect(p).not.toHaveProperty('restockingFee');
  });

  it('tolerates a trailing slash on the site URL', () => {
    const p = decoratedGoodsReturnPolicy(`${SITE}/`) as Record<string, any>;
    expect(p.merchantReturnLink).toBe(`${SITE}/returns`);
  });
});
