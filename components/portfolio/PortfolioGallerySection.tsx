import { SectionShell } from '@/components/page-sections/SectionShell';
import type { PortfolioEmbedHost } from '@/lib/portfolio/image-sizes';
import {
  resolvePortfolioGalleryTiles,
  type PortfolioGalleryInput,
} from '@/lib/sanity/queries/portfolio';
import { PortfolioGalleryBlock } from './PortfolioGalleryBlock';

interface PortfolioGallerySectionProps {
  /** The block as stored on the host document (references), or already dereferenced. */
  gallery: PortfolioGalleryInput | null | undefined;
  /** Which content column the block sits in; picks the tile `sizes` (lib/portfolio/image-sizes.ts). */
  host: PortfolioEmbedHost;
  /**
   * `section`: wrap in the page-builder SectionShell column (ordinary pages,
   * /services pages, the landing template). `inline` (default): the host has
   * its own column and passes spacing through `className` (product, video).
   */
  layout?: 'section' | 'inline';
  className?: string;
}

/**
 * The async SERVER half of an embedded Portfolio Gallery (PORT-120): one
 * stored block in, the shared client renderer out. Every host except the
 * blog body renders through this; the blog body cannot (its PortableText
 * renderer is synchronous), so the blog page calls the same
 * `resolvePortfolioGalleryTiles` up front and hands BlogBody the tiles for
 * the same `PortfolioGalleryBlock`. Either way there is ONE resolver
 * (lib/portfolio/gallery.ts, bound in lib/sanity/queries/portfolio.ts) and
 * ONE renderer.
 *
 * Static-safe: the only reads are the tagged `cachedClient` portfolio reads
 * behind `resolvePortfolioGalleryTiles` (PORTFOLIO_TAG, `revalidate: false`,
 * never `no-store`), no searchParams, no request API; every host route keeps
 * its rendering mode, and the block's tag rides the host's cached render so
 * a portfolio publish refreshes it. A hidden block, a block that resolves to
 * nothing, or a block whose items have no usable image renders NOTHING: no
 * heading, no shell, no spacing (the StripCardGrid contract).
 */
export async function PortfolioGallerySection({
  gallery,
  host,
  layout = 'inline',
  className,
}: PortfolioGallerySectionProps) {
  if (!gallery || gallery.hidden === true) return null;
  const tiles = await resolvePortfolioGalleryTiles(gallery, host);
  if (tiles.length === 0) return null;
  const block = <PortfolioGalleryBlock heading={gallery.heading} tiles={tiles} className={className} />;
  return layout === 'section' ? <SectionShell>{block}</SectionShell> : block;
}
