'use client';

import { useState } from 'react';
import { LeadFormModal } from '@/components/forms/LeadFormModal';

export function BlogSidebarContactCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="rounded-lg border-l-4 border-brand-red bg-bg-soft p-5">
        <h2 className="text-base font-bold text-brand-ink">Need Help Choosing?</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-primary">
          Tell us about your project and we&rsquo;ll send tailored ideas — usually within one
          business day.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-brand-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          Get Free Ideas
        </button>
      </section>
      <LeadFormModal open={open} onClose={() => setOpen(false)} sourceUrl="blog-sidebar" />
    </>
  );
}
