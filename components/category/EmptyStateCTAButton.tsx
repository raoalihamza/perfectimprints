'use client';

import { useState } from 'react';
import { LeadFormModal } from '@/components/forms/LeadFormModal';

interface EmptyStateCTAButtonProps {
  categoryTitle: string;
  sourceUrl: string;
}

export function EmptyStateCTAButton({ categoryTitle, sourceUrl }: EmptyStateCTAButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center justify-center rounded bg-brand-green px-8 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
      >
        Find Products for Me
      </button>
      <LeadFormModal
        open={open}
        onClose={() => setOpen(false)}
        categoryTitle={categoryTitle}
        sourceUrl={sourceUrl}
      />
    </>
  );
}
