'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Color-variant image gallery for /products/<slug> (P2-CP-001).
 *
 * STATIC-RENDER CONTRACT (the /cat CSR-bailout lesson): this component reads
 * NO URL state — no useSearchParams, no window reads during render. Its initial
 * render (variant 0, image 0) is what the server prerenders, so the FIRST
 * color's images are real <img> tags in the static HTML; swatch clicks and the
 * zoom/lightbox are post-hydration state changes over that markup.
 */

export interface GalleryImage {
  /** Main display URL (~900px). */
  url: string;
  /** Large URL (~1600px) for the lightbox. */
  zoomUrl: string;
  alt: string;
}

export interface GalleryVariant {
  /** '' for the default (no-color) image set. */
  colorName: string;
  swatchHex?: string;
  images: GalleryImage[];
}

interface ProductPageGalleryProps {
  variants: GalleryVariant[];
  productName: string;
}

const MAIN_PX = 800;
const THUMB_PX = 80;

export function ProductPageGallery({ variants, productName }: ProductPageGalleryProps) {
  const [variantIdx, setVariantIdx] = useState(0);
  const [imageIdx, setImageIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number; active: boolean }>({
    x: 50,
    y: 50,
    active: false,
  });

  const active = variants[variantIdx] ?? variants[0];
  const image = active?.images[imageIdx] ?? active?.images[0];

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxOpen]);

  if (!active || !image) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded border border-border bg-bg-soft text-sm text-text-muted">
        No image available
      </div>
    );
  }

  const showSwatches = variants.some((v) => v.colorName);

  return (
    <div>
      {/* Main image — hover to zoom, click for the large lightbox view. */}
      <button
        type="button"
        aria-label={`Zoom ${image.alt}`}
        onClick={() => setLightboxOpen(true)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setZoom({
            x: Math.round(((e.clientX - rect.left) / rect.width) * 100),
            y: Math.round(((e.clientY - rect.top) / rect.height) * 100),
            active: true,
          });
        }}
        onMouseLeave={() => setZoom((z) => ({ ...z, active: false }))}
        className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded border border-border bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.alt}
          width={MAIN_PX}
          height={MAIN_PX}
          decoding="async"
          className="h-full w-full object-contain p-4 transition-transform duration-150"
          style={
            zoom.active
              ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` }
              : undefined
          }
        />
      </button>

      {/* Thumbnail strip for the active color. */}
      {active.images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {active.images.map((img, idx) => (
            <button
              key={`${img.url}-${idx}`}
              type="button"
              aria-label={`Show image ${idx + 1} of ${active.images.length}`}
              aria-current={idx === imageIdx}
              onClick={() => setImageIdx(idx)}
              className={cn(
                'h-20 w-20 shrink-0 overflow-hidden rounded border bg-white p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red',
                idx === imageIdx ? 'border-brand-red ring-1 ring-brand-red' : 'border-border hover:border-brand-ink',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt}
                width={THUMB_PX}
                height={THUMB_PX}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}

      {/* Color swatches — clicking swaps the gallery to that color's images. */}
      {showSwatches && (
        <div className="mt-4">
          <p className="text-sm font-medium text-brand-ink">
            Color{active.colorName ? `: ${active.colorName}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((v, idx) => (
              <button
                key={`${v.colorName}-${idx}`}
                type="button"
                aria-label={`Show ${v.colorName || 'default'} images`}
                aria-pressed={idx === variantIdx}
                onClick={() => {
                  setVariantIdx(idx);
                  setImageIdx(0);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red',
                  idx === variantIdx
                    ? 'border-brand-red text-brand-ink ring-1 ring-brand-red'
                    : 'border-border text-text-muted hover:border-brand-ink hover:text-brand-ink',
                )}
              >
                {v.swatchHex ? (
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 rounded-full border border-border"
                    style={{ backgroundColor: v.swatchHex }}
                  />
                ) : null}
                {v.colorName || 'Default'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox — large view of the active image. */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} image`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-brand-ink hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.zoomUrl}
            alt={image.alt}
            className="max-h-[90vh] max-w-full rounded bg-white object-contain p-4"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
