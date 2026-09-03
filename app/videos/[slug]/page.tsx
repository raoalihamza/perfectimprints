import { getHiddenProductContext } from '@/lib/products/site-wide-hidden';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { VideoEmbed } from '@/components/videos/VideoEmbed';
import { VideoCard } from '@/components/videos/VideoCard';
import { buildImageUrl } from '@/lib/sanity/client';
import {
  getVideoBySlug,
  getVideoSlugs,
  getRelatedVideos,
  videoCategoriesOf,
} from '@/lib/sanity/queries/videos';
import { toVideoCardData } from '@/lib/video/card-data';
import { parseVideoEmbed, videoThumbnailUrl } from '@/lib/video/embed';
import { videoObjectSchema } from '@/lib/seo/schema-generators';
import { TWITTER_HANDLE, LOGO_OG_IMAGE } from '@/lib/seo/open-graph';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { portableTextToPlain } from '@/lib/portable-text/to-plain';
import { RichAnswer } from '@/components/portable-text/RichAnswer';
import { VideoRelatedProducts } from '@/components/videos/VideoRelatedProducts';
import { CategoryCtaBar } from '@/components/category/CategoryCtaBar';
import { PortfolioGallerySection } from '@/components/portfolio/PortfolioGallerySection';
import { resolveProductsBySku } from '@/lib/categories';
import { buildSkuSet } from '@/lib/products/hidden-skus';
import { isStripRefEntry } from '@/lib/sanity/strip-product-entries';
import type { GeigerProduct } from '@/lib/product-types';
import type { SanityImage } from '@/lib/sanity/types';
import { formatDate } from '@/lib/utils';
import { jsonLdHtml } from '@/lib/seo/json-ld';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getVideoSlugs();
  return slugs.map((slug) => ({ slug }));
}

