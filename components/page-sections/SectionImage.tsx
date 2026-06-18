import { urlForImage } from '@/lib/sanity/client';
import type { PageImage } from '@/lib/sanity/queries/pages';

interface SectionImageProps {
  image?: PageImage;
  imageUrl?: string;
  alt?: string;
  width?: number;
  className?: string;
  /** Prioritize (eager + high fetchpriority) for above-the-fold heroes. */
  priority?: boolean;
}

/**
 * Renders a section image from a Sanity asset when present, falling back to a
 * hot-linked `imageUrl` string. Returns null when neither is set so sections
 * degrade gracefully (no broken image icon). Plain <img> with explicit sizing
 * to avoid CLS — matches the site's hot-linked-image convention.
 */
export function SectionImage({
  image,
  imageUrl,
  alt,
  width = 1200,
  className,
  priority = false,
}: SectionImageProps) {
  let src: string | null = null;
  if (image?.asset?._ref) {
    try {
      src = urlForImage(image).width(width).fit('max').auto('format').url();
    } catch {
      src = null;
    }
  }
  if (!src && imageUrl) src = imageUrl;
  if (!src) return null;

  const resolvedAlt = image?.alt || alt || '';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={resolvedAlt}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      // @ts-expect-error fetchpriority is a valid DOM attr not yet in React's types
      fetchpriority={priority ? 'high' : undefined}
    />
  );
}
