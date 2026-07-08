'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Turnstile } from './Turnstile';

/** Optional logo / artwork attachments. Kept in sync with the server-side
 *  limits in app/api/leads/route.ts — change both together. */
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // ~20MB total (under Gmail's 25MB ceiling)
const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ai', '.eps'];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Validates the selected attachments. Returns an error string, or null when OK. */
function validateFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files.`;
  let total = 0;
  for (const file of files) {
    const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `${file.name}: unsupported file type. Allowed: ${ACCEPTED_EXTENSIONS.join(', ')}.`;
    }
    if (file.size > MAX_FILE_BYTES) {
      return `${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`;
    }
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return `Total attachment size exceeds ${formatBytes(MAX_TOTAL_BYTES)}.`;
  }
  return null;
}

interface LeadFormProps {
  /** Optional category title used to pre-fill the "looking for" field. */
  categoryTitle?: string;
  /** Optional fallback source URL; client also captures window.location.href. */
  sourceUrl?: string;
  /**
   * Landing-page context (P2-AI-005 part 2). When set, the slug is POSTed with
   * the submission and /api/leads resolves that page's stored `leadRecipient`
   * SERVER-SIDE (and sends the customer a confirmation email). Only the slug
   * ever leaves the client — never a recipient address.
   */
  landingSlug?: string;
  /**
   * Form variant (P2-CP-002). `productQuote` is the Get a Quote form on
   * /products/<slug>: adds required Company + optional Shipping Zip and
   * Comments, drops the "looking for" textarea (the product IS the subject),
   * and relabels the submit button. The default variant renders exactly the
   * pre-existing form — every quote-only change is gated on this flag.
   */
  variant?: 'default' | 'productQuote';
  /**
   * Product-quote context: the /products/<slug> slug, POSTed as a hidden
   * field. /api/leads resolves that product's stored `leadRecipient` AND its
   * title SERVER-SIDE — only the slug ever leaves the client.
   */
  productSlug?: string;
  /** Display-only product name for the quote variant's helper copy. */
  productTitle?: string;
  /** Callback fired after a successful submission. */
  onSuccess?: () => void;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  lookingFor?: string;
  quantityNeeded?: string;
  dateNeeded?: string;
  files?: string;
  form?: string;
}

const inputClass =
  'block h-11 w-full rounded-md border border-border bg-white px-3.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20 aria-[invalid=true]:border-brand-red';
const textareaClass =
  'block w-full rounded-md border border-border bg-white px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20 aria-[invalid=true]:border-brand-red';
const labelClass = 'mb-1.5 block text-left text-sm font-semibold text-brand-ink';
const errorClass = 'mt-1 text-xs font-medium text-brand-red';

export function LeadForm({
  categoryTitle,
  sourceUrl,
  landingSlug,
  variant = 'default',
  productSlug,
  productTitle,
  onSuccess,
}: LeadFormProps) {
  const isQuote = variant === 'productQuote';
  const formId = useId();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<File[]>([]);
  const [resolvedSourceUrl, setResolvedSourceUrl] = useState(sourceUrl ?? '');

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

  const cleanCategory = categoryTitle
    ?.replace(/^(custom|promotional|branded|personalized)\s+/i, '')
    .trim();
  const lookingForPlaceholder = cleanCategory
    ? `e.g. Custom ${cleanCategory} with our logo for an upcoming trade show`
    : 'Describe the products, branding, and any specs you have in mind';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setResolvedSourceUrl(window.location.href);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setErrors({});

    // FormData built from the form captures the text fields, the honeypot, and
    // the hidden `cf-turnstile-response` token Cloudflare injects into the form.
    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: String(formData.get('firstName') ?? ''),
      lastName: String(formData.get('lastName') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      company: String(formData.get('company') ?? ''),
      lookingFor: String(formData.get('lookingFor') ?? ''),
      quantityNeeded: String(formData.get('quantityNeeded') ?? ''),
      dateNeeded: String(formData.get('dateNeeded') ?? ''),
      website: honeypotRef.current?.value ?? '',
    };

    const nextErrors: FieldErrors = {};
    if (!payload.firstName.trim()) nextErrors.firstName = 'Required';
    if (!payload.lastName.trim()) nextErrors.lastName = 'Required';
    if (!payload.email.trim()) nextErrors.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()))
      nextErrors.email = 'Enter a valid email address';
    if (!payload.phone.trim()) nextErrors.phone = 'Required';
    // The quote variant requires Company and has no "looking for" textarea;
    // every other variant keeps the original requirements.
    if (isQuote && !payload.company.trim()) nextErrors.company = 'Required';
    if (!isQuote && !payload.lookingFor.trim()) nextErrors.lookingFor = 'Required';
    if (!payload.quantityNeeded.trim()) nextErrors.quantityNeeded = 'Required';
    if (!payload.dateNeeded.trim()) nextErrors.dateNeeded = 'Required';
    const fileError = validateFiles(files);
    if (fileError) nextErrors.files = fileError;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    // Re-attach the validated files from state (the live file input may have
    // been cleared by remove actions) and set the resolved source URL.
    formData.delete('attachments');
    for (const file of files) formData.append('attachments', file);
    formData.set('sourceUrl', resolvedSourceUrl);

    setSubmitting(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        body: formData,
      });
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
      setErrors({
        form: 'Network error. Please try again or call 800-773-9472.',
      });
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
        <h3 className="text-lg font-semibold">
          {isQuote ? 'Quote request received!' : 'Thanks, we’ll be in touch.'}
        </h3>
        <p className="mt-2 text-sm text-text-primary">
          {isQuote
            ? 'We sent a confirmation copy to your email, and someone on our team will follow up shortly with exact pricing. For anything urgent, call '
            : 'Patrick or someone on our team will reach out shortly with product ideas tailored to your request. For anything urgent, call '}
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

      {/* Landing-page context — the slug only (the server maps it to that
          page's stored recipient; no email address is ever sent from here). */}
      {landingSlug && <input type="hidden" name="landingSlug" value={landingSlug} />}

      {/* Product-quote context (P2-CP-002) — likewise the slug ONLY: the
          server resolves the recipient AND the product title from Sanity. */}
      {isQuote && productSlug && <input type="hidden" name="productSlug" value={productSlug} />}

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
            Last Name <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-lastName`}
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            className={inputClass}
            aria-invalid={!!errors.lastName}
          />
          {errors.lastName && <p className={errorClass}>{errors.lastName}</p>}
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
            Phone <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            className={inputClass}
            aria-invalid={!!errors.phone}
          />
          {errors.phone && <p className={errorClass}>{errors.phone}</p>}
        </div>
      </div>

      {/* Quote variant: required Company + optional Shipping Zip. */}
      {isQuote && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <div>
            <label className={labelClass} htmlFor={`${formId}-company`}>
              Company <span className="text-brand-red">*</span>
            </label>
            <input
              id={`${formId}-company`}
              name="company"
              type="text"
              autoComplete="organization"
              required
              className={inputClass}
              aria-invalid={!!errors.company}
            />
            {errors.company && <p className={errorClass}>{errors.company}</p>}
          </div>
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
      )}

      {/* The quote variant has no "looking for" textarea — the product being
          quoted is the subject; specifics go in Comments below. */}
      {!isQuote && (
        <div>
          <label className={labelClass} htmlFor={`${formId}-lookingFor`}>
            Tell Us Specifically What You&rsquo;re Looking For{' '}
            <span className="text-brand-red">*</span>
          </label>
          <textarea
            id={`${formId}-lookingFor`}
            name="lookingFor"
            rows={4}
            required
            placeholder={lookingForPlaceholder}
            className={textareaClass}
            aria-invalid={!!errors.lookingFor}
          />
          {errors.lookingFor && <p className={errorClass}>{errors.lookingFor}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelClass} htmlFor={`${formId}-quantityNeeded`}>
            Quantity Needed <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-quantityNeeded`}
            name="quantityNeeded"
            type="text"
            inputMode="numeric"
            placeholder="500 or 100-200"
            required
            className={inputClass}
            aria-invalid={!!errors.quantityNeeded}
          />
          {errors.quantityNeeded && <p className={errorClass}>{errors.quantityNeeded}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor={`${formId}-dateNeeded`}>
            Date Needed <span className="text-brand-red">*</span>
          </label>
          <input
            id={`${formId}-dateNeeded`}
            name="dateNeeded"
            type="text"
            placeholder="MM/DD/YYYY or 'next month'"
            required
            className={inputClass}
            aria-invalid={!!errors.dateNeeded}
          />
          {errors.dateNeeded && <p className={errorClass}>{errors.dateNeeded}</p>}
        </div>
      </div>

      {/* Quote variant: free-form comments (imprint details, colors, deadline notes…). */}
      {isQuote && (
        <div>
          <label className={labelClass} htmlFor={`${formId}-comments`}>
            Comments <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <textarea
            id={`${formId}-comments`}
            name="comments"
            rows={4}
            placeholder={
              productTitle
                ? `Imprint details, colors, sizes, or anything else about your ${productTitle} order`
                : 'Imprint details, colors, sizes, or anything else about your order'
            }
            className={textareaClass}
          />
        </div>
      )}

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
                  {file.name}{' '}
                  <span className="text-text-muted">({formatBytes(file.size)})</span>
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
          {submitting ? 'Sending…' : isQuote ? 'Request My Quote' : 'Find Products for Me'}
        </button>
        <p className="mt-3 text-center text-xs text-text-muted">
          {isQuote
            ? 'Takes less than 60 seconds. We’ll reply with exact pricing — no obligation.'
            : 'Takes less than 60 seconds. No pressure, just helpful product ideas sent your way fast!'}
        </p>
      </div>
    </form>
  );
}
