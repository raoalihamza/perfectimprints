'use client';

import { useState } from 'react';
import { LeadFormModal } from '@/components/forms/LeadFormModal';

interface SearchEmptyCTAProps {
  /** The query that returned nothing — seeds the lead form context. */
  query?: string;
  /** `block` = full section on /search; `compact` = inline inside the overlay. */
  variant?: 'block' | 'compact';
}

/**
 * No-results state. Search never dead-ends: instead of "nothing found" we invite
 * the visitor to tell us what they need, consistent with the lead-gen model.
 * Reuses the shared `LeadFormModal`.
 */
export function SearchEmptyCTA({ query, variant = 'block' }: SearchEmptyCTAProps) {
  const [open, setOpen] = useState(false);
  const sourceUrl = query ? `/search?q=${encodeURIComponent(query)}` : '/search';

  const button = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex h-11 items-center justify-center rounded bg-brand-green px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
    >
      Tell us what you need
    </button>
  );

  const modal = (
    <LeadFormModal
      open={open}
      onClose={() => setOpen(false)}
      categoryTitle={query}
      sourceUrl={sourceUrl}
    />
  );

  if (variant === 'compact') {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-text-primary">
          {query ? (
            <>
              No matches for <span className="font-semibold">&ldquo;{query}&rdquo;</span>.
            </>
          ) : (
            'No matches yet.'
          )}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Didn&rsquo;t find it? We can source from over 1,000,000 products.
        </p>
        <div className="mt-3">{button}</div>
        {modal}
      </div>
    );
  }

  return (
    <section className="rounded-lg border-l-4 border-brand-red bg-bg-soft p-8 sm:p-10">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">
          {query ? (
            <>We couldn&rsquo;t find &ldquo;{query}&rdquo; — but we can still help.</>
          ) : (
            <>Didn&rsquo;t find it? We can still help.</>
          )}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-text-primary md:text-lg">
          Our online catalog shows only a portion of what we can source. Tell us what you need and
          our team will send tailored product ideas &mdash; usually within one business day.
        </p>
        <div className="mt-8 flex justify-center">{button}</div>
        <p className="mt-4 text-sm text-text-muted">
          Takes less than 60 seconds. No pressure, just helpful product ideas sent your way fast!
        </p>
      </div>
      {modal}
    </section>
  );
}
