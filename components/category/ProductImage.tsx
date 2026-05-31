'use client';

import { useState } from 'react';

interface ProductImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
}

const PLACEHOLDER_SRC = '/placeholder-product.svg';

export function ProductImage({
  src,
  alt,
  width,
  height,
  priority = false,
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
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );
}
