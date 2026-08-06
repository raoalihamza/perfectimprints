'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SearchResultRow } from '@/components/search/SearchResultRow';
import { SearchEmptyCTA } from '@/components/search/SearchEmptyCTA';
import { useResultNavigation } from '@/components/search/useResultNavigation';
import { prefetchSearchIndex, search, type SearchResult } from '@/lib/search/load-index';
import { SEARCH_GROUP_ORDER, orderedSearchGroups } from '@/lib/search/group-order';
import type { SearchItemType } from '@/lib/search/types';

const SEARCH_PLACEHOLDER =
  'Search custom tote bags, branded drinkware, personalized pens, brands...';
const FETCH_LIMIT = 50;
const DEBOUNCE_MS = 150;

interface SearchBoxProps {
  className?: string;
  placeholder?: string;
  /**
   * Extra classes for the results dropdown (Q-170). The panel is normally as
   * wide as the input, which is right in the header but cramped where the box
   * sits in a narrow column. The blog and video index pages use this to let the
   * panel grow leftwards instead of squeezing product rows. Purely additive:
   * unset, the panel is byte-identical to before.
   */
  panelClassName?: string;
  /**
   * Result group to show FIRST in the dropdown (Q-180 improvement 3). The blog
   * index passes 'blog' and the video index 'video' so a visitor searching from
   * those pages sees the matching content type up top instead of below four
   * groups of categories and products. Presentation only: the search stays
   * site-wide, the index/ranking/caps are untouched, the other groups keep
   * their existing relative order, and the header box (no prop) is unchanged.
   */
  priorityType?: SearchItemType;
}

/**
 * Header search input with a lazy, grouped autocomplete overlay (M3-309 /
 * M5-502b). Fuse.js and the prebuilt index load on first focus via
 * `lib/search/load-index` — neither is in the initial route bundle. Results are
 * grouped (Categories / Products / Brands / Blogs) with product thumbnails;
 * arrow keys move the highlight across all rows + the "See all results" footer,
 * Enter selects, Escape closes.
 */
export function SearchBox({
  className,
  placeholder = SEARCH_PLACEHOLDER,
  panelClassName,
  priorityType,
}: SearchBoxProps) {
  const router = useRouter();
  const { navigate } = useResultNavigation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLFormElement>(null);
  const reqId = useRef(0);
  // Unique per instance — the header renders SearchBox twice (desktop + mobile),
  // so static ids would collide in the DOM and break aria-controls wiring.
  const uid = useId();
  const inputId = `${uid}-input`;
  const listboxId = `${uid}-listbox`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const trimmed = query.trim();

  // Group results into ordered sections; `ordered` is the flat keyboard-nav list.
  // `priorityType` (Q-180) lifts one group to the front; everything else keeps
  // its default position. Which items match, and how many, never changes - the
  // ordering rule itself lives in lib/search/group-order.ts (pure, tested).
  const { sections, ordered } = useMemo(() => {
    const groups = orderedSearchGroups(priorityType);
    const secs: { heading: string; type: SearchItemType; startIndex: number; items: SearchResult[] }[] = [];
    const flat: SearchResult[] = [];
    for (const g of groups) {
      const items = results.filter((r) => r.type === g.type).slice(0, g.cap);
      if (items.length === 0) continue;
      secs.push({ heading: g.heading, type: g.type, startIndex: flat.length, items });
      flat.push(...items);
    }
    return { sections: secs, ordered: flat };
  }, [results, priorityType]);

  const hasResults = ordered.length > 0;
  const seeAllIndex = ordered.length; // the "See all results" row
  const totalLabel = results.length >= FETCH_LIMIT ? `${FETCH_LIMIT}+` : String(results.length);

  // Debounced search. A monotonic request id discards out-of-order responses.
  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(() => {
      // Q-180: on the blog/video index pages, guarantee the priority group is
      // populated from ACTUAL matches. Without this the global top-50 over ~30k
      // categories/products crowds out every video/blog on a broad query and the
      // lifted group renders nothing even though matches exist. The header box
      // passes no priorityType and searches exactly as before.
      search(
        trimmed,
        FETCH_LIMIT,
        priorityType
          ? {
              ensureType: priorityType,
              ensureCount: SEARCH_GROUP_ORDER.find((g) => g.type === priorityType)?.cap ?? 3,
            }
          : undefined,
      )
        .then((res) => {
          if (id !== reqId.current) return;
          setResults(res);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setResults([]);
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [trimmed, priorityType]);

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const goToSearchPage = useCallback(() => {
    if (!trimmed) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [router, trimmed]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (!hasResults) return;
      setActiveIndex((i) => Math.min(i + 1, seeAllIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hasResults && activeIndex >= 0 && activeIndex < ordered.length) {
        setOpen(false);
        navigate(ordered[activeIndex]);
      } else {
        goToSearchPage();
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const showPanel = open && trimmed.length > 0;
  const activeOptionId =
    activeIndex >= 0 && activeIndex < ordered.length ? optionId(activeIndex) : undefined;

  return (
    <form
      ref={rootRef}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        goToSearchPage();
      }}
      className={`relative ${className ?? ''}`}
    >
      <label htmlFor={inputId} className="sr-only">
        Search
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="search"
          name="q"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true);
            prefetchSearchIndex();
          }}
          onKeyDown={onKeyDown}
        />
        <Button type="submit" variant="secondary" size="md">
          Search
        </Button>
      </div>

      {showPanel && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className={`absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-border bg-white shadow-xl ${panelClassName ?? ''}`}
        >
          {hasResults ? (
            <>
              <div className="max-h-[70vh] overflow-y-auto py-1">
                {sections.map((section) => (
                  <div key={section.type}>
                    <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      {section.heading}
                    </p>
                    {section.items.map((item, j) => {
                      const i = section.startIndex + j;
                      return (
                        <SearchResultRow
                          key={`${item.type}-${item.url}-${i}`}
                          item={item}
                          active={i === activeIndex}
                          optionId={optionId(i)}
                          onActivate={() => setOpen(false)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === seeAllIndex}
                onClick={goToSearchPage}
                onMouseEnter={() => setActiveIndex(seeAllIndex)}
                className={`block w-full border-t border-border px-4 py-2.5 text-left text-sm font-medium text-brand-red transition-colors hover:bg-bg-soft ${
                  activeIndex === seeAllIndex ? 'bg-bg-soft' : ''
                }`}
              >
                See all {totalLabel} results for &ldquo;{trimmed}&rdquo;
              </button>
            </>
          ) : loading ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">Searching…</p>
          ) : (
            <SearchEmptyCTA query={trimmed} variant="compact" />
          )}
        </div>
      )}
    </form>
  );
}
