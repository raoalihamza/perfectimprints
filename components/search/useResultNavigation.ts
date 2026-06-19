'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { resultTarget } from '@/lib/search/result-target';
import type { SearchItem } from '@/lib/search/types';

/**
 * Returns `{ navigate, prefetch }` used by the overlay (Enter key) and result
 * rows (click/hover). Products open the affiliate URL in a new tab; everything
 * else is an internal SPA navigation. `prefetch` warms an internal route on
 * hover/focus so the actual click transitions instantly (the route's
 * `loading.tsx` shell is fetched ahead of time).
 */
export function useResultNavigation() {
  const router = useRouter();

  const navigate = useCallback(
    (item: SearchItem) => {
      const target = resultTarget(item);
      if (target.external) {
        window.open(target.href, '_blank', 'noopener,noreferrer');
      } else {
        router.push(target.href);
      }
    },
    [router],
  );

  const prefetch = useCallback(
    (item: SearchItem) => {
      const target = resultTarget(item);
      if (!target.external) router.prefetch(target.href);
    },
    [router],
  );

  return { navigate, prefetch };
}
