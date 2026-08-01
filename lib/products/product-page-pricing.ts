/**
 * Pure pricing + decoration helpers for `productPage` documents (Q-130).
 *
 * These four functions USED to live in lib/sanity/queries/product-pages.ts,
 * which is a `server-only` module (it imports the Sanity client and node-side
 * cache tags). The Studio quote builder needs exactly the same tier selection
 * and decoration normalization to pre-fill an own-product quote line, and the
 * Studio bundle cannot import a `server-only` module. Rather than writing a
 * SECOND copy of the tier rules (which would be free to drift from the numbers
 * the live product page shows), they were moved DOWN here into a pure,
 * client-safe module - no fs, no Sanity, no `server-only`, no React.
 *
 * lib/sanity/queries/product-pages.ts re-exports all four under their original
 * names, so every existing import site is unchanged and there is still exactly
 * ONE definition of "which tiers count" in the codebase.
 *
 * The parameter types are deliberately STRUCTURAL (the `*Source` interfaces
 * below) rather than the server module's `ProductPageCard` / `ProductPageDoc`:
 * that keeps this module dependency-free while staying assignable from those
 * richer types, and lets the Studio pass a plain GROQ result object.
 */

import type { DecorationOption } from './quote-estimate';

export interface PricingTierLike {
  minQty?: number;
  price?: number;
}

export interface DecorationEntryLike {
  method?: string;
  upcharge?: number;
  setupCharge?: number;
}

export interface ProductPagePricingSource {
  pricingTiers?: PricingTierLike[];
  minQty?: number;
}

export interface ProductPageDecorationSource {
  decorationMethods?: (string | DecorationEntryLike)[];
}

/**
 * The SINGLE source of truth for which pricing tiers count: both minQty and
 * price must be positive numbers, sorted by quantity, capped at the 5 the
 * table renders (the schema max-5 rule is warning-level, so 6+ can publish).
 * The detail-page table, the card price range, the price line, the JSON-LD
 * AggregateOffer, and the Studio quote-line pre-fill ALL derive from this list
 * so they can never disagree.
 */
export function productPageValidTiers(
  doc: ProductPagePricingSource,
): { minQty: number; price: number }[] {
  return (doc.pricingTiers ?? [])
    .filter(
      (t): t is PricingTierLike & { minQty: number; price: number } =>
        typeof t.minQty === 'number' &&
        Number.isFinite(t.minQty) &&
        t.minQty > 0 &&
        typeof t.price === 'number' &&
        Number.isFinite(t.price) &&
        t.price > 0,
    )
    .sort((a, b) => a.minQty - b.minQty)
    .slice(0, 5)
    .map((t) => ({ minQty: t.minQty, price: t.price }));
}

/** Low/high card price derived from the (valid, displayed) pricing tiers. */
export function productPagePriceRange(doc: ProductPagePricingSource): {
  low: number | null;
  high: number | null;
} {
  const prices = productPageValidTiers(doc).map((t) => t.price);
  if (prices.length === 0) return { low: null, high: null };
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

/** Explicit minQty, else the lowest (valid, displayed) tier quantity. */
export function productPageMinQty(doc: ProductPagePricingSource): number | null {
  if (typeof doc.minQty === 'number' && doc.minQty > 0) return doc.minQty;
  const tiers = productPageValidTiers(doc);
  return tiers.length > 0 ? tiers[0].minQty : null;
}

/**
 * Normalized decoration options for the configurator, the quote form, and the
 * Studio quote-line pre-fill: legacy string entries and blank upcharges become
 * `{method, upcharge: 0}`; blank methods are dropped; duplicates (by method)
 * keep the first entry.
 *
 * Per-method setup charge (Q-100): carried through ONLY when it is a finite
 * number of 0 or more - an explicit 0 is kept (it means "no setup fee for
 * this method" and overrides the flat product charge in
 * `effectiveSetupCharge`); blank / negative / non-finite values stay
 * undefined so the flat charge applies. Legacy string entries never carry
 * one, so they fall back to the flat charge exactly as before.
 */
export function productPageDecorations(doc: ProductPageDecorationSource): DecorationOption[] {
  const out: DecorationOption[] = [];
  for (const entry of doc.decorationMethods ?? []) {
    const method = (typeof entry === 'string' ? entry : entry?.method ?? '').trim();
    if (!method || out.some((o) => o.method === method)) continue;
    const raw = typeof entry === 'string' ? undefined : entry?.upcharge;
    const upcharge = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
    const rawSetup = typeof entry === 'string' ? undefined : entry?.setupCharge;
    const setupCharge =
      typeof rawSetup === 'number' && Number.isFinite(rawSetup) && rawSetup >= 0
        ? rawSetup
        : undefined;
    out.push({ method, upcharge, ...(setupCharge !== undefined ? { setupCharge } : {}) });
  }
  return out;
}
