'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Turnstile } from './Turnstile';
import {
  ACCEPT_ATTR,
  MAX_FILES,
  MAX_FILE_BYTES,
  formatBytes,
  validateFiles,
} from './attachment-limits';
import {
  DEFAULT_SUBMIT_LABEL,
  DEFAULT_SUCCESS_MESSAGE,
  fieldName,
  usDateFromIso,
  validateAnswers,
  type AnswerValue,
  type FormDef,
  type FormFieldDef,
} from '@/lib/forms/form-def';

/**
 * Renders ANY form built with the Studio form builder (P2-FB-001). Fully
 * generic — no hardcoded field set; the definition (fields, labels, options,
 * required flags, button label, success message) arrives resolved from the
 * server. Submits multipart/form-data to /api/leads with ONLY the form slug +
 * the answers (never a recipient — that is resolved server-side from the
 * slug). Shares the LeadForm spam stack: Turnstile, honeypot, and the shared
 * attachment limits.
 *
 * Static-safety: client island with no useSearchParams/URL reads in the render
 * path (sourceUrl is captured post-mount), so embedding pages stay static.
 */

interface FormRendererProps {
  form: FormDef;
  /** Optional fallback source URL; the client also captures window.location.href. */
  sourceUrl?: string;
  /**
   * Extra hidden values posted with the submission (P2-CAT-002 — e.g.
   * `{catalogSlug}` from the catalog landing CTAs). Context only, never
   * routing: /api/leads validates each value server-side and the recipient is
   * always resolved from the form doc. Set BEFORE formSlug/sourceUrl so a
   * hidden field can never override those.
   */
  hiddenFields?: Record<string, string>;
  onSuccess?: () => void;
}

const inputClass =
  'block h-11 w-full rounded-md border border-border bg-white px-3.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20 aria-[invalid=true]:border-brand-red';
const textareaClass =
  'block w-full rounded-md border border-border bg-white px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20 aria-[invalid=true]:border-brand-red';
const labelClass = 'mb-1.5 block text-left text-sm font-semibold text-brand-ink';
const errorClass = 'mt-1 text-xs font-medium text-brand-red';
const checkboxClass =
  'h-4 w-4 shrink-0 rounded border-border text-brand-green accent-brand-green focus:ring-2 focus:ring-brand-green/40';

/** Text-like input types rendered with a single-line <input>. */
const INPUT_TYPE_ATTR: Partial<Record<FormFieldDef['fieldType'], string>> = {
  shortText: 'text',
  email: 'email',
  phone: 'tel',
  number: 'text', // text + numeric inputMode so ranges like "100-200" still type
  date: 'date',
};

/**
 * Group the definition-ordered fields into layout rows by the EDITOR-set
 * `width` (never guessed from field type — Sanity can send any number of
 * fields in any order, so only an explicit choice lays out predictably):
 * two consecutive `half` fields share a desktop row; everything else —
 * including a lone `half` with no partner — takes the full width. Mobile is
 * always single column. Indexes are preserved — fieldName() depends on them.
 */
function groupFieldRows(fields: FormFieldDef[]): Array<Array<{ field: FormFieldDef; index: number }>> {
  const rows: Array<Array<{ field: FormFieldDef; index: number }>> = [];
  fields.forEach((field, index) => {
    const last = rows[rows.length - 1];
    if (
      field.width === 'half' &&
      last &&
      last.length === 1 &&
      last[0].field.width === 'half'
    ) {
      last.push({ field, index });
      return;
    }
    rows.push([{ field, index }]);
  });
  return rows;
}

function RequiredMark({ required }: { required?: boolean }) {
  if (!required) return null;
  return <span className="text-brand-red"> *</span>;
}

