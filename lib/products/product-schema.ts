/**
 * Product structured-data rules for /products/<slug> (FIX-830 task 1).
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
 * $2.00 each plus a $50 setup, it would show $250." A bare `price: 250` would
 * be read by Google as the price of ONE unit, which is false, so the figure is
 * always emitted with the quantity it applies to, twice over: `eligibleQuantity`
 * on the Offer and a `UnitPriceSpecification` with a `referenceQuantity`. Both
 * are schema.org's own way of saying "this amount buys this many".
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

/** UN/CEFACT code for "one / each" - the unit `eligibleQuantity` counts in. */
const UNIT_EACH = 'C62';

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
  /** OfferShippingDetails block, when the logistics fields are filled. */
  shippingDetails?: Record<string, unknown> | null;
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
  const eligibleQuantity = {
    '@type': 'QuantitativeValue',
    value: quantity,
    unitCode: UNIT_EACH,
  };

  return {
    quantity,
    total,
    offer: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: 'USD',
      price: total,
      // Said twice on purpose: `eligibleQuantity` is what most consumers read,
      // `priceSpecification.referenceQuantity` is the stricter schema.org form.
      // Either one alone leaves "$250" open to being read as a unit price.
      eligibleQuantity,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        priceCurrency: 'USD',
        price: total,
        referenceQuantity: eligibleQuantity,
        valueAddedTaxIncluded: false,
      },
      availability: availabilitySchemaUrl(input.availability),
      // Promotional products are new goods; nothing on this site is used or
      // refurbished, so this is a fact rather than a default.
      itemCondition: 'https://schema.org/NewCondition',
      hasMerchantReturnPolicy: decoratedGoodsReturnPolicy(input.siteUrl),
      ...(input.shippingDetails ? { shippingDetails: input.shippingDetails } : {}),
    },
  };
}
