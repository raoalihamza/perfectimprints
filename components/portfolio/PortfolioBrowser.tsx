'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClientPagination } from '@/components/deals/ClientPagination';
import { DealsFilterSidebar } from '@/components/deals/DealsFilterSidebar';
import {
  applyFacetFilters,
  type DealsFacetSection,
  type DealsFilterState,
} from '@/lib/deals-filter';
import {
  PORTFOLIO_PAGE_SIZE,
  countActivePortfolioFilters,
  portfolioFilterStateFromSearch,
  portfolioSearchFromFilterState,
} from '@/lib/portfolio/page-filters';
import type { PortfolioTile } from '@/lib/portfolio/tile-data';
import { PORTFOLIO_EAGER_TILES, PortfolioGrid } from './PortfolioGrid';
import { PortfolioLightbox } from './PortfolioLightbox';

interface PortfolioBrowserProps {
  /** Every visible item, in site order, already mapped to plain tiles by the server page. */
  tiles: PortfolioTile[];
  /** The two filter groups, built by the server page from the same items. */
  sections: DealsFacetSection[];
}

interface LightboxState {
  /** Index into the FILTERED list (all pages), not the visible page slice. */
  index: number;
  opener: HTMLElement | null;
}

/**
 * The /portfolio page's interactive half (PORT-110): the filter sidebar, the
 * grid, pagination and the lightbox. This is the client boundary: the server
 * page fetched Sanity and mapped every item to a plain `PortfolioTile`, and
 * everything here is a prop.
 *
 * STATIC-RENDER CONTRACT (the /cat CSR-bailout lesson, CLAUDE.md Section 13):
 * this component reads NO URL state during render. The server prerender and
 * the first client render are the UNFILTERED view on page 1, so the full grid
 * is real `<img>` markup in the static HTML and hydration matches. The query
 * string is read from `window.location.search` in a post-mount effect, never
 * via `useSearchParams()`, which would silently swap the whole static page for
 * the loading skeleton while the build still reported it static. A shared
 * filtered link therefore paints unfiltered for one frame and then applies
 * its filters, which is the accepted cost of keeping the page at the edge.
 *
 * THE URL IS THE SHAREABLE ARTEFACT. A filter change writes the canonical
 * query (`?category=caps-and-hats&color=black`) with `history.pushState`, so
 * the address bar always shows the current view and Back walks the filter
 * history; `popstate` reads it back. After the mount read, a non-canonical
 * incoming address (upper case, a different parameter order, a tracking
 * parameter) is rewritten to the canonical form with `replaceState`, so the
 * address bar and the Copy button hand out the same link for the same
 * selection no matter how the page was reached. No navigation, no fetch:
 * filtering is `applyFacetFilters` over the tiles already in memory, the
 * same rule the deals and catalog pages use. Filtering hides and shows, it
 * never fetches. The page number is deliberately NOT in the URL: the link
 * shares the filters, and the button says so.
 */
