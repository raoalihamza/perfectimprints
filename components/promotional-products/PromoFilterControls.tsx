'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DealsFilterSidebar } from '@/components/deals/DealsFilterSidebar';
import type { DealsFacetSection, DealsFilterState } from '@/lib/deals-filter';

/**
 * URL-driven wrapper around the shared DealsFilterSidebar for
 * /promotional-products. The actual filtering runs on the SERVER (see
 * lib/promotional-products.ts), so this only reads the active selections out of
 * the query string and writes new ones back — toggling a facet pushes a new URL
 * and the server re-renders the grid. The `facets` it receives have empty `skus`
 * (stripped server-side) since the sidebar only needs id/label/count.
 */
export function PromoFilterControls({ facets }: { facets: DealsFacetSection[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const state: DealsFilterState = {};
  for (const f of facets) {
    const raw = searchParams.get(f.field);
    if (raw) {
      const ids = raw.split(',').filter(Boolean);
      if (ids.length) state[f.field] = ids;
    }
  }

  const onChange = useCallback(
    (next: DealsFilterState) => {
      const params = new URLSearchParams();
      const sort = searchParams.get('sort');
      if (sort) params.set('sort', sort);
      // Changing filters resets to page 1 (no `page` param carried over).
      for (const [field, ids] of Object.entries(next)) {
        if (ids.length) params.set(field, ids.join(','));
      }
      const qs = params.toString();
      router.push(`/promotional-products${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams],
  );

  return <DealsFilterSidebar sections={facets} state={state} onChange={onChange} />;
}
