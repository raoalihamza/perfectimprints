'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface FilterSectionProps {
  title: string;
  /** Number of options inside; shown in the header when >0. */
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function FilterSection({ title, count, defaultOpen = true, children }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-semibold text-brand-ink hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
      >
        <span>
          {title}
          {count != null && count > 0 && (
            <span className="ml-1 text-xs font-normal text-text-muted">({count})</span>
          )}
        </span>
        <span aria-hidden className={cn('transition-transform', open ? 'rotate-180' : '')}>
          ▾
        </span>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </section>
  );
}
