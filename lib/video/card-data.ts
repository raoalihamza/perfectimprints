import { buildImageUrl } from '@/lib/sanity/client';
import { parseVideoEmbed, videoThumbnailUrl, type VideoAspect } from '@/lib/video/embed';
import { portableTextToPlain } from '@/lib/portable-text/to-plain';
import { videoCategoriesOf, type VideoCategoryRef, type VideoSummary } from '@/lib/sanity/queries/videos';

/**
 * Fully-resolved, serializable shape for a video card. Computed server-side so
 * the (client) browser/grid never needs `urlForImage` or the catalog — it just
 * renders strings. The card thumbnail follows the priority: custom thumbnail →
 * YouTube auto-derived → null (placeholder).
 */
export interface VideoCardData {
  id: string;
  title: string;
  href: string;
  thumbnailUrl: string | null;
  aspect: VideoAspect;
  description?: string;
  publishDate?: string;
  /**
   * Effective category list (Q-180 multi-category) - already normalized
   * (new-list-wins-else-legacy), so client components render it verbatim.
   */
  categories: VideoCategoryRef[];
}

export function toVideoCardData(video: VideoSummary): VideoCardData {
  const { aspect } = parseVideoEmbed(video.embedUrl);

  const thumbnailUrl =
    buildImageUrl(video.thumbnail, (b) => b.width(800).height(450).fit('crop')) ??
    videoThumbnailUrl(video.embedUrl);

  return {
    id: video._id,
    title: video.title,
    href: `/videos/${video.slug.current}`,
    thumbnailUrl: thumbnailUrl ?? null,
    aspect,
    // Card teaser is plain text (clamped); the rich description renders on the
    // detail page only.
    description: portableTextToPlain(video.description) || undefined,
    publishDate: video.publishDate,
    categories: videoCategoriesOf(video),
  };
}
