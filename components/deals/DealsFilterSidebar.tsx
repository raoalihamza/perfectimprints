'use client';

import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { FilterSection } from '@/components/category/FilterSection';
import type { DealsFacetSection, DealsFilterState } from '@/lib/deals-filter';

interface DealsFilterSidebarProps {
  sections: DealsFacetSection[];
  state: DealsFilterState;
  onChange: (next: DealsFilterState) => void;
}

const COLLAPSED_VISIBLE = 6;

export function DealsFilterSidebar({ sections, state, onChange }: DealsFilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeCount = useMemo(
    () => Object.values(state).reduce((n, vs) => n + vs.length, 0),
    [state],
  );

  const toggleValue = useCallback(
    (field: string, valueId: string) => {
      const next: DealsFilterState = { ...state };
      const current = next[field] || [];
      if (current.includes(valueId)) {
        const remaining = current.filter((v) => v !== valueId);
        if (remaining.length === 0) delete next[field];
        else next[field] = remaining;
      } else {
        next[field] = [...current, valueId];
      }
      onChange(next);
    },
    [state, onChange],
  );

  const clearAll = useCallback(() => onChange({}), [onChange]);

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

      <aside
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:backdrop-blur-none',
          mobileOpen ? 'block' : 'hidden lg:block',
        )}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMobileOpen(false);
        }}
      >
        <div
          className={cn(
            'h-full w-full max-w-sm overflow-y-auto bg-white shadow-xl lg:max-w-none lg:shadow-none',
            'lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:rounded-md lg:border lg:border-border',
          )}
        >
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
              <h2 className="text-base font-semibold text-brand-ink">Narrow your search</h2>
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

            {sections.map((section) => {
              const selected = state[section.field] || [];
              return (
                <FilterSection
                  key={section.field}
                  title={section.label}
                  count={section.values.length}
                >
                  <FacetValueList
                    section={section}
                    selected={selected}
                    onToggle={(id) => toggleValue(section.field, id)}
                  />
                </FilterSection>
              );
            })}

            {sections.length === 0 && (
              <p className="text-sm text-text-muted">No filters available right now.</p>
            )}
          </div>

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

interface FacetValueListProps {
  section: DealsFacetSection;
  selected: string[];
  onToggle: (valueId: string) => void;
}

function FacetValueList({ section, selected, onToggle }: FacetValueListProps) {
  const [expanded, setExpanded] = useState(false);
  const values = section.values;
  const visible = expanded ? values : values.slice(0, COLLAPSED_VISIBLE);
  const hidden = values.length - visible.length;

  return (
    <div>
      <ul className="space-y-1.5">
        {visible.map((v) => {
          const isOn = selected.includes(v.id);
          return (
            <li key={v.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary hover:text-brand-ink">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => onToggle(v.id)}
                  className="h-4 w-4 rounded border-border text-brand-red focus:ring-brand-red"
                  aria-label={`${section.label}: ${v.label}`}
                />
                {section.field === 'colors' && (
                  <span
                    aria-hidden
                    className="h-4 w-4 rounded-full border border-border"
                    style={{ background: colorSwatch(v.value || v.label) }}
                  />
                )}
                <span className="flex-1">{v.label}</span>
                <span className="text-xs text-text-muted">({v.count})</span>
              </label>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium text-brand-red hover:underline"
        >
          More Options ({hidden})
        </button>
      )}
      {expanded && values.length > COLLAPSED_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 text-xs font-medium text-brand-red hover:underline"
        >
          Less Options
        </button>
      )}
    </div>
  );
}

function colorSwatch(value: string): string {
  const key = value.toLowerCase();
  const map: Record<string, string> = {
    black: '#111',
    blue: '#1e3a8a',
    red: '#dc2626',
    white: '#fff',
    gray: '#9ca3af',
    'gray/silver': '#9ca3af',
    silver: '#c0c0c0',
    green: '#16a34a',
    orange: '#ea580c',
    purple: '#7e22ce',
    pink: '#ec4899',
    yellow: '#facc15',
    'yellow/gold': '#d4a017',
    gold: '#d4a017',
    brown: '#78350f',
    clear: 'transparent',
    'multi-colored': 'linear-gradient(45deg, #f87171, #facc15, #22c55e, #60a5fa, #a855f7)',
    // The portfolio colour vocabulary's spelling (lib/portfolio/colors.ts, PORT-110).
    'multi-color': 'linear-gradient(45deg, #f87171, #facc15, #22c55e, #60a5fa, #a855f7)',
    multi: 'linear-gradient(45deg, #f87171, #facc15, #22c55e, #60a5fa, #a855f7)',
    rainbow: 'linear-gradient(45deg, #f87171, #facc15, #22c55e, #60a5fa, #a855f7)',
    camo: '#4a5e3a',
    safety: '#facc15',
    iridescent: 'linear-gradient(45deg, #c084fc, #60a5fa, #34d399)',
    neon: '#84cc16',
  };
  return map[key] || '#d1d5db';
}
