'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { HomeValueProp } from '@/lib/sanity/queries/home';
import { PillarCard } from '@/components/home/PillarCard';

interface ValuePillarsCarouselProps {
  pillars: HomeValueProp[];
}

const AUTO_ADVANCE_MS = 6000;

/**
 * Horizontal snap-scroll carousel of value pillars. Shows up to 3 per view on
 * desktop and 1 on mobile. Auto-advances unless the user prefers reduced motion
 * or is interacting; prev/next buttons and keyboard focus work regardless.
 */
export function ValuePillarsCarousel({ pillars }: ValuePillarsCarouselProps) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const pausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Read layout inside requestAnimationFrame so the scroll-event-driven measure
  // never forces a synchronous reflow on the scroll/resize hot path. Coalesces
  // bursts of events into one read per frame.
  const updateArrows = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollerRef.current;
      if (!el) return;
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    });
  }, []);

  // Scroll by one "page" (the first card's width), wrapping around at the ends.
  const scrollByCard = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>('[data-pillar-card]');
    const step = firstCard ? firstCard.offsetWidth + 16 : el.clientWidth;
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4;
    const atStart = el.scrollLeft <= 4;
    if (dir === 1 && atEnd) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (dir === -1 && atStart) {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    } else {
      el.scrollBy({ left: dir * step, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    // ResizeObserver re-checks the arrows on viewport/content changes without a
    // layout-thrashing window 'resize' handler.
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateArrows) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro?.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [updateArrows]);

  // Auto-advance, paused on interaction and disabled for reduced-motion users.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current) scrollByCard(1);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [scrollByCard]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="Why buyers choose Perfect Imprints"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
    >
      <ul
        ref={scrollerRef}
        className="grid auto-cols-[100%] grid-flow-col gap-4 overflow-x-auto pb-2 md:auto-cols-[calc((100%-2rem)/3)]"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {pillars.map((p, i) => (
          <li key={`${p.title}-${i}`} data-pillar-card className="snap-start">
            <PillarCard pillar={p} />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => scrollByCard(-1)}
          aria-label="Previous pillars"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-brand-ink shadow-sm transition hover:bg-bg-soft disabled:opacity-40"
          disabled={!canPrev && !canNext}
        >
          <span aria-hidden>&larr;</span>
        </button>
        <button
          type="button"
          onClick={() => scrollByCard(1)}
          aria-label="Next pillars"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-brand-ink shadow-sm transition hover:bg-bg-soft disabled:opacity-40"
          disabled={!canPrev && !canNext}
        >
          <span aria-hidden>&rarr;</span>
        </button>
      </div>
    </div>
  );
}
