'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Same split as EmptyStateCTAButton: the modal (+ LeadForm + Turnstile + file
// validation) is interaction-only, so it stays out of the static /products
// First Load JS and loads only when the visitor clicks.
const LeadFormModal = dynamic(
  () => import('@/components/forms/LeadFormModal').then((m) => m.LeadFormModal),
  { ssr: false },
);

interface GetQuoteButtonProps {
  productTitle: string;
  productSlug: string;
  sourceUrl: string;
}

/**
 * "Get a Quote" button on /products/<slug> (P2-CP-002). Opens the dedicated
 * product-quote form (LeadForm's `productQuote` variant: First/Last/Company/
 * Email/Phone/Shipping Zip/Quantity/Date/Comments + optional artwork). The
 * client POSTs only the product SLUG — /api/leads resolves the product's
 * stored `leadRecipient` and title server-side, saves the lead record, and
 * emails the customer a confirmation copy.
 */
export function GetQuoteButton({ productTitle, productSlug, sourceUrl }: GetQuoteButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 w-full items-center justify-center rounded bg-brand-green px-8 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 sm:w-auto"
      >
        Get a Quote
      </button>
      {open && (
        <LeadFormModal
          open
          onClose={() => setOpen(false)}
          variant="productQuote"
          productSlug={productSlug}
          productTitle={productTitle}
          categoryTitle={productTitle}
          sourceUrl={sourceUrl}
          heading="Get a Quote"
          subheading={`Tell us about your ${productTitle} order and we’ll reply with exact pricing - usually within one business day.`}
        />
      )}
    </>
  );
}
