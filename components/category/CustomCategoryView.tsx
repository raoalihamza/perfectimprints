import { PortableText } from '@portabletext/react';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { FAQsAccordion } from '@/components/category/FAQsAccordion';
import { CTABanner } from '@/components/category/CTABanner';
import { CategoryCtaBar } from '@/components/category/CategoryCtaBar';
import { EmptyStateCTA } from '@/components/category/EmptyStateCTA';
import { CategoryShell } from '@/components/category/CategoryShell';
import { ProductGrid } from '@/components/category/ProductGrid';
import { Schema } from '@/components/seo/Schema';
import { pagePortableComponents } from '@/components/page-sections/portable-text';
import { collectionPageSchema } from '@/lib/seo/schema-generators';
import { productItemListSchema } from '@/lib/seo/product-list-schema';
import { largeSocialImage } from '@/lib/seo/open-graph';
import { portableTextToPlain } from '@/lib/portable-text/to-plain';
import { affiliateUrl } from '@/lib/affiliate-url';
import { urlForImage } from '@/lib/sanity/client';
import type { GeigerProduct } from '@/lib/product-types';
import type { SidebarData } from '@/lib/filter-types';
import type { CustomCategoryDoc } from '@/lib/sanity/queries/custom-categories';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

interface Props {
  doc: CustomCategoryDoc;
  baseUrl: string;
  products: GeigerProduct[];
  /**
   * Filter sidebar data, computed by the route (server-only membership reads).
   * When set the grid renders inside CategoryShell with the FilterSidebar —
   * filter clicks stay on this URL and fetch /api/category-products. When
   * null/absent the plain ProductGrid renders (the pre-filter behavior).
   */
  sidebar?: SidebarData | null;
  /** Category slug after /cat/ — CategoryShell's API fetch key. */
  slug?: string;
}

/**
 * Renders a Sanity `customCategory` at `/cat/<slug>` (M5-504 Part 4). Does NOT
 * require a Geiger mapping. CTAs default to the contact form when `externalUrl`
 * is blank.
 */
export function CustomCategoryView({ doc, baseUrl, products, sidebar, slug }: Props) {
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
    { label: 'Promotional Products', href: '/promotional-products' },
    { label: title },
  ];

  return (
    <>
      {/* BreadcrumbList JSON-LD is emitted once by the shared <Breadcrumbs>
          component below (absolute URLs) — do not duplicate it here. */}
      <Schema
        data={collectionPageSchema({
          name: title,
          url: `${SITE_URL}${baseUrl}`,
          description: doc.seo?.metaDescription || doc.heroCopy || undefined,
          // Primary image (M-SEO5): hero image when set (matches og:image),
          // else the first product image at the ~1200px social variant.
          image:
            heroImageUrl ??
            largeSocialImage(products.find((p) => p.imageUrl)?.imageUrl) ??
            undefined,
        })}
      />
      {/* Full-product ItemList (SNIP-110) via the shared SNIP-100 serializer:
          nested Product entities with conditional brand/sku/offer. Guards mean
          an override-added product with no destination gets NO url (never the
          bare affiliate homepage) and synthetic custom-<id> SKUs are suppressed.
          Custom pages are unpaginated, so this describes the whole grid. */}
      {products.length > 0 && <Schema data={productItemListSchema(products)} />}
      {hasFaqs && (
        <Schema
          data={{
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: doc.faqs!.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: portableTextToPlain(f.a) },
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
          sidebar ? (
            // Custom pages have no path pagination (page 1 only, whole grid in
            // the static HTML) — totalPages 1 keeps the unfiltered view showing
            // everything; filtered results client-paginate inside the shell.
            <CategoryShell
              sidebar={sidebar}
              products={products}
              totalProducts={products.length}
              totalPages={1}
              currentPage={1}
              baseUrl={baseUrl}
              slug={slug ?? baseUrl.replace(/^\/cat\//, '')}
            />
          ) : (
            <ProductGrid products={products} />
          )
        ) : (
          <EmptyStateCTA categoryTitle={title} sourceUrl={baseUrl} />
        )}
      </Container>

      {/* P2-CTA-001: "Not finding the exact …?" bar — only when the page shows
          products (the empty state above already carries its own CTA). */}
      {products.length > 0 && <CategoryCtaBar categoryTitle={title} sourceUrl={baseUrl} />}

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
