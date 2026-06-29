import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { BlogGrid } from '@/components/blog/BlogGrid';
import { BlogPagination } from '@/components/blog/BlogPagination';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import {
  getAllBlogCategories,
  getBlogCategoryBySlug,
  getBlogPostsByCategorySlug,
} from '@/lib/sanity/queries/blogs';
import { socialMeta } from '@/lib/seo/open-graph';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);
const BLOG_PER_PAGE = 12;

interface Props {
  params: Promise<{ slug: string; n: string }>;
}

export const dynamicParams = true;
export const revalidate = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, n } = await params;
  const page = Number.parseInt(n, 10);
  if (!Number.isInteger(page) || page < 2) return {};
  const category = await getBlogCategoryBySlug(slug);
  if (!category) return {};
  const title = `${category.title} – Page ${page} | Perfect Imprints Blog`;
  const canonical = `${SITE_URL}/blog/cat/${category.slug.current}`;
  return {
    title,
    alternates: { canonical },
    robots: { index: false, follow: true },
    ...socialMeta({ title, url: canonical }),
  };
}

export default async function BlogCategoryPaginated({ params }: Props) {
  const { slug, n } = await params;
  const page = Number.parseInt(n, 10);
  if (!Number.isInteger(page) || page < 1) notFound();
  if (page === 1) redirect(`/blog/cat/${slug}`);

  const [category, allCategories] = await Promise.all([
    getBlogCategoryBySlug(slug),
    getAllBlogCategories(),
  ]);
  if (!category) notFound();

  const { posts, totalPages } = await getBlogPostsByCategorySlug({
    categorySlug: slug,
    page,
    perPage: BLOG_PER_PAGE,
  });
  if (page > totalPages) notFound();

  return (
    <>
      <CustomSchemaJsonLd path={`/blog/cat/${category.slug.current}/page/${page}`} />
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Blog', href: '/blog' },
            { label: category.title, href: `/blog/cat/${category.slug.current}` },
            { label: `Page ${page}` },
          ]}
        />
      </Container>

      <Container as="section" className="pb-6">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl">
          Posts in {category.title} — Page {page}
        </h1>
      </Container>

      <Container as="section" className="pb-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
          <div>
            <BlogGrid posts={posts} />
            <BlogPagination
              currentPage={page}
              totalPages={totalPages}
              baseUrl={`/blog/cat/${category.slug.current}`}
            />
          </div>
          <BlogSidebar categories={allCategories} />
        </div>
      </Container>
    </>
  );
}
