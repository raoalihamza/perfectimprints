import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  availabilityLabel,
  availabilitySchemaUrl,
  buildMinimumOrderOffer,
  buildProductAudience,
  decoratedGoodsReturnPolicy,
  handlingTimeFor,
  isOrderPercentage,
  mergeShippingDetails,
  PRODUCT_AGE_GROUP_VALUES,
  PRODUCT_GENDER_VALUES,
  shippingPolicyDetails,
  shippingRateCents,
  shippingRateFor,
  usdToCents,
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
  orderPercentage: null,
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
      orderPercentage: null,
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


// ---------------------------------------------------------------------------
// MERCH-220: the percentage rate, computed per product in integer cents, and
// the handling time taken from each product's own production time.
//
// MERCH-100's fault sat live for weeks because nothing checked the figure
// Google was handed against the figure the page showed. These tests are the
// first of three guards (unit, live script, Merchant Center spot check).
// ---------------------------------------------------------------------------

describe('shipping rate as a percentage of the order (MERCH-220)', () => {
  const pct15: ShippingPolicy = { ...emptyPolicy, orderPercentage: 15 };

  it('computes in integer cents and rounds half up: $199.50 at 15% is $29.93, not the float method\'s $29.92', () => {
    // 19950 * 1500 = 29,925,000 hundredths-of-a-cent; the true figure is
    // 2992.5 cents, a tie. Half up gives 2993.
    expect(shippingRateCents(19950, 15)).toBe(2993);
    // The float method disagrees on this real product (MERCH-210 measured it).
    expect(Math.round(199.5 * 0.15 * 100)).toBe(2992);
    // The pen page Patrick reported in MERCH-100 is a tie too: $432.50.
    expect(shippingRateCents(43250, 15)).toBe(6488);
    // A non-tie for contrast: $143.28 (the cheapest live product) -> 2149.2 -> 2149.
    expect(shippingRateCents(14328, 15)).toBe(2149);
    // The dearest live product: $1944.96 -> 29174.4 -> 29174.
    expect(shippingRateCents(194496, 15)).toBe(29174);
  });

  it('handles a fractional percentage without leaving integer arithmetic', () => {
    expect(shippingRateCents(10000, 12.5)).toBe(1250);
    expect(shippingRateCents(19950, 12.5)).toBe(2494); // 2493.75 -> 2494
  });

  it('treats 0% as free shipping (a real zero) and 100% as the price itself', () => {
    expect(shippingRateCents(43250, 0)).toBe(0);
    expect(shippingRateCents(43250, 100)).toBe(43250);
  });

  it('never exceeds the price, for every price and every percentage in range', () => {
    const prices = [0, 1, 99, 100, 14328, 19950, 43250, 194496, 99999999];
    for (const price of prices) {
      for (let pct = 0; pct <= 100; pct += 0.25) {
        const rate = shippingRateCents(price, pct);
        expect(rate, `${price} at ${pct}%`).not.toBeNull();
        expect(rate!, `${price} at ${pct}%`).toBeLessThanOrEqual(price);
      }
    }
  });

  it('refuses a unit slip: a percentage above 100 (a 1500 where 15 was meant) yields NO rate, never a clamped one', () => {
    // The guard is the ceiling, not a clamp: a wrong figure must not be
    // published as a plausible one.
    expect(shippingRateCents(43250, 1500)).toBeNull();
    expect(shippingRateCents(43250, 100.01)).toBeNull();
    expect(shippingRateCents(43250, -15)).toBeNull();
    expect(shippingRateCents(43250, Number.NaN)).toBeNull();
    expect(isOrderPercentage(1500)).toBe(false);
    expect(isOrderPercentage(15)).toBe(true);
    // And through the policy: a 0.15 typed where 15 was meant is NOT caught
    // here (0.15% is a legal share), which is why the live verification
    // script flags a percentage between 0 and 1 and the Studio field says
    // "15, never 0.15".
    expect(shippingRateFor({ orderPercentage: 0.15, rate: null }, 432.5)).toEqual({
      '@type': 'MonetaryAmount',
      value: 0.65,
      currency: 'USD',
    });
  });

  it('refuses a price that is not an integer number of cents', () => {
    expect(shippingRateCents(199.5, 15)).toBeNull();
    expect(shippingRateCents(-1, 15)).toBeNull();
    expect(shippingRateCents('19950', 15)).toBeNull();
    expect(usdToCents(199.5)).toBe(19950);
    expect(usdToCents(432.5)).toBe(43250);
    expect(usdToCents(0.1 + 0.2)).toBe(30);
    expect(usdToCents(-1)).toBeNull();
    expect(usdToCents(null)).toBeNull();
  });

  it('precedence: a set percentage wins and the flat rate is ignored', () => {
    expect(shippingRateFor({ orderPercentage: 15, rate: 9 }, 432.5)).toEqual({
      '@type': 'MonetaryAmount',
      value: 64.88,
      currency: 'USD',
    });
  });

  it('precedence: only a flat rate set is byte-identical to MERCH-100', () => {
    expect(shippingRateFor({ orderPercentage: null, rate: 9 }, 432.5)).toEqual({
      '@type': 'MonetaryAmount',
      value: 9,
      currency: 'USD',
    });
    expect(shippingRateFor({ orderPercentage: null, rate: 0 }, 432.5)?.value).toBe(0);
  });

  it('precedence: neither set emits nothing, and a percentage with no order total emits nothing rather than falling back', () => {
    expect(shippingRateFor({ orderPercentage: null, rate: null }, 432.5)).toBeNull();
    expect(shippingRateFor({ orderPercentage: 15, rate: 9 }, null)).toBeNull();
    expect(shippingRateFor({ orderPercentage: 15, rate: 9 })).toBeNull();
    expect(shippingPolicyDetails(pct15)).toBeNull();
  });

  it('an unset percentage emits no shippingRate at all through the offer', () => {
    const offer = buildMinimumOrderOffer({
      ...base,
      tiers: [{ minQty: 1, price: 199.5 }],
      shippingPolicy: { ...emptyPolicy, destinationCountry: 'US' },
    })!.offer as Record<string, any>;
    expect(offer.shippingDetails).not.toHaveProperty('shippingRate');
    expect(offer.shippingDetails.shippingDestination.addressCountry).toBe('US');
  });

  it('through the offer: the rate is the percentage of the very price beside it, in the MonetaryAmount shape', () => {
    // 50 pens at $7.75 plus a $45 setup: $432.50, the pen page's own total.
    const built = buildMinimumOrderOffer({
      ...base,
      minOrderQty: 50,
      tiers: [{ minQty: 50, price: 7.75 }],
      flatSetupCharge: 45,
      shippingPolicy: { ...pct15, destinationCountry: 'US' },
      productionTimeDays: 7,
    })!;
    const offer = built.offer as Record<string, any>;
    expect(offer.price).toBe(432.5);
    expect(offer.priceCurrency).toBe('USD');
    expect(offer.shippingDetails.shippingRate).toEqual({ '@type': 'MonetaryAmount', value: 64.88, currency: 'USD' });
    expect(offer.shippingDetails.shippingRate.value).toBeLessThanOrEqual(offer.price);
    // The $199.50 case end to end.
    const kolder = buildMinimumOrderOffer({
      ...base,
      minOrderQty: 1,
      tiers: [{ minQty: 1, price: 199.5 }],
      shippingPolicy: pct15,
    })!.offer as Record<string, any>;
    expect(kolder.shippingDetails.shippingRate.value).toBe(29.93);
  });

  it('changes nothing else in the offer: price, currency, availability, condition, return policy, and no quantity annotation', () => {
    const args = { ...base, minOrderQty: 50, tiers: [{ minQty: 50, price: 8.65 }] };
    const before = buildMinimumOrderOffer(args)!.offer as Record<string, any>;
    const after = buildMinimumOrderOffer({
      ...args,
      shippingPolicy: { ...pct15, destinationCountry: 'US', transitDaysMin: 3, transitDaysMax: 7 },
      productionTimeDays: 7,
    })!.offer as Record<string, any>;
    const { shippingDetails: _a, ...moneyBefore } = before;
    const { shippingDetails: _b, ...moneyAfter } = after;
    expect(moneyAfter).toEqual(moneyBefore);
    const keys = deepKeys(after);
    for (const forbidden of ['eligibleQuantity', 'referenceQuantity', 'priceSpecification', 'UnitPriceSpecification']) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });
});

