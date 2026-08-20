import { getHiddenProductContext } from '@/lib/products/site-wide-hidden';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CatalogProductsClient } from '@/components/catalogs/CatalogProductsClient';
import { CatalogRelatedContent } from '@/components/catalogs/CatalogRelatedContent';
import { getAllCatalogPageSlugs, getCatalogPageBySlug } from '@/lib/sanity/queries/catalog-pages';
import { getAugmentedCatalogData } from '@/lib/catalogs';

interface Props {
  params: Promise<{ slug: string }>;
}

// The GATED catalog page (P2-CAT-001): reached only via the link emailed after
// the lead form is submitted (prompt 3). "Hidden from Google" is the guarantee
// — noindex robots meta + excluded from the sitemap + never in the menu — NOT
// auth: anyone who has the URL can open it.
//
// Same prebuild-all + on-demand pattern as the public landing page. The whole
// filter/paginate experience is client-side over the baked product JSON (the
// /deals model), so the page shell + first render + strips are static server
// HTML with no searchParams and no uncached reads.
export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getAllCatalogPageSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getCatalogPageBySlug(slug);
  if (!doc) return {};
  return {
    title: { absolute: `${doc.title} Catalog | Perfect Imprints` },
    description: `Shop the products inside the ${doc.title} catalog.`,
    // Deliberately hidden from search engines; the emailed link is the only
    // intended entry point. Also excluded from app/sitemap.ts.
    robots: { index: false, follow: false },
  };
}

export default async function GatedCatalogPage({ params }: Props) {
  const { slug } = await params;
  const doc = await getCatalogPageBySlug(slug);
  if (!doc) notFound();

  // Synced scrape (catalogs.json, by catalogKey) + Patrick's adds − hides,
  // facets re-derived — the /deals aggregator lane. Manual-only catalogs
  // (Retail Collective, Trend Talk) have an empty synced base; their adds are
  // the whole grid.
  const data = getAugmentedCatalogData({
    catalogKey: doc.catalogKey,
    addedSkus: doc.addedSkus,
    addedProducts: doc.addedProducts,
    // HIDE-100: the catalog's own hide list plus the site-wide one.
    hiddenSkus: [...(doc.hiddenSkus ?? []), ...(await getHiddenProductContext()).hiddenSkus],
  });

  // Sanity override wins; else the scraped viewer link for this catalog key.
  const browseUrl = doc.browseCatalogUrl?.trim() || data.browseUrl;

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: doc.title, href: `/shop-by-theme/${doc.slug}` },
            { label: 'Catalog' },
          ]}
        />
      </Container>

      {/* Top: title + the BROWSE INTERACTIVE CATALOG button (opens the digital catalog). */}
      <Container as="section" className="pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl">
            {doc.title} Catalog
          </h1>
          {browseUrl && (
            <a
              href={browseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold uppercase tracking-wide text-white hover:opacity-90"
            >
              Browse Interactive Catalog
            </a>
          )}
        </div>
        <p className="mt-3 max-w-3xl text-text-primary">
          Flip through the digital catalog above, or shop every product in it below — use the
          filters to narrow by category, color, price, and more.
        </p>
      </Container>

      {/* Products: the /deals-style client-side filter + paginate grid. */}
      <Container as="section" className="pb-10">
        {data.products.length > 0 ? (
          <CatalogProductsClient products={data.products} facets={data.facets} />
        ) : (
          <div className="rounded border border-border bg-bg-soft p-10 text-center">
            <h2 className="text-lg font-semibold text-brand-ink">
              Products are on their way
            </h2>
            <p className="mx-auto mt-2 max-w-prose text-text-muted">
              This catalog&apos;s products haven&apos;t been added yet — browse the digital catalog
              above in the meantime.
            </p>
          </div>
        )}
      </Container>

      {/* Bottom: Related Blogs + Related Videos strips (shared with the
          public landing page — components/catalogs/CatalogRelatedContent). */}
      <CatalogRelatedContent doc={doc} />
    </>
  );
}
