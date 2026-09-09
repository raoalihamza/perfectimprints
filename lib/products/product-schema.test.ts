import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  availabilityLabel,
  availabilitySchemaUrl,
  buildMinimumOrderOffer,
  buildProductAudience,
  decoratedGoodsReturnPolicy,
  mergeShippingDetails,
  PRODUCT_AGE_GROUP_VALUES,
  PRODUCT_GENDER_VALUES,
  shippingPolicyDetails,
  type ShippingPolicy,
} from './product-schema';
import type { DecorationOption } from './quote-estimate';

const SITE = 'https://www.perfectimprints.com';

const base = {
  minOrderQty: 100,
  decorations: [] as DecorationOption[],
  url: `${SITE}/products/x`,
  siteUrl: SITE,
};

const emptyPolicy: ShippingPolicy = {
  rate: null,
  destinationCountry: null,
  handlingDaysMin: null,
  handlingDaysMax: null,
  transitDaysMin: null,
  transitDaysMax: null,
};

/** Every key at any depth of a JSON-shaped value. */
function deepKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}

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
    expect(built?.offer.priceCurrency).toBe('USD');
  });

  /**
   * MERCH-100. FIX-830 stated the quantity twice on the offer, as
   * `eligibleQuantity` and as `priceSpecification.referenceQuantity`, so that
   * the minimum-order total could not be read as a unit price. Google read
   * `referenceQuantity` as the measure the product is sold in and MULTIPLIED:
   * $432.50 for 50 pens became $21,625, and 145 of 154 live products were
   * shown at 12 to 500 times their real figure. The price is right and stays;
   * the annotation is what was wrong. This test fails the moment either field,
   * or any quantity-shaped key, returns anywhere inside the offer.
   */
  it('states the minimum-order total with NO quantity annotation Google could multiply by', () => {
    // The pen page Patrick reported: 50 pens at $8.65, no setup, $432.50.
    const offer = buildMinimumOrderOffer({
      ...base,
      minOrderQty: 50,
      tiers: [{ minQty: 50, price: 8.65 }],
    })!.offer;
    expect(offer.price).toBe(432.5);
    expect(offer).not.toHaveProperty('eligibleQuantity');
    expect(offer).not.toHaveProperty('priceSpecification');
    const keys = deepKeys(offer);
    for (const forbidden of [
      'eligibleQuantity',
      'referenceQuantity',
      'priceSpecification',
      'UnitPriceSpecification',
      'unitCode',
      'valueReference',
    ]) {
      expect(keys.has(forbidden), `offer must not carry "${forbidden}"`).toBe(false);
    }
    // The pen page's carton block carries unitCode (LBR / INH), so the check
    // above is on an offer WITHOUT shipping; here the same rule on the money
    // part alone, with shipping present.
    const withShipping = buildMinimumOrderOffer({
      ...base,
      minOrderQty: 50,
      tiers: [{ minQty: 50, price: 8.65 }],
      shippingDetails: { weight: { '@type': 'QuantitativeValue', value: 30, unitCode: 'LBR' } },
    })!.offer;
    const { shippingDetails: _shipping, ...money } = withShipping;
    const moneyKeys = deepKeys(money);
    expect(moneyKeys.has('eligibleQuantity')).toBe(false);
    expect(moneyKeys.has('referenceQuantity')).toBe(false);
    expect(moneyKeys.has('priceSpecification')).toBe(false);
    expect(moneyKeys.has('QuantitativeValue')).toBe(false);
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

  it('includes shipping details only when a carton block or a real policy value was supplied', () => {
    const withOut = buildMinimumOrderOffer({ ...base, tiers: [{ minQty: 1, price: 1 }] })!.offer;
    expect(withOut).not.toHaveProperty('shippingDetails');
    const blankPolicy = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 1, price: 1 }],
      shippingPolicy: emptyPolicy,
    })!.offer;
    expect(blankPolicy).not.toHaveProperty('shippingDetails');
    const withIn = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 1, price: 1 }],
      shippingDetails: { weight: { '@type': 'QuantitativeValue', value: 30, unitCode: 'LBR' } },
    })!.offer as Record<string, any>;
    expect(withIn.shippingDetails['@type']).toBe('OfferShippingDetails');
    expect(withIn.shippingDetails.weight.value).toBe(30);
  });
});

