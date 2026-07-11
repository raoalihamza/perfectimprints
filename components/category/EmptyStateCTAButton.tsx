'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// The lead-form modal (+ LeadForm + Turnstile + file-validation code) is
// interaction-only. Splitting it out with ssr:false keeps it out of the static
// /cat First Load JS — it loads only when the visitor opens the modal.
const LeadFormModal = dynamic(
  () => import('@/components/forms/LeadFormModal').then((m) => m.LeadFormModal),
  { ssr: false },
);

interface EmptyStateCTAButtonProps {
  categoryTitle: string;
  sourceUrl: string;
  /** Button text. Defaults to the empty-state wording so existing uses are unchanged. */
  label?: string;
}

export function EmptyStateCTAButton({
  categoryTitle,
  sourceUrl,
  label = 'Find Products for Me',
}: EmptyStateCTAButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center justify-center rounded bg-brand-green px-8 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
      >
        {label}
      </button>
      {open && (
        <LeadFormModal
          open
          onClose={() => setOpen(false)}
          categoryTitle={categoryTitle}
          sourceUrl={sourceUrl}
        />
      )}
    </>
  );
}
