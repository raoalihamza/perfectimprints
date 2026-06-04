import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ProductGrid } from '@/components/category/ProductGrid';
import { FAQsAccordion } from '@/components/category/FAQsAccordion';
import { CTABanner } from '@/components/category/CTABanner';
import { Pagination } from '@/components/category/Pagination';
import { EmptyStateCTA } from '@/components/category/EmptyStateCTA';
import {
  getAllGeneratedCategorySlugs,
  getCategoryContent,
  getProductsPageForCategorySlug,
  shouldShowEmptyStateCTA,
  PRODUCTS_PER_PAGE,
} from '@/lib/categories';

interface Props {
  params: Promise<{ slug: string[] }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  ''
);

// Static-first for headline pages (roots + modifiers + compound-facets); facet pages
// serve as on-demand SSG (`dynamicParams = true`) because pre-building all 21,137 of
// them plus pagination variants exceeds Vercel's per-deployment output-file budget
// (Next.js 16 emits ~5 segment artifacts per page → ~175k symlinks blows ENOSPC).
// Functionally identical to SSG for crawlers: first hit generates, then cached forever.
export const dynamicParams = true;
export const revalidate = false;

interface ParsedSlug {
  /** URL-style category slug segments (no /page/N suffix). */
  segments: string[];
  /** Filename slug joined with `__`, matching the JSON filename. */
  fileSlug: string;
  /** Clean URL for page 1, e.g. "/cat/water-bottles". */
  baseUrl: string;
  /** 1-indexed page number. */
  page: number;
  /** True if the URL explicitly included `/page/N` (even when N is 1). */
  hasPageSuffix: boolean;
}

function parseSlug(slug: string[]): ParsedSlug | null {
  if (slug.length === 0) return null;
  let segments = slug;
  let page = 1;
  let hasPageSuffix = false;
  if (slug.length >= 3 && slug[slug.length - 2] === 'page') {
    const n = Number.parseInt(slug[slug.length - 1], 10);
    if (!Number.isInteger(n) || n < 1) return null;
    segments = slug.slice(0, -2);
    page = n;
    hasPageSuffix = true;
  }
  const fileSlug = segments.join('__');
  const baseUrl = `/cat/${segments.join('/')}`;
  return { segments, fileSlug, baseUrl, page, hasPageSuffix };
}

// Categories pre-built at deploy time. Facet pages are excluded here and served via
// on-demand SSG instead (see dynamicParams note above).
const PREBUILD_TYPES = new Set(['root', 'modifier', 'compound-facet']);

export function generateStaticParams() {
  const summaries = getAllGeneratedCategorySlugs();
  const params: { slug: string[] }[] = [];
  for (const s of summaries) {
    if (!PREBUILD_TYPES.has(s.type)) continue;
    const segments = s.urlSlug.split('/');
    // Page 1 lives at the clean URL.
    params.push({ slug: segments });
    // Pages 2..totalPages get explicit /page/N URLs.
    for (let p = 2; p <= s.totalPages; p++) {
      params.push({ slug: [...segments, 'page', String(p)] });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return {};
  const content = getCategoryContent(parsed.fileSlug);
  if (!content) return {};

  const cleanUrl = `${SITE_URL}${parsed.baseUrl}`;

  if (parsed.page === 1) {
    return {
      title: { absolute: content.metaTitle },
      description: content.metaDescription,
      alternates: { canonical: cleanUrl },
    };
  }

  return {
    title: { absolute: content.metaTitle },
    description: content.metaDescription,
    alternates: { canonical: cleanUrl },
    robots: { index: false, follow: true },
  };
}

function categoryTitle(content: ReturnType<typeof getCategoryContent>): string {
  if (!content) return '';
  return content.metaTitle.split('|')[0].trim() || content.h1;
}

function buildBreadcrumbs(
  segments: string[],
  title: string
): { label: string; href?: string }[] {
  const items: { label: string; href?: string }[] = [
    { label: 'Home', href: '/' },
    { label: 'Promotional Products', href: '/cat' },
  ];
  // For single-segment (root) URLs, render the root title and we're done.
  if (segments.length === 1) {
    items.push({ label: title });
    return items;
  }
  // For multi-segment URLs, link the root and show the current page title as the leaf.
  const rootSlug = segments[0];
  const rootContent = getCategoryContent(rootSlug);
  const rootLabel = rootContent ? categoryTitle(rootContent) : rootSlug;
  items.push({ label: rootLabel, href: `/cat/${rootSlug}` });
  items.push({ label: title });
  return items;
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) notFound();

  const content = getCategoryContent(parsed.fileSlug);
  if (!content) notFound();

  const showCTA = shouldShowEmptyStateCTA(content);
  const pageData = getProductsPageForCategorySlug(parsed.fileSlug, parsed.page, PRODUCTS_PER_PAGE);

  // Out-of-range page (e.g. /page/99 on a 5-page category) → 404.
  // CTA pages always have a single page, so any /page/N (N > 1) is out of range.
  if (showCTA && parsed.page > 1) notFound();
  if (!showCTA && parsed.page > pageData.totalPages) notFound();

  const title = categoryTitle(content);
  const buyingGuideHtml = content.buyingGuideHtml?.trim();
  const buyingGuideH2 = content.buyingGuideH2?.trim();
  const isRoot = content.type === 'root';

  const showingStart = pageData.totalProducts === 0 ? 0 : (parsed.page - 1) * PRODUCTS_PER_PAGE + 1;
  const showingEnd = Math.min(parsed.page * PRODUCTS_PER_PAGE, pageData.totalProducts);
  const showingLabel =
    pageData.totalPages > 1
      ? `Showing ${showingStart}-${showingEnd} of ${pageData.totalProducts}`
      : `${pageData.totalProducts} ${pageData.totalProducts === 1 ? 'Product' : 'Products'}`;

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={buildBreadcrumbs(parsed.segments, title)} />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          {content.h1}
        </h1>
        {content.introHtml && (
          <div
            className="prose-lede mt-4 text-lg leading-relaxed text-text-primary [&>p]:mt-4 [&>p:first-child]:mt-0"
            dangerouslySetInnerHTML={{ __html: content.introHtml }}
          />
        )}
      </Container>

      <Container as="section" className="pb-10">
        {showCTA ? (
          <EmptyStateCTA categoryTitle={title} sourceUrl={parsed.baseUrl} />
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-ink">{showingLabel}</h2>
            </div>
            <ProductGrid products={pageData.products} />
            <Pagination
              currentPage={parsed.page}
              totalPages={pageData.totalPages}
              baseUrl={parsed.baseUrl}
            />
          </>
        )}
      </Container>

      {isRoot && (
        <Container as="section">
          <FAQsAccordion faqs={content.faqs} />
        </Container>
      )}

      {isRoot && buyingGuideHtml && (
        <Container as="section" className="py-10">
          {buyingGuideH2 && (
            <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{buyingGuideH2}</h2>
          )}
          <div
            className="category-body mt-4 text-text-primary [&>p]:mt-4 [&>p:first-child]:mt-0 [&>p]:leading-relaxed [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:text-brand-ink"
            dangerouslySetInnerHTML={{ __html: buyingGuideHtml }}
          />
        </Container>
      )}

      <CTABanner categoryTitle={title} />
    </>
  );
}
