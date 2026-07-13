import { cachedClient, client } from '@/lib/sanity/client';
import { RELATED_BLOGS_TAG } from '@/lib/sanity/cache-tags';
import { STRIP_PRODUCT_ENTRIES_PROJECTION } from '@/lib/sanity/strip-product-entries';
import type { PortableTextBlock } from '@portabletext/react';
import type { SanityImage, SanitySlug } from '@/lib/sanity/types';

export interface BlogAuthor {
  name: string;
  image?: SanityImage;
  bio?: string;
}

export interface BlogCategoryRef {
  title: string;
  slug: string;
}

export interface BlogPostSummary {
  _id: string;
  title: string;
  slug: SanitySlug;
  headerImage?: SanityImage;
  excerpt?: string;
  publishDate: string;
  author?: BlogAuthor;
  categories?: BlogCategoryRef[];
  metaDescription?: string;
}

export interface BlogPostDetail extends BlogPostSummary {
  body: PortableTextBlock[];
  updatedDate?: string;
  metaTitle?: string;
  /** Optional VERBATIM heading for the CTA block only (rendered as-is, no "Order Custom … Today" wrapper). */
  ctaTopic?: string;
  /** Optional per-post body paragraph for the CTA block (rendered as-is; blank → default copy). */
  ctaBody?: string;
  relatedCategorySlugs?: string[];
  relatedBlogs?: BlogPostSummary[];
}

export interface BlogCategoryDetail {
  _id: string;
  title: string;
  slug: SanitySlug;
  description?: string;
}

const SUMMARY_PROJECTION = `
  _id,
  title,
  slug,
  headerImage,
  excerpt,
  publishDate,
  metaDescription,
  "author": author->{ name, image },
  "categories": categories[]->{ title, "slug": slug.current }
`;

// All queries explicitly exclude drafts via the `!(_id in path("drafts.**"))`
// guard. The public Sanity client uses `perspective: "published"`, so this is
// belt-and-suspenders for any future use of a tokened client (sitemap, etc.).
const PUBLISHED = `_type == "blogPost" && !(_id in path("drafts.**"))`;

export async function getBlogPostSlugs(): Promise<string[]> {
  const docs = (await client.fetch<{ slug: { current: string } }[]>(
    `*[${PUBLISHED}]{ "slug": slug }`,
  )) ?? [];
  return docs.map((d) => d.slug.current).filter(Boolean);
}

export async function getBlogPostCount(): Promise<number> {
  return (await client.fetch<number>(`count(*[${PUBLISHED}])`)) ?? 0;
}

export interface BlogSearchEntry {
  title: string;
  slug: string;
}

/**
 * Minimal title+slug list of every published blog post. Feeds the build-time
 * search index (M5-502) — intentionally tiny (no body, image, or excerpt).
 */
export async function getAllBlogSearchEntries(): Promise<BlogSearchEntry[]> {
  const docs =
    (await client.fetch<{ title: string; slug: { current: string } }[]>(
      `*[${PUBLISHED} && defined(title) && defined(slug.current)]{ title, slug }`,
    )) ?? [];
  return docs
    .map((d) => ({ title: d.title, slug: d.slug?.current }))
    .filter((e): e is BlogSearchEntry => Boolean(e.title && e.slug));
}

/**
 * Published post summaries for an explicit slug list, RETURNED IN THE
 * SLUG-LIST ORDER (P2-CP follow-up — the /products/<slug> "Related Blogs"
 * strip resolves its manual refs + auto keyword matches to slugs, then loads
 * card data here). Unlike the CDN-client reads above, this goes through the
 * non-CDN `cachedClient` with RELATED_BLOGS_TAG (busted on any blogPost
 * publish) so the static product page stays prerenderable AND fresh. Failures
 * degrade to [] (the strip just doesn't render).
 */
export async function getBlogSummariesBySlugs(slugs: string[]): Promise<BlogPostSummary[]> {
  const wanted = slugs.filter(Boolean);
  if (wanted.length === 0) return [];
  try {
    const docs =
      (await cachedClient.fetch<BlogPostSummary[]>(
        `*[${PUBLISHED} && slug.current in $slugs]{ ${SUMMARY_PROJECTION} }`,
        { slugs: wanted },
        { next: { tags: [RELATED_BLOGS_TAG], revalidate: false } },
      )) ?? [];
    const bySlug = new Map(docs.map((d) => [d.slug.current, d]));
    return wanted.map((s) => bySlug.get(s)).filter((d): d is BlogPostSummary => Boolean(d));
  } catch {
    return [];
  }
}

