'use client';

import { cn } from '@/lib/utils';
import { resultTarget } from '@/lib/search/result-target';
import type { SearchItem } from '@/lib/search/types';
import { useResultNavigation } from './useResultNavigation';

interface SearchResultRowProps {
  item: SearchItem;
  /** Highlighted by keyboard navigation in the overlay. */
  active?: boolean;
  /** DOM id so an owning combobox can point `aria-activedescendant` at it. */
  optionId?: string;
  /** Fired right before navigation (e.g. to close the overlay). */
  onActivate?: () => void;
}

/**
 * A single overlay result row, rendered as an anchor so middle-click / cmd-click
 * and "open in new tab" all behave. Plain left-clicks on internal links are
 * SPA navigations; product links keep their native new-tab behavior. Products
 * show a thumbnail + brand; the section header conveys the result type.
 */
export function SearchResultRow({ item, active, optionId, onActivate }: SearchResultRowProps) {
  const { navigate, prefetch } = useResultNavigation();
  const target = resultTarget(item);
  const isProduct = item.type === 'product';

  return (
    <a
      id={optionId}
      role="option"
      aria-selected={active ?? false}
      href={target.href}
      target={target.external ? '_blank' : undefined}
      rel={target.external ? 'noopener noreferrer sponsored' : undefined}
      onMouseEnter={() => prefetch(item)}
      onFocus={() => prefetch(item)}
      onClick={(e) => {
        if (!target.external && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          onActivate?.();
          navigate(item);
          return;
        }
        onActivate?.();
      }}
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm transition-colors focus-visible:outline-none',
        active ? 'bg-bg-soft' : 'hover:bg-bg-soft',
      )}
    >
      {isProduct ? (
        item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            className="h-9 w-9 shrink-0 rounded border border-border bg-white object-contain"
          />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded border border-border bg-bg-soft" aria-hidden />
        )
      ) : null}
      <span className="min-w-0 flex-1 truncate text-text-primary">{item.title}</span>
      {item.brand || item.category ? (
        <span className="shrink-0 truncate text-xs text-text-muted">
          {item.brand || item.category}
        </span>
      ) : null}
    </a>
  );
}
