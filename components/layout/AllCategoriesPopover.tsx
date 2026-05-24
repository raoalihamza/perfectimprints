'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { NavDepartment } from '@/lib/nav-data';

interface AllCategoriesPopoverProps {
  label?: string;
  departments: NavDepartment[];
}

interface NavThing {
  label: string;
  href: string | null;
  available: boolean;
}

function NavLink({
  node,
  className,
  disabledClassName,
  onClick,
}: {
  node: NavThing;
  className: string;
  disabledClassName: string;
  onClick?: () => void;
}) {
  if (node.available && node.href) {
    return (
      <Link href={node.href} className={className} onClick={onClick}>
        {node.label}
      </Link>
    );
  }
  return (
    <span
      className={disabledClassName}
      aria-disabled="true"
      title="Coming soon"
    >
      {node.label}
    </span>
  );
}

export function AllCategoriesPopover({
  label = 'All Categories',
  departments,
}: AllCategoriesPopoverProps) {
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
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      role="none"
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
        {label}
        <span aria-hidden="true" className="ml-1 inline-block text-xs">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="scrollbar-hide absolute left-0 top-full z-50 max-h-[80vh] w-screen max-w-[1100px] overflow-y-auto overscroll-contain border border-border bg-white p-6 shadow-lg"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {departments.map((dept) => (
              <div key={dept.slug}>
                <NavLink
                  node={dept}
                  onClick={() => setOpen(false)}
                  className="block text-sm font-semibold text-brand-ink hover:text-brand-red"
                  disabledClassName="block text-sm font-semibold text-text-muted/70 cursor-not-allowed"
                />
                {dept.children.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {dept.children.slice(0, 10).map((child) => (
                      <li key={child.label}>
                        <NavLink
                          node={child}
                          onClick={() => setOpen(false)}
                          className="block text-xs text-text-primary hover:text-brand-red"
                          disabledClassName={cn(
                            'block text-xs text-text-muted/60 cursor-not-allowed',
                          )}
                        />
                      </li>
                    ))}
                    {dept.children.length > 10 && (
                      <li>
                        <NavLink
                          node={dept}
                          onClick={() => setOpen(false)}
                          className="block text-xs font-medium text-brand-red hover:underline"
                          disabledClassName="block text-xs font-medium text-text-muted/60 cursor-not-allowed"
                        />
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
