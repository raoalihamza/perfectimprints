'use client';

import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface MegaMenuChild {
  label: string;
  href: string;
}

export interface MegaMenuItem {
  label: string;
  href: string;
  featured?: boolean;
  children?: MegaMenuChild[];
}

interface MegaMenuProps {
  items: MegaMenuItem[];
  className?: string;
}

export function MegaMenu({ items, className }: MegaMenuProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenIndex(null);
    }
    function onClickAway(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpenIndex(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickAway);
    };
  }, []);

  return (
    <ul
      ref={containerRef}
      className={cn('hidden items-center gap-1 lg:flex', className)}
      role="menubar"
    >
      {items.map((item, idx) => {
        const hasDropdown = (item.children && item.children.length > 0) || item.featured;
        const isOpen = openIndex === idx;
        const dropdownId = `mega-menu-dropdown-${idx}`;
        return (
          <li
            key={item.label}
            role="none"
            onMouseEnter={() => hasDropdown && setOpenIndex(idx)}
            onMouseLeave={() => setOpenIndex(null)}
            className="relative"
          >
            {hasDropdown ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                  aria-controls={dropdownId}
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  onFocus={() => setOpenIndex(idx)}
                  className="rounded px-3 py-3 text-sm font-medium text-brand-ink hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
                >
                  {item.label}
                </button>
                {isOpen && (
                  <div
                    id={dropdownId}
                    role="menu"
                    className="absolute left-0 top-full z-50 mt-0 min-w-[240px] border border-border bg-white p-2 shadow-lg"
                  >
                    {item.featured ? (
                      <p className="px-3 py-2 text-sm text-text-muted">Loading...</p>
                    ) : (
                      <ul className="grid gap-1">
                        {item.children?.map((child) => (
                          <li key={child.label} role="none">
                            <Link
                              href={child.href}
                              role="menuitem"
                              className="block rounded px-3 py-2 text-sm text-text-primary hover:bg-bg-soft hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            ) : (
              <Link
                href={item.href}
                role="menuitem"
                className="block rounded px-3 py-3 text-sm font-medium text-brand-ink hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
              >
                {item.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
