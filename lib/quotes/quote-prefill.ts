/**
 * Quote line PRE-FILL rules (Q-130 - the Studio quote builder).
 *
 * PURE + CLIENT-SAFE: no fs, no Sanity, no `server-only`, no React. The Studio
 * line inputs import this directly (the lib/quotes/quote-totals.ts precedent),
 * and vitest covers it offline.
 *
 * WHY A SNAPSHOT, NOT A LOOKUP (do not "optimise" this away):
 * everything computed here is written ONCE into the quote's own fields at the
 * moment Patrick asks for it, and is then frozen. Nothing on a quote is ever
 * re-read from the referenced product at render time. A quote sent to a
 * customer must show the same numbers next week even if Patrick edits the
 * product afterwards - the quote is a commercial snapshot, not a view over
 * live data. That rule is stated in sanity/schemas/objects/quote-line-items.ts
 * and was proven by the Q-111 verification run ("snapshot: product setupCharge
 * 100 -> 999, quote line unchanged").
 *
 * The two directions differ in how much is knowable:
 *   - Geiger catalog line: the catalog carries a name, an image, a description,
 *     a price RANGE and a minimum quantity, but NEVER a real cost. So the name,
 *     image and description pre-fill; the range and minimum are shown only as
 *     REFERENCE FIGURES beside the cost field. Unit cost and setup are always
 *     Patrick's own entry.
 *   - Own Product Page line: the product carries real tiered pricing, so the
 *     unit cost and the setup charge can be computed exactly, through the SAME
 *     shared modules the live /products/<slug> configurator uses.
 */

import {
  decorationUpchargeFor,
  effectiveSetupCharge,
  estimateForQuantity,
  type DecorationOption,
} from '../products/quote-estimate';
import {
  productPageDecorations,
  productPageMinQty,
  productPageValidTiers,
  type DecorationEntryLike,
  type PricingTierLike,
} from '../products/product-page-pricing';

/**
 * How much product description a quote LINE carries.
 *
 * 300 characters is roughly 45 words: enough for the one or two sentences that
 * identify an item on a quote ("20 oz double-wall stainless steel bottle with
 * a screw-on lid"), and short enough that a quote with eight lines stays
 * readable on one page in the future PDF. Geiger's own descriptions routinely
 * run several hundred words of marketing copy, which would swamp the line.
 * Patrick can always type more - this is only what auto-fill puts there.
 */
export const QUOTE_DESCRIPTION_MAX_CHARS = 300;

/** True when a field is empty for pre-fill purposes (blank/whitespace counts). */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

/** A usable positive number, else null (draft tolerance: never throws). */
function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Catalog copy to a quote-line description: strip any markup, collapse
 * whitespace, then cut at a WORD boundary within the limit and append "...".
 * Returns null for empty input so callers can skip the field entirely.
 */
export function truncateQuoteDescription(
  raw: unknown,
  maxChars: number = QUOTE_DESCRIPTION_MAX_CHARS,
): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  // Fall back to the hard cut if the text has no space inside the window.
  const body = (lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,.;:-]+$/,
    '',
  );
  return `${body}...`;
}

// ---------------------------------------------------------------------------
// Geiger catalog line
// ---------------------------------------------------------------------------

/** What /api/products/resolve returns for a known SKU (Q-130 extended it). */
export interface GeigerResolvePayload {
  found?: boolean;
  sku?: string;
  name?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  lowPrice?: number | null;
  highPrice?: number | null;
  minQty?: number | null;
}

/** The three catalog-derived display fields a Geiger line can pre-fill. */
export interface GeigerLinePrefill {
  displayName: string | null;
  imageUrl: string | null;
  description: string | null;
}

/**
 * Reference figures shown BESIDE the cost field, never written into it.
 * Geiger publishes a price range for a product, not the cost Patrick pays or
 * charges, so copying a range value into `unitCost` would put an invented
 * number on a customer quote. See Q-000.
 */
export interface GeigerLineGuidance {
  brand: string | null;
  lowPrice: number | null;
  highPrice: number | null;
  minQty: number | null;
}

/** The catalog-derived DISPLAY fields for a Geiger line (never any price). */
export function buildGeigerLinePrefill(payload: GeigerResolvePayload): GeigerLinePrefill {
  return {
    displayName: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null,
    imageUrl:
      typeof payload.imageUrl === 'string' && payload.imageUrl.trim()
        ? payload.imageUrl.trim()
        : null,
    description: truncateQuoteDescription(payload.description),
  };
}

/** The reference-only figures for a Geiger line (guidance, never a quote price). */
export function buildGeigerLineGuidance(payload: GeigerResolvePayload): GeigerLineGuidance {
  return {
    brand: typeof payload.brand === 'string' && payload.brand.trim() ? payload.brand.trim() : null,
    lowPrice: positiveOrNull(payload.lowPrice),
    highPrice: positiveOrNull(payload.highPrice),
    minQty: positiveOrNull(payload.minQty),
  };
}

// ---------------------------------------------------------------------------
// Own Product Page line
// ---------------------------------------------------------------------------

/**
 * The projection the Studio pulls for a referenced Product Page. Shaped to be
 * assignable from the GROQ result, and structurally compatible with the pure
 * pricing helpers.
 */
export interface OwnProductSource {
  title?: string | null;
  imageUrl?: string | null;
  /** Description already flattened to plain text by the caller. */
  descriptionPlain?: string | null;
  pricingTiers?: PricingTierLike[];
  minQty?: number;
  /** The product-level flat setup charge (the default when a method has none). */
  setupCharge?: number;
  decorationMethods?: (string | DecorationEntryLike)[];
}

