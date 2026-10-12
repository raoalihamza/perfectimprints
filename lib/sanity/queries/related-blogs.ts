import { cachedClient } from '@/lib/sanity/client';
import { RELATED_BLOGS_TAG } from '@/lib/sanity/cache-tags';
import type { SanityImage, SanitySlug } from '@/lib/sanity/types';
import type { ExternalHeaderImage } from '@/lib/blog/header-image';

export interface RelatedBlogCard {
  _id: string;
  title: string;
  slug: SanitySlug;
  headerImage?: SanityImage;
  /**
   * The hot-linked Geiger product photo a generated post falls back to when
   * it has no header asset (AUTO-202). Projected since AUTO-204, so the row
   * shows it instead of a placeholder, as the blog cards already do.
   */
  externalHeaderImage?: ExternalHeaderImage | null;
  publishDate: string;
  excerpt: string;
}

/**
 * Returns up to 8 published blog posts where `relatedCategorySlugs` contains
 * the given PI root slug. Newest first. Used by RelatedBlogsSection on root
 * category pages (M3-311).
 *
 * AUTO-204 added ONE field to the projection (`externalHeaderImage`), with
 * Ali's explicit word, and nothing else: the same single fetch, the same
 * non-CDN `cachedClient`, the same `RELATED_BLOGS_TAG`, `revalidate: false`.
 * That is what keeps every `/cat` page static (CLAUDE.md Section 13); do not
 * add a second read here or drop the tag.
 */
export async function getRelatedBlogs(rootSlug: string): Promise<RelatedBlogCard[]> {
  return (
    (await cachedClient.fetch<RelatedBlogCard[]>(
      `*[_type == "blogPost"
        && !(_id in path("drafts.**"))
        && $slug in relatedCategorySlugs]
        | order(publishDate desc) [0...8] {
          _id,
          title,
          slug,
          headerImage,
          externalHeaderImage{ url, alt },
          publishDate,
          "excerpt": coalesce(excerpt, pt::text(body)[0...120])
        }`,
      { slug: rootSlug },
      { next: { tags: [RELATED_BLOGS_TAG], revalidate: false } },
    )) ?? []
  );
}
