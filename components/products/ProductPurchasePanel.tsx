'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { estimateForQuantity, formatUsd, type QuoteTier } from '@/lib/products/quote-estimate';
import { useProductSelection } from './ProductSelectionContext';

// The quote modal (+ form + Turnstile + file validation) is interaction-only —
// same split as the old GetQuoteButton: ssr:false + mount-on-click keeps it out
// of the static /products First Load JS.
const ProductQuoteModal = dynamic(
  () => import('./ProductQuoteForm').then((m) => m.ProductQuoteModal),
  { ssr: false },
);

interface ProductPurchasePanelProps {
  productTitle: string;
  productSlug: string;
  tiers: QuoteTier[];
  setupCharge?: number;
  /** Color option names (gallery order) — selection happens via the swatches. */
  colors: string[];
  sizes: string[];
  decorations: string[];
  /**
   * The minimum order quantity (the greater of the explicit minQty field and
   * the lowest tier's minQty) — computed by the page so the panel, the form,
   * and the "Minimum order quantity" hint all share one number.
   */
  minQuantity: number;
}

/**
 * The Geiger-style configurator on /products/<slug> (P2-CP configurator): the
 * QTY/PRICE tier table with the ACTIVE tier highlighted, a quantity input
 * (floored at the minimum order quantity), size/decoration selectors (fixed
 * text when there is only one option), a live ESTIMATED total (quantity × unit
 * price + optional setup charge — always labeled as an estimate; this site is
 * quote-based, no checkout), and the Get a Quote button that opens the
 * dedicated quote form pre-filled with the current selection.
 *
 * Client island over static HTML: the initial render (default selection =
 * lowest tier quantity + first options) is deterministic, so the full tier
 * table, prices, and labels are all in the prerendered HTML. No URL reads.
 */
