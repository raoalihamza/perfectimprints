'use client';

import { parseVideoEmbed } from '@/lib/video/embed';

interface VideoEmbedProps {
  /** The raw pasted video URL (YouTube/Shorts, Vimeo, Instagram, Facebook). */
  url: string;
  /** Used as the iframe title for accessibility. */
  title: string;
  className?: string;
}

/**
 * Responsive video player (M5-507). Renders the right iframe at the correct
 * aspect ratio from `parseVideoEmbed`. The player stays on the source platform —
 * we only embed the URL, we never host the file.
 *
 * Vertical (9:16) embeds (Shorts / reels) are centered and capped in width so
 * they don't tower over the page; landscape (16:9) fills the column.
 */
export function VideoEmbed({ url, title, className }: VideoEmbedProps) {
  const { embedSrc, aspect } = parseVideoEmbed(url);

  if (!embedSrc) return null;

  const isVertical = aspect === '9:16';

  return (
    <div
      className={[
        'relative w-full overflow-hidden rounded-lg bg-black',
        isVertical ? 'mx-auto aspect-[9/16] max-w-[420px]' : 'aspect-video',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <iframe
        src={embedSrc}
        title={title}
        className="absolute inset-0 h-full w-full"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}
