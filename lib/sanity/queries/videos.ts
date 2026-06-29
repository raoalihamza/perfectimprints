import type { PortableTextBlock } from '@portabletext/react';
import { client } from '@/lib/sanity/client';
import type { SanityImage, SanitySlug, SeoFields } from '@/lib/sanity/types';

export interface VideoCategoryRef {
  title: string;
  slug: string;
}

export interface VideoSummary {
  _id: string;
  title: string;
  slug: SanitySlug;
  embedUrl: string;
  thumbnail?: SanityImage;
  /** Rich text (Task B). Rendered with links; plain-texted for meta + schema. */
  description?: PortableTextBlock[];
  publishDate?: string;
  category?: VideoCategoryRef;
  seo?: SeoFields;
}

const SUMMARY_PROJECTION = `
  _id,
  title,
  slug,
  embedUrl,
  thumbnail,
  description,
  publishDate,
  seo,
  "category": category->{ title, "slug": slug.current }
`;

// Belt-and-suspenders draft guard (the public client already uses the published
// perspective). Also require an embedUrl — a video doc without one can't render.
const PUBLISHED = `_type == "video" && !(_id in path("drafts.**")) && defined(embedUrl)`;

/** All published videos, newest first. Videos with no publishDate sort last. */
export async function getAllVideos(): Promise<VideoSummary[]> {
  return (
    (await client.fetch<VideoSummary[]>(
      `*[${PUBLISHED}] | order(publishDate desc, _createdAt desc) { ${SUMMARY_PROJECTION} }`,
    )) ?? []
  );
}

export async function getVideoSlugs(): Promise<string[]> {
  const docs =
    (await client.fetch<{ slug: { current: string } }[]>(
      `*[${PUBLISHED} && defined(slug.current)]{ "slug": slug }`,
    )) ?? [];
  return docs.map((d) => d.slug.current).filter(Boolean);
}

export async function getVideoBySlug(slug: string): Promise<VideoSummary | null> {
  return (
    (await client.fetch<VideoSummary | null>(
      `*[${PUBLISHED} && slug.current == $slug][0]{ ${SUMMARY_PROJECTION} }`,
      { slug },
    )) ?? null
  );
}

/** Other published videos in the same category, newest first. */
export async function getRelatedVideos(video: VideoSummary, limit = 6): Promise<VideoSummary[]> {
  const categorySlug = video.category?.slug;
  if (!categorySlug) return [];
  return (
    (await client.fetch<VideoSummary[]>(
      `*[${PUBLISHED}
          && slug.current != $self
          && category->slug.current == $cat]
        | order(publishDate desc, _createdAt desc) [0...$limit] { ${SUMMARY_PROJECTION} }`,
      { self: video.slug.current, cat: categorySlug, limit },
    )) ?? []
  );
}

export interface VideoSearchEntry {
  title: string;
  slug: string;
  /** Category title — secondary search key in the build-time index. */
  category?: string;
}

/**
 * Minimal list of every published video for the build-time search index
 * (M5-507): title + category (both searchable) + slug (internal route).
 */
export async function getAllVideoSearchEntries(): Promise<VideoSearchEntry[]> {
  const docs =
    (await client.fetch<{ title: string; slug: { current: string }; category?: string }[]>(
      `*[${PUBLISHED} && defined(title) && defined(slug.current)]{
        title,
        slug,
        "category": category->title
      }`,
    )) ?? [];
  return docs
    .map(
      (d): VideoSearchEntry => ({
        title: d.title,
        slug: d.slug?.current,
        category: d.category,
      }),
    )
    .filter((e) => Boolean(e.title && e.slug));
}
