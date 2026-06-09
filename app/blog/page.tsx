import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { BlogGrid } from '@/components/blog/BlogGrid';
import { BlogPagination } from '@/components/blog/BlogPagination';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { getBlogPostsPage, getAllBlogCategories } from '@/lib/sanity/queries/blogs';

export const dynamic = 'force-static';
export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);
const BLOG_PER_PAGE = 12;

export const metadata: Metadata = {
  title: 'Promotional Products Blog | Perfect Imprints',
  description:
    'Get proven promotional product ideas, trade show strategies, and marketing tips from Perfect Imprints to help your brand stand out.',
  alternates: { canonical: `${SITE_URL}/blog` },
};

export default async function BlogIndexPage() {
  const [{ posts, totalPages }, categories] = await Promise.all([
    getBlogPostsPage({ page: 1, perPage: BLOG_PER_PAGE }),
    getAllBlogCategories(),
  ]);

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Blog' }]} />
      </Container>

      <Container as="section" className="pb-6">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          Perfect Imprints Blog
        </h1>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-text-primary">
          Stay ahead with proven promotional product ideas, trade show strategies, and marketing
          insights that drive real results.
        </p>
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
