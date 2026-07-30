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

/**
 * One decoration-method choice on the configurator: the method name plus its
 * optional per-unit upcharge (0 = no upcharge — legacy string entries and
 * blank upcharges normalize to 0 upstream in `productPageDecorations()`),
 * plus an optional one-time setup charge for THIS method (Q-100).
 *
 * `setupCharge` semantics differ from `upcharge` on purpose: for the setup
 * override, 0 and "not set" mean different things. `undefined` = the method
 * has no setup of its own, fall back to the product-level flat setup charge;
 * an explicit 0 = this method deliberately has NO setup fee (cancels the flat
 * fee). The normalizer only carries finite values of 0 or more; anything else
 * stays undefined.
 */
export interface DecorationOption {
  method: string;
  upcharge: number;
  setupCharge?: number;
}

export interface QuoteEstimate {
  /** The quantity the estimate was computed for (clamped to the minimum). */
  quantity: number;
  /** The tier that priced this quantity — index into the sorted tier list. */
  tierIndex: number;
  unitPrice: number;
  /** Per-unit upcharge of the selected decoration method (0 when none). */
  decorationUpcharge: number;
  /** quantity × (unitPrice + decorationUpcharge) + setupCharge. */
  total: number;
  setupCharge: number;
}

/** The selected decoration's per-unit upcharge (0 when unset/not found). */
export function decorationUpchargeFor(
  options: DecorationOption[],
  method: string | null | undefined,
): number {
  if (!method) return 0;
  const found = options.find((o) => o.method === method);
  return found && Number.isFinite(found.upcharge) && found.upcharge > 0 ? found.upcharge : 0;
}

/**
 * The setup charge the estimate should actually use (Q-100) - the ONE place
 * setup resolution happens; no caller may re-derive it. Precedence:
 *
 *  1. The selected decoration's own `setupCharge`, when it is a finite number
 *     of 0 or more. An explicit 0 WINS here: it means "this method has no
 *     setup fee" and cancels the flat product-level charge (different from
 *     the per-unit upcharge, where anything not above 0 is just "none").
 *  2. Otherwise the product's flat setup charge, under the same finite-and-
 *     0-or-more rule.
 *  3. Otherwise 0 (no setup). Negative or non-finite values are treated as
 *     "not set" in either position.
 *
 * Returns a plain number ready to pass into `estimateForQuantity` as its
 * `setupCharge` argument (which keeps its existing signature and behavior).
 */
export function effectiveSetupCharge(
  options: DecorationOption[],
  method: string | null | undefined,
  flatSetupCharge?: number | null,
): number {
  const usable = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (method) {
    const found = options.find((o) => o.method === method);
    if (found && usable(found.setupCharge)) return found.setupCharge;
  }
  return usable(flatSetupCharge) ? flatSetupCharge : 0;
}

/**
 * Display label for a decoration option, e.g. "Pad Print (+$0.50/unit)" when
 * there is a per-unit upcharge, else just the method name. Consolidated here
 * (Q-100) from identical copies in ProductPurchasePanel and ProductQuoteForm
 * so the two surfaces can never drift; output is unchanged. Deliberately does
 * NOT mention the setup fee - whether the dropdown label should is Patrick's
 * call, not part of Q-100.
 */
export function decorationLabel(option: DecorationOption): string {
  return option.upcharge > 0
    ? `${option.method} (+${formatUsd(option.upcharge)}/unit)`
    : option.method;
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
  decorationUpcharge?: number | null,
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
  const decoration =
    typeof decorationUpcharge === 'number' && decorationUpcharge > 0 ? decorationUpcharge : 0;
  return {
    quantity: qty,
    tierIndex,
    unitPrice,
    decorationUpcharge: decoration,
    total: qty * (unitPrice + decoration) + setup,
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
