'use client';

import { useEffect, useState } from 'react';

interface SearchWithinCategoryProps {
  /** Debounced value emitted upward; parent uses it to filter the grid. */
  onChange: (query: string) => void;
  placeholder?: string;
}

export function SearchWithinCategory({ onChange, placeholder = 'Search within this category' }: SearchWithinCategoryProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const id = setTimeout(() => onChange(value.trim().toLowerCase()), 150);
    return () => clearTimeout(id);
  }, [value, onChange]);

  return (
    <div className="relative">
      <label htmlFor="search-within-category" className="sr-only">
        Search within this category
      </label>
      <input
        id="search-within-category"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted/70 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
      >
        🔍
      </span>
    </div>
  );
}
