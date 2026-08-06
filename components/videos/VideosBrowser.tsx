'use client';

import { useMemo, useState } from 'react';
import { VideoCard } from './VideoCard';
import type { VideoCardData } from '@/lib/video/card-data';

interface VideosBrowserProps {
  videos: VideoCardData[];
}

const ALL = '__all__';

/** Cards rendered per "page" — Load more reveals another batch of this size. */
const PAGE_SIZE = 24;

/**
 * Videos index grid with a blog-style category filter (M5-507). Filtering is
 * client-side over the full (small) video set — instant, no extra routes, no
 * server roundtrips. Chips are derived from the categories actually present, so
 * an empty taxonomy simply hides the filter row. Rendering is capped at
 * PAGE_SIZE cards with a Load more button (client-side pagination — the full
 * list still ships, only the rendered count is limited; no URL change).
 */
export function VideosBrowser({ videos }: VideosBrowserProps) {
  const [active, setActive] = useState<string>(ALL);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Unique categories present across the videos, alphabetical. A multi-category
  // video (Q-180) contributes each of its categories to the chip row.
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of videos) {
      for (const c of v.categories) {
        if (c.slug) map.set(c.slug, c.title);
      }
    }
    return [...map.entries()]
      .map(([slug, title]) => ({ slug, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [videos]);

  // Filtering FILTERS the video list, it never expands it: a video with three
  // categories shows under each chip, and exactly ONCE when the filter is
  // cleared (the "All" view is the video list itself, one card per video).
  const filtered = useMemo(
    () => (active === ALL ? videos : videos.filter((v) => v.categories.some((c) => c.slug === active))),
    [videos, active],
  );

  const visible = filtered.slice(0, visibleCount);

  if (videos.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-bg-soft py-12 text-center text-text-muted">
        No videos yet. Check back soon.
      </p>
    );
  }

  const selectCategory = (value: string) => {
    setActive(value);
    // Start the newly filtered set from its first page.
    setVisibleCount(PAGE_SIZE);
  };

  const chip = (label: string, value: string) => {
    const selected = active === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={selected}
        onClick={() => selectCategory(value)}
        className={[
          'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
          selected
            ? 'border-brand-red bg-brand-red text-white'
            : 'border-border bg-white text-brand-ink hover:border-brand-ink hover:text-brand-red',
        ].join(' ')}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      {categories.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter videos by category">
          {chip('All', ALL)}
          {categories.map((c) => chip(c.title, c.slug))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-text-muted">No videos in this category yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-text-muted">
            Showing {visible.length} of {filtered.length} video{filtered.length === 1 ? '' : 's'}
          </p>

          {visible.length < filtered.length && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="rounded-md border border-brand-ink px-6 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:border-brand-red hover:text-brand-red"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
