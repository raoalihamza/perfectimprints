'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CategoryFaq } from '@/lib/categories';

interface FAQsAccordionProps {
  faqs: CategoryFaq[];
  className?: string;
}

export function FAQsAccordion({ faqs, className }: FAQsAccordionProps) {
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set());

  if (faqs.length === 0) return null;

  const toggle = (idx: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <section className={cn('mt-12', className)} aria-labelledby="faqs-heading">
      <h2 id="faqs-heading" className="text-2xl font-semibold text-brand-ink">
        Frequently Asked Questions
      </h2>

      <div className="mt-6 divide-y divide-border rounded border border-border">
        {faqs.map((faq, idx) => {
          const isOpen = openSet.has(idx);
          const panelId = `faq-panel-${idx}`;
          const buttonId = `faq-button-${idx}`;
          return (
            <div key={idx}>
              <h3 className="m-0">
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(idx)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-base font-medium text-text-primary hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
                >
                  <span>{faq.q}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block flex-shrink-0 text-xl leading-none text-brand-red transition-transform',
                      isOpen ? 'rotate-45' : 'rotate-0',
                    )}
                  >
                    +
                  </span>
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                hidden={!isOpen}
                className="px-4 pb-4 text-text-primary"
              >
                <p className="max-w-prose leading-relaxed">{faq.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
