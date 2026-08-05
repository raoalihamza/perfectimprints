import { cachedClient } from '@/lib/sanity/client';
import { BLOG_LIST_TAG, RELATED_BLOGS_TAG, blogPostTag } from '@/lib/sanity/cache-tags';
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

/**
 * Q-175: every LIST-level blog read below moved off the CDN `client` onto the
 * non-CDN `cachedClient` with BLOG_LIST_TAG. They feed the blog index and its
 * pagination, the blog CATEGORY pages and theirs, the home page's post preview,
 * the sitemap, and the search delta - all of which were reading a copy that
 * could be up to a minute stale at the exact moment a publish rebuilt them.
 * The category pages were the worst case: `revalidate = false` AND no webhook
 * path, so they were frozen until the next deploy. One list tag rather than
 * per-slug because a post moving between categories changes listings whose
 * slugs the webhook payload does not carry. See cache-tags.ts BLOG_LIST_TAG.
 */
const LIST_FETCH_OPTS = { next: { tags: [BLOG_LIST_TAG], revalidate: false as const } };

export async function getBlogPostSlugs(): Promise<string[]> {
  const docs = (await cachedClient.fetch<{ slug: { current: string } }[]>(
    `*[${PUBLISHED}]{ "slug": slug }`,
    {},
    LIST_FETCH_OPTS,
  )) ?? [];
  return docs.map((d) => d.slug.current).filter(Boolean);
}

export async function getBlogPostCount(): Promise<number> {
  return (
    (await cachedClient.fetch<number>(`count(*[${PUBLISHED}])`, {}, LIST_FETCH_OPTS)) ?? 0
  );
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
    (await cachedClient.fetch<{ title: string; slug: { current: string } }[]>(
      `*[${PUBLISHED} && defined(title) && defined(slug.current)]{ title, slug }`,
      {},
      LIST_FETCH_OPTS,
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
    cachedClient.fetch<BlogPostSummary[]>(
      `*[${PUBLISHED}] | order(publishDate desc) [${start}...${end}] { ${SUMMARY_PROJECTION} }`,
      {},
      LIST_FETCH_OPTS,
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
  //
  // Reads through the non-CDN `cachedClient`, tagged per slug (2026-08-05). It
  // used to use the CDN `client`, and because `/blog/<slug>` is `revalidate =
  // false` that made every publish a race the page could lose FOREVER: the
  // webhook rebuilt the page within a second, the Sanity CDN was still serving
  // its pre-publish ~60s copy, and that stale body was baked in permanently.
  // The symptom was a deleted product strip that would not go away. `useCdn:
  // false` is what removes the race; the tag is what keeps the read cached so
  // the route stays static instead of flipping dynamic. See blogPostTag().
  const doc = await cachedClient.fetch<BlogPostDetail | null>(
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
    { next: { tags: [blogPostTag(slug)].filter(Boolean), revalidate: false } },
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

  // Same non-CDN + tagged treatment as getBlogPostBySlug above: this runs in the
  // SAME frozen `revalidate = false` render, so a CDN read could bake a stale
  // related list in permanently too. Tagged RELATED_BLOGS_TAG rather than per
  // slug because the answer depends on OTHER posts publishing, and the webhook
  // already busts that tag on any blogPost publish.
  const auto = await cachedClient.fetch<BlogPostSummary[]>(
    `*[${PUBLISHED}
        && slug.current != $self
        && count(categories[@->slug.current in $cats]) > 0]
      | order(publishDate desc) [0...$limit] { ${SUMMARY_PROJECTION} }`,
    { self: post.slug.current, cats: categorySlugs, limit },
    { next: { tags: [RELATED_BLOGS_TAG], revalidate: false } },
  );
  return auto ?? [];
}

export async function getAllBlogCategories(): Promise<BlogCategoryDetail[]> {
  return (
    (await cachedClient.fetch<BlogCategoryDetail[]>(
      `*[_type == "blogCategory"] | order(title asc) { _id, title, slug, description }`,
      {},
      LIST_FETCH_OPTS,
    )) ?? []
  );
}

export async function getBlogCategoryBySlug(slug: string): Promise<BlogCategoryDetail | null> {
  return (
    (await cachedClient.fetch<BlogCategoryDetail | null>(
      `*[_type == "blogCategory" && slug.current == $slug][0]{ _id, title, slug, description }`,
      { slug },
      LIST_FETCH_OPTS,
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
    cachedClient.fetch<BlogPostSummary[]>(
      `*[${PUBLISHED} && $cat in categories[]->slug.current]
        | order(publishDate desc) [${start}...${end}] { ${SUMMARY_PROJECTION} }`,
      { cat: opts.categorySlug },
      LIST_FETCH_OPTS,
    ),
    cachedClient.fetch<number>(
      `count(*[${PUBLISHED} && $cat in categories[]->slug.current])`,
      { cat: opts.categorySlug },
      LIST_FETCH_OPTS,
    ),
  ]);
  return {
    posts: posts ?? [],
    total: total ?? 0,
    totalPages: Math.max(1, Math.ceil((total ?? 0) / opts.perPage)),
  };
}
