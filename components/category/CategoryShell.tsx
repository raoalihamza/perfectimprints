'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GeigerProduct } from '@/lib/product-types';
import { PRODUCTS_PER_PAGE } from '@/lib/product-types';
import {
  isStateEmpty,
  parseFilterState,
  type SidebarData,
  type SortMode,
} from '@/lib/filter-types';
import { FilterSidebar } from './FilterSidebar';
import { SortDropdown } from './SortDropdown';
import { ProductGrid } from './ProductGrid';
import { Pagination } from './Pagination';

interface CategoryShellProps {
  sidebar: SidebarData;
  /** The unfiltered, path-paginated page slice rendered by the server (static SEO view). */
  products: GeigerProduct[];
  totalProducts: number;
  totalPages: number;
  currentPage: number;
  baseUrl: string;
  /** Category slug (after /cat/) — used to fetch filtered results from the API. */
  slug: string;
}

interface FilterResponse {
  products: GeigerProduct[];
  totalProducts: number;
}

/**
 * Faceted filtering runs server-side (membership data is server-only) via
 * /api/category-products, so the page itself never reads searchParams and stays
 * statically prerendered. With no filters, the server's path-paginated slice is
 * shown (fast, indexable). When a filter/sort is applied, this client fetches the
 * full filtered list and paginates it in-browser.
 */
export function CategoryShell({
  sidebar,
  products,
  totalProducts,
  totalPages,
  currentPage,
  baseUrl,
  slug,
}: CategoryShellProps) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  // Active-filter detection from the URL (parseFilterState/isStateEmpty are
  // client-safe — they live in filter-types, not the server-only filters module).
  const { active, sort } = useMemo(() => {
    const record: Record<string, string | string[]> = {};
    for (const key of new Set(searchParams.keys())) {
      const all = searchParams.getAll(key);
      record[key] = all.length > 1 ? all : all[0];
    }
    const state = parseFilterState(record);
    return { active: !isStateEmpty(state), sort: state.sort as SortMode };
  }, [searchParams]);

  const [filtered, setFiltered] = useState<GeigerProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientPage, setClientPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const gridTopRef = useRef<HTMLDivElement>(null);

  // Fetch filtered results whenever the URL filters change.
  useEffect(() => {
    if (!active) {
      setFiltered(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setClientPage(1);
    fetch(`/api/category-products?slug=${encodeURIComponent(slug)}&${searchKey}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<FilterResponse>) : { products: [], totalProducts: 0 }))
      .then((data) => setFiltered(data.products ?? []))
      .catch((err) => {
        if (err?.name !== 'AbortError') setFiltered([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [active, slug, searchKey]);

  const goToClientPage = (page: number) => {
    setClientPage(page);
    gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Resolve what to show: filtered (client-paginated) vs server path page.
  const view = useMemo(() => {
    if (active && filtered) {
      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));
      const page = Math.min(clientPage, pages);
      const start = (page - 1) * PRODUCTS_PER_PAGE;
      return {
        pageItems: filtered.slice(start, start + PRODUCTS_PER_PAGE),
        total,
        pages,
        page,
        clientPaginated: true,
      };
    }
    return {
      pageItems: products,
      total: totalProducts,
      pages: totalPages,
      page: currentPage,
      clientPaginated: false,
    };
  }, [active, filtered, clientPage, products, totalProducts, totalPages, currentPage]);

  const visible = useMemo(() => {
    if (!searchQuery) return view.pageItems;
    const q = searchQuery.toLowerCase();
    return view.pageItems.filter((p) => p.name.toLowerCase().includes(q));
  }, [view.pageItems, searchQuery]);

  const showingStart = view.total === 0 ? 0 : (view.page - 1) * PRODUCTS_PER_PAGE + 1;
  const showingEnd = Math.min(view.page * PRODUCTS_PER_PAGE, view.total);
  const showingLabel =
    view.pages > 1
      ? `Showing ${showingStart}-${showingEnd} of ${view.total}`
      : `${view.total} ${view.total === 1 ? 'Product' : 'Products'}`;

  const isBusy = active && (loading || filtered === null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <FilterSidebar sidebar={sidebar} onSearchWithin={setSearchQuery} />

      <div ref={gridTopRef}>
        <div
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
        >
          <h2 className="text-xl font-semibold text-brand-ink">
            {isBusy ? 'Filtering…' : showingLabel}
          </h2>
          <SortDropdown current={sort} />
        </div>

        {searchQuery && visible.length < view.pageItems.length && (
          <p className="mb-3 text-sm text-text-muted">
            Showing {visible.length} of {view.pageItems.length} products matching “{searchQuery}”.
          </p>
        )}

        {isBusy ? (
          <div className="rounded border border-border bg-bg-soft p-10 text-center text-text-muted">
            Loading filtered products…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState hasSearch={!!searchQuery} />
        ) : (
          <>
            <ProductGrid products={visible} />
            <Pagination
              currentPage={view.page}
              totalPages={view.pages}
              baseUrl={baseUrl}
              onPageChange={view.clientPaginated ? goToClientPage : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="rounded border border-border bg-bg-soft p-10 text-center">
      <h3 className="text-lg font-semibold text-brand-ink">
        {hasSearch ? 'No products match your search' : 'No products match these filters'}
      </h3>
      <p className="mx-auto mt-2 max-w-prose text-text-muted">
        Try clearing some filters or browsing the full category.
      </p>
    </div>
  );
}
