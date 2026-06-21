'use client';

import { useMemo, useState } from 'react';
import { VideoCard } from './VideoCard';
import type { VideoCardData } from '@/lib/video/card-data';

interface VideosBrowserProps {
  videos: VideoCardData[];
}

const ALL = '__all__';

/**
 * Videos index grid with a blog-style category filter (M5-507). Filtering is
 * client-side over the full (small) video set — instant, no extra routes, no
 * server roundtrips. Chips are derived from the categories actually present, so
 * an empty taxonomy simply hides the filter row.
 */
export function VideosBrowser({ videos }: VideosBrowserProps) {
  const [active, setActive] = useState<string>(ALL);

  // Unique categories present across the videos, alphabetical.
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of videos) {
      if (v.category?.slug) map.set(v.category.slug, v.category.title);
    }
    return [...map.entries()]
      .map(([slug, title]) => ({ slug, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [videos]);

  const filtered = useMemo(
    () => (active === ALL ? videos : videos.filter((v) => v.category?.slug === active)),
    [videos, active],
  );

  if (videos.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-bg-soft py-12 text-center text-text-muted">
        No videos yet. Check back soon.
      </p>
    );
  }

  const chip = (label: string, value: string) => {
    const selected = active === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={selected}
        onClick={() => setActive(value)}
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
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
