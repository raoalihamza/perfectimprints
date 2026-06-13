'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductGrid } from '@/components/category/ProductGrid';
import { ClientPagination } from '@/components/deals/ClientPagination';
import { NewProductsFilterSidebar } from './NewProductsFilterSidebar';
import {
  applyNewProductsFilters,
  type NewProductsFacetSection,
  type NewProductsFilterState,
} from '@/lib/new-products-filter';
import { PRODUCTS_PER_PAGE, type GeigerProduct } from '@/lib/product-types';

interface NewProductsClientProps {
  products: GeigerProduct[];
  facets: NewProductsFacetSection[];
}

export function NewProductsClient({ products, facets }: NewProductsClientProps) {
  const [filterState, setFilterState] = useState<NewProductsFilterState>({});
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => applyNewProductsFilters(products, facets, filterState),
    [products, facets, filterState],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const start = (page - 1) * PRODUCTS_PER_PAGE;
  const visible = filtered.slice(start, start + PRODUCTS_PER_PAGE);
  const showingStart = filtered.length === 0 ? 0 : start + 1;
  const showingEnd = Math.min(start + PRODUCTS_PER_PAGE, filtered.length);

  const isFiltered =
    Object.values(filterState).reduce((n, vs) => n + vs.length, 0) > 0;

  const countLabel =
    totalPages > 1
      ? `Showing ${showingStart}-${showingEnd} of ${filtered.length} new products`
      : isFiltered
        ? `Showing ${filtered.length} of ${products.length} new products`
        : `Showing ${filtered.length} new ${filtered.length === 1 ? 'product' : 'products'}`;

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
      <NewProductsFilterSidebar
        sections={facets}
        state={filterState}
        onChange={(next) => {
          setFilterState(next);
          setPage(1);
        }}
      />

      <div>
        <div ref={gridTopRef} />
        <h2 className="mb-4 text-xl font-semibold text-brand-ink" aria-live="polite">
          {countLabel}
        </h2>

        {filtered.length === 0 ? (
          <div className="rounded border border-border bg-bg-soft p-10 text-center">
            <h3 className="text-lg font-semibold text-brand-ink">
              No new products match your filters
            </h3>
            <p className="mx-auto mt-2 max-w-prose text-text-muted">
              Try clearing a filter or browse all new products.
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
            <ClientPagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
