import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ProductGrid } from '@/components/category/ProductGrid';
import { CTABanner } from '@/components/category/CTABanner';
import { PromoFilterControls } from '@/components/promotional-products/PromoFilterControls';
import { PromoSortSelect } from '@/components/promotional-products/PromoSortSelect';
import { PromoPagination } from '@/components/promotional-products/PromoPagination';
import { getPromoClientFacets, getPromoResult } from '@/lib/promotional-products';
import { PROMO_SORTS, type PromoSort } from '@/lib/promotional-products-sorts';
import type { DealsFilterState } from '@/lib/deals-filter';
import { PRODUCTS_PER_PAGE } from '@/lib/product-types';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

type SP = Record<string, string | string[] | undefined>;
interface Props {
  searchParams: Promise<SP>;
}

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  // Only the clean, unfiltered page is indexable; filter/sort/page variants are
  // near-duplicates that canonical back to it (mirrors the pagination rule).
  const hasParams = Object.keys(sp).length > 0;
  return {
    title: {
      absolute: 'Promotional Products — Shop All Custom Branded Products | Perfect Imprints',
    },
    description:
      'Browse every custom promotional product, branded giveaway, and personalized corporate gift in our catalog. Filter thousands of bulk wholesale promo items by category, price, brand, and minimum quantity.',
    alternates: { canonical: `${SITE_URL}/promotional-products` },
    ...(hasParams ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function PromotionalProductsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const clientFacets = getPromoClientFacets();

  // Parse the active filter selections out of the query string.
  const state: DealsFilterState = {};
  for (const f of clientFacets) {
    const raw = one(sp[f.field]);
    if (raw) {
      const ids = raw.split(',').filter(Boolean);
      if (ids.length) state[f.field] = ids;
    }
  }

  const sort: PromoSort =
    PROMO_SORTS.find((s) => s.value === one(sp.sort))?.value ?? 'featured';
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);

  const result = getPromoResult(state, sort, page);

  // Base query (filters + sort, no page) for the pagination links.
  const baseParams = new URLSearchParams();
  if (sort !== 'featured') baseParams.set('sort', sort);
  for (const [field, ids] of Object.entries(state)) baseParams.set(field, ids.join(','));
  const baseQuery = baseParams.toString();

  const start = (result.page - 1) * PRODUCTS_PER_PAGE;
  const showingStart = result.totalMatched === 0 ? 0 : start + 1;
  const showingEnd = Math.min(start + PRODUCTS_PER_PAGE, result.totalMatched);
  const countLabel =
    result.totalPages > 1
      ? `Showing ${showingStart}-${showingEnd} of ${result.totalMatched.toLocaleString()} products`
      : result.isFiltered
        ? `Showing ${result.totalMatched.toLocaleString()} of ${result.totalAll.toLocaleString()} products`
        : `${result.totalAll.toLocaleString()} products`;

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Promotional Products' }]} />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          Custom Promotional Products
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-text-primary">
          Browse our full catalog of custom promotional products, branded giveaways, and
          personalized corporate gifts. Filter thousands of bulk, wholesale, and logo-printed items
          by category, price, brand, and minimum quantity to find the perfect fit for your next
          campaign.
        </p>
      </Container>

      <Container as="section" className="pb-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
          <PromoFilterControls facets={clientFacets} />

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-brand-ink" aria-live="polite">
                {countLabel}
              </h2>
              <PromoSortSelect />
            </div>

            {result.products.length > 0 ? (
              <>
                <ProductGrid products={result.products} />
                <PromoPagination
                  page={result.page}
                  totalPages={result.totalPages}
                  baseQuery={baseQuery}
                />
              </>
            ) : (
              <div className="rounded border border-border bg-bg-soft p-10 text-center">
                <h3 className="text-lg font-semibold text-brand-ink">
                  No products match your filters
                </h3>
                <p className="mx-auto mt-2 max-w-prose text-text-muted">
                  Try clearing a filter to widen your results.
                </p>
                <Link
                  href="/promotional-products"
                  className="mt-6 inline-flex h-11 items-center justify-center rounded border border-border bg-white px-5 font-medium text-brand-ink hover:border-brand-ink"
                >
                  Clear all filters
                </Link>
              </div>
            )}
          </div>
        </div>
      </Container>

      <CTABanner categoryTitle="Promotional Products" />
    </>
  );
}
