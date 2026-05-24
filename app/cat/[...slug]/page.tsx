import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ProductGrid } from '@/components/category/ProductGrid';
import { FAQsAccordion } from '@/components/category/FAQsAccordion';
import { CTABanner } from '@/components/category/CTABanner';
import {
  getAllGeneratedRootSlugs,
  getCategoryContent,
  getProductsForCategorySlug,
} from '@/lib/categories';

interface Props {
  params: Promise<{ slug: string[] }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllGeneratedRootSlugs().map((slug) => ({ slug: [slug] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug.length !== 1) return {};
  const content = getCategoryContent(slug[0]);
  if (!content) return {};
  return {
    title: { absolute: content.metaTitle },
    description: content.metaDescription,
    alternates: { canonical: content.url },
  };
}

function splitIntro(html: string): { lede: string; rest: string } {
  const closeIdx = html.indexOf('</p>');
  if (closeIdx === -1) return { lede: html, rest: '' };
  const end = closeIdx + '</p>'.length;
  return { lede: html.slice(0, end), rest: html.slice(end) };
}

function categoryTitle(content: ReturnType<typeof getCategoryContent>): string {
  if (!content) return '';
  return content.metaTitle.split('|')[0].trim() || content.h1;
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  if (slug.length !== 1) notFound();
  const content = getCategoryContent(slug[0]);
  if (!content || content.type !== 'root') notFound();

  const products = getProductsForCategorySlug(slug[0]);
  const { lede, rest } = splitIntro(content.introHtml);
  const title = categoryTitle(content);

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Promotional Products', href: '/cat' },
            { label: title },
          ]}
        />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          {content.h1}
        </h1>
        <div
          className="prose-lede mt-4 max-w-prose text-lg leading-relaxed text-text-primary"
          dangerouslySetInnerHTML={{ __html: lede }}
        />
      </Container>

      <Container as="section" className="pb-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-brand-ink">
            {products.length} {products.length === 1 ? 'Product' : 'Products'}
          </h2>
        </div>
        <ProductGrid products={products} />
      </Container>

      {rest && (
        <Container as="section" className="py-8">
          <div
            className="category-body max-w-prose text-text-primary [&>p]:mt-4 [&>p:first-child]:mt-0 [&>p]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: rest }}
          />
        </Container>
      )}

      <Container as="section">
        <FAQsAccordion faqs={content.faqs} />
      </Container>

      <CTABanner categoryTitle={title} />
    </>
  );
}
