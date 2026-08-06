import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient } from '@/lib/sanity/client';
import { VIDEOS_TAG } from '@/lib/sanity/cache-tags';
import {
  STRIP_PRODUCT_ENTRIES_PROJECTION,
  type StripProductEntry,
} from '@/lib/sanity/strip-product-entries';
import type { SanityImage, SanitySlug, SeoFields } from '@/lib/sanity/types';
import {
  effectiveVideoCategories,
  rankRelatedVideos,
  type VideoCategoryRef,
} from '@/lib/video/video-categories';

// Tagged, non-CDN fetch options shared by every video read. Reading off
// api.sanity.io (not the CDN) means a publish-triggered revalidation always sees
// fresh data; the tag lets the webhook bust /videos + /videos/<slug> + the
// search delta in seconds. Both pages stay static/on-demand (tagged, not no-store).
const VIDEO_FETCH_OPTS = { next: { tags: [VIDEOS_TAG], revalidate: false as const } };

export type { VideoCategoryRef };

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
  /**
   * Multi-category (Q-180): the new `categories` list + the legacy single
   * `category` (projected as `legacyCategory`). NEVER read these raw - use
   * `videoCategoriesOf(video)` so every consumer applies the same
   * new-list-wins-else-legacy rule (lib/video/video-categories.ts).
   */
  categories?: (VideoCategoryRef | null)[] | null;
  legacyCategory?: VideoCategoryRef | null;
  seo?: SeoFields;
}

/** Effective category list for a video (new list wins, else legacy single). */
export function videoCategoriesOf(
  video: Pick<VideoSummary, 'categories' | 'legacyCategory'>,
): VideoCategoryRef[] {
  return effectiveVideoCategories(video);
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
  "categories": categories[]->{ title, "slug": slug.current },
  "legacyCategory": category->{ title, "slug": slug.current }
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

/**
 * Other published videos sharing at least one category, ranked by HOW MANY
 * categories they share (more shared = more related), newest first within a
 * band (Q-180 multi-category). With single-category videos this reduces to the
 * old "same category, newest first" rule. Candidates come from the same
 * getAllVideos query the index uses (identical query string → deduped in the
 * Next data cache, same VIDEOS_TAG), and the ranking itself is the pure,
 * legacy-tolerant rankRelatedVideos (lib/video/video-categories.ts).
 */
export async function getRelatedVideos(video: VideoSummary, limit = 6): Promise<VideoSummary[]> {
  const selfSlugs = videoCategoriesOf(video).map((c) => c.slug);
  if (selfSlugs.length === 0) return [];
  const all = await getAllVideos();
  return rankRelatedVideos(
    all.map((v) => ({
      item: v,
      slug: v.slug.current,
      categorySlugs: videoCategoriesOf(v).map((c) => c.slug),
    })),
    video.slug.current,
    selfSlugs,
    limit,
  );
}

export interface VideoSearchEntry {
  title: string;
  slug: string;
  /**
   * Category title(s) - secondary search key in the live search delta. A
   * multi-category video joins its titles into this ONE string ("Drinkware,
   * Tote Bags") so it stays searchable by every category while producing
   * exactly ONE index entry (Q-180: never one entry per category).
   */
  category?: string;
}

/**
 * Minimal list of every published video for the search index delta (M5-507):
 * title + category titles (both searchable) + slug (internal route).
 */
export async function getAllVideoSearchEntries(): Promise<VideoSearchEntry[]> {
  const docs =
    (await cachedClient.fetch<
      {
        title: string;
        slug: { current: string };
        categories?: (VideoCategoryRef | null)[] | null;
        legacyCategory?: VideoCategoryRef | null;
      }[]
    >(
      `*[${PUBLISHED} && defined(title) && defined(slug.current)]{
        title,
        slug,
        "categories": categories[]->{ title, "slug": slug.current },
        "legacyCategory": category->{ title, "slug": slug.current }
      }`,
      {},
      VIDEO_FETCH_OPTS,
    )) ?? [];
  return docs
    .map((d): VideoSearchEntry => {
      const titles = effectiveVideoCategories(d).map((c) => c.title);
      return {
        title: d.title,
        slug: d.slug?.current,
        category: titles.length > 0 ? titles.join(', ') : undefined,
      };
    })
    .filter((e) => Boolean(e.title && e.slug));
}
