/**
 * Product structured-data rules for /products/<slug> (FIX-830 task 1, revised
 * by MERCH-100).
 *
 * PURE + CLIENT-SAFE (no fs, no Sanity, no `server-only`) so the offer figure
 * can be unit-tested and, if a surface ever needs it, computed on either side.
 *
 * WHY THIS FILE EXISTS. Google's Merchant Listings report flagged four things
 * missing on the product pages: a return policy, shipping details, a product
 * identifier, and a description. Description was already emitted; the other
 * three are decided here. The load-bearing decision is the PRICE.
 *
 * THE PRICE, AND WHY IT IS TRUE. Patrick's instruction: show the price of a
 * full minimum order, including setup - "if 100 quantity is the minimum at
 * $2.00 each plus a $50 setup, it would show $250." That follows Google's own
 * rule for a minimum purchase quantity: submit the price for the smallest
 * order a buyer can place. A unit price alone would break that rule, and a
 * range or an AggregateOffer is not accepted for merchant listings, which
 * require an Offer.
 *
 * THE QUANTITY IS NOT STATED ON THE OFFER, AND MUST NOT COME BACK (MERCH-100,
 * 2026-09-09). FIX-830 said the quantity twice, as `eligibleQuantity` and as a
 * `UnitPriceSpecification` with `referenceQuantity`, so that "$250" could not
 * be read as the price of one unit. Google reads `referenceQuantity` as the
 * measure the product is sold in (its unit-pricing measure), and MULTIPLIES:
 * the pen page's $432.50 for 50 pens became $432.50 x 50 = $21,625 in
 * Merchant Center, and 145 of the 154 live products, every one with a minimum
 * above 1, were shown at 12 to 500 times their real figure, from $200 to
 * $732,500. The guard created a larger fault than the one it prevented. The
 * offer now carries `price` and `priceCurrency` and nothing that describes a
 * quantity; the quantity the price buys is stated in the page's visible copy
 * ("Estimated total for 50") and nowhere in the markup. A test fails if either
 * field returns.
 *
 * The number itself is not re-derived here. It comes from `estimateForQuantity`
 * and `effectiveSetupCharge` in lib/products/quote-estimate.ts - the same two
 * functions the on-page configurator uses for its default state - fed the same
 * defaults the page uses (minimum order quantity, first decoration method). So
 * the amount in the markup is a figure the visitor can see rendered on the page
 * as the Estimated total, not a private calculation. If the panel's defaults
 * ever change, change them in ONE place and both follow.
 *
 * A product with no usable pricing tier gets NO offer at all rather than a
 * guess.
 */

import {
  decorationUpchargeFor,
  effectiveSetupCharge,
  estimateForQuantity,
  type DecorationOption,
  type QuoteTier,
} from './quote-estimate';

/**
 * The availability values Patrick can choose in Studio, mirrored inline in
 * sanity/schemas/documents/product-page.ts (the standalone Studio bundler
 * cannot import the app's lib/, same rule as the FAQ category list).
 *
 * The business does not track stock, so nothing here is inferred from data -
 * it is whatever Patrick has set on the document, defaulting to "in stock"
 * meaning "we can take an order for this".
 */
export const PRODUCT_AVAILABILITY_VALUES = [
  'InStock',
  'LimitedAvailability',
  'BackOrder',
  'OutOfStock',
  'Discontinued',
] as const;

export type ProductAvailability = (typeof PRODUCT_AVAILABILITY_VALUES)[number];

export const DEFAULT_PRODUCT_AVAILABILITY: ProductAvailability = 'InStock';

/** Schema.org enum URL for a stored availability value, defaulting safely. */
export function availabilitySchemaUrl(value?: string | null): string {
  const v = (value ?? '').trim() as ProductAvailability;
  const known = (PRODUCT_AVAILABILITY_VALUES as readonly string[]).includes(v)
    ? v
    : DEFAULT_PRODUCT_AVAILABILITY;
  return `https://schema.org/${known}`;
}

