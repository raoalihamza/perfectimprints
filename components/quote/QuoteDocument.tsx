import { Container } from '@/components/ui/Container';
import { ProductImage } from '@/components/category/ProductImage';
import { QuoteActions } from '@/components/quote/QuoteActions';
import { QuoteLineDescription } from '@/components/quote/QuoteLineDescription';
import { QuotePrintStyles } from '@/components/quote/QuotePrintStyles';
import { latestCustomerAction } from '@/lib/quotes/quote-response';
import { buildImageUrl } from '@/lib/sanity/client';
import { computeQuoteTotals, formatUsd } from '@/lib/quotes/quote-totals';
import {
  cleanText,
  formatQuoteDate,
  isQuoteChargeLine,
  isQuoteExpired,
  quoteLineTitle,
  shownAmount,
  shownQuantity,
} from '@/lib/quotes/quote-display';
import type { QuoteDoc, QuoteLineItem } from '@/lib/sanity/queries/quotes';

/**
 * The customer-facing quote (Q-140). A read-only document rendered from the
 * numbers STORED on the quote - nothing here reads a live price, and no total
 * is read from a stored field (there are none): every amount comes from the
 * shared lib/quotes/quote-totals.ts, the same module the Studio totals box and
 * the quote list preview use, so three surfaces cannot disagree.
 *
 * WHAT THE CUSTOMER SEES, AND WHAT IS DELIBERATELY WITHHELD
 *
 * Rendered: quoteNumber, quoteDate, expiryDate, customerCompany,
 * customerName, repName / repEmail / repPhone, and per line the display name,
 * image, decoration method, description, note, quantity, unit cost, setup,
 * shipping and that line's total, plus subtotal / shipping / salesTax /
 * grandTotal.
 *
 * Withheld on purpose:
 *   - `title` (Internal label) - the schema says outright it is never shown.
 *   - `sentAt` - internal workflow state, meaningless to the customer.
 *   - `_id` and the token itself - the token is already in the address bar;
 *     printing it as text invites it into a screenshot or a forwarded photo.
 *   - `customerEmail`, `customerPhone`, `customerAddress` - the recipient
 *     gains nothing from being shown their own contact details, and a
 *     forwarded link then leaks less. (Add the address later if Patrick wants
 *     a ship-to block; it is a business call, not a technical limit.)
 *   - A Geiger line's `sku` - a supplier item number lets the customer price
 *     shop the quote against the catalog; the display name is what Patrick
 *     chose to call the item. Patrick's call to reverse.
 *   - A link to `/products/<slug>` for own-product lines - the product page
 *     shows LIVE pricing, which would contradict the frozen quote price.
 *
 * Every field is treated as possibly absent: a missing image, description,
 * decoration, setup, shipping or tax renders as nothing at all, never as an
 * error and never as the word undefined.
 *
 * Q-150 added the customer's ACTIONS (accept / request a change / save a copy)
 * in place of the reply-by-email note that used to sit below the totals. They
 * live in the QuoteActions client island, but every value it draws is resolved
 * here and handed over as a prop, so this page is still fully rendered on the
 * server and the accept/change status is in the static HTML.
 */

interface LineImage {
  src: string;
  alt: string;
}

/**
 * A line's picture, preferring the SNAPSHOT stored on the quote and only then
 * the referenced product's own image (same precedence as the prices: what was
 * captured when the quote was built wins).
 */
function lineImage(line: QuoteLineItem, title: string): LineImage | null {
  if (line._type === 'quoteChargeLine') return null;

  if (line._type === 'quoteGeigerLine' || line._type === 'quoteOwnProductLine') {
    const snapshot = cleanText(line.imageUrl);
    if (snapshot) return { src: snapshot, alt: title };
  }
  if (line._type === 'quoteOwnProductLine') {
    const referenced = buildImageUrl(line.product?.image, (b) => b.width(240).fit('max'));
    if (referenced) return { src: referenced, alt: cleanText(line.product?.image?.alt) ?? title };
  }
  if (line._type === 'quoteCustomLine') {
    const own = buildImageUrl(line.image, (b) => b.width(240).fit('max'));
    if (own) return { src: own, alt: cleanText(line.image?.alt) ?? title };
  }
  return null;
}

/** One label/amount row in a line's money column. */
function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:justify-end">
      <dt className="text-sm text-text-muted sm:w-28 sm:text-right">{label}</dt>
      <dd className="text-sm tabular-nums text-text-primary sm:w-24 sm:text-right">{value}</dd>
    </div>
  );
}

