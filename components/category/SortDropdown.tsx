'use client';

import { usePathname } from 'next/navigation';
import { DEFAULT_SORT, SORT_OPTIONS, type SortMode } from '@/lib/filter-types';

interface SortDropdownProps {
  /** Current sort value from the URL query (resolved by CategoryShell). */
  current: SortMode;
  /**
   * Current URL query string, owned by CategoryShell (read post-mount from
   * window.location — NOT useSearchParams, which would CSR-bail the /cat
   * prerender; see CategoryShell). usePathname stays: it is prerender-safe.
   */
  searchKey: string;
  /** Push a new URL (router.push, scroll:false) + keep the shared query state in sync. */
  navigate: (url: string) => void;
}

export function SortDropdown({ current, searchKey, navigate }: SortDropdownProps) {
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SortMode;
    const params = new URLSearchParams(searchKey);
    if (next === DEFAULT_SORT) {
      params.delete('sort');
    } else {
      params.set('sort', next);
    }
    const qs = params.toString();
    navigate(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="hidden text-sm font-medium text-text-muted sm:inline">
        Sort by:
      </label>
      <select
        id="sort-select"
        // The visible label is display:none on mobile (removed from the a11y
        // tree), so carry an explicit accessible name on the control itself.
        aria-label="Sort products by"
        value={current}
        onChange={handleChange}
        className="h-10 rounded-md border border-border bg-white pl-3 pr-8 text-sm font-medium text-brand-ink focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
