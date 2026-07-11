import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PortableTextBlock } from '@portabletext/react';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { BlogBody } from '@/components/blog/BlogBody';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { SocialShareBar } from '@/components/blog/SocialShareBar';
import { OrderTodayCTA } from '@/components/blog/OrderTodayCTA';
import { RelatedBlogsForPost } from '@/components/blog/RelatedBlogsForPost';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { buildImageUrl } from '@/lib/sanity/client';
import {
  getBlogPostBySlug,
  getBlogPostSlugs,
  getAllBlogCategories,
  getRelatedBlogsForPost,
} from '@/lib/sanity/queries/blogs';
import { resolveProductsBySku } from '@/lib/categories';
import { socialMeta } from '@/lib/seo/open-graph';
import { buildBlogPostingSchema } from '@/lib/seo/content-schema';
import type { GeigerProduct } from '@/lib/product-types';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getBlogPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};
  const canonical = `${SITE_URL}/blog/${post.slug.current}`;
  const heroImage = buildImageUrl(post.headerImage, (b) => b.width(1200)) ?? undefined;
  return {
    title: post.metaTitle || `${post.title} | Perfect Imprints`,
    description: post.metaDescription || post.excerpt,
    alternates: { canonical },
    ...socialMeta({
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt,
      url: canonical,
      image: heroImage ?? null,
      imageAlt: post.title,
      type: 'article',
      publishedTime: post.publishDate,
      modifiedTime: post.updatedDate,
    }),
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function deriveOrderTopic(post: { title: string; categories?: { title: string }[] }): string {
  if (post.categories && post.categories.length > 0) return post.categories[0].title;
  // Fallback: lift the first 2-3 keyword words from the title.
  return post.title.split(/[:|—–-]/)[0].trim();
}

function collectBlogProductSkus(body: PortableTextBlock[] | undefined): string[] {
  if (!body) return [];
  const skus: string[] = [];
  const seen = new Set<string>();
  for (const block of body) {
    // Entries can also be dereferenced productPage/customProduct refs (which
    // carry no `sku` here) or null (dangling ref) — both are skipped; only
    // blogProduct SKU entries feed the catalog lookup.
    const b = block as { _type?: string; products?: ({ sku?: string } | null)[] };
    if (b._type !== 'blogProducts') continue;
    for (const entry of b.products ?? []) {
      const sku = entry?.sku?.trim();
      if (sku && !seen.has(sku)) {
        seen.add(sku);
        skus.push(sku);
      }
    }
  }
  return skus;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post, categories] = await Promise.all([
    getBlogPostBySlug(slug),
    getAllBlogCategories(),
  ]);
  if (!post) notFound();

  const canonical = `${SITE_URL}/blog/${post.slug.current}`;
  const heroImage = buildImageUrl(post.headerImage, (b) => b.width(1400));
  const firstCategory = post.categories?.[0];
  const orderTopic = deriveOrderTopic(post);

  const blogProductSkus = collectBlogProductSkus(post.body);
  const skuProducts = new Map<string, GeigerProduct>();
  if (blogProductSkus.length > 0) {
    for (const product of resolveProductsBySku(blogProductSkus)) {
      skuProducts.set(product.sku, product);
    }
  }

  const relatedBlogs = await getRelatedBlogsForPost(post, 8);

  const blogPostingSchema = buildBlogPostingSchema({
    title: post.title,
    canonical,
    heroImage,
    publishDate: post.publishDate,
    updatedDate: post.updatedDate,
    authorName: post.author?.name,
    description: post.metaDescription || post.excerpt,
    siteUrl: SITE_URL,
  });

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Blog', href: '/blog' },
            ...(firstCategory
              ? [{ label: firstCategory.title, href: `/blog/cat/${firstCategory.slug}` }]
              : []),
            { label: post.title },
          ]}
        />
      </Container>

      <Container as="article" className="pb-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[48px_1fr_280px]">
          {/* Left: vertical sticky social bar (desktop only) */}
          <div className="hidden lg:block">
            <SocialShareBar
              url={canonical}
              title={post.title}
              imageUrl={heroImage || undefined}
            />
          </div>

          {/* Center: header + hero + body */}
          <div className="min-w-0">
            <header className="mb-6">
              <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
                {post.title}
              </h1>
              <div className="mt-3 text-sm text-text-muted">
                <span>Published: {formatDate(post.publishDate)}</span>
                {post.author?.name && <span className="ml-4">Author: {post.author.name}</span>}
              </div>
              <div className="mt-4 lg:hidden">
                <SocialShareBar
                  url={canonical}
                  title={post.title}
                  imageUrl={heroImage || undefined}
                />
              </div>
            </header>

            {heroImage && (
              <figure className="mb-6 overflow-hidden rounded-lg bg-bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt={post.title}
                  className="h-auto w-full"
                />
              </figure>
            )}
            <BlogBody body={post.body} skuProducts={skuProducts} />

            {/* ctaTopic is a VERBATIM CTA-heading override (no "Order Custom …
                Today" wrapper) and affects ONLY this block — the Related Blogs
                heading below always uses the automatic category-based topic. */}
            <OrderTodayCTA
              topic={orderTopic}
              heading={post.ctaTopic?.trim() || undefined}
              sourceUrl={canonical}
            />

            <RelatedBlogsForPost posts={relatedBlogs} topic={orderTopic} />
          </div>

          {/* Right: sidebar */}
          <BlogSidebar categories={categories} />
        </div>
      </Container>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema) }}
      />
      <CustomSchemaJsonLd path={`/blog/${post.slug.current}`} />
    </>
  );
}
