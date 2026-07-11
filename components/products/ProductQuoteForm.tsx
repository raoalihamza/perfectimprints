'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Turnstile } from '@/components/forms/Turnstile';
import {
  ACCEPT_ATTR,
  MAX_FILES,
  MAX_FILE_BYTES,
  formatBytes,
  validateFiles,
} from '@/components/forms/attachment-limits';
import {
  buildSelectionSummary,
  decorationUpchargeFor,
  estimateForQuantity,
  formatUsd,
  type DecorationOption,
  type QuoteTier,
} from '@/lib/products/quote-estimate';
import { usDateFromIso } from '@/lib/forms/form-def';

/**
 * The DEDICATED Get a Quote form for /products/<slug> (P2-CP configurator) —
 * used ONLY on product detail pages (the category-CTA / landing / contact /
 * blog / search-empty forms keep the shared LeadForm, untouched).
 *
 * Pre-filled + editable from the configurator selection: Quantity, Color,
 * Size, Decoration — editing the quantity here recalculates the SAME estimate
 * the panel shows (shared lib/products/quote-estimate helpers), and a
 * deterministic 1-line summary of the selection is displayed (not AI).
 * Entered from scratch: First Name* / Email* / Date Needed* + optional Last
 * Name, Phone, Company, Shipping Zip, Comments, artwork.
 *
 * ABUSE GUARD unchanged from P2-CP-002: the POST carries only the productSlug
 * + the selection + the entered fields — /api/leads resolves the recipient AND
 * the product title server-side from the productPage doc.
 */

export interface QuoteSelection {
  colorName: string | null;
  size: string | null;
  decoration: string | null;
  quantity: number;
}

interface ProductQuoteFormProps {
  productTitle: string;
  productSlug: string;
  tiers: QuoteTier[];
  setupCharge?: number;
  colors: string[];
  sizes: string[];
  /** Decoration methods + optional per-unit upcharges (feed the estimate). */
  decorations: DecorationOption[];
  /** Same minimum-order-quantity number the panel shows (computed by the page). */
  minQuantity: number;
  initialSelection: QuoteSelection;
  onSuccess?: () => void;
}

/** "Pad Print (+$0.50/unit)" when there's an upcharge, else just the method. */
function decorationLabel(option: DecorationOption): string {
  return option.upcharge > 0
    ? `${option.method} (+${formatUsd(option.upcharge)}/unit)`
    : option.method;
}

interface FieldErrors {
  firstName?: string;
  email?: string;
  dateNeeded?: string;
  files?: string;
  form?: string;
}

const inputClass =
  'block h-11 w-full rounded-md border border-border bg-white px-3.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20 aria-[invalid=true]:border-brand-red';
const selectClass =
  'block h-11 w-full rounded-md border border-border bg-white px-3 text-base text-text-primary focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20';
const textareaClass =
  'block w-full rounded-md border border-border bg-white px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20';
const labelClass = 'mb-1.5 block text-left text-sm font-semibold text-brand-ink';
const errorClass = 'mt-1 text-xs font-medium text-brand-red';

