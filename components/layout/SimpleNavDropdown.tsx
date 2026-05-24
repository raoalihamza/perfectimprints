'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { MegaMenuItem } from './MegaMenu';

interface SimpleNavDropdownProps {
  item: MegaMenuItem;
}

export function SimpleNavDropdown({ item }: SimpleNavDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClickAway(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickAway);
    };
  }, []);

  return (
    <li
      ref={containerRef}
      className="relative"
      role="none"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        className="rounded px-3 py-3 text-sm font-medium text-brand-ink hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
      >
        {item.label}
        <span aria-hidden="true" className="ml-1 inline-block text-xs">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute left-0 top-full z-50 min-w-[220px] border border-border bg-white p-2 shadow-lg"
        >
          {item.children?.map((child) => (
            <li key={child.label} role="none">
              <Link
                href={child.href}
                role="menuitem"
                className="block rounded px-3 py-2 text-sm text-text-primary hover:bg-bg-soft hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
                onClick={() => setOpen(false)}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
