'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { PortfolioTile } from '@/lib/portfolio/tile-data';

interface PortfolioLightboxProps {
  /** The CURRENTLY FILTERED set: next / previous walk this list, not the whole collection. */
  tiles: readonly PortfolioTile[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  /** The tile button that opened the viewer; focus goes back to it on close. */
  returnFocusTo: HTMLElement | null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Anything a click on which must NOT close the viewer. */
const KEEP_OPEN = 'img, figcaption, button';

const arrowClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-brand-ink hover:bg-white aria-disabled:cursor-not-allowed aria-disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red';

/**
 * The Portfolio Gallery viewer (PORT-110). Written fresh rather than reusing
 * components/products/ProductPageGallery: that one is bound to
 * `useProductSelection()` (it throws outside ProductSelectionProvider), its
 * data is the colour variants of ONE product, and its lightbox has no next
 * or previous. What carried over is the idiom (Escape closes, body scroll is
 * locked while open and released on unmount) and its static-render contract:
 *
 * STATIC-RENDER CONTRACT: this component reads NO URL state and is mounted
 * ONLY after a tile is clicked, so the server prerender of /portfolio never
 * contains it and the full-size image is fetched only when the viewer opens.
 * Every value it renders arrives as a prop from the browser component.
 *
 * Accessibility: role=dialog + aria-modal, labelled by the item title;
 * Escape closes, arrow keys move; Tab is trapped inside (focus on the dialog
 * container itself, which is where a click on the photo lands it, counts as
 * "outside the tab list" so Shift+Tab wraps to the last control instead of
 * escaping behind the backdrop); focus lands on the Close button when the
 * viewer opens and returns to the opening tile when it closes, whichever way
 * it closes (button, Escape, backdrop, or unmount). The end arrows use
 * `aria-disabled` rather than `disabled` so the control a keyboard user is
 * standing on never vanishes from the tab order when the end is reached.
 * The dialog scrolls (the body does not) so a long description is always
 * reachable on a short viewport.
 */
export function PortfolioLightbox({
  tiles,
  index,
  onClose,
  onNavigate,
  returnFocusTo,
}: PortfolioLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusTo);
  returnFocusRef.current = returnFocusTo;
  const titleId = useId();

  const tile = tiles[index];
  const hasPrev = index > 0;
  const hasNext = index < tiles.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(index - 1);
  }, [hasPrev, index, onNavigate]);
  const goNext = useCallback(() => {
    if (hasNext) onNavigate(index + 1);
  }, [hasNext, index, onNavigate]);

  // Body scroll lock + initial focus on open; unlock + focus return on unmount.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, []);

  // Keyboard: Escape closes, arrows move, Tab cycles inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Focus on the container itself (or anywhere not in the list) wraps the
      // same way as focus outside the dialog would: never past the edges.
      const position = focusable.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (position <= 0) {
          e.preventDefault();
          last.focus();
        }
      } else if (position === -1 || position === focusable.length - 1) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, goNext, goPrev]);

  // The filtered set can shrink underneath an open viewer; the browser closes
  // it in that case, and this guard keeps the render safe in the same tick.
  if (!tile) return null;

  // One rule for the whole surface: a click anywhere that is not the photo,
  // its caption or a control closes the viewer. Decided at the root so the
  // dark area beside a narrow portrait image behaves like the dark area
  // anywhere else.
  const onSurfaceClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as Element | null;
    if (target && target.closest(KEEP_OPEN)) return;
    onClose();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onClick={onSurfaceClick}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black/90 p-4 text-white outline-none sm:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-white/80" aria-live="polite">
          {index + 1} of {tiles.length}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-brand-ink hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-2 py-4 sm:gap-4">
        <button
          type="button"
          onClick={goPrev}
          aria-disabled={!hasPrev}
          aria-label="Previous photo"
          className={arrowClass}
        >
          <span aria-hidden="true">&larr;</span>
        </button>

        <figure className="flex min-h-0 min-w-0 flex-1 flex-col items-center">
          {/* Keyed by tile so navigation swaps the element and its srcset cleanly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={tile.id}
            src={tile.large.src}
            srcSet={tile.large.srcSet}
            sizes={tile.large.sizes}
            alt={tile.alt}
            width={tile.large.width}
            height={tile.large.height}
            decoding="async"
            className="max-h-[70vh] w-auto max-w-full rounded bg-white object-contain"
          />
          <figcaption className="mt-4 max-w-2xl text-center">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">
              {tile.title}
            </h2>
            {tile.category ? (
              <p className="mt-1 text-xs uppercase tracking-wider text-white/70">
                {tile.category.title}
              </p>
            ) : null}
            {tile.description ? (
              <p className="mt-2 text-sm leading-relaxed text-white/85">{tile.description}</p>
            ) : null}
            {tile.clientName ? (
              <p className="mt-1 text-sm text-white/70">Made for {tile.clientName}</p>
            ) : null}
          </figcaption>
        </figure>

        <button
          type="button"
          onClick={goNext}
          aria-disabled={!hasNext}
          aria-label="Next photo"
          className={arrowClass}
        >
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
