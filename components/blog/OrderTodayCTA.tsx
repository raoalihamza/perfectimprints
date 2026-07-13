'use client';

import { useState } from 'react';
import { LeadFormModal } from '@/components/forms/LeadFormModal';
import { DEFAULT_CTA_BODY } from '@/lib/blog/cta-defaults';

interface OrderTodayCTAProps {
  topic: string;
  /** Verbatim heading override — rendered exactly as-is (no "Order Custom … Today" wrapper). */
  heading?: string;
  /** Per-post body override — rendered as-is; falls back to DEFAULT_CTA_BODY when blank. */
  body?: string;
  sourceUrl?: string;
}

export function OrderTodayCTA({ topic, heading, body, sourceUrl }: OrderTodayCTAProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-12 rounded-lg border-l-4 border-brand-red bg-bg-soft p-6 sm:p-8">
      <h2 className="text-xl font-bold text-brand-ink md:text-2xl">
        {heading || `Order Custom ${topic} Today`}
      </h2>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-primary md:text-base">
        {body || DEFAULT_CTA_BODY}
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-md bg-brand-green px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          Get Custom Quote
        </button>
      </div>
      <LeadFormModal
        open={open}
        onClose={() => setOpen(false)}
        categoryTitle={topic}
        sourceUrl={sourceUrl}
      />
    </section>
  );
}
