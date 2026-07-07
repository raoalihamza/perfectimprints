'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SORT,
  countActiveFilters,
  emptyFilterState,
  filterStateFromSearchKey,
  serializeFilterState,
  type FilterState,
  type SidebarData,
} from '@/lib/filter-types';
import { FilterSection } from './FilterSection';
import { MinQuantityFilter } from './MinQuantityFilter';
import { SearchWithinCategory } from './SearchWithinCategory';

interface FilterSidebarProps {
  sidebar: SidebarData;
  /**
   * Current URL query string, owned by CategoryShell (read post-mount from
   * window.location — NOT useSearchParams, which would CSR-bail the /cat
   * prerender; see CategoryShell).
   */
  searchKey: string;
  /** Push a new URL (router.push, scroll:false) + keep the shared query state in sync. */
  navigate: (url: string) => void;
  /** Emits the search-within query string upward to the parent grid wrapper. */
  onSearchWithin?: (query: string) => void;
}

export function FilterSidebar({ sidebar, searchKey, navigate, onSearchWithin }: FilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Parse current filter state from the URL query (single source of truth).
  const state: FilterState = useMemo(() => filterStateFromSearchKey(searchKey), [searchKey]);

  const activeCount = countActiveFilters(state);

  /** Root URL for the current category (e.g. /cat/water-bottles). */
  const rootUrl = `/cat/${sidebar.rootSlug}`;

  /**
   * Navigate to a new filter state. If exactly one facet is selected AND it has a
   * matching static URL, navigate to that URL. Otherwise navigate to the root URL
   * with query params for multi-facet / non-static-URL combinations.
   */
  const pushState = useCallback(
    (next: FilterState, opts?: { preferStaticUrl?: { staticUrl: string } }) => {
      const facetKeys = Object.keys(next.facets);
      const singleFacetType =
        facetKeys.length === 1 && next.facets[facetKeys[0]].length === 1
          ? { key: facetKeys[0], value: next.facets[facetKeys[0]][0] }
          : null;
      const noOtherFilters =
        next.minQtyBuckets.length === 0 &&
        next.priceMin == null &&
        next.priceMax == null &&
        !next.newOnly &&
        !next.madeInUsa &&
        !next.ecoFriendly &&
        !next.deals;

      // Case 1: single facet with a known static URL + no other state → navigate there.
      if (opts?.preferStaticUrl && singleFacetType && noOtherFilters && next.sort === DEFAULT_SORT) {
        navigate(opts.preferStaticUrl.staticUrl);
        return;
      }

      // Default: stay on root URL + serialize state.
      const qs = serializeFilterState(next);
      navigate(qs ? `${rootUrl}?${qs}` : rootUrl);
    },
    [navigate, rootUrl]
  );

  const toggleFacet = useCallback(
    (facetType: string, value: string, staticUrl: string | null) => {
      const next: FilterState = {
        ...state,
        facets: { ...state.facets },
      };
      const current = next.facets[facetType] || [];
      if (current.includes(value)) {
        const remaining = current.filter((v) => v !== value);
        if (remaining.length === 0) delete next.facets[facetType];
        else next.facets[facetType] = remaining;
      } else {
        next.facets[facetType] = [...current, value];
      }
      pushState(next, staticUrl ? { preferStaticUrl: { staticUrl } } : undefined);
    },
    [state, pushState]
  );

  const toggleMinQty = useCallback(
    (bucketKey: string) => {
      const next: FilterState = { ...state };
      next.minQtyBuckets = state.minQtyBuckets.includes(bucketKey)
        ? state.minQtyBuckets.filter((b) => b !== bucketKey)
        : [...state.minQtyBuckets, bucketKey];
      pushState(next);
    },
    [state, pushState]
  );

  const toggleRefineBy = useCallback(
    (key: 'newOnly' | 'madeInUsa' | 'ecoFriendly' | 'deals') => {
      const next: FilterState = { ...state, [key]: !state[key] };
      pushState(next);
    },
    [state, pushState]
  );

  const updatePriceRange = useCallback(
    (lo: number | null, hi: number | null) => {
      pushState({ ...state, priceMin: lo, priceMax: hi });
    },
    [state, pushState]
  );

  const clearAll = useCallback(() => {
    const next = emptyFilterState();
    next.sort = state.sort; // Preserve sort.
    pushState(next);
  }, [state, pushState]);

  return (
    <>
      {/* Mobile open button */}
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium text-brand-ink hover:border-brand-ink"
        >
          <span aria-hidden>≡</span>
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-red px-2 py-0.5 text-xs font-semibold text-white">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-medium text-brand-red hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Sidebar — desktop sticky / mobile drawer */}
      <aside
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:backdrop-blur-none',
          mobileOpen ? 'block' : 'hidden lg:block'
        )}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMobileOpen(false);
        }}
      >
        <div
          className={cn(
            'h-full w-full max-w-sm overflow-y-auto bg-white shadow-xl lg:max-w-none lg:shadow-none',
            'lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:rounded-md lg:border lg:border-border'
          )}
        >
          {/* Mobile header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
            <h2 className="text-base font-semibold text-brand-ink">Filters</h2>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded p-1 text-text-muted hover:text-brand-ink"
              aria-label="Close filters"
            >
              ✕
            </button>
          </div>

          <div className="p-4 lg:p-5">
            <div className="mb-3">
              <SearchWithinCategory onChange={onSearchWithin ?? (() => {})} />
            </div>

            {activeCount > 0 && (
              <div className="mb-3 flex items-center justify-between rounded bg-bg-soft px-3 py-2 text-xs">
                <span className="font-medium text-brand-ink">
                  {activeCount} filter{activeCount === 1 ? '' : 's'} applied
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="font-semibold text-brand-red hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Refine-by quick toggles */}
            <FilterSection title="Quick Filters" defaultOpen>
              <ul className="space-y-1.5">
                {sidebar.refineBy.newItems > 0 && (
                  <RefineByItem
                    label="New Items"
                    count={sidebar.refineBy.newItems}
                    checked={state.newOnly}
                    onToggle={() => toggleRefineBy('newOnly')}
                  />
                )}
                {sidebar.refineBy.deals > 0 && (
                  <RefineByItem
                    label="Deals / Closeout"
                    count={sidebar.refineBy.deals}
                    checked={state.deals}
                    onToggle={() => toggleRefineBy('deals')}
                  />
                )}
                {sidebar.refineBy.madeInUsa > 0 && (
                  <RefineByItem
                    label="Made in USA"
                    count={sidebar.refineBy.madeInUsa}
                    checked={state.madeInUsa}
                    onToggle={() => toggleRefineBy('madeInUsa')}
                  />
                )}
                {sidebar.refineBy.ecoFriendly > 0 && (
                  <RefineByItem
                    label="Eco-Friendly"
                    count={sidebar.refineBy.ecoFriendly}
                    checked={state.ecoFriendly}
                    onToggle={() => toggleRefineBy('ecoFriendly')}
                  />
                )}
              </ul>
            </FilterSection>

            {/* Min Quantity (Patrick's PI differentiator) */}
            {sidebar.minQtyBuckets.length > 0 && (
              <FilterSection title="Minimum Quantity" defaultOpen>
                <MinQuantityFilter
                  buckets={sidebar.minQtyBuckets}
                  selected={state.minQtyBuckets}
                  onToggle={toggleMinQty}
                />
              </FilterSection>
            )}

            {/* Price range */}
            {sidebar.price && (
              <FilterSection title="Price Range" defaultOpen>
                <PriceRangeFilter
                  min={sidebar.price.min}
                  max={sidebar.price.max}
                  valueMin={state.priceMin}
                  valueMax={state.priceMax}
                  onApply={updatePriceRange}
                />
              </FilterSection>
            )}

            {/* Standard facet sections */}
            {sidebar.sections.map((section) => {
              const selected = state.facets[section.key] || [];
              return (
                <FilterSection key={section.key} title={section.label} count={section.values.length}>
                  <ul className="space-y-1.5">
                    {section.values.map((opt) => {
                      const isOn = selected.includes(opt.value);
                      return (
                        <li key={opt.value}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary hover:text-brand-ink">
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggleFacet(section.key, opt.value, opt.staticUrl)}
                              className="h-4 w-4 rounded border-border text-brand-red focus:ring-brand-red"
                              aria-label={`${section.label}: ${opt.label}`}
                            />
                            {section.key === 'color' && (
                              <span
                                aria-hidden
                                className="h-4 w-4 rounded-full border border-border"
                                style={{ background: colorSwatch(opt.value) }}
                              />
                            )}
                            <span className="flex-1">{opt.label}</span>
                            <span className="text-xs text-text-muted">({opt.count})</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </FilterSection>
              );
            })}
          </div>

          {/* Mobile apply/close footer */}
          <div className="sticky bottom-0 flex gap-3 border-t border-border bg-white p-3 lg:hidden">
            <button
              type="button"
              onClick={clearAll}
              className="h-11 flex-1 rounded-md border border-border bg-white text-sm font-medium text-brand-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="h-11 flex-1 rounded-md bg-brand-green text-sm font-semibold text-white"
            >
              View results
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function RefineByItem({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary hover:text-brand-ink">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 rounded border-border text-brand-red focus:ring-brand-red"
          aria-label={label}
        />
        <span className="flex-1">{label}</span>
        <span className="text-xs text-text-muted">({count})</span>
      </label>
    </li>
  );
}

function PriceRangeFilter({
  min,
  max,
  valueMin,
  valueMax,
  onApply,
}: {
  min: number;
  max: number;
  valueMin: number | null;
  valueMax: number | null;
  onApply: (lo: number | null, hi: number | null) => void;
}) {
  const [lo, setLo] = useState<string>(valueMin != null ? String(valueMin) : '');
  const [hi, setHi] = useState<string>(valueMax != null ? String(valueMax) : '');

  // Sync local state when URL changes (e.g. clear-all).
  useEffect(() => {
    setLo(valueMin != null ? String(valueMin) : '');
    setHi(valueMax != null ? String(valueMax) : '');
  }, [valueMin, valueMax]);

  function apply() {
    const loN = lo === '' ? null : Number(lo);
    const hiN = hi === '' ? null : Number(hi);
    onApply(
      loN != null && !Number.isNaN(loN) ? loN : null,
      hiN != null && !Number.isNaN(hiN) ? hiN : null
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-text-muted">
        Catalog range: ${min} – ${max}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          placeholder={`$${min}`}
          value={lo}
          onChange={(e) => setLo(e.target.value)}
          className="h-9 w-full min-w-0 flex-1 rounded border border-border px-2 text-sm focus:border-brand-red focus:outline-none"
          aria-label="Minimum price"
        />
        <span className="text-text-muted">–</span>
        <input
          type="number"
          min={0}
          placeholder={`$${max}`}
          value={hi}
          onChange={(e) => setHi(e.target.value)}
          className="h-9 w-full min-w-0 flex-1 rounded border border-border px-2 text-sm focus:border-brand-red focus:outline-none"
          aria-label="Maximum price"
        />
      </div>
      <button
        type="button"
        onClick={apply}
        className="mt-2 h-9 w-full rounded bg-brand-ink px-3 text-xs font-semibold text-white hover:bg-brand-ink/90"
      >
        Apply
      </button>
    </div>
  );
}

// Approximate hex swatches for color filter slugs. Anything not in the map renders gray.
const COLOR_SWATCHES: Record<string, string> = {
  black: '#1a1a1a',
  white: '#ffffff',
  gray: '#9ca3af',
  grey: '#9ca3af',
  silver: '#c0c0c0',
  red: '#dc2626',
  burgundy: '#7f1d1d',
  pink: '#ec4899',
  orange: '#f97316',
  yellow: '#facc15',
  gold: '#d4af37',
  green: '#16a34a',
  blue: '#2563eb',
  navy: '#1e3a8a',
  teal: '#0d9488',
  purple: '#7c3aed',
  brown: '#78350f',
  tan: '#d2b48c',
  beige: '#e8d8b8',
  camo: 'linear-gradient(45deg,#3a4a2a,#7a8b5a,#3a4a2a)',
  'multi-color': 'linear-gradient(90deg,#dc2626,#facc15,#16a34a,#2563eb)',
  clear: 'rgba(255,255,255,0.4)',
};

function colorSwatch(value: string): string {
  return COLOR_SWATCHES[value] || '#d1d5db';
}
