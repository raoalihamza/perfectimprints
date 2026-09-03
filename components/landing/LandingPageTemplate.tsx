import { PortableText } from '@portabletext/react';
import type { PortableTextBlock } from '@portabletext/react';
import { Container } from '@/components/ui/Container';
import { LeadForm } from '@/components/forms/LeadForm';
import { SectionShell } from '@/components/page-sections/SectionShell';
import { pagePortableComponents } from '@/components/page-sections/portable-text';
import { ProductStrip } from '@/components/page-sections/ProductStrip';
import { FaqAccordion } from '@/components/page-sections/FaqAccordion';
import { PortfolioGallerySection } from '@/components/portfolio/PortfolioGallerySection';
import { landingServiceSchema } from '@/lib/seo/schema-generators';
import type {
  FaqAccordionSection,
  PortfolioGalleryPageSection,
  ProductStripSection,
} from '@/lib/sanity/queries/pages';
import type { LandingPageDoc } from '@/lib/sanity/queries/landing-pages';
import { jsonLdHtml } from '@/lib/seo/json-ld';

/**
 * The FIXED local/topic landing-page template (P2-AI-005 part 1), rendered at
 * /<slug> by the root catch-all. Order is deliberate and not editor-rearrangeable
 * (unlike the `page` builder): hero → local intro → options & ideas + product
 * strip → why us → FAQ → lead form. Every content field is Sanity-editable; the
 * AI action drafts them.
 *
 * Server component, static-safe: the bodies are plain PortableText renders, the
 * product strip resolves SKUs synchronously from disk (reusing the page-builder
 * ProductStrip → resolveProductsBySku), and the only client component is the
 * existing LeadForm. No searchParams, no uncached read — /<slug> stays SSG.
 *
 * JSON-LD: the FAQ section reuses the page-builder FaqAccordion, which emits its
 * own FAQPage schema — do NOT add a second FAQPage block here. The Service
 * schema (product + city) is emitted below when both inputs exist.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

/** Anchor the hero button targets — the lead-form slot at the bottom. */
const QUOTE_FORM_ID = 'quote-form';

function hasBody(body?: PortableTextBlock[]): body is PortableTextBlock[] {
  return Array.isArray(body) && body.length > 0;
}

function titleCase(phrase: string): string {
  return phrase.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function LandingPageTemplate({ page }: { page: LandingPageDoc }) {
  const heading = page.heroHeading?.trim() || page.title;
  const place = [page.city, page.state].filter(Boolean).join(', ');

  const serviceSchema =
    page.product?.trim() && page.city?.trim()
      ? landingServiceSchema({
          product: page.product.trim(),
          city: page.city.trim(),
          state: page.state?.trim() || undefined,
          url: `${SITE_URL}/${page.slug}`,
          description: page.seo?.metaDescription?.trim() || undefined,
        })
      : null;

  // Reuse the page-builder ProductStrip renderer (SKU-backed cards resolved from
  // disk + manual-fallback cards + affiliate rewrite) by handing it a synthetic
  // section built from this doc's relatedProducts.
  const stripSection: ProductStripSection | null =
    (page.relatedProducts?.length ?? 0) > 0
      ? {
          _type: 'productStrip',
          _key: 'landing-products',
          heading: page.product?.trim()
            ? `Featured ${titleCase(page.product.trim())}`
            : 'Featured Custom Promotional Products',
          products: page.relatedProducts,
        }
      : null;

  // PORT-120: reuse the page-builder Portfolio Gallery section the same way,
  // by handing it a synthetic section built from this doc's field. Fixed
  // position (after Options & Ideas + the strip, before Why Us); the field
  // stays as stored (references), the section resolves them.
  const gallerySection: PortfolioGalleryPageSection | null = page.portfolioGallery
    ? {
        ...page.portfolioGallery,
        _type: 'portfolioGallery',
        _key: 'landing-portfolio',
        hidden: page.portfolioGallery.hidden ?? undefined,
      }
    : null;

  // Reuse the page-builder FaqAccordion (it also emits the FAQPage JSON-LD).
  const faqSection: FaqAccordionSection | null =
    (page.faqs?.length ?? 0) > 0
      ? {
          _type: 'faqAccordion',
          _key: 'landing-faqs',
          heading: 'Frequently Asked Questions',
          items: page.faqs,
        }
      : null;

  return (
    <>
      {/* 1. Hero — text-only (Patrick adds no image in part 1), CTA anchors to the form. */}
      <section className="bg-bg-soft">
        <Container className="py-10 text-center md:py-14">
          <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-5xl">
            {heading}
          </h1>
          {page.heroSubheading?.trim() && (
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-primary md:text-xl">
              {page.heroSubheading.trim()}
            </p>
          )}
          <a
            href={`#${QUOTE_FORM_ID}`}
            className="mt-6 inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white hover:opacity-90"
          >
            {page.heroCtaLabel?.trim() || 'Request a Quote'}
          </a>
        </Container>
      </section>

      {/* 2. Local intro — the landmark-weaving local context. */}
      {hasBody(page.localIntro) && (
        <SectionShell>
          <PortableText value={page.localIntro} components={pagePortableComponents} />
        </SectionShell>
      )}

      {/* 3. Options & ideas (the main content) + the related-products strip. */}
      {hasBody(page.optionsIdeas) && (
        <SectionShell>
          <PortableText value={page.optionsIdeas} components={pagePortableComponents} />
        </SectionShell>
      )}
      {stripSection && <ProductStrip section={stripSection} />}

      {/* 3b. Portfolio gallery (PORT-120): fixed here, below the main content. */}
      {gallerySection && (
        <PortfolioGallerySection gallery={gallerySection} host="section" layout="section" />
      )}

      {/* 4. Why Perfect Imprints — the trust section. */}
      {hasBody(page.whyUs) && (
        <SectionShell>
          <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">Why Perfect Imprints</h2>
          <PortableText value={page.whyUs} components={pagePortableComponents} />
        </SectionShell>
      )}

      {/* 5. FAQ accordion (emits its own FAQPage JSON-LD). */}
      {faqSection && <FaqAccordion section={faqSection} />}

      {/* 6. The landing lead form (P2-AI-005 part 2). `landingSlug` is the only
          landing context the client sends — /api/leads resolves this page's
          stored `leadRecipient` server-side and emails the customer an
          automatic confirmation of their submission. Heading + hero button
          label are Studio-editable with automatic defaults. */}
      <SectionShell>
        <div id={QUOTE_FORM_ID} className="scroll-mt-24 rounded-md border border-border bg-brand-white p-6 md:p-8">
          <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">
            {page.leadFormHeading?.trim() ||
              (place ? `Request a Quote in ${place}` : 'Request a Quote')}
          </h2>
          <p className="mt-2 text-text-muted">
            Tell us what you need and our team will get back to you fast with product ideas and
            pricing.
          </p>
          <div className="mt-6">
            <LeadForm
              categoryTitle={page.product?.trim() || undefined}
              sourceUrl={`/${page.slug}`}
              landingSlug={page.slug}
            />
          </div>
        </div>
      </SectionShell>

      {serviceSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(serviceSchema) }}
        />
      )}
    </>
  );
}