/** Best available poster image: custom thumbnail → YouTube auto → none. */
function resolvePosterUrl(
  thumbnail: SanityImage | undefined,
  embedUrl: string,
  width = 1280,
): string | undefined {
  return (
    buildImageUrl(thumbnail, (b) => b.width(width)) ?? videoThumbnailUrl(embedUrl) ?? undefined
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  if (!video) return {};
  const canonical = `${SITE_URL}/videos/${video.slug.current}`;

  // Explicit SEO fields win; otherwise fall back to the on-page content.
  const title = video.seo?.metaTitle || `${video.title} | Perfect Imprints`;
  const ogTitle = video.seo?.metaTitle || video.title;
  // meta/OG/Twitter descriptions must stay plain strings.
  const description = video.seo?.metaDescription || portableTextToPlain(video.description) || undefined;
  const poster =
    buildImageUrl(video.seo?.ogImage, (b) => b.width(1200)) ??
    resolvePosterUrl(video.thumbnail, video.embedUrl);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'video.other',
      siteName: 'Perfect Imprints',
      url: canonical,
      title: ogTitle,
      description,
      images: [poster ? { url: poster, alt: ogTitle } : { url: LOGO_OG_IMAGE, alt: ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      // This inline block REPLACES the root twitter default (shallow merge), so
      // re-declare site/creator here or X loses the @perfectimprints handle.
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: ogTitle,
      description,
      images: [poster || LOGO_OG_IMAGE],
    },
  };
}

export default async function VideoDetailPage({ params }: Props) {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  if (!video) notFound();

  const canonical = `${SITE_URL}/videos/${video.slug.current}`;
  const { embedSrc } = parseVideoEmbed(video.embedUrl);
  const poster = resolvePosterUrl(video.thumbnail, video.embedUrl);
  const related = (await getRelatedVideos(video, 3)).map(toVideoCardData);

  // Related-products strip (P2-AI-003): SKUs resolve server-side from
  // products.json — same disk-read pattern as the blog page's product strips,
  // so the route stays on-demand SSG (no searchParams, no uncached read).
  const relatedProductEntries = video.relatedProducts ?? [];
  // Referenced productPage/customProduct entries carry no `sku` in the
  // projection (and a dangling ref is null) — only blogProduct SKU entries
  // feed the catalog lookup; the strip renders refs from their own doc data.
  const stripSkus = Array.from(
    new Set(
      relatedProductEntries
        .map((e) => (e && !isStripRefEntry(e) ? e.sku?.trim() : undefined))
        .filter((s): s is string => Boolean(s)),
    ),
  );
  // Site-wide hide list (HIDE-100), from the layout's already-deduped read.
  const hiddenContext = await getHiddenProductContext();
  const hiddenSkus = buildSkuSet(hiddenContext.hiddenSkus);
  const skuProducts = new Map<string, GeigerProduct>();
  if (stripSkus.length > 0) {
    for (const product of resolveProductsBySku(stripSkus)) {
      skuProducts.set(product.sku, product);
    }
  }

  // FIX-830 task 2: `contentUrl` is passed through the generator's
  // isDirectMediaUrl gate, so a YouTube watch/Shorts page (which is what every
  // video here holds) is no longer emitted as if it were a video file - Google
  // fetches contentUrl to verify the video and explicitly says not to point it
  // at the embedding page. `url` ties the VideoObject to this page.
  const schema = videoObjectSchema({
    name: video.title,
    description: portableTextToPlain(video.description) || undefined,
    thumbnailUrl: poster,
    uploadDate: video.publishDate,
    embedUrl: embedSrc || undefined,
    contentUrl: video.embedUrl,
    url: canonical,
  });

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Videos', href: '/videos' },
            { label: video.title },
          ]}
        />
      </Container>

      <Container as="article" className="pb-12">
        <div className="mx-auto max-w-4xl">
          <header className="mb-6">
            <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl">
              {video.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-muted">
              {video.publishDate ? <span>Published: {formatDate(video.publishDate)}</span> : null}
              {videoCategoriesOf(video).map((c) => (
                <Link
                  key={c.slug}
                  href="/videos"
                  className="rounded-full bg-bg-soft px-2.5 py-0.5 font-semibold text-brand-red hover:underline"
                >
                  {c.title}
                </Link>
              ))}
            </div>
          </header>

          <VideoEmbed url={video.embedUrl} title={video.title} />

          {video.description && video.description.length > 0 ? (
            <div className="mt-6 text-lg leading-relaxed text-text-primary">
              <RichAnswer value={video.description} />
            </div>
          ) : null}

          {relatedProductEntries.length > 0 && (
            <VideoRelatedProducts
              entries={relatedProductEntries}
              skuProducts={skuProducts}
              hiddenSkus={hiddenSkus}
              replacementBySku={hiddenContext.replacementBySku}
            />
          )}

          {/* Portfolio gallery (PORT-120): a FIXED position on this page type,
              under the related-products strip and above the lead bar. Renders
              nothing when the field is empty or resolves to no items. */}
          <PortfolioGallerySection
            gallery={video.portfolioGallery}
            host="video"
            className="mt-10"
          />

          {/* P2-CTA-001 video variant: "Need help choosing…?" lead bar — below
              the featured-products strip (and deliberately rendered even when
              that strip is empty: that is exactly when a visitor needs a next
              step). Server-rendered; wording in Global Settings › Video CTA
              Bar; same "Find Products for Me" modal + lead flow, with the
              video title as the lead's context. */}
          <CategoryCtaBar
            variant="video"
            inline
            categoryTitle={video.title}
            sourceUrl={`/videos/${video.slug.current}`}
          />

          {related.length > 0 && (
            <section className="mt-12">
              <h2 className="text-2xl font-bold text-brand-ink">Related Videos</h2>
              <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            </section>
          )}
        </div>
      </Container>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(schema) }}
      />
      <CustomSchemaJsonLd path={`/videos/${video.slug.current}`} />
    </>
  );
}
