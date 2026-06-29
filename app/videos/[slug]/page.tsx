import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { VideoEmbed } from '@/components/videos/VideoEmbed';
import { VideoCard } from '@/components/videos/VideoCard';
import { buildImageUrl } from '@/lib/sanity/client';
import { getVideoBySlug, getVideoSlugs, getRelatedVideos } from '@/lib/sanity/queries/videos';
import { toVideoCardData } from '@/lib/video/card-data';
import { parseVideoEmbed, videoThumbnailUrl } from '@/lib/video/embed';
import { videoObjectSchema } from '@/lib/seo/schema-generators';
import { portableTextToPlain } from '@/lib/portable-text/to-plain';
import { RichAnswer } from '@/components/portable-text/RichAnswer';
import type { SanityImage } from '@/lib/sanity/types';
import { formatDate } from '@/lib/utils';

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
      images: [poster ? { url: poster, alt: ogTitle } : { url: `${SITE_URL}/logo.svg`, alt: ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [poster || `${SITE_URL}/logo.svg`],
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

  const schema = videoObjectSchema({
    name: video.title,
    description: portableTextToPlain(video.description) || undefined,
    thumbnailUrl: poster,
    uploadDate: video.publishDate,
    embedUrl: embedSrc || undefined,
    contentUrl: video.embedUrl,
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
              {video.category ? (
                <Link
                  href="/videos"
                  className="rounded-full bg-bg-soft px-2.5 py-0.5 font-semibold text-brand-red hover:underline"
                >
                  {video.category.title}
                </Link>
              ) : null}
            </div>
          </header>

          <VideoEmbed url={video.embedUrl} title={video.title} />

          {video.description && video.description.length > 0 ? (
            <div className="mt-6 text-lg leading-relaxed text-text-primary">
              <RichAnswer value={video.description} />
            </div>
          ) : null}

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </>
  );
}
