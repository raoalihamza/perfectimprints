import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { BlogGrid } from '@/components/blog/BlogGrid';
import { BlogPagination } from '@/components/blog/BlogPagination';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { getBlogPostsPage, getAllBlogCategories } from '@/lib/sanity/queries/blogs';
import { socialMeta } from '@/lib/seo/open-graph';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);
const BLOG_PER_PAGE = 12;

interface Props {
  params: Promise<{ n: string }>;
}

export const dynamicParams = true;
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { n } = await params;
  const page = Number.parseInt(n, 10);
  if (!Number.isInteger(page) || page < 2) return {};
  const title = `Promotional Products Blog – Page ${page} | Perfect Imprints`;
  const description =
    'More promotional product ideas, marketing tips, and buyer guidance from the Perfect Imprints blog.';
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/blog` },
    robots: { index: false, follow: true },
    ...socialMeta({ title, description, url: `${SITE_URL}/blog` }),
  };
}

export default async function BlogIndexPaginated({ params }: Props) {
  const { n } = await params;
  const page = Number.parseInt(n, 10);
  if (!Number.isInteger(page) || page < 1) notFound();
  if (page === 1) redirect('/blog');

  const [{ posts, totalPages }, categories] = await Promise.all([
    getBlogPostsPage({ page, perPage: BLOG_PER_PAGE }),
    getAllBlogCategories(),
  ]);

  if (page > totalPages) notFound();

  return (
    <>
      <CustomSchemaJsonLd path={`/blog/page/${page}`} />
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Blog', href: '/blog' },
            { label: `Page ${page}` },
          ]}
        />
      </Container>

      <Container as="section" className="pb-6">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl">
          Perfect Imprints Blog — Page {page}
        </h1>
      </Container>

      <Container as="section" className="pb-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
          <div>
            <BlogGrid posts={posts} />
            <BlogPagination currentPage={page} totalPages={totalPages} baseUrl="/blog" />
          </div>
          <BlogSidebar categories={categories} />
        </div>
      </Container>
    </>
  );
}
