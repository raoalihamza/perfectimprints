import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { VideosBrowser } from '@/components/videos/VideosBrowser';
import { getAllVideos } from '@/lib/sanity/queries/videos';
import { toVideoCardData } from '@/lib/video/card-data';
import { socialMeta } from '@/lib/seo/open-graph';

export const dynamic = 'force-static';
export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const VIDEOS_TITLE = 'Videos | Perfect Imprints';
const VIDEOS_DESCRIPTION =
  'Watch promotional product videos, demos, and ideas from Perfect Imprints to help your brand stand out.';

export const metadata: Metadata = {
  title: VIDEOS_TITLE,
  description: VIDEOS_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/videos` },
  ...socialMeta({ title: VIDEOS_TITLE, description: VIDEOS_DESCRIPTION, url: `${SITE_URL}/videos` }),
};

export default async function VideosIndexPage() {
  const videos = (await getAllVideos()).map(toVideoCardData);

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Videos' }]} />
      </Container>

      <Container as="section" className="pb-6">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          Videos
        </h1>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-text-primary">
          Promotional product demos, ideas, and inspiration to help your brand make an impression.
        </p>
      </Container>

      <Container as="section" className="pb-12">
        <VideosBrowser videos={videos} />
      </Container>
    </>
  );
}
