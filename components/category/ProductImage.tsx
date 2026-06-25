'use client';

import { useState } from 'react';

interface ProductImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  /**
   * Responsive width hint passed to the browser. Hot-linked Geiger images have no
   * srcset, so this is advisory, but it keeps the markup correct if a srcset is
   * ever added and documents the card's rendered footprint (~1 col mobile → 4 col
   * desktop, see the grid in ProductGrid).
   */
  sizes?: string;
  className?: string;
}

const PLACEHOLDER_SRC = '/placeholder-product.svg';

// Default footprint of a product card image across the responsive grid
// (1 col < 640px, 2 col < 768px, 3 col < 1024px, 4 col above).
const DEFAULT_SIZES =
  '(max-width: 640px) 92vw, (max-width: 768px) 46vw, (max-width: 1024px) 30vw, 275px';

export function ProductImage({
  src,
  alt,
  width,
  height,
  priority = false,
  sizes = DEFAULT_SIZES,
  className,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const finalSrc = failed ? PLACEHOLDER_SRC : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      // The first row of cards is the likely LCP candidate on category pages —
      // load it eagerly with high fetch priority; everything below the fold stays
      // lazy so it never competes with the LCP image for bandwidth.
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={className}
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );
}
