'use client';

import { useMemo, useState } from 'react';
import type { GeigerProduct } from '@/lib/categories';
import type { SidebarData, SortMode } from '@/lib/filter-types';
import { FilterSidebar } from './FilterSidebar';
import { SortDropdown } from './SortDropdown';
import { ProductGrid } from './ProductGrid';
import { Pagination } from './Pagination';

interface CategoryShellProps {
  sidebar: SidebarData;
  products: GeigerProduct[];
  totalProducts: number;
  totalPages: number;
  currentPage: number;
  baseUrl: string;
  sort: SortMode;
}

export function CategoryShell({
  sidebar,
  products,
  totalProducts,
  totalPages,
  currentPage,
  baseUrl,
  sort,
}: CategoryShellProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Client-side search-within filtering of the rendered page only.
  const visible = useMemo(() => {
    if (!searchQuery) return products;
    return products.filter((p) => p.name.toLowerCase().includes(searchQuery));
  }, [products, searchQuery]);

  const showingStart = totalProducts === 0 ? 0 : (currentPage - 1) * 60 + 1;
  const showingEnd = Math.min(currentPage * 60, totalProducts);
  const showingLabel =
    totalPages > 1
      ? `Showing ${showingStart}-${showingEnd} of ${totalProducts}`
      : `${totalProducts} ${totalProducts === 1 ? 'Product' : 'Products'}`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <FilterSidebar sidebar={sidebar} onSearchWithin={setSearchQuery} />

      <div>
        <div
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
        >
          <h2 className="text-xl font-semibold text-brand-ink">{showingLabel}</h2>
          <SortDropdown current={sort} />
        </div>

        {searchQuery && visible.length < products.length && (
          <p className="mb-3 text-sm text-text-muted">
            Showing {visible.length} of {products.length} products matching “{searchQuery}”.
          </p>
        )}

        {visible.length === 0 ? (
          <EmptyState hasSearch={!!searchQuery} />
        ) : (
          <>
            <ProductGrid products={visible} />
            <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl={baseUrl} />
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
