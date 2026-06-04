'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface LeadFormProps {
  /** Optional category title used to pre-fill the "looking for" field. */
  categoryTitle?: string;
  /** Optional fallback source URL; client also captures window.location.href. */
  sourceUrl?: string;
  /** Callback fired after a successful submission. */
  onSuccess?: () => void;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  lookingFor?: string;
  quantityNeeded?: string;
  dateNeeded?: string;
  form?: string;
}

const inputClass =
  'block h-11 w-full rounded-md border border-border bg-white px-3.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20 aria-[invalid=true]:border-brand-red';
const textareaClass =
  'block w-full rounded-md border border-border bg-white px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20 aria-[invalid=true]:border-brand-red';
const labelClass = 'mb-1.5 block text-left text-sm font-semibold text-brand-ink';
const errorClass = 'mt-1 text-xs font-medium text-brand-red';

export function LeadForm({ categoryTitle, sourceUrl, onSuccess }: LeadFormProps) {
  const formId = useId();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [resolvedSourceUrl, setResolvedSourceUrl] = useState(sourceUrl ?? '');

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

    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: String(formData.get('firstName') ?? ''),
      lastName: String(formData.get('lastName') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      lookingFor: String(formData.get('lookingFor') ?? ''),
      quantityNeeded: String(formData.get('quantityNeeded') ?? ''),
      dateNeeded: String(formData.get('dateNeeded') ?? ''),
      sourceUrl: resolvedSourceUrl,
      website: honeypotRef.current?.value ?? '',
    };

    const nextErrors: FieldErrors = {};
    if (!payload.firstName.trim()) nextErrors.firstName = 'Required';
    if (!payload.lastName.trim()) nextErrors.lastName = 'Required';
    if (!payload.email.trim()) nextErrors.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()))
      nextErrors.email = 'Enter a valid email address';
    if (!payload.phone.trim()) nextErrors.phone = 'Required';
    if (!payload.lookingFor.trim()) nextErrors.lookingFor = 'Required';
    if (!payload.quantityNeeded.trim()) nextErrors.quantityNeeded = 'Required';
    if (!payload.dateNeeded.trim()) nextErrors.dateNeeded = 'Required';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
        <h3 className="text-lg font-semibold">Thanks, we&rsquo;ll be in touch.</h3>
        <p className="mt-2 text-sm text-text-primary">
          Patrick or someone on our team will reach out shortly with product ideas tailored to your
          request. For anything urgent, call <strong>800-773-9472</strong>.
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
          {submitting ? 'Sending…' : 'Find Products for Me'}
        </button>
        <p className="mt-3 text-center text-xs text-text-muted">
          Takes less than 60 seconds. No pressure, just helpful product ideas sent your way fast!
        </p>
      </div>
    </form>
  );
}
