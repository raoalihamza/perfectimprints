import Link from 'next/link';
import { FormModalButton } from '@/components/forms/FormModalButton';
import type { FormDef } from '@/lib/forms/form-def';

interface CatalogCtaProps {
  /** Studio-editable heading line (catalogPage.ctaHeading). */
  heading?: string;
  /** Studio-editable button label (catalogPage.ctaButtonLabel). */
  buttonLabel?: string;
  /** The catalog's slug — posted as a hidden field so /api/leads emails THIS catalog's gated link. */
  catalogSlug: string;
  /** Distinguishes the three placements for analytics/testing hooks later. */
  placement: 'top' | 'middle' | 'end';
  /**
   * The resolved `catalog-request` builder form (P2-CAT-002) — resolved ONCE
   * by the landing page via the tag-cached getFormBySlug and shared by all
   * three CTA instances. Null (form unpublished / slug typo) falls back to a
   * plain /contact link so the CTA never dead-ends.
   */
  form?: FormDef | null;
}

const DEFAULT_HEADING = 'Want the full catalog?';
const DEFAULT_BUTTON_LABEL = 'Get the Catalog';

const buttonClass =
  'mt-6 inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-8 text-base font-semibold text-white hover:opacity-90';

/**
 * The "Get the Catalog" CTA block on the public /shop-by-theme/<slug> landing
 * page — rendered three times (top / middle / end), all from the same
 * Studio-editable copy.
 *
 * P2-CAT-002: the button opens the seeded `catalog-request` form in a modal
 * (the standard FormModalButton client island — the landing page stays
 * static). The hidden `catalogSlug` rides the submission so the customer's
 * confirmation email carries THIS catalog's gated-page link; it is context
 * only — the lead recipient is always the form doc's stored address, resolved
 * server-side in /api/leads.
 */
export function CatalogCta({ heading, buttonLabel, catalogSlug, placement, form }: CatalogCtaProps) {
  const label = buttonLabel?.trim() || DEFAULT_BUTTON_LABEL;
  return (
    // Self-centering card, uniform across all three placements (top/middle/
    // end) — the block sizes itself so the page never has to wrap it.
    <div
      data-catalog-cta={placement}
      data-catalog-slug={catalogSlug}
      className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-bg-soft px-6 py-10 text-center shadow-sm sm:px-12"
    >
      <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">
        {heading?.trim() || DEFAULT_HEADING}
      </h2>
      {form ? (
        <FormModalButton
          form={form}
          label={label}
          className={buttonClass}
          hiddenFields={{ catalogSlug }}
        />
      ) : (
        // Fallback while the catalog-request form is unpublished — the CTA
        // never dead-ends (same pattern as CtaBlock's formSlug fallback).
        <Link href="/contact" className={buttonClass}>
          {label}
        </Link>
      )}
    </div>
  );
}
