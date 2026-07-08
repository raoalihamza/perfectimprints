/**
 * Quote-estimate math + selection summary for the /products/<slug> configurator
 * (P2-CP configurator). PURE + CLIENT-SAFE: no fs, no Sanity, no `server-only`
 * — the client islands (ProductPurchasePanel, ProductQuoteForm) and the server
 * page import the SAME functions, so the highlighted tier, the unit price, and
 * the estimated total can never disagree between surfaces.
 *
 * HONESTY RULE: everything computed here is an ESTIMATE for a quote-based
 * business (no cart, no checkout). Callers must always render it with the
 * "Estimated total — final pricing confirmed in your quote" label.
 */

export interface QuoteTier {
  minQty: number;
  price: number;
}

export interface QuoteEstimate {
  /** The quantity the estimate was computed for (clamped to the minimum). */
  quantity: number;
  /** The tier that priced this quantity — index into the sorted tier list. */
  tierIndex: number;
  unitPrice: number;
  /** quantity × unitPrice + setupCharge. */
  total: number;
  setupCharge: number;
}

/** Lowest orderable quantity — the first (sorted) tier's minQty, else 1. */
export function minimumQuantity(tiers: QuoteTier[]): number {
  return tiers.length > 0 ? tiers[0].minQty : 1;
}

/**
 * The tier that prices `quantity`: the one with the greatest minQty <= quantity
 * (tiers must be the sorted `productPageValidTiers()` output — the same list
 * the visible table renders, so the highlight always matches the math).
 * Quantities below the first tier clamp UP to it (the page enforces the
 * minimum order quantity). Returns null when there are no tiers (no price
 * data → capture the quantity, skip the price).
 */
export function estimateForQuantity(
  tiers: QuoteTier[],
  quantity: number,
  setupCharge?: number | null,
): QuoteEstimate | null {
  if (tiers.length === 0) return null;
  const min = minimumQuantity(tiers);
  const qty = Math.max(Math.floor(Number.isFinite(quantity) ? quantity : min), min);
  let tierIndex = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    if (tiers[i].minQty <= qty) tierIndex = i;
    else break;
  }
  const unitPrice = tiers[tierIndex].price;
  const setup = typeof setupCharge === 'number' && setupCharge > 0 ? setupCharge : 0;
  return {
    quantity: qty,
    tierIndex,
    unitPrice,
    total: qty * unitPrice + setup,
    setupCharge: setup,
  };
}

/** Deterministic USD formatting — explicit locale so SSR and hydration agree. */
export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface SelectionSummaryInput {
  productTitle: string;
  colorName?: string | null;
  size?: string | null;
  quantity?: number | null;
  decoration?: string | null;
}

/**
 * Deterministic 1-line summary of the configured selection (NOT AI), e.g.
 * "Custom Bamboo Folding Fan — White, Small, 150 units, Pad Print." Empty
 * properties are skipped.
 */
export function buildSelectionSummary(input: SelectionSummaryInput): string {
  const parts = [
    input.colorName?.trim() || '',
    input.size?.trim() || '',
    input.quantity && input.quantity > 0
      ? `${input.quantity.toLocaleString('en-US')} units`
      : '',
    input.decoration?.trim() || '',
  ].filter(Boolean);
  if (parts.length === 0) return input.productTitle;
  return `${input.productTitle} — ${parts.join(', ')}.`;
}
