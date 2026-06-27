'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Container } from '@/components/ui/Container';
import type { HomeTestimonial } from '@/lib/sanity/queries/home';

interface TestimonialsProps {
  testimonials: HomeTestimonial[];
  heading?: string;
}

const AUTO_ADVANCE_MS = 7000;
const DEFAULT_HEADING = 'What Our Customers are Saying';

/**
 * Dark testimonials block as a horizontal snap-scroll carousel: 3 quotes per
 * view on desktop, 1 on mobile. Auto-advances (paused on interaction, disabled
 * for reduced-motion); prev/next buttons + native swipe on touch.
 */
export function Testimonials({ testimonials, heading }: TestimonialsProps) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const pausedRef = useRef(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const scrollByCard = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>('[data-testimonial-card]');
    const step = firstCard ? firstCard.offsetWidth + 24 : el.clientWidth;
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
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + 4);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [testimonials.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current && hasOverflow) scrollByCard(1);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [scrollByCard, hasOverflow]);

  if (testimonials.length === 0) return null;

  const title = heading?.trim() || DEFAULT_HEADING;

  return (
    <section className="bg-brand-ink text-white">
      <Container className="py-14 md:py-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold md:text-3xl">{title}</h2>
          {hasOverflow && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                aria-label="Previous testimonials"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition hover:bg-white/15"
              >
                <span aria-hidden>&larr;</span>
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                aria-label="Next testimonials"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition hover:bg-white/15"
              >
                <span aria-hidden>&rarr;</span>
              </button>
            </div>
          )}
        </div>

        <div
          role="region"
          aria-roledescription="carousel"
          aria-label={title}
          onMouseEnter={() => (pausedRef.current = true)}
          onMouseLeave={() => (pausedRef.current = false)}
          onFocusCapture={() => (pausedRef.current = true)}
          onBlurCapture={() => (pausedRef.current = false)}
        >
          <ul
            ref={scrollerRef}
            className="mt-8 grid auto-cols-[100%] grid-flow-col gap-6 overflow-x-auto pb-2 md:auto-cols-[calc((100%-3rem)/3)]"
            style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
          >
            {testimonials.map((t, i) => (
              <li
                key={`${t.attribution}-${i}`}
                data-testimonial-card
                className="snap-start rounded-md border border-white/10 bg-white/5 p-6"
              >
                <blockquote className="text-base leading-relaxed text-white/90 md:text-lg">
                  &ldquo;{t.text}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm text-white/70">
                  <span className="font-semibold text-white">{t.attribution}</span>
                  {t.company && <span> · {t.company}</span>}
                </figcaption>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
