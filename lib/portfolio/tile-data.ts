import { buildImageUrl, urlForRenderImage } from '@/lib/sanity/client';
import { portfolioItemColors, type PortfolioItemCard } from './gallery';
import {
  LIGHTBOX_WIDTHS,
  TILE_SIZES,
  TILE_WIDTHS,
  buildSrcSet,
  croppedImageBox,
  lightboxSizesFor,
  parseSanityImageRef,
  pickSrcWidth,
  widthsWithin,
} from './image-sizes';

/**
 * The serialisable tile the /portfolio page hands its client browser
 * (PORT-110), computed SERVER-SIDE so the client never needs the Sanity URL
 * builder or the item documents: it renders strings and numbers. This is the
 * `toVideoCardData` pattern, and it is where the client boundary sits: the
 * page (server) reads Sanity, maps every item through `toPortfolioTile`, and
 * passes the resulting plain objects as props.
 *
 * Every rendered URL here goes through `urlForRenderImage` (IMG-120,
 * `auto=format`, so the CDN answers WebP/AVIF where the browser accepts it).
 * The two SEO helpers at the bottom use the plain `buildImageUrl` on purpose:
 * an og:image and a sitemap image must resolve to the same bytes for every
 * fetcher, which `auto=format` by definition does not (CLAUDE.md Section 11).
 *
 * Sizing follows lib/portfolio/image-sizes.ts: the square tile is clamped to
 * the shorter cropped side of the asset because `fit=crop` upscales, and the
 * lightbox uses `fit=max`, which never does. An item whose asset id cannot be
 * parsed yields no tile; the URL builder parses the same id and could not
 * have produced a URL for it either, so nothing that could render is lost.
 */

export interface PortfolioTileImage {
  /** Fallback URL for a browser without srcset support. */
  src: string;
  srcSet: string;
  sizes: string;
  /** Pixel size of `src`, for the width/height attributes (CLS). */
  width: number;
  height: number;
}

export interface PortfolioTile {
  id: string;
  title: string;
  alt: string;
  description: string | null;
  clientName: string | null;
  category: { slug: string; title: string } | null;
  colors: string[];
  /** The square grid tile (hotspot crop). */
  image: PortfolioTileImage;
  /** The lightbox image (natural aspect, fetched only when the viewer opens). */
  large: PortfolioTileImage;
}

/** Preferred `src` width for a tile: the 2x desktop tile, 1x tablet. */
const TILE_SRC_WIDTH = 640;
/** Preferred `src` width for the lightbox. */
const LIGHTBOX_SRC_WIDTH = 1200;

function squareTile(image: NonNullable<PortfolioItemCard['image']>, side: number): PortfolioTileImage {
  const widths = widthsWithin(TILE_WIDTHS, side);
  const entries = widths.map((width) => ({
    width,
    url: urlForRenderImage(image).width(width).height(width).fit('crop').url(),
  }));
  const srcWidth = pickSrcWidth(widths, TILE_SRC_WIDTH);
  const src = entries.find((e) => e.width === srcWidth)?.url ?? entries[0].url;
  return { src, srcSet: buildSrcSet(entries), sizes: TILE_SIZES, width: srcWidth, height: srcWidth };
}

function largeImage(
  image: NonNullable<PortfolioItemCard['image']>,
  box: { width: number; height: number },
): PortfolioTileImage {
  const widths = widthsWithin(LIGHTBOX_WIDTHS, box.width);
  const entries = widths.map((width) => ({
    width,
    url: urlForRenderImage(image).width(width).fit('max').url(),
  }));
  const srcWidth = pickSrcWidth(widths, LIGHTBOX_SRC_WIDTH);
  const src = entries.find((e) => e.width === srcWidth)?.url ?? entries[0].url;
  const height = Math.max(1, Math.round((srcWidth * box.height) / box.width));
  return {
    src,
    srcSet: buildSrcSet(entries),
    sizes: lightboxSizesFor(box),
    width: srcWidth,
    height,
  };
}

/** One projected item to one tile, or null when it carries no usable image. */
export function toPortfolioTile(item: PortfolioItemCard): PortfolioTile | null {
  const image = item.image;
  const intrinsic = parseSanityImageRef(image?.asset?._ref);
  if (!image || !intrinsic) return null;
  const box = croppedImageBox(intrinsic, image.crop);
  try {
    return {
      id: item._id,
      title: item.title,
      alt: image.alt?.trim() || item.title,
      description: item.description?.trim() || null,
      clientName: item.clientName?.trim() || null,
      category:
        item.category?.slug && item.category.title
          ? { slug: item.category.slug, title: item.category.title }
          : null,
      colors: portfolioItemColors(item),
      image: squareTile(image, Math.min(box.width, box.height)),
      large: largeImage(image, box),
    };
  } catch {
    // The URL builder refused the asset (a malformed id that passed the
    // regex, a builder change): skip the item rather than fail the render.
    return null;
  }
}

/**
 * The representative image for og:image / the CollectionPage, as the plain
 * card-size URL (`w=400&fit=max`, the shape the product card normalisers
 * produce). The PAGE passes it through `largeSocialImage()`, the shared
 * IMG-110 helper, which raises it toward 1200 without ever upscaling; that
 * call lives in the page so the helper is visibly called, never re-implemented.
 * Items arrive in site order (featured first), so the first item with an
 * image IS the first featured item when one exists. Plain builder: no
 * `auto=format`.
 */
export function portfolioRepresentativeImage(items: readonly PortfolioItemCard[]): string | null {
  for (const item of items) {
    const url = buildImageUrl(item.image, (b) => b.width(400).fit('max'));
    if (url) return url;
  }
  return null;
}

/**
 * One sitemap `<image:loc>` per item, at the 1200px `fit=max` variant the
 * product-page sitemap entries use. Plain builder: no `auto=format`. The
 * sitemap escapes the `&` itself at the XML boundary.
 */
export function portfolioSitemapImages(items: readonly PortfolioItemCard[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const url = buildImageUrl(item.image, (b) => b.width(1200).fit('max'));
    if (url) out.push(url);
  }
  return out;
}
