'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductGrid } from '@/components/category/ProductGrid';
import { DealsFilterSidebar } from '@/components/deals/DealsFilterSidebar';
import { ClientPagination } from '@/components/deals/ClientPagination';
import {
  applyDealsFilters,
  type DealsFacetSection,
  type DealsFilterState,
} from '@/lib/deals-filter';
import { PRODUCTS_PER_PAGE, type GeigerProduct } from '@/lib/product-types';

type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'minqty-asc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Best Match' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'minqty-asc', label: 'Min Qty: Low to High' },
];

interface SearchFacetedResultsProps {
  /** Ranked (Best Match) product matches from the server. */
  products: GeigerProduct[];
  facets: DealsFacetSection[];
}

function sortProducts(products: GeigerProduct[], sort: SortKey): GeigerProduct[] {
  if (sort === 'relevance') return products;
  const copy = [...products];
  const num = (v: number | null, fallback: number) => (v == null ? fallback : v);
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => num(a.low_price, Infinity) - num(b.low_price, Infinity));
    case 'price-desc':
      return copy.sort((a, b) => num(b.low_price, -Infinity) - num(a.low_price, -Infinity));
    case 'minqty-asc':
      return copy.sort((a, b) => num(a.min_qty, Infinity) - num(b.min_qty, Infinity));
    default:
      return copy;
  }
}

/**
 * Geiger-style faceted product results for /search. Mirrors the /deals
 * `DealsClient` (client-side filter + pagination, no URL/API roundtrips) and
 * adds a Sort control. Reuses the deals filter sidebar, ProductGrid, and
 * pagination components verbatim.
 */
export function SearchFacetedResults({ products, facets }: SearchFacetedResultsProps) {
  const [filterState, setFilterState] = useState<DealsFilterState>({});
  const [sort, setSort] = useState<SortKey>('relevance');
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => applyDealsFilters(products, facets, filterState),
    [products, facets, filterState],
  );
  const sorted = useMemo(() => sortProducts(filtered, sort), [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PRODUCTS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const start = (page - 1) * PRODUCTS_PER_PAGE;
  const visible = sorted.slice(start, start + PRODUCTS_PER_PAGE);
  const showingStart = sorted.length === 0 ? 0 : start + 1;
  const showingEnd = Math.min(start + PRODUCTS_PER_PAGE, sorted.length);

  const isFiltered = Object.values(filterState).reduce((n, vs) => n + vs.length, 0) > 0;

  const countLabel =
    totalPages > 1
      ? `Showing ${showingStart}-${showingEnd} of ${sorted.length} products`
      : isFiltered
        ? `Showing ${sorted.length} of ${products.length} products`
        : `${sorted.length} ${sorted.length === 1 ? 'product' : 'products'}`;

  const gridTopRef = useRef<HTMLDivElement | null>(null);
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [page]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <DealsFilterSidebar
        sections={facets}
        state={filterState}
        onChange={(next) => {
          setFilterState(next);
          setPage(1);
        }}
      />

      <div>
        <div ref={gridTopRef} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand-ink" aria-live="polite">
            {countLabel}
          </h2>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <span className="sr-only sm:not-sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                setPage(1);
              }}
              className="h-10 rounded border border-border bg-white px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded border border-border bg-bg-soft p-10 text-center">
            <h3 className="text-lg font-semibold text-brand-ink">
              No products match your filters
            </h3>
            <p className="mx-auto mt-2 max-w-prose text-text-muted">
              Try clearing a filter to widen your results.
            </p>
            <button
              type="button"
              onClick={() => setFilterState({})}
              className="mt-6 inline-flex h-11 items-center justify-center rounded border border-border bg-white px-5 font-medium text-brand-ink hover:border-brand-ink"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <ProductGrid products={visible} />
            <ClientPagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
