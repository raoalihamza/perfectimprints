import Link from 'next/link';

interface CatalogCtaProps {
  /** Studio-editable heading line (catalogPage.ctaHeading). */
  heading?: string;
  /** Studio-editable button label (catalogPage.ctaButtonLabel). */
  buttonLabel?: string;
  /** The catalog's slug — the lead form (prompt 3) needs it to route the email. */
  catalogSlug: string;
  /** Distinguishes the three placements for analytics/testing hooks later. */
  placement: 'top' | 'middle' | 'end';
}

const DEFAULT_HEADING = 'Want the full catalog?';
const DEFAULT_BUTTON_LABEL = 'Get the Catalog';

/**
 * The "Get the Catalog" CTA block on the public /shop-by-theme/<slug> landing
 * page — rendered three times (top / middle / end), all from the same
 * Studio-editable copy.
 *
 * M3 prompt 3: open catalog lead form for `catalogSlug` — replace the interim
 * /contact link below with the gated-catalog lead form modal (the form emails
 * the visitor the /shop-by-theme/<slug>/catalog link and cc's Patrick). The
 * placeholder deliberately links to /contact so the button never dead-ends in
 * the meantime; `catalogSlug` + `placement` are already plumbed for the modal.
 */
export function CatalogCta({ heading, buttonLabel, catalogSlug, placement }: CatalogCtaProps) {
  return (
    <div
      data-catalog-cta={placement}
      data-catalog-slug={catalogSlug}
      className="rounded-md border border-border bg-bg-soft px-6 py-8 text-center"
    >
      <h2 className="text-xl font-bold text-brand-ink md:text-2xl">
        {heading?.trim() || DEFAULT_HEADING}
      </h2>
      {/* M3 prompt 3: open catalog lead form for {catalogSlug} — swap this
          link for the lead-form modal button (keep the same visual style). */}
      <Link
        href="/contact"
        className="mt-4 inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white hover:opacity-90"
      >
        {buttonLabel?.trim() || DEFAULT_BUTTON_LABEL}
      </Link>
    </div>
  );
}