export function ProductPurchasePanel({
  productTitle,
  productSlug,
  tiers,
  setupCharge,
  colors,
  sizes,
  decorations,
  minQuantity,
}: ProductPurchasePanelProps) {
  const { colorName, size, setSize, decoration, setDecoration, quantity, setQuantity } =
    useProductSelection();
  const [quoteOpen, setQuoteOpen] = useState(false);
  // The raw input text so typing "1" on the way to "150" isn't fought; the
  // ESTIMATE always uses the clamped numeric quantity.
  const [quantityText, setQuantityText] = useState(String(quantity));

  const minQty = minQuantity;
  const estimate = estimateForQuantity(tiers, quantity, setupCharge);
  const belowMinimum = Number.parseInt(quantityText, 10) < minQty;

  function commitQuantity(raw: string) {
    const parsed = Number.parseInt(raw, 10);
    const clamped = Math.max(Number.isFinite(parsed) ? parsed : minQty, minQty);
    setQuantity(clamped);
    setQuantityText(String(clamped));
  }

  return (
    <div className="mt-6">
      {/* Tier table — the active tier (the one pricing the current quantity)
          is highlighted, Geiger-style. */}
      {tiers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-border bg-bg-soft px-3 py-2 text-left font-semibold text-brand-ink">
                  QTY
                </th>
                {tiers.map((t, idx) => (
                  <th
                    key={`qty-${idx}`}
                    className={cn(
                      'border border-border px-3 py-2 text-center font-semibold text-brand-ink',
                      estimate?.tierIndex === idx ? 'bg-brand-red/10' : 'bg-bg-soft',
                    )}
                  >
                    {t.minQty.toLocaleString('en-US')}+
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-border px-3 py-2 font-semibold text-brand-ink">
                  PRICE
                </td>
                {tiers.map((t, idx) => (
                  <td
                    key={`price-${idx}`}
                    className={cn(
                      'border border-border px-3 py-2 text-center',
                      estimate?.tierIndex === idx
                        ? 'bg-brand-red/10 font-semibold text-brand-ink'
                        : 'text-text-primary',
                    )}
                  >
                    {formatUsd(t.price)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {/* Quantity */}
        <div>
          <label
            className="mb-1.5 block text-sm font-semibold text-brand-ink"
            htmlFor="pp-quantity"
          >
            Quantity
          </label>
          <input
            id="pp-quantity"
            type="number"
            inputMode="numeric"
            min={minQty}
            value={quantityText}
            onChange={(e) => {
              setQuantityText(e.target.value);
              const parsed = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(parsed)) setQuantity(Math.max(parsed, minQty));
            }}
            onBlur={(e) => commitQuantity(e.target.value)}
            className="block h-11 w-40 rounded-md border border-border bg-white px-3.5 text-base text-text-primary transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
          />
          <p className={cn('mt-1 text-xs', belowMinimum ? 'text-brand-red' : 'text-text-muted')}>
            Minimum order quantity: {minQty.toLocaleString('en-US')}
          </p>
        </div>

        {/* Selected color — chosen via the gallery swatches; shown here so the
            whole configuration reads in one place. */}
        {colors.length > 0 && colorName && (
          <p className="text-sm text-text-primary">
            <span className="font-semibold text-brand-ink">Color:</span> {colorName}
            <span className="ml-2 text-xs text-text-muted">(pick a swatch under the photos)</span>
          </p>
        )}

        {/* Size — selector when there is a choice, fixed text otherwise. */}
        {sizes.length > 1 ? (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-brand-ink" htmlFor="pp-size">
              Size
            </label>
            <select
              id="pp-size"
              value={size ?? ''}
              onChange={(e) => setSize(e.target.value || null)}
              className="block h-11 w-full max-w-xs rounded-md border border-border bg-white px-3 text-base text-text-primary focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : sizes.length === 1 ? (
          <p className="text-sm text-text-primary">
            <span className="font-semibold text-brand-ink">Size:</span> {sizes[0]}
          </p>
        ) : null}

        {/* Decoration — same pattern. */}
        {decorations.length > 1 ? (
          <div>
            <label
              className="mb-1.5 block text-sm font-semibold text-brand-ink"
              htmlFor="pp-decoration"
            >
              Decoration
            </label>
            <select
              id="pp-decoration"
              value={decoration ?? ''}
              onChange={(e) => setDecoration(e.target.value || null)}
              className="block h-11 w-full max-w-xs rounded-md border border-border bg-white px-3 text-base text-text-primary focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
            >
              {decorations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ) : decorations.length === 1 ? (
          <p className="text-sm text-text-primary">
            <span className="font-semibold text-brand-ink">Decoration:</span> {decorations[0]}
          </p>
        ) : null}

        {/* Live estimate — HONESTLY labeled; quote-based business, no checkout. */}
        {estimate && (
          <div className="rounded border border-border bg-bg-soft px-4 py-3">
            <p className="text-sm text-text-primary">
              {estimate.quantity.toLocaleString('en-US')} × {formatUsd(estimate.unitPrice)} each
              {estimate.setupCharge > 0 ? ` + ${formatUsd(estimate.setupCharge)} setup` : ''}
            </p>
            <p className="mt-1 text-xl font-bold text-brand-ink">
              {formatUsd(estimate.total)}{' '}
              <span className="text-sm font-normal text-text-muted">estimated total</span>
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Estimated total — final pricing confirmed in your quote.
            </p>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setQuoteOpen(true)}
            className="inline-flex h-12 w-full items-center justify-center rounded bg-brand-green px-8 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 sm:w-auto"
          >
            Get a Quote
          </button>
          <p className="mt-2 text-xs text-text-muted">
            No online checkout — we&rsquo;ll confirm exact pricing in your quote.
          </p>
        </div>
      </div>

      {quoteOpen && (
        <ProductQuoteModal
          onClose={() => setQuoteOpen(false)}
          productTitle={productTitle}
          productSlug={productSlug}
          tiers={tiers}
          setupCharge={setupCharge}
          colors={colors}
          sizes={sizes}
          decorations={decorations}
          minQuantity={minQuantity}
          initialSelection={{
            colorName,
            size,
            decoration,
            quantity: estimate?.quantity ?? quantity,
          }}
        />
      )}
    </div>
  );
}
