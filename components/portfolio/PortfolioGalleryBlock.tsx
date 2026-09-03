'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { PortfolioTile } from '@/lib/portfolio/tile-data';
import { PortfolioGrid } from './PortfolioGrid';
import { PortfolioLightbox } from './PortfolioLightbox';

interface PortfolioGalleryBlockProps {
  /** The block's optional heading; rendered only when it has text. */
  heading?: string | null;
  /** The tiles the ONE resolver decided, already mapped server-side. */
  tiles: readonly PortfolioTile[];
  /** Outer spacing the host supplies (the block itself has none, so each host owns its rhythm). */
  className?: string;
}

interface LightboxState {
  index: number;
  opener: HTMLElement | null;
}

/**
 * The ONE renderer of an embedded Portfolio Gallery block (PORT-120). Blog
 * bodies, ordinary page sections, product pages, video pages and landing
 * pages all draw a block through this and nothing else; it is the
 * StripCardGrid of the portfolio module. It reuses the /portfolio page's
 * tile (`PortfolioGrid`, with its reserved caption heights) and viewer
 * (`PortfolioLightbox`) exactly as they are; what it does NOT carry is the
 * page's filter sidebar, pagination, URL state and count heading, because a
 * block is a fixed, already-resolved list.
 *
 * EMPTY RENDERS NULL, including the heading: a block whose category has no
 * published items, whose items are all hidden, or whose photographs were
 * never uploaded leaves no heading, no box and no spacing behind. Hosts keep
 * their own "no block, no section" guard on top (the StripCardGrid contract).
 *
 * THE LIGHTBOX OPENS IN PLACE rather than linking each tile to /portfolio.
 * Three reasons. (1) Reuse: `PortfolioGrid` renders its tiles as buttons
 * that call `onOpen`; a linking tile would be a second tile markup, which is
 * the fork this ticket exists to avoid. (2) The visitor is reading an article
 * or a product page; a photograph that opens over it and closes back to the
 * same scroll position keeps them there, which is what a gallery beside the
 * content is for. (3) Staticness: this is a client component, but its FIRST
 * render is the full grid as real `<img>` markup with no URL read (the
 * PortfolioBrowser contract), so the host's prerender contains every tile,
 * and the viewer mounts only after a click, so its JS runs and its full-size
 * image is fetched only then. A single "See more of our work" link under the
 * grid is the route to the full page and its filters.
 *
 * Every tile loads lazily (`eagerCount={0}`): a block sits below the host's
 * main content, so nothing in it is above the fold at load.
 *
 * STATIC-RENDER CONTRACT: no `useSearchParams`, no `next/navigation`, no URL
 * read during render; every value is a prop (CLAUDE.md Section 13).
 */
export function PortfolioGalleryBlock({ heading, tiles, className }: PortfolioGalleryBlockProps) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const openTile = useCallback(
    (index: number, opener: HTMLButtonElement) => setLightbox({ index, opener }),
    [],
  );
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const navigateLightbox = useCallback(
    (index: number) => setLightbox((current) => (current ? { ...current, index } : current)),
    [],
  );

  if (tiles.length === 0) return null;
  const title = heading?.trim() || '';

  return (
    <section className={className} aria-label={title || 'Portfolio gallery'}>
      {title ? <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{title}</h2> : null}
      <div className={title ? 'mt-5' : undefined}>
        <PortfolioGrid tiles={tiles} onOpen={openTile} eagerCount={0} />
      </div>
      <p className="mt-4 text-sm">
        <Link href="/portfolio" className="font-medium text-brand-red hover:underline">
          See more of our work
        </Link>
      </p>
      {lightbox ? (
        <PortfolioLightbox
          tiles={tiles}
          index={lightbox.index}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          returnFocusTo={lightbox.opener}
        />
      ) : null}
    </section>
  );
}
