'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PROMO_SORTS } from '@/lib/promotional-products';

/** URL-driven sort control for /promotional-products. Preserves active filters,
 *  resets to page 1 on change. */
export function PromoSortSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('sort') ?? 'featured';

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value === 'featured') params.delete('sort');
    else params.set('sort', e.target.value);
    params.delete('page'); // back to page 1 on a re-sort
    const qs = params.toString();
    router.push(`/promotional-products${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-text-muted">
      <span className="sr-only sm:not-sr-only">Sort by</span>
      <select
        value={current}
        onChange={onChange}
        className="h-10 rounded border border-border bg-white px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
      >
        {PROMO_SORTS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