describe('shipping policy (MERCH-100 part 2)', () => {
  it('emits nothing for a null or entirely blank policy', () => {
    expect(shippingPolicyDetails(null)).toBeNull();
    expect(shippingPolicyDetails(undefined)).toBeNull();
    expect(shippingPolicyDetails(emptyPolicy)).toBeNull();
    expect(mergeShippingDetails(null, emptyPolicy)).toBeNull();
  });

  it('emits the rate, destination and delivery time when all are filled', () => {
    const d = shippingPolicyDetails({
      rate: 12.5,
      destinationCountry: 'us',
      handlingDaysMin: 1,
      handlingDaysMax: 2,
      transitDaysMin: 3,
      transitDaysMax: 7,
    }) as Record<string, any>;
    expect(d.shippingRate).toEqual({ '@type': 'MonetaryAmount', value: 12.5, currency: 'USD' });
    expect(d.shippingDestination).toEqual({ '@type': 'DefinedRegion', addressCountry: 'US' });
    expect(d.deliveryTime).toEqual({
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 7, unitCode: 'DAY' },
    });
  });

  it('treats a zero rate as free shipping, a real value, and blank as nothing', () => {
    expect((shippingPolicyDetails({ ...emptyPolicy, rate: 0 }) as any).shippingRate.value).toBe(0);
    expect(shippingPolicyDetails({ ...emptyPolicy, rate: null })).toBeNull();
    expect(shippingPolicyDetails({ ...emptyPolicy, rate: -1 })).toBeNull();
    expect(shippingPolicyDetails({ ...emptyPolicy, rate: Number.NaN })).toBeNull();
  });

  it('emits each part independently and drops a half-filled day range', () => {
    const rateOnly = shippingPolicyDetails({ ...emptyPolicy, rate: 9 }) as Record<string, any>;
    expect(Object.keys(rateOnly)).toEqual(['shippingRate']);
    const halfRange = shippingPolicyDetails({ ...emptyPolicy, transitDaysMin: 2 });
    expect(halfRange).toBeNull();
    const reversed = shippingPolicyDetails({ ...emptyPolicy, transitDaysMin: 5, transitDaysMax: 2 });
    expect(reversed).toBeNull();
    const transitOnly = shippingPolicyDetails({ ...emptyPolicy, transitDaysMin: 2, transitDaysMax: 5 }) as Record<
      string,
      any
    >;
    expect(transitOnly.deliveryTime).not.toHaveProperty('handlingTime');
    expect(transitOnly.deliveryTime.transitTime.maxValue).toBe(5);
  });

  it('rejects a destination that is not a two-letter country code', () => {
    expect(shippingPolicyDetails({ ...emptyPolicy, destinationCountry: 'United States' })).toBeNull();
    expect(shippingPolicyDetails({ ...emptyPolicy, destinationCountry: 'U' })).toBeNull();
    expect((shippingPolicyDetails({ ...emptyPolicy, destinationCountry: ' ca ' }) as any).shippingDestination.addressCountry).toBe('CA');
  });

  it('keeps the carton facts and adds the policy beside them in one block', () => {
    const carton = {
      weight: { '@type': 'QuantitativeValue', value: 30, unitCode: 'LBR' },
      shippingOrigin: { '@type': 'DefinedRegion', addressCountry: 'US', postalCode: '33760' },
    };
    const merged = mergeShippingDetails(carton, { ...emptyPolicy, rate: 15, destinationCountry: 'US' }) as Record<
      string,
      any
    >;
    expect(merged['@type']).toBe('OfferShippingDetails');
    expect(merged.weight.value).toBe(30);
    expect(merged.shippingOrigin.postalCode).toBe('33760');
    expect(merged.shippingRate.value).toBe(15);
    expect(merged.shippingDestination.addressCountry).toBe('US');
    // Carton alone is byte-identical to what FIX-830 emitted.
    expect(mergeShippingDetails(carton, null)).toEqual({ '@type': 'OfferShippingDetails', ...carton });
  });
});

