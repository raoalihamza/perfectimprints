import { buildImageUrl, urlForRenderImage } from '@/lib/sanity/client';
import {
  portfolioItemColors,
  portfolioItemDecorationMethods,
  portfolioItemIndustry,
  type PortfolioItemCard,
} from './gallery';
import {
  LIGHTBOX_WIDTHS,
  TILE_SIZES,
  TILE_WIDTHS,
  buildSrcSet,
  croppedImageBox,
  fittedWidthFraction,
  lightboxSizesFor,
  parseSanityImageRef,
  pickSrcWidth,
  scaleSizes,
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
 * Sizing follows lib/portfolio/image-sizes.ts. Since PORT-150 the tile and
 * the lightbox are the SAME request shape, `fit=max` at the picture's
 * natural aspect with no height (the one mode measured never to upscale;
 * `fit=crop` and `fit=fill` both do), built by one function below; they
 * differ only in their candidate widths, their preferred `src` width and
 * their `sizes`. The tile is then fitted whole inside PortfolioGrid's square
 * box by CSS, and because a tall picture occupies only part of that box's
 * width, its `sizes` is scaled down by `fittedWidthFraction` so the browser
 * fetches for the width it will actually paint. A stored Studio crop frame
 * reaches both URLs as `rect=` (the builder emits it for any request), so
 * cropping is still possible; the hotspot circle only ever steered a
 * height-constrained crop and now has no effect. An item whose asset id
 * cannot be parsed yields no tile; the URL builder parses the same id and
 * could not have produced a URL for it either, so nothing that could render
 * is lost.
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
  /** PORT-160: vocabulary values (lib/portfolio/decoration-methods), the decoration filter's keys. */
  decorationMethods: string[];
  /** PORT-160: one vocabulary value (lib/portfolio/industries) or null, the industry filter's key. */
  industry: string | null;
  /** The grid tile image: the whole picture at natural aspect, fitted inside the square box by CSS. */
  image: PortfolioTileImage;
  /** The lightbox image (natural aspect, fetched only when the viewer opens). */
  large: PortfolioTileImage;
}

/** Preferred `src` width for a tile: the 2x desktop tile, 1x tablet. */
const TILE_SRC_WIDTH = 640;
/** Preferred `src` width for the lightbox. */
const LIGHTBOX_SRC_WIDTH = 1200;

/**
 * Options for the tile mapper. `sizes` is the grid tile's `sizes` attribute
 * for a FULL-WIDTH image: the /portfolio page's own layout by default, or
 * `embeddedTileSizes(host)` (lib/portfolio/image-sizes.ts) for a gallery
 * block inside a content column (PORT-120). A tall image's sizes is derived
 * from it here, so a host never scales anything itself. Nothing else about a
 * tile differs between the page and a block.
 */
export interface PortfolioTileOptions {
  sizes?: string;
}

/**
 * One natural-aspect `fit=max` image: the candidates that fit inside the
 * (cropped) asset width, a mid-size `src`, and the `src` candidate's own
 * pixel box for the width/height attributes.
 */
function naturalImage(
  image: NonNullable<PortfolioItemCard['image']>,
  box: { width: number; height: number },
  candidates: readonly number[],
  preferredSrcWidth: number,
  sizes: string,
): PortfolioTileImage {
  const widths = widthsWithin(candidates, box.width);
  const entries = widths.map((width) => ({
    width,
    url: urlForRenderImage(image).width(width).fit('max').url(),
  }));
  const srcWidth = pickSrcWidth(widths, preferredSrcWidth);
  const src = entries.find((e) => e.width === srcWidth)?.url ?? entries[0].url;
  const height = Math.max(1, Math.round((srcWidth * box.height) / box.width));
  return { src, srcSet: buildSrcSet(entries), sizes, width: srcWidth, height };
}

/** One projected item to one tile, or null when it carries no usable image. */
export function toPortfolioTile(
  item: PortfolioItemCard,
  options: PortfolioTileOptions = {},
): PortfolioTile | null {
  const image = item.image;
  const intrinsic = parseSanityImageRef(image?.asset?._ref);
  if (!image || !intrinsic) return null;
  const box = croppedImageBox(intrinsic, image.crop);
  const tileSizes = scaleSizes(options.sizes ?? TILE_SIZES, fittedWidthFraction(box));
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
      decorationMethods: portfolioItemDecorationMethods(item),
      industry: portfolioItemIndustry(item),
      image: naturalImage(image, box, TILE_WIDTHS, TILE_SRC_WIDTH, tileSizes),
      large: naturalImage(image, box, LIGHTBOX_WIDTHS, LIGHTBOX_SRC_WIDTH, lightboxSizesFor(box)),
    };
  } catch {
    // The URL builder refused the asset (a malformed id that passed the
    // regex, a builder change): skip the item rather than fail the render.
    return null;
  }
}

/**
 * Every item that can render, as tiles, in the order given. An item with no
 * usable image is skipped (never a broken tile), so an empty list, a list of
 * items whose images were never uploaded, or a list a resolver already
 * emptied all come back as `[]`, which every renderer turns into nothing.
 */
export function toPortfolioTiles(
  items: readonly PortfolioItemCard[],
  options: PortfolioTileOptions = {},
): PortfolioTile[] {
  const out: PortfolioTile[] = [];
  for (const item of items) {
    const tile = toPortfolioTile(item, options);
    if (tile) out.push(tile);
  }
  return out;
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
