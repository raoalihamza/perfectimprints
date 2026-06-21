import { urlForImage } from '@/lib/sanity/client';
import { parseVideoEmbed, videoThumbnailUrl, type VideoAspect } from '@/lib/video/embed';
import type { VideoCategoryRef, VideoSummary } from '@/lib/sanity/queries/videos';

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
  category?: VideoCategoryRef;
}

export function toVideoCardData(video: VideoSummary): VideoCardData {
  const { aspect } = parseVideoEmbed(video.embedUrl);

  const thumbnailUrl = video.thumbnail
    ? urlForImage(video.thumbnail).width(800).height(450).fit('crop').url()
    : videoThumbnailUrl(video.embedUrl);

  return {
    id: video._id,
    title: video.title,
    href: `/videos/${video.slug.current}`,
    thumbnailUrl: thumbnailUrl ?? null,
    aspect,
    description: video.description,
    publishDate: video.publishDate,
    category: video.category,
  };
}