describe('audience (MERCH-100 part 3)', () => {
  it("uses Google's value lists exactly", () => {
    expect([...PRODUCT_AGE_GROUP_VALUES]).toEqual(['newborn', 'infant', 'toddler', 'kids', 'adult']);
    expect([...PRODUCT_GENDER_VALUES]).toEqual(['male', 'female', 'unisex']);
  });

  it('emits nothing when neither field is set', () => {
    expect(buildProductAudience({})).toBeNull();
    expect(buildProductAudience({ ageGroup: '', gender: null })).toBeNull();
  });

  it('emits nothing for a value outside the lists, never a guess', () => {
    expect(buildProductAudience({ ageGroup: 'youth' })).toBeNull();
    expect(buildProductAudience({ gender: 'mens' })).toBeNull();
    expect(buildProductAudience({ ageGroup: 'Adult' })).toBeNull();
  });

  it("maps each age group to Google's numeric years, adults with no upper bound", () => {
    expect(buildProductAudience({ ageGroup: 'newborn' })).toEqual({
      '@type': 'PeopleAudience',
      suggestedMinAge: 0,
      suggestedMaxAge: 0.25,
    });
    expect(buildProductAudience({ ageGroup: 'infant' })).toMatchObject({ suggestedMinAge: 0.25, suggestedMaxAge: 1 });
    expect(buildProductAudience({ ageGroup: 'toddler' })).toMatchObject({ suggestedMinAge: 1, suggestedMaxAge: 5 });
    expect(buildProductAudience({ ageGroup: 'kids' })).toMatchObject({ suggestedMinAge: 5, suggestedMaxAge: 13 });
    const adult = buildProductAudience({ ageGroup: 'adult' })!;
    expect(adult.suggestedMinAge).toBe(13);
    expect(adult).not.toHaveProperty('suggestedMaxAge');
  });

  it('emits gender alone, age alone, or both', () => {
    expect(buildProductAudience({ gender: 'female' })).toEqual({
      '@type': 'PeopleAudience',
      suggestedGender: 'female',
    });
    expect(buildProductAudience({ ageGroup: 'kids', gender: 'unisex' })).toEqual({
      '@type': 'PeopleAudience',
      suggestedGender: 'unisex',
      suggestedMinAge: 5,
      suggestedMaxAge: 13,
    });
    // A bad gender beside a good age group drops only the bad one.
    expect(buildProductAudience({ ageGroup: 'adult', gender: 'boys' })).toEqual({
      '@type': 'PeopleAudience',
      suggestedMinAge: 13,
    });
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

/**
 * Structural guard (MERCH-100). The quantity annotation was added once by
 * someone trying to be helpful, and it will be tempting to add again for the
 * same reason. No rendered source may emit a `referenceQuantity` or a
 * `UnitPriceSpecification` anywhere, and `eligibleQuantity` may appear only in
 * the AggregateOffer serializer for the listing surfaces (lib/seo/
 * product-list-schema.ts), which MERCH-100 reported and deliberately left for
 * its own decision because it feeds /cat.
 */
describe('no rendered source re-adds a quantity annotation to a product offer', () => {
  const root = resolve(__dirname, '../..');
  // Comments are stripped first: this module's own header names the forbidden
  // fields in order to forbid them, and prose is not an emission.
  const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const files = new Map<string, string>();
  for (const dir of ['app', 'components', 'lib']) {
    const dirBase = resolve(root, dir);
    for (const name of readdirSync(dirBase, { recursive: true }) as string[]) {
      const rel = join(dir, name);
      if (!['.ts', '.tsx'].includes(extname(rel))) continue;
      if (rel.includes('.test.')) continue;
      files.set(rel.split(sep).join('/'), stripComments(readFileSync(resolve(root, rel), 'utf8')));
    }
  }
  const offenders = (needle: string) => [...files].filter(([, src]) => src.includes(needle)).map(([p]) => p).sort();

  it('emits referenceQuantity nowhere', () => {
    expect(offenders('referenceQuantity')).toEqual([]);
  });

  it('emits UnitPriceSpecification nowhere', () => {
    expect(offenders('UnitPriceSpecification')).toEqual([]);
  });

  it('confines eligibleQuantity to the listing serializer', () => {
    expect(offenders('eligibleQuantity')).toEqual(['lib/seo/product-list-schema.ts']);
  });
});
