import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PortableText } from '@portabletext/react';

import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ProductGrid } from '@/components/category/ProductGrid';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { CatalogCta } from '@/components/catalogs/CatalogCta';
import { CatalogRelatedContent } from '@/components/catalogs/CatalogRelatedContent';
import { pagePortableComponents } from '@/components/page-sections/portable-text';
import {
  getAllCatalogPageSlugs,
  getCatalogPageBySlug,
  type CatalogPageDoc,
} from '@/lib/sanity/queries/catalog-pages';
import { getCatalogPreviewProducts } from '@/lib/catalogs';
import { getFormBySlug, toFormRenderDef } from '@/lib/sanity/queries/forms';
import { CATALOG_FORM_SLUG } from '@/lib/leads/catalog-lead';
import { buildImageUrl } from '@/lib/sanity/client';
import { collectionPageSchema } from '@/lib/seo/schema-generators';
import { largeSocialImage, socialMeta } from '@/lib/seo/open-graph';
import { portableTextToPlain } from '@/lib/portable-text/to-plain';

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// Prebuild every published catalogPage (the set is small — 7 catalogs today,
// Patrick-authored) but keep dynamicParams TRUE so a catalog published after
// the last deploy renders on-demand instead of 404ing until a rebuild — the
// /products/[slug] pattern. All Sanity reads are cache-tagged (CATALOG_PAGES_TAG
// + catalog-page:<slug>) and the catalogs.json read is sync disk I/O, so the
// route stays statically prerenderable (no searchParams, no uncached fetch).
export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getAllCatalogPageSlugs();
  return slugs.map((slug) => ({ slug }));
}

/** Word-boundary clamp for meta descriptions derived from the body. */
function clampAtWord(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd()}…`;
}

/** og:image priority: seo.ogImage → hero image → first scraped product image. */
function catalogOgImage(doc: CatalogPageDoc): string | null {
  if (doc.seo?.ogImage) {
    const url = buildImageUrl(doc.seo.ogImage, (b) => b.width(1200).fit('max'));
    if (url) return url;
  }
  if (doc.heroImage) {
    const url = buildImageUrl(doc.heroImage, (b) => b.width(1200).fit('max'));
    if (url) return url;
  }
  const first = getCatalogPreviewProducts(doc.catalogKey, 1)[0];
  return largeSocialImage(first?.imageUrl);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getCatalogPageBySlug(slug);
  if (!doc) return {};

  const canonical = `${SITE_URL}/shop-by-theme/${doc.slug}`;
  const title = doc.seo?.metaTitle?.trim() || `${doc.title} Promotional Products Catalog | Perfect Imprints`;
  const plain = portableTextToPlain(doc.body);
  const description =
    doc.seo?.metaDescription?.trim() ||
    (plain
      ? clampAtWord(plain, 155)
      : `Browse the ${doc.title} catalog of custom promotional products from Perfect Imprints.`);
  const image = catalogOgImage(doc);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...socialMeta({ title, description, url: canonical, image, imageAlt: doc.title }),
  };
}

export default async function CatalogLandingPage({ params }: Props) {
  const { slug } = await params;
  const doc = await getCatalogPageBySlug(slug);
  if (!doc) notFound();

  // The catalog lead form (P2-CAT-002): the seeded `catalog-request` builder
  // form, resolved ONCE through the tag-cached read (FORMS_TAG + form:<slug> —
  // static-safe, webhook-revalidated) and shared by all three CTA instances.
  // Unpublished → null → the CTAs fall back to a /contact link.
  const catalogFormDoc = await getFormBySlug(CATALOG_FORM_SLUG);
  const catalogForm = catalogFormDoc ? toFormRenderDef(catalogFormDoc) : null;

  const canonical = `${SITE_URL}/shop-by-theme/${doc.slug}`;
  const heading = doc.heroHeading?.trim() || doc.title;
  const heroImageUrl = doc.heroImage
    ? buildImageUrl(doc.heroImage, (b) => b.width(1600).fit('max'))
    : null;
  const hasBody = Array.isArray(doc.body) && doc.body.length > 0;
  // A small static peek at the catalog's products (scraped set only — cheap,
  // sync disk read; manual-only catalogs have none and render no strip).
  const previewProducts = getCatalogPreviewProducts(doc.catalogKey, 4);

  const schema = collectionPageSchema({
    name: heading,
    url: canonical,
    description: doc.seo?.metaDescription?.trim() || undefined,
    image: catalogOgImage(doc) || undefined,
  });

  const cta = (placement: 'top' | 'middle' | 'end') => (
    <CatalogCta
      heading={doc.ctaHeading}
      buttonLabel={doc.ctaButtonLabel}
      catalogSlug={doc.slug}
      placement={placement}
      form={catalogForm}
    />
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
      />
      <CustomSchemaJsonLd path={`/shop-by-theme/${doc.slug}`} />

      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: doc.title }]} />
      </Container>

      {/* Hero: heading + subheading + the TOP CTA. */}
      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          {heading}
        </h1>
        {doc.heroSubheading?.trim() && (
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-text-primary">
            {doc.heroSubheading.trim()}
          </p>
        )}
        {/* CatalogCta self-centers (mx-auto max-w-2xl) — no width wrapper here. */}
        <div className="mt-8">{cta('top')}</div>
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt={doc.heroImage?.alt?.trim() || `${doc.title} catalog`}
            className="mt-8 h-auto w-full rounded-md border border-border"
            loading="eager"
          />
        )}
      </Container>

      {/* Long-form SEO body (portable text + inline sized images). */}
      {hasBody && (
        <Container as="section" className="pb-8">
          <div className="prose max-w-none">
            <PortableText value={doc.body ?? []} components={pagePortableComponents} />
          </div>
        </Container>
      )}

      {/* Middle CTA. */}
      <Container as="section" className="pb-8">
        {cta('middle')}
      </Container>

      {/* A static peek at the catalog's products (scraped set, first 4). */}
      {previewProducts.length > 0 && (
        <Container as="section" className="pb-8">
          <h2 className="text-2xl font-bold text-brand-ink">
            A peek inside the {doc.title} catalog
          </h2>
          <div className="mt-6">
            <ProductGrid products={previewProducts} priorityCount={0} />
          </div>
        </Container>
      )}

      {/* End CTA. */}
      <Container as="section" className="pb-12">
        {cta('end')}
      </Container>

      {/* Related Blogs + Related Videos strips — the SAME resolution +
          renderer as the gated /catalog page (shared component), so both
          routes show one consistent set for the catalog. On the indexed
          landing page this is the SEO surface Patrick asked for. Tag-cached
          reads only (RELATED_BLOGS_TAG / VIDEOS_TAG) — route stays static. */}
      <CatalogRelatedContent doc={doc} />
    </>
  );
}