export function PortfolioBrowser({ tiles, sections }: PortfolioBrowserProps) {
  const [filterState, setFilterState] = useState<DealsFilterState>({});
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const countRef = useRef<HTMLHeadingElement | null>(null);

  // URL -> state: after mount, and again on back/forward. The pathname is
  // captured at mount so a popstate that is LEAVING this page (Back to the
  // previous route, handled by the router in a transition) does not flash
  // the grid to the unfiltered view while the old page is still on screen.
  useEffect(() => {
    const pathname = window.location.pathname;
    const read = () => {
      if (window.location.pathname !== pathname) return;
      const next = portfolioFilterStateFromSearch(window.location.search, sections);
      setFilterState(next);
      setPage(1);
      // Canonicalise a pasted or hand-typed address in place (no history entry).
      const canonical = portfolioSearchFromFilterState(next, sections);
      const target = `${pathname}${canonical ? `?${canonical}` : ''}`;
      if (`${pathname}${window.location.search}` !== target) {
        window.history.replaceState(window.history.state, '', target);
      }
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [sections]);

  // State -> URL on a user change. pushState (not replaceState) so the Back
  // button undoes a filter step; the popstate listener above restores it.
  const applyFilters = useCallback(
    (next: DealsFilterState) => {
      setFilterState(next);
      setPage(1);
      setCopyState('idle');
      const qs = portfolioSearchFromFilterState(next, sections);
      const target = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (target !== current) window.history.pushState(null, '', target);
    },
    [sections],
  );

  // Clearing removes the buttons the user may be standing on, so focus moves
  // to the count heading instead of falling to <body>.
  const clearFilters = useCallback(() => {
    applyFilters({});
    countRef.current?.focus();
  }, [applyFilters]);

  const filtered = useMemo(
    () => applyFacetFilters(tiles, sections, filterState, (t) => t.id),
    [tiles, sections, filterState],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PORTFOLIO_PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const start = (page - 1) * PORTFOLIO_PAGE_SIZE;
  const visible = filtered.slice(start, start + PORTFOLIO_PAGE_SIZE);
  const activeCount = countActivePortfolioFilters(filterState);

  // A filter change can shrink the set under an open viewer: close it.
  useEffect(() => {
    if (lightbox && lightbox.index >= filtered.length) setLightbox(null);
  }, [lightbox, filtered.length]);

  const openTile = useCallback(
    (visibleIndex: number, opener: HTMLButtonElement) =>
      setLightbox({ index: start + visibleIndex, opener }),
    [start],
  );
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const navigateLightbox = useCallback(
    (index: number) => setLightbox((current) => (current ? { ...current, index } : current)),
    [],
  );

  // Copy the canonical link for the current FILTERS (built from state, not
  // read off the address bar, so it never carries a stray parameter).
  const copyLink = useCallback(async () => {
    const qs = portfolioSearchFromFilterState(filterState, sections);
    const link = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }, [filterState, sections]);
  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  // Scroll back to the top of the grid when the PAGE changes (compared with
  // the previous page rather than a first-render flag, which React
  // StrictMode's double mount would trip in development).
  const gridTopRef = useRef<HTMLDivElement | null>(null);
  const previousPageRef = useRef(page);
  useEffect(() => {
    if (previousPageRef.current !== page) {
      gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    previousPageRef.current = page;
  }, [page]);

  const showingEnd = Math.min(start + PORTFOLIO_PAGE_SIZE, filtered.length);
  const noun = (n: number) => (n === 1 ? 'photo' : 'photos');
  const countLabel =
    totalPages > 1
      ? `Showing ${start + 1}-${showingEnd} of ${filtered.length} ${noun(filtered.length)}`
      : activeCount > 0
        ? `Showing ${filtered.length} of ${tiles.length} ${noun(tiles.length)}`
        : `${tiles.length} ${noun(tiles.length)}`;

  const copyLabel =
    copyState === 'copied'
      ? 'Link copied'
      : copyState === 'failed'
        ? 'Copy the address bar instead'
        : 'Copy link to these filters';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <DealsFilterSidebar sections={sections} state={filterState} onChange={applyFilters} />

      <div>
        <div ref={gridTopRef} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            ref={countRef}
            tabIndex={-1}
            className="text-xl font-semibold text-brand-ink outline-none"
            aria-live="polite"
          >
            {countLabel}
          </h2>
          {activeCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex h-9 items-center rounded border border-border bg-white px-3 text-sm font-medium text-brand-ink hover:border-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
              >
                {copyLabel}
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center rounded border border-border bg-white px-3 text-sm font-medium text-brand-red hover:border-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded border border-border bg-bg-soft p-10 text-center">
            <h3 className="text-lg font-semibold text-brand-ink">No photos match those filters</h3>
            <p className="mx-auto mt-2 max-w-prose text-text-muted">
              Try clearing a filter to see more of our work.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 inline-flex h-11 items-center justify-center rounded border border-border bg-white px-5 font-medium text-brand-ink hover:border-brand-ink"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <PortfolioGrid
              tiles={visible}
              onOpen={openTile}
              eagerCount={page === 1 ? PORTFOLIO_EAGER_TILES : 0}
            />
            <ClientPagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              ariaLabel="Portfolio pagination"
            />
          </>
        )}
      </div>

      {lightbox ? (
        <PortfolioLightbox
          tiles={filtered}
          index={lightbox.index}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          returnFocusTo={lightbox.opener}
        />
      ) : null}
    </div>
  );
}