export function FormRenderer({ form, sourceUrl, hiddenFields, onSuccess }: FormRendererProps) {
  const formId = useId();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Per-fileUpload-field selections, keyed by generated field name.
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [resolvedSourceUrl, setResolvedSourceUrl] = useState(sourceUrl ?? '');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setResolvedSourceUrl(window.location.href);
    }
  }, []);

  function handleFilesChange(name: string, event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const allSelected = Object.entries(files)
      .filter(([key]) => key !== name)
      .flatMap(([, list]) => list)
      .concat(selected);
    const fileError = validateFiles(allSelected);
    if (fileError) {
      setErrors((prev) => ({ ...prev, [name]: fileError }));
      setFiles((prev) => ({ ...prev, [name]: [] }));
      event.target.value = '';
      return;
    }
    setErrors((prev) => ({ ...prev, [name]: '' }));
    setFiles((prev) => ({ ...prev, [name]: selected }));
  }

  function removeFile(name: string, index: number) {
    setFiles((prev) => ({ ...prev, [name]: (prev[name] ?? []).filter((_, i) => i !== index) }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setErrors({});

    // FormData from the form element captures every named input, the honeypot,
    // and the hidden `cf-turnstile-response` token Cloudflare injects.
    const formData = new FormData(event.currentTarget);

    // Normalize per-field answers for validation + submission.
    const answers: Record<string, AnswerValue> = {};
    const fileCounts: Record<string, number> = {};
    form.fields.forEach((field, index) => {
      const name = fieldName(field, index);
      if (field.fieldType === 'fileUpload') {
        // Re-attach the validated files from state (the live input may have
        // been cleared by remove actions).
        formData.delete(name);
        const selected = files[name] ?? [];
        for (const file of selected) formData.append(name, file);
        fileCounts[name] = selected.length;
        return;
      }
      if (field.fieldType === 'checkbox') {
        // A yes/no checkbox always submits an explicit answer.
        const checked = formData.get(name) != null;
        formData.set(name, checked ? 'Yes' : 'No');
        answers[name] = checked ? 'Yes' : 'No';
        return;
      }
      if (field.fieldType === 'checkboxGroup') {
        answers[name] = formData
          .getAll(name)
          .filter((v): v is string => typeof v === 'string')
          .filter(Boolean);
        return;
      }
      if (field.fieldType === 'date') {
        // The native date input posts ISO (YYYY-MM-DD) — convert to US format
        // so the lead email + record read naturally.
        const formatted = usDateFromIso(String(formData.get(name) ?? ''));
        formData.set(name, formatted);
        answers[name] = formatted;
        return;
      }
      answers[name] = String(formData.get(name) ?? '');
    });

    // Client-side validation mirrors the server (same pure validateAnswers
    // over the same definition) — the server re-runs it regardless.
    const nextErrors = validateAnswers(form, answers, fileCounts);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    for (const [key, value] of Object.entries(hiddenFields ?? {})) {
      if (value) formData.set(key, value);
    }
    formData.set('formSlug', form.slug);
    formData.set('sourceUrl', resolvedSourceUrl);

    setSubmitting(true);
    try {
      const res = await fetch('/api/leads', { method: 'POST', body: formData });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
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
        <h3 className="text-lg font-semibold">Request received</h3>
        <p className="mt-2 text-sm text-text-primary">
          {form.successMessage?.trim() || DEFAULT_SUCCESS_MESSAGE}
        </p>
      </div>
    );
  }

  function renderField(field: FormFieldDef, index: number) {
    const name = fieldName(field, index);
    const id = `${formId}-${name}`;
    const error = errors[name];
    const options = (field.options ?? []).filter(Boolean);

    if (field.fieldType === 'longText') {
      return (
        <div key={field._key}>
          <label className={labelClass} htmlFor={id}>
            {field.label}
            <RequiredMark required={field.required} />
          </label>
          <textarea
            id={id}
            name={name}
            rows={4}
            placeholder={field.placeholder || undefined}
            className={textareaClass}
            aria-invalid={!!error}
          />
          {error && <p className={errorClass}>{error}</p>}
        </div>
      );
    }

    if (field.fieldType === 'dropdown') {
      return (
        <div key={field._key}>
          <label className={labelClass} htmlFor={id}>
            {field.label}
            <RequiredMark required={field.required} />
          </label>
          <select
            id={id}
            name={name}
            defaultValue=""
            className={inputClass}
            aria-invalid={!!error}
          >
            <option value="" disabled={!!field.required}>
              {field.placeholder || 'Select…'}
            </option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {error && <p className={errorClass}>{error}</p>}
        </div>
      );
    }

    if (field.fieldType === 'checkbox') {
      return (
        <div key={field._key}>
          <label className="flex items-start gap-2.5 text-left text-sm font-semibold text-brand-ink">
            <input
              type="checkbox"
              name={name}
              value="Yes"
              className={`${checkboxClass} mt-0.5`}
              aria-invalid={!!error}
            />
            <span>
              {field.label}
              <RequiredMark required={field.required} />
            </span>
          </label>
          {error && <p className={errorClass}>{error}</p>}
        </div>
      );
    }

    if (field.fieldType === 'checkboxGroup') {
      return (
        <fieldset key={field._key}>
          <legend className={labelClass}>
            {field.label}
            <RequiredMark required={field.required} />
          </legend>
          <div className="space-y-2">
            {options.map((option) => (
              <label
                key={option}
                className="flex items-start gap-2.5 text-left text-sm text-text-primary"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  className={`${checkboxClass} mt-0.5`}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          {error && <p className={errorClass}>{error}</p>}
        </fieldset>
      );
    }

    if (field.fieldType === 'fileUpload') {
      const selected = files[name] ?? [];
      return (
        <div key={field._key}>
          <label className={labelClass} htmlFor={id}>
            {field.label}
            <RequiredMark required={field.required} />
            {!field.required && <span className="font-normal text-text-muted"> (optional)</span>}
          </label>
          <input
            id={id}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={(e) => handleFilesChange(name, e)}
            aria-invalid={!!error}
            className="block w-full cursor-pointer rounded-md border border-border bg-white text-sm text-text-primary file:mr-3 file:cursor-pointer file:border-0 file:bg-bg-soft file:px-3.5 file:py-2.5 file:text-sm file:font-semibold file:text-brand-ink hover:file:bg-border/60 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
          />
          <p className="mt-1 text-xs text-text-muted">
            Up to {MAX_FILES} files (PDF, PNG, JPG, GIF, SVG, AI, EPS). Max{' '}
            {formatBytes(MAX_FILE_BYTES)} each.
          </p>
          {selected.length > 0 && (
            <ul className="mt-2 space-y-1">
              {selected.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-bg-soft px-2.5 py-1.5 text-xs text-text-primary"
                >
                  <span className="truncate">
                    {file.name} <span className="text-text-muted">({formatBytes(file.size)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(name, i)}
                    className="shrink-0 font-semibold text-brand-red hover:underline"
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className={errorClass}>{error}</p>}
        </div>
      );
    }

    // shortText / email / phone / number / date — single-line inputs.
    return (
      <div key={field._key}>
        <label className={labelClass} htmlFor={id}>
          {field.label}
          <RequiredMark required={field.required} />
        </label>
        <input
          id={id}
          name={name}
          type={INPUT_TYPE_ATTR[field.fieldType] ?? 'text'}
          inputMode={field.fieldType === 'number' ? 'numeric' : undefined}
          autoComplete={
            field.fieldType === 'email' ? 'email' : field.fieldType === 'phone' ? 'tel' : undefined
          }
          placeholder={field.placeholder || undefined}
          className={inputClass}
          aria-invalid={!!error}
        />
        {error && <p className={errorClass}>{error}</p>}
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

      {form.intro?.trim() && <p className="text-sm text-text-muted">{form.intro}</p>}

      {/* Two consecutive Half-width fields (editor-set in Studio) share a
          desktop row; everything else — including an unpaired Half — takes
          the full width. Each paired cell bottom-aligns its input so a
          longer, wrapping label in one cell doesn't push the inputs out of
          line with each other. */}
      {groupFieldRows(form.fields).map((row) =>
        row.length === 2 ? (
          <div key={row[0].field._key} className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {row.map(({ field, index }) => (
              <div key={field._key} className="flex flex-col justify-end">
                {renderField(field, index)}
              </div>
            ))}
          </div>
        ) : (
          renderField(row[0].field, row[0].index)
        ),
      )}

      {/* Wrapped in a plain flex row so the ~300px Cloudflare widget pins to
          the LEFT edge of the form (it was rendering centered inside the wide
          modal), matching the LeadForm / ProductQuoteForm placement. */}
      <div className="flex justify-start">
        <Turnstile />
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
          {submitting ? 'Sending…' : form.submitButtonLabel?.trim() || DEFAULT_SUBMIT_LABEL}
        </button>
      </div>
    </form>
  );
}