export async function getBlogPostsPage(opts: {
  page: number;
  perPage: number;
}): Promise<{ posts: BlogPostSummary[]; total: number; totalPages: number }> {
  const start = (opts.page - 1) * opts.perPage;
  const end = start + opts.perPage;
  const [posts, total] = await Promise.all([
    client.fetch<BlogPostSummary[]>(
      `*[${PUBLISHED}] | order(publishDate desc) [${start}...${end}] { ${SUMMARY_PROJECTION} }`,
    ),
    getBlogPostCount(),
  ]);
  return {
    posts: posts ?? [],
    total,
    totalPages: Math.max(1, Math.ceil(total / opts.perPage)),
  };
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPostDetail | null> {
  // `body` is projected block-by-block so `blogProducts` strips can carry
  // productPage/customProduct REFERENCES alongside SKU/manual entries: the
  // spread keeps every block verbatim; the conditional re-projects only the
  // strip's products array, dereferencing refs in place (a dangling ref
  // yields null — BlogBody drops it). All other block types are unchanged.
  const doc = await client.fetch<BlogPostDetail | null>(
    `*[${PUBLISHED} && slug.current == $slug][0]{
      ${SUMMARY_PROJECTION},
      body[]{
        ...,
        _type == 'blogProducts' => {
          ...,
          products[]${STRIP_PRODUCT_ENTRIES_PROJECTION}
        }
      },
      updatedDate,
      metaTitle,
      ctaTopic,
      ctaBody,
      relatedCategorySlugs,
      "relatedBlogs": relatedBlogs[]->{ ${SUMMARY_PROJECTION} }
    }`,
    { slug },
  );
  return doc ?? null;
}

/**
 * Returns the related-blogs list to display under a single blog post.
 *
 * If the post has a curated `relatedBlogs` array, use it verbatim (published-only,
 * preserving editor order). Otherwise auto-derive by finding other published
 * posts that share at least one category slug, newest first.
 */
export async function getRelatedBlogsForPost(
  post: BlogPostDetail,
  limit = 8,
): Promise<BlogPostSummary[]> {
  const curated = (post.relatedBlogs ?? []).filter((p) => p?.slug?.current);
  if (curated.length > 0) return curated.slice(0, limit);

  const categorySlugs = (post.categories ?? []).map((c) => c.slug).filter(Boolean);
  if (categorySlugs.length === 0) return [];

  const auto = await client.fetch<BlogPostSummary[]>(
    `*[${PUBLISHED}
        && slug.current != $self
        && count(categories[@->slug.current in $cats]) > 0]
      | order(publishDate desc) [0...$limit] { ${SUMMARY_PROJECTION} }`,
    { self: post.slug.current, cats: categorySlugs, limit },
  );
  return auto ?? [];
}

export async function getAllBlogCategories(): Promise<BlogCategoryDetail[]> {
  return (
    (await client.fetch<BlogCategoryDetail[]>(
      `*[_type == "blogCategory"] | order(title asc) { _id, title, slug, description }`,
    )) ?? []
  );
}

export async function getBlogCategoryBySlug(slug: string): Promise<BlogCategoryDetail | null> {
  return (
    (await client.fetch<BlogCategoryDetail | null>(
      `*[_type == "blogCategory" && slug.current == $slug][0]{ _id, title, slug, description }`,
      { slug },
    )) ?? null
  );
}

export async function getBlogPostsByCategorySlug(opts: {
  categorySlug: string;
  page: number;
  perPage: number;
}): Promise<{ posts: BlogPostSummary[]; total: number; totalPages: number }> {
  const start = (opts.page - 1) * opts.perPage;
  const end = start + opts.perPage;
  const [posts, total] = await Promise.all([
    client.fetch<BlogPostSummary[]>(
      `*[${PUBLISHED} && $cat in categories[]->slug.current]
        | order(publishDate desc) [${start}...${end}] { ${SUMMARY_PROJECTION} }`,
      { cat: opts.categorySlug },
    ),
    client.fetch<number>(
      `count(*[${PUBLISHED} && $cat in categories[]->slug.current])`,
      { cat: opts.categorySlug },
    ),
  ]);
  return {
    posts: posts ?? [],
    total: total ?? 0,
    totalPages: Math.max(1, Math.ceil((total ?? 0) / opts.perPage)),
  };
}