describe('handling and transit time (MERCH-220)', () => {
  const fallback: ShippingPolicy = { ...emptyPolicy, handlingDaysMin: 10, handlingDaysMax: 10 };

  it("handling comes from the product's own production time, as an exact range", () => {
    expect(handlingTimeFor(fallback, 7)).toEqual({ '@type': 'QuantitativeValue', minValue: 7, maxValue: 7, unitCode: 'DAY' });
    expect(handlingTimeFor(fallback, 40)?.maxValue).toBe(40);
  });

  it("falls back to the settings range only when the product has no production time (that is where Patrick's 10 days lives)", () => {
    const ten = { '@type': 'QuantitativeValue', minValue: 10, maxValue: 10, unitCode: 'DAY' };
    expect(handlingTimeFor(fallback, null)).toEqual(ten);
    expect(handlingTimeFor(fallback, undefined)).toEqual(ten);
    expect(handlingTimeFor(fallback, 0)).toEqual(ten);
    expect(handlingTimeFor(fallback, -3)).toEqual(ten);
    expect(handlingTimeFor(fallback, Number.NaN)).toEqual(ten);
  });

  it('emits no handling time when the product has none and the settings range is blank or half-filled', () => {
    expect(handlingTimeFor(emptyPolicy, null)).toBeNull();
    expect(handlingTimeFor({ ...emptyPolicy, handlingDaysMin: 10 }, null)).toBeNull();
    expect(handlingTimeFor(null, null)).toBeNull();
  });

  it('omits transitTime entirely when unset, leaving a deliveryTime with handling alone', () => {
    const d = shippingPolicyDetails({ ...emptyPolicy, destinationCountry: 'US' }, { productionTimeDays: 7 }) as Record<
      string,
      any
    >;
    expect(d.deliveryTime).toEqual({
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: 7, maxValue: 7, unitCode: 'DAY' },
    });
    expect(d.deliveryTime).not.toHaveProperty('transitTime');
    // Transit only ever comes from settings.
    const withTransit = shippingPolicyDetails(
      { ...emptyPolicy, transitDaysMin: 3, transitDaysMax: 7 },
      { productionTimeDays: 7 },
    ) as Record<string, any>;
    expect(withTransit.deliveryTime.transitTime).toEqual({ '@type': 'QuantitativeValue', minValue: 3, maxValue: 7, unitCode: 'DAY' });
  });

  it("emits the product's production time as handling even when Global Settings is entirely blank: it is a fact the page prints", () => {
    const d = shippingPolicyDetails(null, { orderTotal: 432.5, productionTimeDays: 7 }) as Record<string, any>;
    expect(Object.keys(d)).toEqual(['deliveryTime']);
    expect(d.deliveryTime.handlingTime.maxValue).toBe(7);
    expect(d).not.toHaveProperty('shippingRate');
    // And still nothing at all with no policy and no context, or with no policy and no figure.
    expect(shippingPolicyDetails(null)).toBeNull();
    expect(shippingPolicyDetails(null, { orderTotal: 432.5, productionTimeDays: null })).toBeNull();
    const offer = buildMinimumOrderOffer({ ...base, tiers: [{ minQty: 1, price: 1 }], productionTimeDays: 14 })!
      .offer as Record<string, any>;
    expect(offer.shippingDetails).toEqual({
      '@type': 'OfferShippingDetails',
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 14, maxValue: 14, unitCode: 'DAY' },
      },
    });
  });

  it('emits no deliveryTime at all when there is neither a handling nor a transit figure', () => {
    const d = shippingPolicyDetails({ ...emptyPolicy, destinationCountry: 'US' }, { productionTimeDays: null });
    expect(d).not.toHaveProperty('deliveryTime');
  });

  it('keeps everything the carton block emits today beside the computed parts', () => {
    const carton = {
      weight: { '@type': 'QuantitativeValue', value: 30, unitCode: 'LBR' },
      width: { '@type': 'QuantitativeValue', value: 13, unitCode: 'INH' },
      height: { '@type': 'QuantitativeValue', value: 14, unitCode: 'INH' },
      depth: { '@type': 'QuantitativeValue', value: 8, unitCode: 'INH' },
      shippingOrigin: { '@type': 'DefinedRegion', addressCountry: 'US', addressRegion: 'FL', postalCode: '33760' },
    };
    const merged = mergeShippingDetails(
      carton,
      { ...emptyPolicy, orderPercentage: 15, destinationCountry: 'US' },
      { orderTotal: 432.5, productionTimeDays: 7 },
    ) as Record<string, any>;
    for (const [k, v] of Object.entries(carton)) expect(merged[k]).toEqual(v);
    expect(merged.shippingRate.value).toBe(64.88);
    expect(merged.deliveryTime.handlingTime.maxValue).toBe(7);
    // No context at all: byte-identical to MERCH-100's merge.
    expect(mergeShippingDetails(carton, { ...emptyPolicy, rate: 15, destinationCountry: 'US' })).toEqual(
      mergeShippingDetails(carton, { ...emptyPolicy, rate: 15, destinationCountry: 'US' }, undefined),
    );
  });
});

describe('the product route feeds the builder its own production time (MERCH-220)', () => {
  const route = readFileSync(resolve(__dirname, '../../app/products/[slug]/page.tsx'), 'utf8');

  it('passes doc.productionTime as productionTimeDays and nothing site-wide', () => {
    expect(route).toContain('productionTimeDays: doc.productionTime,');
    expect(route).not.toMatch(/productionTimeDays:\s*\d/);
  });

  it('still renders the same figure on the page, so markup and page cannot disagree', () => {
    expect(route).toContain('{doc.productionTime} {doc.productionTime === 1 ? \'day\' : \'days\'}');
  });
});

describe('no em dash in the MERCH-220 sources', () => {
  it.each([
    // global-settings.ts and the route carry em dashes from 2026-06 comments;
    // the MERCH-220 additions to them were checked by hand on the diff.
    'lib/products/product-schema.ts',
    'lib/products/product-schema.test.ts',
    'lib/sanity/queries/global-settings.test.ts',
    'scripts/merch/verify-merch-220.ts',
  ])('%s', (rel) => {
    expect(readFileSync(resolve(__dirname, '../../', rel), 'utf8')).not.toContain(String.fromCharCode(0x2014));
  });
});
