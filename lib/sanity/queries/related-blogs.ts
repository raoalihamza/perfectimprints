import { cachedClient } from '@/lib/sanity/client';
import { RELATED_BLOGS_TAG } from '@/lib/sanity/cache-tags';
import type { SanityImage, SanitySlug } from '@/lib/sanity/types';

export interface RelatedBlogCard {
  _id: string;
  title: string;
  slug: SanitySlug;
  headerImage?: SanityImage;
  publishDate: string;
  excerpt: string;
}

/**
 * Returns up to 8 published blog posts where `relatedCategorySlugs` contains
 * the given PI root slug. Newest first. Used by RelatedBlogsSection on root
 * category pages (M3-311).
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
          publishDate,
          "excerpt": coalesce(excerpt, pt::text(body)[0...120])
        }`,
      { slug: rootSlug },
      { next: { tags: [RELATED_BLOGS_TAG], revalidate: false } },
    )) ?? []
  );
}
