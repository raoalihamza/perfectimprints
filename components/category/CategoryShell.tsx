'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { GeigerProduct } from '@/lib/product-types';
import { PRODUCTS_PER_PAGE } from '@/lib/product-types';
import {
  filterStateFromSearchKey,
  isStateEmpty,
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
 *
 * The URL query is read from `window.location.search` in a post-mount effect —
 * NEVER via `useSearchParams()`. A render-time `useSearchParams()` anywhere in
 * this tree forces a CSR bailout during prerender that swaps the ENTIRE page's
 * static HTML (H1, product grid, JSON-LD) for the route's loading.tsx skeleton
 * while the build still reports `●` static (M-SEO5; CLAUDE.md §13). This shell
 * owns the query state and hands FilterSidebar/SortDropdown a `searchKey` +
 * `navigate` pair so no child needs the hook either.
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
  const router = useRouter();
  const pathname = usePathname();

  // Raw query string (no leading "?"). null until the mount effect reads the
  // real URL, so the server prerender AND the first client render both show the
  // unfiltered view — that keeps the full grid in the static HTML and makes
  // hydration match.
  const [qs, setQs] = useState<string | null>(null);

  // Read the query after mount, again after every committed route transition
  // (pathname dep), and on back/forward (pushState never fires popstate, so
  // same-path filter clicks are synced by `navigate` below instead). The
  // pathname guard skips mid-transition popstate reads — mirroring the old
  // useSearchParams behavior of only updating at navigation commit — so a
  // cross-category back/forward can't fire a fetch for a mismatched slug+query.
  useEffect(() => {
    const read = () => {
      if (window.location.pathname !== pathname) return;
      setQs(window.location.search.replace(/^\?/, ''));
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [pathname]);

  const searchKey = qs ?? '';

  // Active-filter detection from the URL (filterStateFromSearchKey/isStateEmpty
  // are client-safe — they live in filter-types, not the server-only filters module).
  const { active, sort } = useMemo(() => {
    const state = filterStateFromSearchKey(searchKey);
    return { active: !isStateEmpty(state), sort: state.sort as SortMode };
  }, [searchKey]);

  // Filter/sort navigation for this page and its children. For a same-pathname
  // (query-only) push the router remounts nothing and no event fires, so sync
  // the local query state immediately; a cross-pathname push (e.g. a single
  // facet's static URL) is picked up by the pathname-keyed effect above once
  // the transition commits.
  const navigate = useCallback(
    (url: string) => {
      router.push(url, { scroll: false });
      const q = url.indexOf('?');
      const targetPath = q === -1 ? url : url.slice(0, q);
      if (targetPath === window.location.pathname) {
        setQs(q === -1 ? '' : url.slice(q + 1));
      }
    },
    [router],
  );

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
      <FilterSidebar
        sidebar={sidebar}
        searchKey={searchKey}
        navigate={navigate}
        onSearchWithin={setSearchQuery}
      />

      <div ref={gridTopRef}>
        <div
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
        >
          <h2 className="text-xl font-semibold text-brand-ink">
            {isBusy ? 'Filtering…' : showingLabel}
          </h2>
          <SortDropdown current={sort} searchKey={searchKey} navigate={navigate} />
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
