'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { search, type SearchResult } from '@/lib/search/load-index';
import { SEARCH_TYPE_LABELS, type SearchItemType } from '@/lib/search/types';

interface SearchAlsoMatchingProps {
  query: string;
}

const GROUPS: { type: Exclude<SearchItemType, 'product'>; cap: number }[] = [
  { type: 'category', cap: 6 },
  { type: 'brand', cap: 4 },
  { type: 'blog', cap: 4 },
  { type: 'video', cap: 4 },
];

/**
 * Compact "also matching" strip above the product grid on /search. Products are
 * the hero (server-rendered grid); this surfaces matching categories, brands,
 * and blog posts — content Geiger's product search has no equivalent for. Runs
 * client-side over the same cached index the overlay uses; self-hides if empty.
 */
export function SearchAlsoMatching({ query }: SearchAlsoMatchingProps) {
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    let live = true;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    search(q, 40)
      .then((r) => live && setResults(r.filter((x) => x.type !== 'product')))
      .catch(() => live && setResults([]));
    return () => {
      live = false;
    };
  }, [query]);

  const groups = GROUPS.map((g) => ({
    ...g,
    items: results.filter((r) => r.type === g.type).slice(0, g.cap),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <section
      aria-label="Other matching content"
      className="mb-8 rounded-lg border border-border bg-bg-soft p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.type} className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {SEARCH_TYPE_LABELS[g.type]}
              {g.type === 'category' ? ' pages' : 's'}
            </span>
            {g.items.map((item) => (
              <Link
                key={item.url}
                href={item.url}
                className="inline-flex max-w-full items-center truncate rounded-full border border-border bg-white px-3 py-1 text-sm text-brand-ink transition-colors hover:border-brand-ink hover:text-brand-red"
              >
                {item.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
