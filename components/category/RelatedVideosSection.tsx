import { VideoCard } from '@/components/videos/VideoCard';
import { getRelatedVideosForCategory } from '@/lib/sanity/queries/related-videos';
import { toVideoCardData } from '@/lib/video/card-data';

interface RelatedVideosSectionProps {
  categorySlug: string;
  categoryTitle: string;
}

/**
 * "Related Videos About <category>" on a ROOT category page (VID-100): the
 * twin of RelatedBlogsSection, mounted directly under it. A server component
 * that reads nothing from the request and makes exactly ONE tag-cached read
 * (`getRelatedVideosForCategory`), so the `/cat` route stays static. Renders
 * nothing at all for a root with no linked videos: no heading, no spacing.
 * The card is the site's existing VideoCard, fed through `toVideoCardData`
 * exactly as the /videos index, the video page and the catalog strips do.
 */
export async function RelatedVideosSection({ categorySlug, categoryTitle }: RelatedVideosSectionProps) {
  const videos = await getRelatedVideosForCategory(categorySlug);
  if (videos.length === 0) return null;
  const cards = videos.map(toVideoCardData);

  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">
        Related Videos About {categoryTitle}
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </section>
  );
}