export interface OwnProductPrefill {
  /** Fields to write onto the line (null = nothing knowable, skip the field). */
  displayName: string | null;
  imageUrl: string | null;
  description: string | null;
  unitCost: number | null;
  setupCharge: number | null;
  /** Reference only: the product's minimum order quantity. */
  minQty: number | null;
  /** The product's decoration methods, for the "pick one" chooser. */
  decorations: DecorationOption[];
  /** The quantity the unit cost was priced at (clamped up to the minimum). */
  quantityUsed: number | null;
  /** The `minQty` of the tier that priced it, so the panel can show which tier. */
  tierMinQty: number | null;
  /** The tier's own price before any decoration upcharge. */
  tierPrice: number | null;
  /** The selected decoration's per-unit upcharge, folded into `unitCost`. */
  decorationUpcharge: number;
  /** Plain-English things Patrick should know, shown in the panel. */
  warnings: string[];
}

export interface OwnProductPrefillOptions {
  /** The quantity currently on the quote line (may be missing on a draft). */
  quantity?: unknown;
  /** The decoration method currently on the quote line (free text). */
  decorationMethod?: string | null;
}

/**
 * Everything knowable about an own-product quote line, computed through the
 * SAME modules the live product page uses:
 *   - `productPageValidTiers` picks which tiers count,
 *   - `estimateForQuantity` picks the tier for the quantity (clamping up to the
 *     minimum, exactly as the configurator does),
 *   - `effectiveSetupCharge` resolves setup (the chosen decoration's own charge
 *     wins, an explicit 0 there means "no setup fee", blank falls back to the
 *     product's flat charge - Q-100).
 * No pricing formula is re-implemented here.
 *
 * `unitCost` is the tier price PLUS the selected decoration's per-unit upcharge,
 * which is what the customer would have been quoted by the configurator for
 * that configuration. Both parts are reported separately so the panel can show
 * the arithmetic instead of a bare number.
 *
 * Draft tolerance: any missing or unusable input degrades to a null field plus
 * a warning. Nothing here throws.
 */
export function buildOwnProductPrefill(
  source: OwnProductSource | null | undefined,
  options: OwnProductPrefillOptions = {},
): OwnProductPrefill {
  const warnings: string[] = [];
  const empty: OwnProductPrefill = {
    displayName: null,
    imageUrl: null,
    description: null,
    unitCost: null,
    setupCharge: null,
    minQty: null,
    decorations: [],
    quantityUsed: null,
    tierMinQty: null,
    tierPrice: null,
    decorationUpcharge: 0,
    warnings,
  };

  if (!source) {
    warnings.push('That product could not be loaded. Try again, or fill this line in by hand.');
    return empty;
  }

  const decorations = productPageDecorations(source);
  const tiers = productPageValidTiers(source);
  const productMinQty = productPageMinQty(source);
  const method = typeof options.decorationMethod === 'string' ? options.decorationMethod.trim() : '';

  // Warn when the typed decoration is not one this product defines: the setup
  // charge then comes from the product default, which is easy to miss.
  if (method && decorations.length > 0 && !decorations.some((d) => d.method === method)) {
    warnings.push(
      `"${method}" is not one of this product's decoration methods, so the setup charge below is the product's default. Pick one of its methods to use that method's own setup fee.`,
    );
  }

  const enteredQuantity = positiveOrNull(options.quantity);
  if (enteredQuantity === null) {
    warnings.push(
      productMinQty
        ? `This line has no quantity yet, so the price shown is for this product's minimum of ${productMinQty}. Set the quantity and pull again to price it properly.`
        : 'This line has no quantity yet, so the price shown is for the lowest quantity this product sells.',
    );
  } else if (productMinQty !== null && enteredQuantity < productMinQty) {
    warnings.push(
      `Your quantity (${enteredQuantity}) is below this product's minimum of ${productMinQty}. The unit cost below is the minimum-quantity price - change the quantity or the price before you send this quote.`,
    );
  }

  const setupCharge = effectiveSetupCharge(decorations, method || null, source.setupCharge);
  const decorationUpcharge = decorationUpchargeFor(decorations, method || null);

  if (tiers.length === 0) {
    warnings.push(
      'This product has no pricing tiers yet, so there is no unit cost to pull. Add tiers on the Product Page, or type the cost here.',
    );
  }

  const estimate = estimateForQuantity(
    tiers,
    enteredQuantity ?? productMinQty ?? 1,
    setupCharge,
    decorationUpcharge,
  );

  return {
    displayName: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : null,
    imageUrl:
      typeof source.imageUrl === 'string' && source.imageUrl.trim() ? source.imageUrl.trim() : null,
    description: truncateQuoteDescription(source.descriptionPlain),
    unitCost: estimate ? estimate.unitPrice + estimate.decorationUpcharge : null,
    // An explicit 0 is a real answer ("no setup fee"), so it is written, not skipped.
    setupCharge: estimate ? setupCharge : null,
    minQty: productMinQty,
    decorations,
    quantityUsed: estimate ? estimate.quantity : null,
    tierMinQty: estimate ? tiers[estimate.tierIndex].minQty : null,
    tierPrice: estimate ? estimate.unitPrice : null,
    decorationUpcharge: estimate ? estimate.decorationUpcharge : 0,
    warnings,
  };
}
