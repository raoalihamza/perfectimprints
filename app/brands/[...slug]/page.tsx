import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CTABanner } from '@/components/category/CTABanner';
import { ProductGrid } from '@/components/category/ProductGrid';
import { Pagination } from '@/components/category/Pagination';
import { affiliateUrl } from '@/lib/affiliate-url';
import {
  buildBrandIntroFallback,
  getAllBrandSlugs,
  getAllBrands,
  getBrandBySlug,
  getProductsForBrandSlug,
  type Brand,
} from '@/lib/brands';
import { PRODUCTS_PER_PAGE, paginateProducts } from '@/lib/categories';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { Schema } from '@/components/seo/Schema';
import { productItemListSchema } from '@/lib/seo/product-list-schema';
import { socialMeta } from '@/lib/seo/open-graph';

interface Props {
  params: Promise<{ slug: string[] }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// Pre-build every brand at deploy time (~205 paths). Well within Vercel's
// per-deploy output budget — the static-path concern in §3 / §13 is for the
// 22k category set, not brands.
export const dynamicParams = false;

interface ParsedBrandSlug {
  slug: string;
  baseUrl: string;
  page: number;
  hasPageSuffix: boolean;
}

function parseBrandSlug(segments: string[]): ParsedBrandSlug | null {
  if (segments.length === 0) return null;
  if (segments.length >= 3 && segments[segments.length - 2] === 'page') {
    const n = Number.parseInt(segments[segments.length - 1], 10);
    if (!Number.isInteger(n) || n < 1) return null;
    const slug = segments.slice(0, -2).join('/');
    return { slug, baseUrl: `/brands/${slug}`, page: n, hasPageSuffix: true };
  }
  if (segments.length > 1) return null;
  const slug = segments[0];
  return { slug, baseUrl: `/brands/${slug}`, page: 1, hasPageSuffix: false };
}

export async function generateStaticParams() {
  const slugs = await getAllBrandSlugs();
  const params: { slug: string[] }[] = [];
  for (const slug of slugs) {
    params.push({ slug: [slug] });
    const products = getProductsForBrandSlug(slug);
    const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
    for (let p = 2; p <= totalPages; p++) {
      params.push({ slug: [slug, 'page', String(p)] });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseBrandSlug(slug);
  if (!parsed) return {};
  const brand = await getBrandBySlug(parsed.slug);
  if (!brand) return {};

  const cleanUrl = `${SITE_URL}${parsed.baseUrl}`;
  const title = `Custom ${brand.name} Products | Perfect Imprints`;
  const description =
    brand.productCount > 0
      ? `Shop ${brand.productCount} custom ${brand.name} promotional products. Branded gifts, corporate giveaways, and more — built to ship fast.`
      : `Browse custom ${brand.name} promotional products and corporate gifts at Perfect Imprints.`;

  const social = socialMeta({
    title,
    description,
    url: cleanUrl,
    image: brand.logoUrl ?? null,
    imageAlt: brand.logoAlt || `${brand.name} logo`,
  });

  if (parsed.page === 1) {
    return {
      title: { absolute: title },
      description,
      alternates: { canonical: cleanUrl },
      ...social,
    };
  }
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/brands/${brand.slug}` },
    robots: { index: false, follow: true },
    ...social,
  };
}

function BrandHeader({ brand }: { brand: Brand }) {
  return (
    <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
      {brand.logoUrl ? (
        <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded border border-border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.logoUrl}
            alt={brand.logoAlt || brand.name}
            width={160}
            height={96}
            className="max-h-full w-auto max-w-full object-contain"
          />
        </div>
      ) : null}
      <div>
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          Custom {brand.name} Promotional Products
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {brand.productCount > 0
            ? `${brand.productCount} ${brand.productCount === 1 ? 'product' : 'products'} available`
            : 'Listed on Geiger — products coming soon'}
        </p>
      </div>
    </div>
  );
}

export default async function BrandPage({ params }: Props) {
  const { slug } = await params;
  const parsed = parseBrandSlug(slug);
  if (!parsed) notFound();

  // /brands/<slug>/page/1 → 308 to clean URL, matching the category-page convention.
  if (parsed.hasPageSuffix && parsed.page === 1) {
    redirect(parsed.baseUrl);
  }

  const brand = await getBrandBySlug(parsed.slug);
  if (!brand) notFound();

  const allProducts = getProductsForBrandSlug(brand.slug);
  const pageData = paginateProducts(allProducts, parsed.page, PRODUCTS_PER_PAGE);

  // Out-of-range pages 404.
  if (parsed.page > pageData.totalPages && allProducts.length > 0) notFound();

  const intro = brand.description?.trim() || buildBrandIntroFallback(brand.name);

  // Full-product ItemList (SNIP-100): each page describes ONLY the products it
  // renders, positions restarting at 1 per page. Products come from the same
  // in-memory objects the grid renders, so this stays static (no new read).
  // Omitted entirely for brands with no products rather than an empty list.
  // BreadcrumbList stays with the <Breadcrumbs> component, untouched.
  const itemList = pageData.products.length > 0 ? productItemListSchema(pageData.products) : null;

  return (
    <>
      {itemList ? <Schema data={itemList} /> : null}
      <CustomSchemaJsonLd path={parsed.baseUrl} />
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Brands', href: '/brands' },
            { label: brand.name },
          ]}
        />
      </Container>

      <Container as="section" className="pb-8">
        <BrandHeader brand={brand} />
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-text-primary">{intro}</p>
      </Container>

      <Container as="section" className="pb-10">
        {allProducts.length === 0 ? (
          <div className="rounded border border-border bg-bg-soft p-10 text-center">
            <h2 className="text-xl font-semibold text-brand-ink">
              No {brand.name} products in our catalog yet
            </h2>
            <p className="mx-auto mt-2 max-w-prose text-text-muted">
              Browse the full Geiger catalog or contact us — we can source any {brand.name} item.
            </p>
            <a
              href={affiliateUrl(brand.geigerUrl)}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="mt-6 inline-flex h-11 items-center justify-center rounded bg-brand-green px-5 font-medium text-white hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
            >
              Browse {brand.name} on Geiger
            </a>
          </div>
        ) : (
          <>
            <ProductGrid products={pageData.products} />
            <div className="mt-10">
              <Pagination
                currentPage={parsed.page}
                totalPages={pageData.totalPages}
                baseUrl={parsed.baseUrl}
              />
            </div>
          </>
        )}
      </Container>

      <CTABanner categoryTitle={`${brand.name} Products`} />
    </>
  );
}
