import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { FORMS_TAG, formTag } from '@/lib/sanity/cache-tags';
import type { FormDef, FormFieldDef } from '@/lib/forms/form-def';

// ---------------------------------------------------------------------------
// Reusable form-builder `form` documents (P2-FB-001). Read in two places:
//   - server components resolving a CTA's `formSlug` before handing the
//     RENDERABLE definition to the client island (recipient config stripped);
//   - the /api/leads route re-resolving the SAME slug server-side for the
//     recipient + required-field validation (never trusting the client).
// Reads are non-CDN + cache-tagged (FORMS_TAG list-level, form:<slug>
// content-level) so a Studio edit revalidates in seconds while every
// embedding page stays static — the standing freshness pattern.
// ---------------------------------------------------------------------------

/** The full form doc, INCLUDING routing config — server-side use only. */
export interface FormDoc extends FormDef {
  /** Where this form's lead emails go — resolved server-side, never sent to the client. */
  recipientEmail?: string;
  sendCustomerConfirmation?: boolean;
}

const FORM_PROJECTION = `{
  title,
  "slug": slug.current,
  recipientEmail,
  sendCustomerConfirmation,
  successMessage,
  submitButtonLabel,
  intro,
  fields[]{ _key, label, fieldType, options, required, placeholder }
}`;

export async function getFormBySlug(slug: string): Promise<FormDoc | null> {
  if (!slug) return null;
  try {
    const doc = await cachedClient.fetch<FormDoc | null>(
      `*[_type == "form" && slug.current == $slug][0]${FORM_PROJECTION}`,
      { slug },
      { next: { tags: [FORMS_TAG, formTag(slug)].filter(Boolean), revalidate: false } },
    );
    if (!doc?.title || !doc.slug) return null;
    return { ...doc, fields: sanitizeFields(doc.fields) };
  } catch {
    return null;
  }
}

/** Drop half-filled Studio rows (no label / no type) so render + validation never see them. */
function sanitizeFields(fields: FormFieldDef[] | undefined | null): FormFieldDef[] {
  return (fields ?? []).filter((f) => Boolean(f?._key && f.label && f.fieldType));
}

/**
 * Strip a form doc to the RENDERABLE definition passed to the client island.
 * `recipientEmail` / `sendCustomerConfirmation` deliberately never reach the
 * browser — the submit route re-resolves them from the slug (no open relay,
 * and the address isn't baked into page HTML for scrapers).
 */
export function toFormRenderDef(doc: FormDoc): FormDef {
  return {
    title: doc.title,
    slug: doc.slug,
    intro: doc.intro,
    submitButtonLabel: doc.submitButtonLabel,
    successMessage: doc.successMessage,
    fields: doc.fields,
  };
}
