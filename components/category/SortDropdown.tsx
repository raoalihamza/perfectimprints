'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { DEFAULT_SORT, SORT_OPTIONS, type SortMode } from '@/lib/filter-types';

interface SortDropdownProps {
  /** Current sort value from URL (server-resolved). */
  current: SortMode;
}

export function SortDropdown({ current }: SortDropdownProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SortMode;
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (next === DEFAULT_SORT) {
      params.delete('sort');
    } else {
      params.set('sort', next);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="hidden text-sm font-medium text-text-muted sm:inline">
        Sort by:
      </label>
      <select
        id="sort-select"
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
