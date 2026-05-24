'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MegaMenuItem } from './MegaMenu';

interface MobileDrawerProps {
  items: MegaMenuItem[];
}

export function MobileDrawer({ items }: MobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-drawer"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded text-brand-ink hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink lg:hidden"
      >
        <span aria-hidden="true" className="text-2xl leading-none">
          {open ? '✕' : '☰'}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        id="mobile-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-80 max-w-[90vw] transform overflow-y-auto bg-white shadow-xl transition-transform lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <span className="font-semibold text-brand-ink">Menu</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded text-brand-ink hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <ul className="p-2">
          {items.map((item, idx) => {
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedIndex === idx;
            return (
              <li key={item.label}>
                {hasChildren ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                      className="flex w-full items-center justify-between rounded px-3 py-3 text-left text-base font-medium text-brand-ink hover:bg-bg-soft"
                    >
                      {item.label}
                      <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </button>
                    {isExpanded && (
                      <ul className="pl-4">
                        {item.children?.map((child) => {
                          const isExternal = /^https?:\/\//i.test(child.href);
                          const className =
                            'block rounded px-3 py-2 text-sm text-text-primary hover:bg-bg-soft';
                          return (
                            <li key={child.label}>
                              {isExternal ? (
                                <a
                                  href={child.href}
                                  target="_blank"
                                  rel="noopener noreferrer sponsored"
                                  className={className}
                                  onClick={() => setOpen(false)}
                                >
                                  {child.label}
                                </a>
                              ) : (
                                <Link
                                  href={child.href}
                                  className={className}
                                  onClick={() => setOpen(false)}
                                >
                                  {child.label}
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : /^https?:\/\//i.test(item.href) ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="block rounded px-3 py-3 text-base font-medium text-brand-ink hover:bg-bg-soft"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    className="block rounded px-3 py-3 text-base font-medium text-brand-ink hover:bg-bg-soft"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
