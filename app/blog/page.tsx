import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { BlogGrid } from '@/components/blog/BlogGrid';
import { BlogPagination } from '@/components/blog/BlogPagination';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { IndexHeadingWithSearch } from '@/components/layout/IndexHeadingWithSearch';
import { getBlogPostsPage, getAllBlogCategories } from '@/lib/sanity/queries/blogs';
import { socialMeta } from '@/lib/seo/open-graph';
import { buildBlogListingSchemas } from '@/lib/seo/content-schema';
import { Schema } from '@/components/seo/Schema';

export const dynamic = 'force-static';
export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);
const BLOG_PER_PAGE = 12;

const BLOG_TITLE = 'Promotional Products Blog | Perfect Imprints';
const BLOG_DESCRIPTION =
  'Get proven promotional product ideas, trade show strategies, and marketing tips from Perfect Imprints to help your brand stand out.';

export const metadata: Metadata = {
  title: BLOG_TITLE,
  description: BLOG_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/blog` },
  ...socialMeta({ title: BLOG_TITLE, description: BLOG_DESCRIPTION, url: `${SITE_URL}/blog` }),
};

export default async function BlogIndexPage() {
  const [{ posts, totalPages }, categories] = await Promise.all([
    getBlogPostsPage({ page: 1, perPage: BLOG_PER_PAGE }),
    getAllBlogCategories(),
  ]);

  // SNIP-150: CollectionPage + an ItemList of the posts THIS page renders
  // (summary-page shape: position + url per item, positions from 1). Pure over
  // the summaries already fetched - no new read, the route stays static.
  const listingSchemas = buildBlogListingSchemas({
    name: 'Perfect Imprints Blog',
    url: `${SITE_URL}/blog`,
    description: BLOG_DESCRIPTION,
    postUrls: posts.map((p) => `${SITE_URL}/blog/${p.slug.current}`),
  });

  return (
    <>
      <Schema data={listingSchemas} />
      <CustomSchemaJsonLd path="/blog" />
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Blog' }]} />
      </Container>

      <Container as="section" className="pb-6">
        <IndexHeadingWithSearch priorityType="blog">
          <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
            Perfect Imprints Blog
          </h1>
          <p className="mt-3 max-w-3xl text-lg leading-relaxed text-text-primary">
            Stay ahead with proven promotional product ideas, trade show strategies, and marketing
            insights that drive real results.
          </p>
        </IndexHeadingWithSearch>
      </Container>

      <Container as="section" className="pb-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
          <div>
            <BlogGrid posts={posts} emptyMessage="No published blog posts yet. Check back soon." />
            <BlogPagination currentPage={1} totalPages={totalPages} baseUrl="/blog" />
          </div>
          <BlogSidebar categories={categories} />
        </div>
      </Container>
    </>
  );
}
