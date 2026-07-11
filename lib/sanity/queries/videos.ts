import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient } from '@/lib/sanity/client';
import { VIDEOS_TAG } from '@/lib/sanity/cache-tags';
import {
  STRIP_PRODUCT_ENTRIES_PROJECTION,
  type StripProductEntry,
} from '@/lib/sanity/strip-product-entries';
import type { SanityImage, SanitySlug, SeoFields } from '@/lib/sanity/types';

// Tagged, non-CDN fetch options shared by every video read. Reading off
// api.sanity.io (not the CDN) means a publish-triggered revalidation always sees
// fresh data; the tag lets the webhook bust /videos + /videos/<slug> + the
// search delta in seconds. Both pages stay static/on-demand (tagged, not no-store).
const VIDEO_FETCH_OPTS = { next: { tags: [VIDEOS_TAG], revalidate: false as const } };

export interface VideoCategoryRef {
  title: string;
  slug: string;
}

/**
 * One `relatedProducts` entry (P2-AI-003; extended 2026-07-11): the shared
 * `blogProduct` object (SKU-backed or manual) OR a dereferenced
 * productPage/customProduct reference — same union every product strip uses.
 * A dangling reference projects to null, so consumers null-guard each item.
 */
export type VideoRelatedProductEntry = StripProductEntry;

export interface VideoSummary {
  _id: string;
  title: string;
  slug: SanitySlug;
  embedUrl: string;
  thumbnail?: SanityImage;
  /** Rich text (Task B). Rendered with links; plain-texted for meta + schema. */
  description?: PortableTextBlock[];
  /** Product strip under the description on /videos/<slug> (P2-AI-003). */
  relatedProducts?: (VideoRelatedProductEntry | null)[];
  publishDate?: string;
  category?: VideoCategoryRef;
  seo?: SeoFields;
}

// relatedProducts is re-projected so productPage/customProduct references
// dereference in place (blogProduct entries pass through verbatim) — see
// STRIP_PRODUCT_ENTRIES_PROJECTION. The deref rides this same VIDEOS_TAG-cached
// read, so the route stays static; the webhook's productPage/customProduct
// branches bust VIDEOS_TAG for embedding videos on an edit.
const SUMMARY_PROJECTION = `
  _id,
  title,
  slug,
  embedUrl,
  thumbnail,
  description,
  relatedProducts[]${STRIP_PRODUCT_ENTRIES_PROJECTION},
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
    (await cachedClient.fetch<VideoSummary[]>(
      `*[${PUBLISHED}] | order(publishDate desc, _createdAt desc) { ${SUMMARY_PROJECTION} }`,
      {},
      VIDEO_FETCH_OPTS,
    )) ?? []
  );
}

export async function getVideoSlugs(): Promise<string[]> {
  const docs =
    (await cachedClient.fetch<{ slug: { current: string } }[]>(
      `*[${PUBLISHED} && defined(slug.current)]{ "slug": slug }`,
      {},
      VIDEO_FETCH_OPTS,
    )) ?? [];
  return docs.map((d) => d.slug.current).filter(Boolean);
}

export async function getVideoBySlug(slug: string): Promise<VideoSummary | null> {
  return (
    (await cachedClient.fetch<VideoSummary | null>(
      `*[${PUBLISHED} && slug.current == $slug][0]{ ${SUMMARY_PROJECTION} }`,
      { slug },
      VIDEO_FETCH_OPTS,
    )) ?? null
  );
}

/**
 * Published videos for an explicit slug list, RETURNED IN THE SLUG-LIST ORDER
 * (P2-CP follow-up — the /products/<slug> "Related Videos" strip resolves its
 * manual refs + auto keyword matches to slugs, then loads card data here).
 * Rides VIDEOS_TAG, so a video publish revalidates every product page that
 * rendered the strip. Failures degrade to [] (the strip just doesn't render).
 */
export async function getVideoSummariesBySlugs(slugs: string[]): Promise<VideoSummary[]> {
  const wanted = slugs.filter(Boolean);
  if (wanted.length === 0) return [];
  try {
    const docs =
      (await cachedClient.fetch<VideoSummary[]>(
        `*[${PUBLISHED} && slug.current in $slugs]{ ${SUMMARY_PROJECTION} }`,
        { slugs: wanted },
        VIDEO_FETCH_OPTS,
      )) ?? [];
    const bySlug = new Map(docs.map((d) => [d.slug.current, d]));
    return wanted.map((s) => bySlug.get(s)).filter((d): d is VideoSummary => Boolean(d));
  } catch {
    return [];
  }
}

/** Other published videos in the same category, newest first. */
export async function getRelatedVideos(video: VideoSummary, limit = 6): Promise<VideoSummary[]> {
  const categorySlug = video.category?.slug;
  if (!categorySlug) return [];
  return (
    (await cachedClient.fetch<VideoSummary[]>(
      `*[${PUBLISHED}
          && slug.current != $self
          && category->slug.current == $cat]
        | order(publishDate desc, _createdAt desc) [0...$limit] { ${SUMMARY_PROJECTION} }`,
      { self: video.slug.current, cat: categorySlug, limit },
      VIDEO_FETCH_OPTS,
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
    (await cachedClient.fetch<{ title: string; slug: { current: string }; category?: string }[]>(
      `*[${PUBLISHED} && defined(title) && defined(slug.current)]{
        title,
        slug,
        "category": category->title
      }`,
      {},
      VIDEO_FETCH_OPTS,
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
