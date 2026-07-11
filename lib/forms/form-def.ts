/**
 * Reusable form-builder definition types + pure helpers (P2-FB-001).
 *
 * PURE module — no fs, no Sanity, no `server-only` — because it is imported by
 * BOTH sides of the pipeline and they must agree byte-for-byte:
 *   - the client `FormRenderer` (renders inputs, names them, pre-validates)
 *   - the `/api/leads` route (re-derives the same names, re-validates
 *     server-side against the SERVER-resolved form definition — a crafted
 *     client payload can't skip a required field)
 *
 * The Sanity `form` schema (sanity/schemas/documents/form.ts) mirrors the
 * field-type list inline (the standalone Studio bundler can't import lib/).
 */

export type FormFieldType =
  | 'shortText'
  | 'longText'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'checkbox'
  | 'checkboxGroup'
  | 'fileUpload';

export interface FormFieldDef {
  _key: string;
  label: string;
  fieldType: FormFieldType;
  /** Choices — dropdown / checkboxGroup only. */
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

/**
 * The RENDERABLE form definition — what the server passes to the client
 * island. Deliberately EXCLUDES `recipientEmail` / `sendCustomerConfirmation`
 * (routing config must never reach the browser; the route re-resolves the doc
 * from `slug` server-side).
 */
export interface FormDef {
  title: string;
  slug: string;
  intro?: string;
  submitButtonLabel?: string;
  successMessage?: string;
  fields: FormFieldDef[];
}

export const DEFAULT_SUBMIT_LABEL = 'Request a Quote';
export const DEFAULT_SUCCESS_MESSAGE =
  'Thanks, we received your request and will get back to you shortly.';

/** A submitted answer: single value, or the selected options of a checkboxGroup. */
export type AnswerValue = string | string[];

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Stable generated input `name` for a field — derived from the definition on
 * BOTH sides (client posts under it, server reads under it), so it never
 * crosses the wire as trusted data. Index-prefixed so two same-label fields
 * can't collide.
 */
export function fieldName(field: Pick<FormFieldDef, 'label'>, index: number): string {
  const slug = slugifyLabel(field.label || 'field');
  return slug ? `f${index}-${slug}` : `f${index}`;
}

export function isValidEmailAnswer(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Convert a native date-input value (YYYY-MM-DD) to US display format
 * (MM/DD/YYYY) for the lead emails + leadSubmission records. Every date entry
 * site-wide is a native `<input type="date">` (LeadForm / ProductQuoteForm
 * `dateNeeded` + the form-builder `date` fieldType), and all of them run the
 * picked value through this at submit. Non-ISO input passes through unchanged
 * (safety for any legacy free-text value).
 */
export function usDateFromIso(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : value.trim();
}

/** Join a checkboxGroup selection for display / storage. */
export function formatAnswerValue(value: AnswerValue | undefined | null): string {
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean).join(', ');
  return (value ?? '').trim();
}

/**
 * Validate collected answers against the form definition. Returns errors keyed
 * by generated field name (empty object = valid). Used by the client for
 * inline errors AND re-run by the server against its own resolved definition
 * (never trusting the client's validation).
 *
 * `fileCounts` maps a fileUpload field's name → number of files attached
 * (file contents are validated separately via the shared attachment limits).
 */
export function validateAnswers(
  form: FormDef,
  answers: Record<string, AnswerValue>,
  fileCounts?: Record<string, number>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  form.fields.forEach((field, index) => {
    const name = fieldName(field, index);
    const value = answers[name];

    if (field.fieldType === 'fileUpload') {
      if (field.required && (fileCounts?.[name] ?? 0) === 0) errors[name] = 'Required';
      return;
    }
    if (field.fieldType === 'checkboxGroup') {
      const selected = Array.isArray(value) ? value.filter(Boolean) : [];
      if (field.required && selected.length === 0) errors[name] = 'Select at least one option';
      else if (
        selected.length > 0 &&
        Array.isArray(field.options) &&
        field.options.length > 0 &&
        selected.some((v) => !field.options!.includes(v))
      ) {
        errors[name] = 'Choose from the listed options';
      }
      return;
    }

    const text = formatAnswerValue(value);
    if (field.fieldType === 'checkbox') {
      // A yes/no checkbox always carries an explicit 'Yes'/'No'. `required`
      // means "must be checked" (consent-style), so only 'Yes' passes.
      if (field.required && text !== 'Yes') errors[name] = 'Required';
      return;
    }
    if (field.required && !text) {
      errors[name] = 'Required';
      return;
    }
    if (text && field.fieldType === 'email' && !isValidEmailAnswer(text)) {
      errors[name] = 'Enter a valid email address';
      return;
    }
    if (
      text &&
      field.fieldType === 'dropdown' &&
      Array.isArray(field.options) &&
      field.options.length > 0 &&
      !field.options.includes(text)
    ) {
      errors[name] = 'Choose from the listed options';
    }
  });
  return errors;
}

/** One label:value row for the lead email / confirmation / lead record. */
export interface AnswerRow {
  label: string;
  value: string;
}

/**
 * Contact fields extracted from the answers by label/type heuristics — used to
 * populate the leadSubmission's core columns, the email reply-to, and the
 * customer-confirmation greeting/destination. Heuristics: first `email`-typed
 * field = the submitter's email, first `phone`-typed field = phone, labels
 * matching "first name" / "last name" / "company" fill the rest (a lone "Name"
 * label falls back to first name).
 */
export interface ExtractedContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
}

export function extractContactFields(
  form: FormDef,
  answers: Record<string, AnswerValue>,
): ExtractedContact {
  const contact: ExtractedContact = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
  };
  form.fields.forEach((field, index) => {
    const value = formatAnswerValue(answers[fieldName(field, index)]);
    if (!value) return;
    const label = (field.label || '').toLowerCase();
    if (!contact.email && field.fieldType === 'email') contact.email = value;
    if (!contact.phone && field.fieldType === 'phone') contact.phone = value;
    if (!contact.firstName && /first\s*name/.test(label)) contact.firstName = value;
    if (!contact.lastName && /last\s*name/.test(label)) contact.lastName = value;
    if (!contact.company && /company\s*name|^company$/.test(label)) contact.company = value;
  });
  if (!contact.firstName) {
    // A form with a single "Name" field still gets a usable greeting.
    form.fields.forEach((field, index) => {
      const label = (field.label || '').trim().toLowerCase();
      if (!contact.firstName && (label === 'name' || label === 'your name')) {
        contact.firstName = formatAnswerValue(answers[fieldName(field, index)]).split(/\s+/)[0] ?? '';
      }
    });
  }
  return contact;
}

/**
 * The ordered label:value rows for the lead email + confirmation + lead
 * record. Follows definition order; empty answers are skipped (a checkbox is
 * never empty — it submits an explicit 'Yes'/'No'). `fileNames` supplies the
 * display value for fileUpload fields (the attached filenames).
 */
export function buildAnswerRows(
  form: FormDef,
  answers: Record<string, AnswerValue>,
  fileNames?: Record<string, string[]>,
): AnswerRow[] {
  const rows: AnswerRow[] = [];
  form.fields.forEach((field, index) => {
    const name = fieldName(field, index);
    const value =
      field.fieldType === 'fileUpload'
        ? (fileNames?.[name] ?? []).join(', ')
        : formatAnswerValue(answers[name]);
    if (value) rows.push({ label: field.label, value });
  });
  return rows;
}
