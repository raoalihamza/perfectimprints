'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { NavDepartment, NavNode } from '@/lib/nav-data';

interface ShopByMegaMenuProps {
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
      <Link
        href={node.href}
        className={className}
        onClick={onClick}
        role="menuitem"
      >
        {node.label}
      </Link>
    );
  }
  return (
    <span
      className={disabledClassName}
      aria-disabled="true"
      role="menuitem"
      title="Coming soon"
    >
      {node.label}
    </span>
  );
}

export function ShopByMegaMenu({ label = 'Shop by', departments }: ShopByMegaMenuProps) {
  const [open, setOpen] = useState(false);
  const [hoveredDept, setHoveredDept] = useState<string | null>(null);
  const [hoveredChild, setHoveredChild] = useState<string | null>(null);
  const containerRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setHoveredDept(null);
        setHoveredChild(null);
      }
    }
    function onClickAway(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setHoveredDept(null);
        setHoveredChild(null);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickAway);
    };
  }, []);

  const activeDept = departments.find((d) => d.slug === hoveredDept) ?? null;
  const activeChild: NavNode | null =
    activeDept?.children.find((c) => c.label === hoveredChild) ?? null;

  function closeAll() {
    setOpen(false);
    setHoveredDept(null);
    setHoveredChild(null);
  }

  return (
    <li
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={closeAll}
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
          className="absolute left-0 top-full z-50 flex max-h-[80vh] border border-border bg-white shadow-lg"
        >
          <ul className="w-60 scrollbar-hide overflow-y-auto overscroll-contain border-r border-border py-2" role="none">
            {departments.map((dept) => {
              const isActive = hoveredDept === dept.slug;
              const baseRow =
                'flex w-full items-center justify-between px-4 py-2 text-sm transition-colors';
              return (
                <li
                  key={dept.slug}
                  role="none"
                  onMouseEnter={() => {
                    setHoveredDept(dept.slug);
                    setHoveredChild(null);
                  }}
                  className="flex items-stretch"
                >
                  <NavLink
                    node={dept}
                    onClick={closeAll}
                    className={cn(
                      baseRow,
                      isActive
                        ? 'bg-bg-soft text-brand-red'
                        : 'text-text-primary hover:bg-bg-soft hover:text-brand-red',
                    )}
                    disabledClassName={cn(
                      baseRow,
                      'cursor-not-allowed text-text-muted/60',
                      isActive && 'bg-bg-soft',
                    )}
                  />
                </li>
              );
            })}
          </ul>

          {activeDept && activeDept.children.length > 0 && (
            <ul className="w-64 scrollbar-hide overflow-y-auto overscroll-contain border-r border-border py-2" role="none">
              {activeDept.children.map((child) => {
                const isActive = hoveredChild === child.label;
                const hasGrandkids = child.children.length > 0;
                const baseRow =
                  'flex w-full items-center justify-between gap-2 px-4 py-2 text-sm transition-colors';
                return (
                  <li
                    key={child.label}
                    role="none"
                    onMouseEnter={() => setHoveredChild(child.label)}
                    className="flex items-stretch"
                  >
                    <NavLink
                      node={child}
                      onClick={closeAll}
                      className={cn(
                        baseRow,
                        isActive
                          ? 'bg-bg-soft text-brand-red'
                          : 'text-text-primary hover:bg-bg-soft hover:text-brand-red',
                      )}
                      disabledClassName={cn(
                        baseRow,
                        'cursor-not-allowed text-text-muted/60',
                        isActive && 'bg-bg-soft',
                      )}
                    />
                    {hasGrandkids && (
                      <span
                        aria-hidden="true"
                        className="flex items-center pr-2 text-text-muted"
                      >
                        ›
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {activeChild && activeChild.children.length > 0 && (
            <ul className="w-64 scrollbar-hide overflow-y-auto overscroll-contain py-2" role="none">
              {activeChild.children.map((g) => (
                <li key={g.label} role="none">
                  <NavLink
                    node={g}
                    onClick={closeAll}
                    className="block px-4 py-2 text-sm text-text-primary hover:bg-bg-soft hover:text-brand-red"
                    disabledClassName="block cursor-not-allowed px-4 py-2 text-sm text-text-muted/60"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