export function ProductQuoteForm({
  productTitle,
  productSlug,
  tiers,
  setupCharge,
  colors,
  sizes,
  decorations,
  minQuantity,
  initialSelection,
  onSuccess,
}: ProductQuoteFormProps) {
  const formId = useId();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<File[]>([]);
  const [resolvedSourceUrl, setResolvedSourceUrl] = useState(`/products/${productSlug}`);

  // The pre-filled selection — seeded from the configurator, editable here.
  const minQty = minQuantity;
  const [quantityText, setQuantityText] = useState(String(initialSelection.quantity));
  const [colorName, setColorName] = useState(initialSelection.colorName ?? '');
  const [size, setSize] = useState(initialSelection.size ?? '');
  const [decoration, setDecoration] = useState(initialSelection.decoration ?? '');

  const parsedQty = Number.parseInt(quantityText, 10);
  const quantity = Math.max(Number.isFinite(parsedQty) ? parsedQty : minQty, minQty);
  const decorationUpcharge = decorationUpchargeFor(decorations, decoration);
  const estimate = estimateForQuantity(tiers, quantity, setupCharge, decorationUpcharge);
  const summary = buildSelectionSummary({
    productTitle,
    colorName,
    size,
    quantity,
    decoration,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setResolvedSourceUrl(window.location.href);
    }
  }, []);

  function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const fileError = validateFiles(selected);
    if (fileError) {
      setErrors((prev) => ({ ...prev, files: fileError }));
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setErrors((prev) => ({ ...prev, files: undefined }));
    setFiles(selected);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) => ({ ...prev, files: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setErrors({});

    // Captures the named inputs, the honeypot, and the hidden
    // `cf-turnstile-response` token Cloudflare injects into the form.
    const formData = new FormData(event.currentTarget);
    const firstName = String(formData.get('firstName') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const dateNeeded = String(formData.get('dateNeeded') ?? '').trim();

    const nextErrors: FieldErrors = {};
    if (!firstName) nextErrors.firstName = 'Required';
    if (!email) nextErrors.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = 'Enter a valid email address';
    if (!dateNeeded) nextErrors.dateNeeded = 'Required';
    const fileError = validateFiles(files);
    if (fileError) nextErrors.files = fileError;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    // Selection + computed fields — the CLAMPED quantity is what gets quoted;
    // the estimate string is display-labeled, never a firm price. The selected
    // decoration is annotated with its per-unit upcharge so the lead email and
    // the leadSubmission record show both.
    formData.set('quantityNeeded', String(quantity));
    formData.set('estimatedTotal', estimate ? formatUsd(estimate.total) : '');
    formData.set(
      'selectedDecoration',
      decoration
        ? decorationUpcharge > 0
          ? `${decoration} (+${formatUsd(decorationUpcharge)}/unit)`
          : decoration
        : '',
    );
    formData.delete('attachments');
    for (const file of files) formData.append('attachments', file);
    formData.set('sourceUrl', resolvedSourceUrl);
    formData.set('website', honeypotRef.current?.value ?? '');
    // The native date input posts ISO (YYYY-MM-DD) — convert to US format so
    // the lead email + record read naturally.
    formData.set('dateNeeded', usDateFromIso(dateNeeded));

    setSubmitting(true);
    try {
      const res = await fetch('/api/leads', { method: 'POST', body: formData });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fields?: FieldErrors;
      };
      if (!res.ok) {
        setErrors({
          ...(data.fields ?? {}),
          form: data.error ?? 'Something went wrong. Please try again or call 800-773-9472.',
        });
        return;
      }
      setSuccess(true);
      onSuccess?.();
    } catch {
      setErrors({ form: 'Network error. Please try again or call 800-773-9472.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded border border-brand-green/40 bg-brand-green/10 p-6 text-brand-ink"
      >
        <h3 className="text-lg font-semibold">Quote request received!</h3>
        <p className="mt-2 text-sm text-text-primary">
          We sent a confirmation copy to your email, and someone on our team will follow up shortly
          with exact pricing for your {productTitle}. For anything urgent, call{' '}
          <strong>800-773-9472</strong>.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {/* Honeypot — humans never see or fill this. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={`${formId}-website`}>Website</label>
        <input
          ref={honeypotRef}
          id={`${formId}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* Product context — the slug ONLY; the server resolves the recipient
          and the product title from Sanity (no open relay, no spoofed title). */}
      <input type="hidden" name="productSlug" value={productSlug} />

      {/* Your configuration — pre-filled from the page, editable here. */}
      <div className="rounded border border-border bg-bg-soft px-4 py-3">
        <p className="text-sm font-semibold text-brand-ink">Your configuration</p>
        <p className="mt-1 text-sm text-text-primary">{summary}</p>
        {estimate && (
          <p className="mt-1 text-sm text-text-primary">
            {estimate.quantity.toLocaleString('en-US')} × {formatUsd(estimate.unitPrice)} each
            {estimate.decorationUpcharge > 0
              ? ` + ${formatUsd(estimate.decorationUpcharge)}/unit decoration`
              : ''}
            {estimate.setupCharge > 0 ? ` + ${formatUsd(estimate.setupCharge)} setup` : ''} ={' '}
            <strong>{formatUsd(estimate.total)}</strong>{' '}
            <span className="text-xs text-text-muted">
              estimated total - final pricing confirmed in your quote
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelClass} htmlFor={`${formId}-quantity`}>
            Quantity <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-quantity`}
            type="number"
            inputMode="numeric"
            min={minQty}
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)}
            onBlur={() => setQuantityText(String(quantity))}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-text-muted">
            Minimum order quantity: {minQty.toLocaleString('en-US')}
          </p>
        </div>
        {colors.length > 0 && (
          <div>
            <label className={labelClass} htmlFor={`${formId}-color`}>
              Color
            </label>
            {colors.length > 1 ? (
              <select
                id={`${formId}-color`}
                name="selectedColor"
                value={colorName}
                onChange={(e) => setColorName(e.target.value)}
                className={selectClass}
              >
                {colors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <p className="flex h-11 items-center text-base text-text-primary">{colors[0]}</p>
                <input type="hidden" name="selectedColor" value={colors[0]} />
              </>
            )}
          </div>
        )}
      </div>

      {(sizes.length > 0 || decorations.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {sizes.length > 0 && (
            <div>
              <label className={labelClass} htmlFor={`${formId}-size`}>
                Size
              </label>
              {sizes.length > 1 ? (
                <select
                  id={`${formId}-size`}
                  name="selectedSize"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className={selectClass}
                >
                  {sizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <p className="flex h-11 items-center text-base text-text-primary">{sizes[0]}</p>
                  <input type="hidden" name="selectedSize" value={sizes[0]} />
                </>
              )}
            </div>
          )}
          {decorations.length > 0 && (
            <div>
              <label className={labelClass} htmlFor={`${formId}-decoration`}>
                Decoration
              </label>
              {decorations.length > 1 ? (
                <select
                  id={`${formId}-decoration`}
                  name="selectedDecoration"
                  value={decoration}
                  onChange={(e) => setDecoration(e.target.value)}
                  className={selectClass}
                >
                  {decorations.map((d) => (
                    <option key={d.method} value={d.method}>
                      {decorationLabel(d)}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <p className="flex h-11 items-center text-base text-text-primary">
                    {decorationLabel(decorations[0])}
                  </p>
                  <input type="hidden" name="selectedDecoration" value={decorations[0].method} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelClass} htmlFor={`${formId}-firstName`}>
            First Name <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-firstName`}
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            className={inputClass}
            aria-invalid={!!errors.firstName}
          />
          {errors.firstName && <p className={errorClass}>{errors.firstName}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor={`${formId}-lastName`}>
            Last Name <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id={`${formId}-lastName`}
            name="lastName"
            type="text"
            autoComplete="family-name"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelClass} htmlFor={`${formId}-email`}>
            Email <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className={errorClass}>{errors.email}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor={`${formId}-phone`}>
            Phone <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id={`${formId}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelClass} htmlFor={`${formId}-company`}>
            Company <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id={`${formId}-company`}
            name="company"
            type="text"
            autoComplete="organization"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${formId}-dateNeeded`}>
            Date Needed <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-dateNeeded`}
            name="dateNeeded"
            type="date"
            required
            className={inputClass}
            aria-invalid={!!errors.dateNeeded}
          />
          {errors.dateNeeded && <p className={errorClass}>{errors.dateNeeded}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelClass} htmlFor={`${formId}-shippingZip`}>
            Shipping Zip <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id={`${formId}-shippingZip`}
            name="shippingZip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor={`${formId}-comments`}>
          Comments <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <textarea
          id={`${formId}-comments`}
          name="comments"
          rows={4}
          placeholder={`Imprint details, colors, or anything else about your ${productTitle} order`}
          className={textareaClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor={`${formId}-attachments`}>
          Attach a logo or artwork <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <input
          ref={fileInputRef}
          id={`${formId}-attachments`}
          name="attachments"
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          onChange={handleFilesChange}
          aria-invalid={!!errors.files}
          className="block w-full cursor-pointer rounded-md border border-border bg-white text-sm text-text-primary file:mr-3 file:cursor-pointer file:border-0 file:bg-bg-soft file:px-3.5 file:py-2.5 file:text-sm file:font-semibold file:text-brand-ink hover:file:bg-border/60 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
        />
        <p className="mt-1 text-xs text-text-muted">
          Up to {MAX_FILES} files (PDF, PNG, JPG, GIF, SVG, AI, EPS). Max{' '}
          {formatBytes(MAX_FILE_BYTES)} each.
        </p>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded border border-border bg-bg-soft px-2.5 py-1.5 text-xs text-text-primary"
              >
                <span className="truncate">
                  {file.name} <span className="text-text-muted">({formatBytes(file.size)})</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="shrink-0 font-semibold text-brand-red hover:underline"
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {errors.files && <p className={errorClass}>{errors.files}</p>}
      </div>

      <Turnstile />

      {errors.form && (
        <div
          role="alert"
          className="rounded border border-brand-red/40 bg-brand-red/5 px-3 py-2 text-sm text-brand-red"
        >
          {errors.form}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 w-full items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Request My Quote'}
        </button>
        <p className="mt-3 text-center text-xs text-text-muted">
          Takes less than 60 seconds. We&rsquo;ll reply with exact pricing — no obligation.
        </p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Modal shell — same a11y behavior as LeadFormModal (escape, focus, scroll
// lock, overlay click), with product-quote chrome. Loaded lazily (ssr:false)
// by ProductPurchasePanel, so none of this ships in the static page JS.
// ---------------------------------------------------------------------------

interface ProductQuoteModalProps extends Omit<ProductQuoteFormProps, 'onSuccess'> {
  onClose: () => void;
}

export function ProductQuoteModal({ onClose, ...formProps }: ProductQuoteModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-quote-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl outline-none sm:rounded-xl"
      >
        <div className="relative border-b border-border bg-white px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-soft hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h2
            id="product-quote-modal-title"
            className="px-10 text-center text-2xl font-bold leading-tight text-brand-ink sm:text-3xl"
          >
            Get a Quote
          </h2>
          <p className="mx-auto mt-2 max-w-xl px-10 text-center text-sm text-text-muted sm:text-base">
            Your configuration is filled in below - adjust anything, add your contact details, and
            we&rsquo;ll reply with exact pricing, usually within one business day.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-8 sm:py-8 [&::-webkit-scrollbar]:hidden">
          <ProductQuoteForm {...formProps} />
        </div>
      </div>
    </div>
  );
}
