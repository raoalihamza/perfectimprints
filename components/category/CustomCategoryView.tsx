import { PortableText } from '@portabletext/react';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { FAQsAccordion } from '@/components/category/FAQsAccordion';
import { CTABanner } from '@/components/category/CTABanner';
import { EmptyStateCTA } from '@/components/category/EmptyStateCTA';
import { ProductGrid } from '@/components/category/ProductGrid';
import { Schema } from '@/components/seo/Schema';
import { pagePortableComponents } from '@/components/page-sections/portable-text';
import { breadcrumbSchema } from '@/lib/seo/schema-generators';
import { affiliateUrl } from '@/lib/affiliate-url';
import { urlForImage } from '@/lib/sanity/client';
import type { GeigerProduct } from '@/lib/product-types';
import type { CustomCategoryDoc } from '@/lib/sanity/queries/custom-categories';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

interface Props {
  doc: CustomCategoryDoc;
  baseUrl: string;
  products: GeigerProduct[];
}

/**
 * Renders a Sanity `customCategory` at `/cat/<slug>` (M5-504 Part 4). Does NOT
 * require a Geiger mapping. CTAs default to the contact form when `externalUrl`
 * is blank.
 */
export function CustomCategoryView({ doc, baseUrl, products }: Props) {
  const title = doc.title;
  const hasFaqs = Array.isArray(doc.faqs) && doc.faqs.length > 0;
  const externalUrl = doc.externalUrl?.trim();

  let heroImageUrl: string | null = null;
  if (doc.heroImage?.asset?._ref) {
    try {
      heroImageUrl = urlForImage(doc.heroImage).width(1200).fit('max').url();
    } catch {
      heroImageUrl = null;
    }
  }

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Promotional Products', href: '/cat' },
    { label: title },
  ];

  return (
    <>
      <Schema
        data={breadcrumbSchema([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Promotional Products', url: `${SITE_URL}/cat` },
          { name: title, url: `${SITE_URL}${baseUrl}` },
        ])}
      />
      {hasFaqs && (
        <Schema
          data={{
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: doc.faqs!.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }}
        />
      )}

      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={breadcrumbItems} />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          {title}
        </h1>
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt={doc.heroImage?.alt || title}
            className="mt-6 w-full rounded-lg object-cover"
            width={1200}
            height={500}
          />
        )}
        {doc.heroCopy && (
          <p className="mt-4 text-lg leading-relaxed text-text-primary">{doc.heroCopy}</p>
        )}
        {doc.introHtml && doc.introHtml.length > 0 && (
          <div className="prose-lede mt-4 text-lg leading-relaxed text-text-primary">
            <PortableText value={doc.introHtml} components={pagePortableComponents} />
          </div>
        )}
      </Container>

      <Container as="section" className="pb-10">
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <EmptyStateCTA categoryTitle={title} sourceUrl={baseUrl} />
        )}
      </Container>

      {doc.bodySections && doc.bodySections.length > 0 && (
        <Container as="section" className="py-10">
          <div className="category-body text-text-primary">
            <PortableText value={doc.bodySections} components={pagePortableComponents} />
          </div>
        </Container>
      )}

      {hasFaqs && (
        <Container as="section">
          <FAQsAccordion faqs={doc.faqs!} />
        </Container>
      )}

      {externalUrl && (
        <Container as="section" className="pb-10">
          <a
            href={affiliateUrl(externalUrl)}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex h-11 items-center justify-center rounded bg-brand-green px-6 font-medium text-white hover:bg-brand-green/90"
          >
            Shop {title}
          </a>
        </Container>
      )}

      <CTABanner categoryTitle={title} />
    </>
  );
}
