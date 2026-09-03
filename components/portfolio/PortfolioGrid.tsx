'use client';

import type { PortfolioTile } from '@/lib/portfolio/tile-data';

/** Tiles in the first grid row: loaded eagerly, everything below stays lazy. */
export const PORTFOLIO_EAGER_TILES = 4;

interface PortfolioGridProps {
  tiles: readonly PortfolioTile[];
  /** Called with the tile's index in `tiles` and the button that opened it (for focus return). */
  onOpen: (index: number, opener: HTMLButtonElement) => void;
  /** How many leading tiles load eagerly; 0 on a later page, where nothing is above the fold at mount. */
  eagerCount?: number;
}

/**
 * The Portfolio Gallery grid (PORT-110): 2 columns on phones, 3 on tablets,
 * 4 on desktop, each tile a square hotspot crop with explicit width/height
 * (so sixty photographs loading never shift the layout) and a real `srcset`
 * built server-side in lib/portfolio/tile-data.ts. Renders nothing for an
 * empty list, the StripCardGrid contract, so the browser keeps its own
 * "no photos match" state.
 *
 * Every tile is a button that opens the lightbox; the `<img>` carries the
 * item's alt text so the photograph itself is described, and the visible
 * title and category name the tile for everyone.
 *
 * TILE TEXT (PORT-115): under the photograph sit the title, the category
 * name and, when the item has one, a short description. Text of varying
 * length under a square image is what makes a grid ragged, so EVERY tile
 * reserves the same caption height whether or not the text is there:
 *   - title: clamped to 2 lines at a fixed 1.25rem line height, with a
 *     2-line minimum height (min-h-10), so a three-word and a twelve-word
 *     title occupy the same space;
 *   - category: exactly one line (truncate + a 1-line minimum), rendered
 *     empty when the item has none;
 *   - description: clamped to 2 lines at a fixed 1.125rem line height with a
 *     2-line minimum height, rendered as an EMPTY slot of the same height
 *     when the item has none.
 * Every caption is therefore the same height on every tile in the whole
 * grid, independent of which tiles share a row (filters and pagination
 * change that), and nothing here loads later, so no layout shift is
 * introduced. The grid's own stretch (`li` is a flex box, the button fills
 * it) is the belt on top: if font metrics ever differed between tiles the
 * row would still equalise. The clamp is visual only: the full text stays in
 * the DOM (so the button's accessible name is complete) and the lightbox
 * shows all of it. Two lines because a tile is 150 to 300px wide, so two
 * lines of 12px text hold roughly one sentence, enough to read as a job and
 * short enough that the photograph stays the subject; on a 2-column phone a
 * larger reservation would leave a visible blank block under every
 * description-less item.
 */
export function PortfolioGrid({
  tiles,
  onOpen,
  eagerCount = PORTFOLIO_EAGER_TILES,
}: PortfolioGridProps) {
  if (tiles.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {tiles.map((tile, index) => {
        const eager = index < eagerCount;
        // The button's accessible name is its content: the photo's alt, the
        // title and the category. When the alt simply repeats the title (the
        // fallback, and a common editor choice) name the button once instead
        // of reading the same phrase twice to a screen-reader user.
        const repeatsTitle = tile.alt === tile.title;
        const spokenName = repeatsTitle
          ? `${tile.title}${tile.category ? `, ${tile.category.title}` : ''}`
          : undefined;
        return (
          <li key={tile.id} className="flex">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={spokenName}
              onClick={(e) => onOpen(index, e.currentTarget)}
              className="group flex w-full flex-col overflow-hidden rounded border border-border bg-white text-left transition hover:border-brand-ink hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
            >
              <span className="block aspect-square w-full overflow-hidden bg-bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.image.src}
                  srcSet={tile.image.srcSet}
                  sizes={tile.image.sizes}
                  alt={tile.alt}
                  width={tile.image.width}
                  height={tile.image.height}
                  loading={eager ? 'eager' : 'lazy'}
                  fetchPriority={eager ? 'high' : 'auto'}
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </span>
              <span className="flex flex-1 flex-col p-3">
                <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-brand-ink">
                  {tile.title}
                </span>
                <span className="mt-1 block min-h-4 truncate text-xs uppercase leading-4 tracking-wider text-text-muted">
                  {tile.category ? tile.category.title : ''}
                </span>
                <span className="mt-1.5 line-clamp-2 min-h-[2.25rem] text-xs leading-[1.125rem] text-text-primary">
                  {tile.description ?? ''}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