function QuoteLineRow({ line, total }: { line: QuoteLineItem; total: number }) {
  const title = quoteLineTitle(line);
  const image = lineImage(line, title);
  const isCharge = isQuoteChargeLine(line);

  const quantity = shownQuantity((line as { quantity?: number | null }).quantity);
  const unit = isCharge
    ? shownAmount((line as { unitPrice?: number | null }).unitPrice)
    : shownAmount((line as { unitCost?: number | null }).unitCost);
  // A charge line has no setup and no shipping at all - not a blank column,
  // no column. Product lines drop a zero setup or shipping for the same
  // reason: an empty row reads as information that went missing.
  const setup = isCharge ? null : shownAmount((line as { setupCharge?: number | null }).setupCharge);
  const shipping = isCharge ? null : shownAmount((line as { shipping?: number | null }).shipping);

  const decoration = isCharge ? null : cleanText((line as { decorationMethod?: unknown }).decorationMethod);
  const description = isCharge ? null : cleanText((line as { description?: unknown }).description);
  const note = cleanText((line as { note?: unknown }).note);

  return (
    <li className="quote-line quote-surface border-b border-border px-4 py-5 last:border-b-0 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {image ? (
          <div className="shrink-0">
            <ProductImage
              src={image.src}
              alt={image.alt}
              width={96}
              height={96}
              sizes="96px"
              className="h-24 w-24 rounded border border-border bg-white object-contain p-1"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-brand-ink">{title}</h3>
          {decoration ? (
            <p className="mt-1 text-sm text-text-primary">
              <span className="font-semibold text-brand-ink">Decoration:</span> {decoration}
            </p>
          ) : null}
          <QuoteLineDescription description={description} />
          {note ? (
            <p className="mt-2 whitespace-pre-line rounded border-l-2 border-border pl-3 text-sm text-text-primary">
              {note}
            </p>
          ) : null}
        </div>

        {/* Amounts: a stacked label/value list on a phone, a right-aligned
            column on a wider screen. Never a table that scrolls sideways. */}
        <dl className="shrink-0 space-y-1 border-t border-border pt-3 sm:min-w-[13rem] sm:border-t-0 sm:pt-0">
          {quantity !== null ? (
            <AmountRow label="Quantity" value={quantity.toLocaleString('en-US')} />
          ) : null}
          {unit !== null ? (
            <AmountRow label={isCharge ? 'Price each' : 'Unit price'} value={formatUsd(unit)} />
          ) : null}
          {setup !== null ? <AmountRow label="Setup" value={formatUsd(setup)} /> : null}
          {shipping !== null ? <AmountRow label="Shipping" value={formatUsd(shipping)} /> : null}
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-1 sm:justify-end">
            <dt className="text-sm font-semibold text-brand-ink sm:w-28 sm:text-right">
              Line total
            </dt>
            <dd className="text-base font-bold tabular-nums text-brand-ink sm:w-24 sm:text-right">
              {formatUsd(total)}
            </dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

function TotalsRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? 'flex items-baseline justify-between gap-6 border-t-2 border-brand-ink pt-3'
          : 'flex items-baseline justify-between gap-6'
      }
    >
      <dt className={strong ? 'text-base font-bold text-brand-ink' : 'text-sm text-text-muted'}>
        {label}
      </dt>
      <dd
        className={
          strong
            ? 'text-xl font-bold tabular-nums text-brand-ink'
            : 'text-sm tabular-nums text-text-primary'
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function QuoteDocument({ quote, now }: { quote: QuoteDoc; now: Date }) {
  const lines = Array.isArray(quote.lineItems) ? quote.lineItems : [];
  const totals = computeQuoteTotals(lines, quote.salesTax);

  const quoteNumber = cleanText(quote.quoteNumber);
  const quoteDate = formatQuoteDate(quote.quoteDate);
  const expiryDate = formatQuoteDate(quote.expiryDate);
  const expired = isQuoteExpired(quote.expiryDate, now);

  const company = cleanText(quote.customer?.company);
  const contactName = cleanText(quote.customer?.name);
  const repName = cleanText(quote.rep?.name);
  const repEmail = cleanText(quote.rep?.email);
  const repPhone = cleanText(quote.rep?.phone);

  // The customer's most recent deliberate action (Q-150), resolved here so the
  // status line is part of the STATIC HTML: a returning visitor sees what they
  // already did without waiting for any client-side fetch. Views are excluded
  // by the projection - "you opened this page" is not worth telling anyone.
  const latestAction = latestCustomerAction(quote.responses);

  return (
    <>
      <QuotePrintStyles />
      <Container as="section" className="py-8">
        <article id="quote-document" className="mx-auto max-w-4xl">
          {/* ---- Header: who this is from, and which quote it is ---- */}
          <header className="quote-header quote-surface rounded-lg border border-border p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.svg"
                  alt="Perfect Imprints"
                  width={180}
                  height={48}
                  className="h-10 w-auto"
                />
                <p className="mt-3 text-sm text-text-muted">
                  Custom promotional products and branded apparel
                </p>
              </div>

              <div className="sm:text-right">
                <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                  Quotation
                </p>
                {quoteNumber ? (
                  <p className="text-2xl font-bold leading-tight text-brand-ink">{quoteNumber}</p>
                ) : null}
                <dl className="mt-2 space-y-0.5 text-sm text-text-primary">
                  {quoteDate ? (
                    <div className="flex gap-2 sm:justify-end">
                      <dt className="text-text-muted">Quote date:</dt>
                      <dd>{quoteDate}</dd>
                    </div>
                  ) : null}
                  {expiryDate ? (
                    <div className="flex gap-2 sm:justify-end">
                      <dt className="text-text-muted">{expired ? 'Expired:' : 'Valid until:'}</dt>
                      <dd className="font-semibold text-brand-ink">{expiryDate}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
          </header>

          {/* ---- Expired: say so plainly, keep the prices on the page ---- */}
          {expired ? (
            <div className="quote-surface mt-5 rounded-lg border border-brand-red/40 bg-brand-red/5 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-brand-ink">
                This quote has passed its expiry date
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-primary">
                The pricing below was valid until {expiryDate}. It may still be available, and we
                are happy to refresh it for you.{' '}
                {repName ? `Just get in touch with ${repName} and we will send an updated quote.` : 'Just get in touch and we will send an updated quote.'}
              </p>
            </div>
          ) : null}

          {/* ---- Who it is for, and who to reply to ---- */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="quote-surface rounded-lg border border-border p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Prepared for
              </h2>
              {company ? (
                <p className="mt-1 text-base font-semibold text-brand-ink">{company}</p>
              ) : null}
              {contactName ? (
                <p className="text-sm text-text-primary">{contactName}</p>
              ) : null}
              {!company && !contactName ? (
                <p className="mt-1 text-sm text-text-muted">Your custom quotation</p>
              ) : null}
            </div>

            <div className="quote-surface rounded-lg border border-border p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Your Perfect Imprints contact
              </h2>
              {repName ? (
                <p className="mt-1 text-base font-semibold text-brand-ink">{repName}</p>
              ) : null}
              {repEmail ? (
                <p className="text-sm">
                  <a
                    href={`mailto:${repEmail}`}
                    className="text-brand-red underline hover:no-underline"
                  >
                    {repEmail}
                  </a>
                </p>
              ) : null}
              {repPhone ? (
                <p className="text-sm">
                  <a href={`tel:${repPhone}`} className="text-brand-red underline hover:no-underline">
                    {repPhone}
                  </a>
                </p>
              ) : null}
              {/* A quote whose rep block was cleared must not show a bare
                  heading over an empty box. */}
              {!repName && !repEmail && !repPhone ? (
                <p className="mt-1 text-sm text-text-muted">
                  Reply to the email this quote came from and we will pick it up.
                </p>
              ) : null}
            </div>
          </div>

          {/* ---- The line items ---- */}
          <h2 className="mt-8 text-lg font-bold text-brand-ink">Your quote</h2>
          {lines.length > 0 ? (
            <ul className="quote-surface mt-2 rounded-lg border border-border">
              {lines.map((line, index) => (
                <QuoteLineRow
                  key={line._key ?? `line-${index}`}
                  line={line}
                  total={totals.lineTotals[index] ?? 0}
                />
              ))}
            </ul>
          ) : (
            <div className="quote-surface mt-2 rounded-lg border border-border p-6 text-center">
              <p className="text-sm text-text-primary">
                No items have been added to this quote yet.
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {repName
                  ? `${repName} is still putting it together - it will appear here shortly.`
                  : 'We are still putting it together - it will appear here shortly.'}
              </p>
            </div>
          )}

          {/* ---- Totals: computed here, never stored on the quote ---- */}
          {lines.length > 0 ? (
            <div className="mt-5 flex justify-end">
              <dl className="quote-totals quote-surface w-full space-y-2 rounded-lg border border-border p-5 sm:max-w-sm">
                <TotalsRow label="Subtotal" value={formatUsd(totals.subtotal)} />
                {totals.shippingTotal > 0 ? (
                  <TotalsRow label="Shipping" value={formatUsd(totals.shippingTotal)} />
                ) : null}
                {totals.salesTax > 0 ? (
                  <TotalsRow label="Sales tax" value={formatUsd(totals.salesTax)} />
                ) : null}
                <TotalsRow label="Total" value={formatUsd(totals.grandTotal)} strong />
              </dl>
            </div>
          ) : null}

          {/* ---- What the customer can DO (Q-150) ----
                  A client island, but every value it renders is computed HERE
                  and passed as a prop, so the page stays statically generated
                  and the first client render matches the server's. See the
                  staticness note in components/quote/QuoteActions.tsx. */}
          <QuoteActions
            token={quote.token ?? ''}
            expired={expired}
            repEmail={repEmail}
            repPhone={repPhone}
            quoteNumber={quoteNumber}
            previousAction={
              latestAction
                ? {
                    kind: latestAction.kind,
                    when: formatQuoteDate(latestAction.createdAt) || null,
                  }
                : null
            }
          />

          {/* ---- Footer note ---- */}
          <footer className="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-text-muted">
            <p>
              This is a quotation, not an invoice. Nothing is ordered and nothing is charged until
              you approve it.
              {expiryDate && !expired ? ` Pricing shown holds until ${expiryDate}.` : ''}
            </p>
            <p className="mt-2">
              Prices are in US dollars and cover the items and quantities shown. Freight, taxes and
              artwork changes can affect the final invoice, and we will confirm anything that moves
              before you approve.
            </p>
          </footer>
        </article>
      </Container>
    </>
  );
}
