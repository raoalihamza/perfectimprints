import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { BlogGrid } from '@/components/blog/BlogGrid';
import { BlogPagination } from '@/components/blog/BlogPagination';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
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
  params: Promise<{ slug: string }>;
}

export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const categories = await getAllBlogCategories();
  return categories.map((c) => ({ slug: c.slug.current }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getBlogCategoryBySlug(slug);
  if (!category) return {};
  const canonical = `${SITE_URL}/blog/cat/${category.slug.current}`;
  const title = `${category.title} | Perfect Imprints Blog`;
  const description =
    category.description || `Read promotional product blog posts in the ${category.title} category.`;
  return {
    title,
    description,
    alternates: { canonical },
    ...socialMeta({ title, description, url: canonical }),
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params;
  const [category, allCategories] = await Promise.all([
    getBlogCategoryBySlug(slug),
    getAllBlogCategories(),
  ]);
  if (!category) notFound();

  const { posts, totalPages } = await getBlogPostsByCategorySlug({
    categorySlug: slug,
    page: 1,
    perPage: BLOG_PER_PAGE,
  });

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Blog', href: '/blog' },
            { label: category.title },
          ]}
        />
      </Container>

      <Container as="section" className="pb-6">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl">
          Posts in {category.title}
        </h1>
        {category.description && (
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-text-primary">
            {category.description}
          </p>
        )}
      </Container>

      <Container as="section" className="pb-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
          <div>
            <BlogGrid
              posts={posts}
              emptyMessage={`No posts in ${category.title} yet.`}
            />
            <BlogPagination
              currentPage={1}
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