/** Short human sentence for a non-default availability, or null for the default. */
export function availabilityLabel(value?: string | null): string | null {
  switch ((value ?? '').trim()) {
    case 'LimitedAvailability':
      return 'Limited availability';
    case 'BackOrder':
      return 'Currently back-ordered';
    case 'OutOfStock':
      return 'Currently out of stock';
    case 'Discontinued':
      return 'Discontinued';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Audience: age group + gender (MERCH-100, part 3).
//
// Google's Merchant Center reads the `age_group` and `gender` attributes from
// Product.audience (a PeopleAudience) as `suggestedMinAge` / `suggestedMaxAge`
// and `suggestedGender`. The allowed values and the numeric ages come from
// Google's own tables, read 2026-09-09:
//   age_group  https://support.google.com/merchants/answer/6324463
//              newborn 0-3 months, infant 3-12 months, toddler 1-5 years,
//              kids 5-13 years, adult 13+.
//   gender     https://support.google.com/merchants/answer/6324479
//              male, female, unisex.
//   mapping    https://support.google.com/merchants/answer/6386198
//              newborn min 0 max 0.25; infant 0.25 to 1; toddler 1 to 5;
//              kids 5 to 13; adult min 13, max not specified.
//
// Both are OPTIONAL on the document and emitted ONLY when set to a known
// value. There is no default and no guess: an unset field emits nothing, an
// unrecognised value (a hand edit through the API, say) emits nothing.
// ---------------------------------------------------------------------------

/** Mirrored inline in sanity/schemas/documents/product-page.ts (Studio bundler rule). */
export const PRODUCT_AGE_GROUP_VALUES = ['newborn', 'infant', 'toddler', 'kids', 'adult'] as const;
export type ProductAgeGroup = (typeof PRODUCT_AGE_GROUP_VALUES)[number];

/** Mirrored inline in sanity/schemas/documents/product-page.ts (Studio bundler rule). */
export const PRODUCT_GENDER_VALUES = ['male', 'female', 'unisex'] as const;
export type ProductGender = (typeof PRODUCT_GENDER_VALUES)[number];

/** Google's numeric age boundaries, in years, for each age_group value. */
const AGE_GROUP_YEARS: Record<ProductAgeGroup, { min: number; max?: number }> = {
  newborn: { min: 0, max: 0.25 },
  infant: { min: 0.25, max: 1 },
  toddler: { min: 1, max: 5 },
  kids: { min: 5, max: 13 },
  adult: { min: 13 },
};

export function isProductAgeGroup(value: unknown): value is ProductAgeGroup {
  return typeof value === 'string' && (PRODUCT_AGE_GROUP_VALUES as readonly string[]).includes(value);
}

export function isProductGender(value: unknown): value is ProductGender {
  return typeof value === 'string' && (PRODUCT_GENDER_VALUES as readonly string[]).includes(value);
}

export interface ProductAudienceInput {
  ageGroup?: string | null;
  gender?: string | null;
}

/**
 * The Product `audience` block, or null when neither field holds a known
 * value. Ages are emitted as bare numbers of years, which is how Google's
 * mapping table states them; `suggestedMaxAge` is omitted for adults because
 * Google specifies no upper bound.
 */
export function buildProductAudience(input: ProductAudienceInput): Record<string, unknown> | null {
  const ageGroup = (input.ageGroup ?? '').trim();
  const gender = (input.gender ?? '').trim();
  const hasAge = isProductAgeGroup(ageGroup);
  const hasGender = isProductGender(gender);
  if (!hasAge && !hasGender) return null;

  const audience: Record<string, unknown> = { '@type': 'PeopleAudience' };
  if (hasGender) audience.suggestedGender = gender;
  if (hasAge) {
    const years = AGE_GROUP_YEARS[ageGroup];
    audience.suggestedMinAge = years.min;
    if (years.max !== undefined) audience.suggestedMaxAge = years.max;
  }
  return audience;
}

// ---------------------------------------------------------------------------
// Shipping policy: rate, destination, delivery time (MERCH-100 part 2, made
// real by MERCH-220).
//
// Google's merchant-listing shipping wants three things the carton facts do
// not give it: `shippingRate` (a MonetaryAmount), `shippingDestination` (a
// DefinedRegion) and `deliveryTime` (handling + transit ranges in days).
// MERCH-100 built the fields blank because the business quoted shipping.
// Patrick then answered (2026-09-13): "For GMC, shipping can be figured at
// 15% of the purchase price and production time can be 10 days." MERCH-220
// acts on that with two decisions, taken in MERCH-200 / MERCH-210 and NOT to
// be re-derived here:
//
//  1. THE RATE IS COMPUTED PER PRODUCT, AT THE OFFER LEVEL, IN INTEGER CENTS.
//     Google's precedence puts the Merchant Center ACCOUNT setting above all
//     markup, so the account carries the percentage and wins; the markup's
//     job is to say the same thing on each page and to clear the three Search
//     Console warnings. `shippingRate` at Offer level takes a money amount
//     only (schema.org's `ShippingRateSettings.orderPercentage` is documented
//     by Google at Organization level alone), so the amount is
//     `orderPercentage` of the very `price` beside it, the minimum order
//     total. Integer cents because floating point is wrong on a real product:
//     $199.50 x 15% is 2992.5 cents, which `Math.round(199.5 * 0.15 * 100)`
//     gives as 2992 and the half-up rule gives as 2993; 24 of the 158 live
//     prices land on exactly such a tie. When `orderPercentage` is set the
//     flat rate is ignored; when only `flatRate` is set nothing changed from
//     MERCH-100; when neither is set no rate is emitted.
//
//  2. HANDLING TIME IS EACH PRODUCT'S OWN `productionTime`, NOT A SITE-WIDE
//     10. Production is handling (the delay before the parcel leaves), and
//     every page prints its own figure ("Production time: 7 days" on the pen
//     page). MERCH-210 measured 2 days on 22 pages, 7 on 17, 10 on 12, 14 on
//     53, 15 on 13, 40 on 7 and so on: a site-wide 10 would contradict the
//     visible page on 144 of 158 products, the same class of fault as the
//     carton weight MERCH-100 refused to emit. Patrick's 10 days lives where
//     it is site-wide by nature: the Merchant Center account setting, and
//     the settings `handlingDaysMin/Max` fallback for the products that have
//     no production time of their own. Transit is the carrier's time, is
//     unknown, comes only from settings, and is omitted entirely when unset.
//
// THE GUARD: a computed rate can never exceed the price. A shipping charge
// above the order total is impossible here, and it is the one thing that
// catches a `15` where `0.15` was meant, or any future unit slip, before it
// reaches Google. The rate is dropped, never clamped, so a wrong figure is
// never published as a plausible one.
//
// A rate of 0 is a real value (free shipping) and IS emitted; blank is not.
// A shipping WEIGHT is still not emitted (MERCH-100's reasoning stands).
// ---------------------------------------------------------------------------

export interface ShippingPolicy {
  /**
   * Shipping as a percentage of the order total, 0 to 100, e.g. 15 for 15%.
   * When set it WINS over `rate`. The unit is PERCENT: 15 means 15%, and a
   * `0.15` here would mean 0.15% (the resolver and the live verification
   * script both treat the value as percent; see `shippingRateCents`).
   */
  orderPercentage: number | null;
  /** Flat shipping charge in USD for one order. 0 means free shipping. Ignored when `orderPercentage` is set. */
  rate: number | null;
  /** ISO 3166-1 alpha-2 country the rate applies to, e.g. "US". */
  destinationCountry: string | null;
  /** Business days between order and dispatch: the FALLBACK when a product has no production time. */
  handlingDaysMin: number | null;
  handlingDaysMax: number | null;
  /** Business days in transit. */
  transitDaysMin: number | null;
  transitDaysMax: number | null;
}

/**
 * What the policy needs from the PRODUCT to compute its part of the block.
 * Both optional: `shippingPolicyDetails(policy)` with no context still
 * emits everything that needs no product (the MERCH-100 behaviour).
 */
export interface ShippingPolicyContext {
  /** The offer price in USD, i.e. the minimum order total already rounded to cents. */
  orderTotal?: number | null;
  /** The product's own production time in days (its `productionTime` field). */
  productionTimeDays?: number | null;
}

const finiteNonNegative = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** A usable percentage: finite, 0 to 100 inclusive. Anything else is "not set". */
export function isOrderPercentage(v: unknown): v is number {
  return finiteNonNegative(v) && v <= 100;
}

/** USD to integer cents, half up, or null for anything that is not a finite non-negative amount. */
export function usdToCents(usd: unknown): number | null {
  if (!finiteNonNegative(usd)) return null;
  return Math.round(usd * 100);
}

/**
 * The shipping charge for one order, in integer cents, as `percentage` of
 * `priceCents`, rounded HALF UP to the cent. Never floating point: the
 * percentage is taken to hundredths (15 -> 1500, 12.5 -> 1250), the product
 * `priceCents * pctHundredths` is an exact integer, and the division by
 * 10,000 is a floor after adding half. So $199.50 at 15% is
 * 19950 * 1500 = 29,925,000; (29,925,000 + 5,000) / 10,000 floors to 2993,
 * which is $29.93 (the float method gives $29.92).
 *
 * Returns null for a percentage outside 0..100 or a price that is not a
 * non-negative integer number of cents, and null when the result would EXCEED
 * the price: a charge larger than the order is impossible and is what a unit
 * slip looks like.
 */
export function shippingRateCents(priceCents: unknown, percentage: unknown): number | null {
  if (!isOrderPercentage(percentage)) return null;
  if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || priceCents < 0) return null;
  const pctHundredths = Math.round(percentage * 100);
  const rate = Math.floor((priceCents * pctHundredths + 5000) / 10000);
  if (rate > priceCents) return null;
  return rate;
}

/** A min/max pair is emitted only when BOTH are set and ordered. */
function dayRange(min: number | null, max: number | null): Record<string, unknown> | null {
  if (!finiteNonNegative(min) || !finiteNonNegative(max) || min > max) return null;
  return { '@type': 'QuantitativeValue', minValue: min, maxValue: max, unitCode: 'DAY' };
}

/**
 * The handling time Google is told: the product's own production time when
 * it has one (a positive number of days, emitted as an exact `{N, N}` range,
 * the figure the page prints), else the settings range, else nothing.
 */
export function handlingTimeFor(
  policy: Pick<ShippingPolicy, 'handlingDaysMin' | 'handlingDaysMax'> | null | undefined,
  productionTimeDays?: number | null,
): Record<string, unknown> | null {
  if (typeof productionTimeDays === 'number' && Number.isFinite(productionTimeDays) && productionTimeDays > 0) {
    return dayRange(productionTimeDays, productionTimeDays);
  }
  if (!policy) return null;
  return dayRange(policy.handlingDaysMin, policy.handlingDaysMax);
}

/**
 * The `shippingRate` MonetaryAmount for this policy and order, or null.
 * Precedence: a set `orderPercentage` wins and needs the order total (no
 * total means no rate, never a guess); otherwise the flat rate as before.
 */
export function shippingRateFor(
  policy: Pick<ShippingPolicy, 'orderPercentage' | 'rate'> | null | undefined,
  orderTotal?: number | null,
): Record<string, unknown> | null {
  if (!policy) return null;
  if (isOrderPercentage(policy.orderPercentage)) {
    const cents = shippingRateCents(usdToCents(orderTotal), policy.orderPercentage);
    if (cents === null) return null;
    return { '@type': 'MonetaryAmount', value: cents / 100, currency: 'USD' };
  }
  if (finiteNonNegative(policy.rate)) {
    return { '@type': 'MonetaryAmount', value: policy.rate, currency: 'USD' };
  }
  return null;
}

/**
 * The parts of OfferShippingDetails that come from the site-wide policy
 * (plus, with a context, the product's own price and production time), or
 * null when there is nothing real to say.
 */
export function shippingPolicyDetails(
  policy: ShippingPolicy | null | undefined,
  context?: ShippingPolicyContext | null,
): Record<string, unknown> | null {
  // No policy and no product context: nothing to say (the MERCH-100 shape).
  // No policy but a product context: the product's own production time is
  // still a fact the page prints, so it is still emitted as handling time.
  if (!policy && !context) return null;
  const out: Record<string, unknown> = {};

  const shippingRate = shippingRateFor(policy, context?.orderTotal);
  if (shippingRate) out.shippingRate = shippingRate;

  const country = (policy?.destinationCountry ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(country)) {
    out.shippingDestination = { '@type': 'DefinedRegion', addressCountry: country };
  }

  const handlingTime = handlingTimeFor(policy, context?.productionTimeDays);
  const transitTime = dayRange(policy?.transitDaysMin ?? null, policy?.transitDaysMax ?? null);
  if (handlingTime || transitTime) {
    out.deliveryTime = {
      '@type': 'ShippingDeliveryTime',
      ...(handlingTime ? { handlingTime } : {}),
      ...(transitTime ? { transitTime } : {}),
    };
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * ONE OfferShippingDetails block from the two honest sources: the product's
 * own carton facts (weight, dimensions, ships-from origin, built by the page)
 * and the site-wide policy applied to this product. Either may be absent;
 * both absent means no block. The carton keys are spread FIRST and untouched,
 * so everything MERCH-100 emitted is kept byte for byte.
 */
export function mergeShippingDetails(
  carton: Record<string, unknown> | null | undefined,
  policy: ShippingPolicy | null | undefined,
  context?: ShippingPolicyContext | null,
): Record<string, unknown> | null {
  const fromPolicy = shippingPolicyDetails(policy, context);
  if (!carton && !fromPolicy) return null;
  return {
    '@type': 'OfferShippingDetails',
    ...(carton ?? {}),
    ...(fromPolicy ?? {}),
  };
}

/**
 * Perfect Imprints' return policy as structured data (FIX-830 task 1).
 *
 * Patrick's decision, verbatim: "Go with the first policy that decorated items
 * can't be returned unless there is an error on Perfect Imprints part." Every
 * /products/ page sells decorated goods, so the category is
 * MerchantReturnNotPermitted and the full policy - including the error-on-our-
 * part exception, which structured data has no vocabulary for - is reached via
 * `merchantReturnLink`.
 *
 * Deliberately NOT emitted: `merchantReturnDays` and any restocking fee. Those
 * are the blank-goods terms on /returns; stating them here would promise a
 * returns window on custom printed work, which is a real commercial risk.
 */
export function decoratedGoodsReturnPolicy(siteUrl: string): Record<string, unknown> {
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'US',
    returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    merchantReturnLink: `${siteUrl.replace(/\/$/, '')}/returns`,
  };
}

export interface MinimumOrderOfferInput {
  /** Sorted, valid tiers - `productPageValidTiers()` output. */
  tiers: QuoteTier[];
  /** The page's minimum order quantity (max of explicit minQty and first tier). */
  minOrderQty: number;
  /** Normalized decoration options - `productPageDecorations()` output. */
  decorations: DecorationOption[];
  /** Product-level flat setup charge (the fallback when a method has none). */
  flatSetupCharge?: number | null;
  /** Absolute canonical URL of the product page. */
  url: string;
  availability?: string | null;
  siteUrl: string;
  /** The carton part of OfferShippingDetails, when the logistics fields are filled. */
  shippingDetails?: Record<string, unknown> | null;
  /** The site-wide shipping policy from globalSettings, when any of it is filled. */
  shippingPolicy?: ShippingPolicy | null;
  /**
   * The product's own `productionTime` in days (MERCH-220): the handling time
   * Google is told, because production IS handling and the page prints this
   * exact figure. Unset falls back to the settings handling range.
   */
  productionTimeDays?: number | null;
}

export interface MinimumOrderOffer {
  offer: Record<string, unknown>;
  /** The quantity the price buys - for the page's own copy. */
  quantity: number;
  /** The total, rounded to cents. */
  total: number;
}

/**
 * Build the Offer for one full minimum order. Returns null when the product has
 * no usable tier, so the caller emits a Product with no offers rather than a
 * fabricated price.
 */
export function buildMinimumOrderOffer(input: MinimumOrderOfferInput): MinimumOrderOffer | null {
  // The configurator's default selection: first decoration method, minimum
  // order quantity. Mirrors ProductSelectionProvider's initial state exactly.
  const defaultDecoration = input.decorations.find((d) => d.method.trim())?.method ?? null;
  const setup = effectiveSetupCharge(input.decorations, defaultDecoration, input.flatSetupCharge);
  const upcharge = decorationUpchargeFor(input.decorations, defaultDecoration);
  const estimate = estimateForQuantity(input.tiers, input.minOrderQty, setup, upcharge);
  if (!estimate) return null;

  const total = Math.round(estimate.total * 100) / 100;
  const quantity = estimate.quantity;
  // MERCH-220: the policy's rate is a percentage of THIS total, the figure
  // beside it in the offer, and its handling time is THIS product's own
  // production time. Both are computed here, where the rounded total is
  // already in scope, so the rate and the price it is a share of can never
  // be two different numbers.
  const shippingDetails = mergeShippingDetails(input.shippingDetails, input.shippingPolicy, {
    orderTotal: total,
    productionTimeDays: input.productionTimeDays,
  });

  return {
    quantity,
    total,
    offer: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: 'USD',
      // The total for one full minimum order. NO quantity annotation beside
      // it: see the header comment (MERCH-100) before adding one back.
      price: total,
      availability: availabilitySchemaUrl(input.availability),
      // Promotional products are new goods; nothing on this site is used or
      // refurbished, so this is a fact rather than a default.
      itemCondition: 'https://schema.org/NewCondition',
      hasMerchantReturnPolicy: decoratedGoodsReturnPolicy(input.siteUrl),
      ...(shippingDetails ? { shippingDetails } : {}),
    },
  };
}
