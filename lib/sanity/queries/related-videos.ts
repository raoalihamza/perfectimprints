import { cachedClient } from '@/lib/sanity/client';
import { RELATED_VIDEOS_TAG } from '@/lib/sanity/cache-tags';
import type { VideoSummary } from '@/lib/sanity/queries/videos';

/** How many videos a root category page lists: one row of the four-column grid. */
export const RELATED_VIDEOS_PER_ROOT = 4;

/**
 * Published videos whose `relatedCategorySlugs` carries the given PI root slug,
 * newest first, for the "Related Videos About ..." row on root category pages
 * (VID-100). The twin of `getRelatedBlogs` in related-blogs.ts, built the same
 * way for the same reason: ONE fetch, through the non-CDN `cachedClient`,
 * tagged and `revalidate: false`, never uncached. That is what keeps every
 * `/cat` page static (CLAUDE.md Section 13); do not add a second read here or
 * drop the tag.
 *
 * The tag is RELATED_VIDEOS_TAG, the row's own and not the videos collection
 * tag, so that only a video publish invalidates the root pages
 * (lib/sanity/cache-tags.ts has the reasoning).
 * The projection is exactly what `toVideoCardData` reads and nothing the
 * video page alone needs (not the product strip, not the SEO object, not the
 * gallery block), so a root page carries four small documents, not four whole
 * videos.
 */
export async function getRelatedVideosForCategory(rootSlug: string): Promise<VideoSummary[]> {
  return (
    (await cachedClient.fetch<VideoSummary[]>(
      `*[_type == "video"
        && !(_id in path("drafts.**"))
        && defined(embedUrl)
        && $slug in relatedCategorySlugs]
        | order(publishDate desc, _createdAt desc) [0...${RELATED_VIDEOS_PER_ROOT}] {
          _id,
          title,
          slug,
          embedUrl,
          thumbnail,
          description,
          publishDate,
          "categories": categories[]->{ title, "slug": slug.current },
          "legacyCategory": category->{ title, "slug": slug.current }
        }`,
      { slug: rootSlug },
      { next: { tags: [RELATED_VIDEOS_TAG], revalidate: false } },
    )) ?? []
  );
}
