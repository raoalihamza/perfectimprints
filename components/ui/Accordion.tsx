'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface AccordionItem {
  id?: string;
  question: string;
  answer: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpenIndex?: number;
  className?: string;
}

export function Accordion({ items, defaultOpenIndex, className }: AccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(
    defaultOpenIndex ?? null,
  );

  return (
    <div className={cn('divide-y divide-border rounded border border-border', className)}>
      {items.map((item, idx) => {
        const isOpen = idx === openIndex;
        const panelId = `accordion-panel-${idx}`;
        const buttonId = `accordion-button-${idx}`;
        return (
          <div key={item.id ?? idx}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="flex w-full items-center justify-between px-4 py-4 text-left text-base font-medium text-text-primary hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
              >
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'ml-4 inline-block transition-transform',
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
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
