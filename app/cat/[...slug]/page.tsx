import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { FAQsAccordion } from '@/components/category/FAQsAccordion';
import { CTABanner } from '@/components/category/CTABanner';
import { EmptyStateCTA } from '@/components/category/EmptyStateCTA';
import { CategoryShell } from '@/components/category/CategoryShell';
import { RelatedBlogsSection } from '@/components/category/RelatedBlogsSection';
import {
  getAllGeneratedCategorySlugs,
  getCategoryContent,
  paginateProducts,
  resolveProductsBySku,
  shouldShowEmptyStateCTA,
  PRODUCTS_PER_PAGE,
} from '@/lib/categories';
import { Schema } from '@/components/seo/Schema';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import {
  collectionPageSchema,
  faqPageSchema,
  itemListSchema,
} from '@/lib/seo/schema-generators';
import { socialMeta, largeSocialImage } from '@/lib/seo/open-graph';
import { affiliateUrl } from '@/lib/affiliate-url';
import { buildImageUrl } from '@/lib/sanity/client';
import {
  getCategoryOverride,
  mergeCategoryProducts,
} from '@/lib/sanity/queries/category-overrides';
import {
  getPlacedProductPagesForCategory,
  getPlacementSkusForCategory,
} from '@/lib/sanity/queries/product-placements';
import {
  getCustomCategoryBySlug,
  type CustomCategoryDoc,
} from '@/lib/sanity/queries/custom-categories';
import {
  getCategoryControlSets,
  getOwnedSlugsFromFile,
} from '@/lib/sanity/queries/owned-categories';
import { customProductToGeigerProduct } from '@/lib/sanity/queries/custom-products';
import { CustomCategoryView } from '@/components/category/CustomCategoryView';
import { buildAddedAttrOverlay, buildSidebarData, enrichSidebarWithProductStats } from '@/lib/filters';

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const seen = new Set<string>();
  for (const s of summaries) {
    if (!PREBUILD_TYPES.has(s.type)) continue;
    const segments = s.urlSlug.split('/');
    // Page 1 lives at the clean URL.
    params.push({ slug: segments });
    seen.add(segments.join('/'));
    // Pages 2..totalPages get explicit /page/N URLs.
    for (let p = 2; p <= s.totalPages; p++) {
      params.push({ slug: [...segments, 'page', String(p)] });
    }
  }
  // Also prebuild any slug Sanity currently OWNS (pushed/custom pages) from the
  // build artifact, so owned pages render statically too. Newly-pushed slugs go
  // live via the webhook revalidatePath before the next build picks them up here.
  for (const slug of getOwnedSlugsFromFile()) {
    const segments = slug.split('/').filter(Boolean);
    if (segments.length === 0) continue;
    const key = segments.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    params.push({ slug: segments });
  }
  return params;
}

const BRAND_SUFFIX = ' | Perfect Imprints';

// Category meta <title> uses the page H1 (the full descriptive phrase) rather
// than the shorter templated metaTitle (Patrick: category meta titles are too
// short). The brand suffix is appended only when the result still fits
// comfortably (~60 chars); a long H1 stands alone. Canonical/H1 are untouched.
function categoryMetaTitle(h1: string): string {
  const withSuffix = `${h1}${BRAND_SUFFIX}`;
  return withSuffix.length <= 60 ? withSuffix : h1;
}

// First product image of the category (from the baked SKU list) for the social
// image (og:image + twitter:image). Reads products.json off disk (no Sanity /
// network call) so generateMetadata stays static-safe. The URL is upsized to a
// ~1200px variant via largeSocialImage() so X renders a LARGE card (the 275px
// grid thumbnail is too small/square) — the on-page grid still uses 275px.
// Returns null for CTA-only categories → logo fallback.
function categoryOgImage(skus: string[]): { url: string; alt: string } | null {
  if (skus.length === 0) return null;
  for (const p of resolveProductsBySku(skus.slice(0, 12))) {
    if (p.imageUrl) {
      const url = largeSocialImage(p.imageUrl);
      if (url) return { url, alt: p.name };
    }
  }
  return null;
}

function customCategoryMetadata(custom: CustomCategoryDoc, cleanUrl: string): Metadata {
  const description = custom.seo?.metaDescription || custom.heroCopy || undefined;
  const heroImage = buildImageUrl(custom.heroImage, (b) => b.width(1200)) ?? null;
  return {
    title: { absolute: custom.seo?.metaTitle || custom.title },
    description,
    alternates: { canonical: cleanUrl },
    ...socialMeta({
      title: custom.title,
      description,
      url: cleanUrl,
      image: heroImage,
      imageAlt: custom.heroImage?.alt || custom.title,
    }),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return {};

  const categorySlug = parsed.segments.join('/');
  const cleanUrl = `${SITE_URL}${parsed.baseUrl}`;

  // Owned customCategory wins (push-to-Sanity precedence), page 1 only.
  if (parsed.page === 1) {
    const { owned } = await getCategoryControlSets();
    if (owned.has(categorySlug)) {
      const custom = await getCustomCategoryBySlug(categorySlug);
      if (custom) return customCategoryMetadata(custom, cleanUrl);
    }
  }

  const content = getCategoryContent(parsed.fileSlug);
  if (!content) {
    // customCategory not yet in the cached owned set (just published). Page 1 only.
    if (parsed.page === 1) {
      const custom = await getCustomCategoryBySlug(categorySlug);
      if (custom) return customCategoryMetadata(custom, cleanUrl);
    }
    return {};
  }

  const metaTitle = categoryMetaTitle(content.h1);
  const og = categoryOgImage(content.productSkus || []);
  const social = socialMeta({
    title: content.h1,
    description: content.metaDescription,
    url: cleanUrl,
    image: og?.url ?? null,
    imageAlt: og?.alt || content.heroAltText || content.h1,
  });

  if (parsed.page === 1) {
    return {
      title: { absolute: metaTitle },
      description: content.metaDescription,
      alternates: { canonical: cleanUrl },
      ...social,
    };
  }

  return {
    title: { absolute: metaTitle },
    description: content.metaDescription,
    alternates: { canonical: cleanUrl },
    robots: { index: false, follow: true },
    ...social,
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
    { label: 'Promotional Products', href: '/promotional-products' },
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

/**
 * Resolve a customCategory's product grid (its own SKU list + attached custom
 * products + productPlacement/categoryOverride edits, removal-wins de-dup) and
 * render the Sanity-owned page. Shared by the owned-slug path and the no-JSON
 * fallback.
 */
async function renderCustomCategory(
  custom: CustomCategoryDoc,
  baseUrl: string,
  categorySlug: string,
) {
  const [override, placement, placedPages] = await Promise.all([
    getCategoryOverride(categorySlug),
    getPlacementSkusForCategory(categorySlug),
    getPlacedProductPagesForCategory(categorySlug),
  ]);
  const products = mergeCategoryProducts({
    bakedSkus: custom.productSkus ?? [],
    override,
    placementAddSkus: placement.addSkus,
    placementRemoveSkus: placement.removeSkus,
    extraCustomProducts: custom.customProducts.map(customProductToGeigerProduct),
    placedProductPages: placedPages.products,
  });
  return (
    <>
      <CustomSchemaJsonLd path={baseUrl} />
      <CustomCategoryView doc={custom} baseUrl={baseUrl} products={products} />
    </>
  );
}

// NOTE: this page intentionally does NOT read `searchParams`. Reading it is a
// Next.js Dynamic API that forces the whole route off static prerendering.
// Faceted filtering runs server-side via /api/category-products, called by the
// client CategoryShell, so the 22,180 baked pages stay static (see CLAUDE.md §13).
export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) notFound();

  const categorySlug = parsed.segments.join('/');

  // One shared cached read (no per-page Sanity lookup): which slugs Sanity OWNS
  // (published customCategory) and which are "edited" (owned + touched by a
  // categoryOverride / productPlacement). Untouched pages below do zero Sanity
  // calls — they render straight from the baked JSON.
  const { owned, edited } = await getCategoryControlSets();

  // Push-to-Sanity precedence: an owned slug is rendered from Sanity (wins over
  // any baked JSON). Custom pages have no pagination, so only page 1 is owned.
  if (parsed.page === 1 && owned.has(categorySlug)) {
    const custom = await getCustomCategoryBySlug(categorySlug);
    if (custom) return renderCustomCategory(custom, parsed.baseUrl, categorySlug);
  }

  const content = getCategoryContent(parsed.fileSlug);

  // No baked JSON page → it may be a Sanity customCategory not yet reflected in
  // the cached owned set (e.g. just published). Safety fallback, page 1 only.
  if (!content) {
    if (parsed.page === 1) {
      const custom = await getCustomCategoryBySlug(categorySlug);
      if (custom) return renderCustomCategory(custom, parsed.baseUrl, categorySlug);
    }
    notFound();
  }

  // Only "edited" slugs pay the per-slug override + placement Sanity fetches
  // (incl. product-side placed productPages, P2-CP-004 batch 4 — their slugs
  // are in the edited set via the control query's pagePlacements).
  // Every untouched page skips them entirely and resolves from baked SKUs.
  const isEdited = edited.has(categorySlug);
  const [override, placement, placedPages] = isEdited
    ? await Promise.all([
        getCategoryOverride(categorySlug),
        getPlacementSkusForCategory(categorySlug),
        getPlacedProductPagesForCategory(categorySlug),
      ])
    : [
        null,
        { addSkus: [], removeSkus: [] },
        { products: [], overlayDocs: [] },
      ];

  // Unified resolver: baked SKUs + override adds + placement adds − override hides
  // − placement removes (removal wins). When override.replaceProducts is on the
  // baked set is ignored, so the grid is ONLY Patrick's added items. The page
  // renders the UNFILTERED, path-paginated view (static + indexable); filtering
  // happens client-side.
  const rootSlug = parsed.segments[0];
  const allProducts = mergeCategoryProducts({
    bakedSkus: content.productSkus || [],
    override,
    placementAddSkus: placement.addSkus,
    placementRemoveSkus: placement.removeSkus,
    placedProductPages: placedPages.products,
  });
  const effectiveSkus = allProducts.map((p) => p.sku);

  // Per-category Sanity override (forceCTA / replaceProducts / forceProducts /
  // hidden+added SKUs). Precedence (highest first):
  //   forceCTA → replaceProducts (grid when non-empty, else CTA) → forceProducts
  //   → original shouldShowEmptyStateCTA (empty-skus, full-capped-60, JSON forceCTA).
  // replaceProducts lets an empty/off-topic category show ONLY Patrick's products,
  // overriding the automatic CTA rule (incl. full-capped-60). The earlier
  // exact-match-only Geiger-menu gate was reverted as too aggressive.
  const showCTA = override?.forceCTA
    ? true
    : override?.replaceProducts
      ? allProducts.length === 0
      : override?.forceProducts
        ? false
        : shouldShowEmptyStateCTA(content);
  const pageData = paginateProducts(allProducts, parsed.page, PRODUCTS_PER_PAGE);

  // Out-of-range page (e.g. /page/99 on a 5-page category) → 404.
  // CTA pages always have a single page, so any /page/N (N > 1) is out of range.
  if (showCTA && parsed.page > 1) notFound();
  if (!showCTA && parsed.page > pageData.totalPages && allProducts.length > 0) notFound();

  // Replace-products (curated) mode: the grid shows ONLY Patrick's added
  // products, which aren't in this category's scraped facet memberships. Build
  // an attribute overlay (real Geiger tags for pinned SKUs; colors/material/brand
  // for custom products) so those products participate in the Color/Material/
  // Brand filters and the refine-by toggles, and so filter clicks stay on the
  // root URL instead of jumping to a baked child facet page. Reuses the already
  // fetched `override` (no extra Sanity read — replaceProducts slugs are always
  // "edited"), and reads only facet-memberships.json, so /cat stays static.
  const curated = override?.replaceProducts === true;
  const addedAttrOverlay = curated
    ? buildAddedAttrOverlay(allProducts, [
        ...(override?.addedProducts ?? []),
        // Product-side placed productPages (batch 4) participate identically.
        ...placedPages.overlayDocs,
      ])
    : undefined;

  // Sidebar data is derived from the unfiltered category SKU set so filter counts
  // reflect "products available if I add this filter," not "products after current filters."
  const sidebar = !showCTA
    ? enrichSidebarWithProductStats(
        buildSidebarData(rootSlug, effectiveSkus, addedAttrOverlay, curated),
        allProducts,
      )
    : null;

  const title = categoryTitle(content);
  const buyingGuideHtml = content.buyingGuideHtml?.trim();
  const buyingGuideH2 = content.buyingGuideH2?.trim();
  const isRoot = content.type === 'root';

  // Page-type JSON-LD: CollectionPage (always) + ItemList (only when products
  // render — omitted for CTA-only categories) + FAQPage (root pages with FAQs).
  // BreadcrumbList is emitted separately by the <Breadcrumbs> component.
  // Schema images use the ~1200px social variant (largeSocialImage) so the
  // structured-data image signal is large (M-SEO5); the rendered grid keeps
  // requesting the 275px thumbnails.
  const primaryImage = !showCTA
    ? largeSocialImage(pageData.products.find((p) => p.imageUrl)?.imageUrl)
    : null;
  const schemaGraph: Record<string, unknown>[] = [
    collectionPageSchema({
      name: content.h1,
      url: `${SITE_URL}${parsed.baseUrl}`,
      description: content.metaDescription,
      image: primaryImage ?? undefined,
    }),
  ];
  if (!showCTA && pageData.products.length > 0) {
    schemaGraph.push(
      itemListSchema(
        pageData.products.map((p) => ({
          name: p.name,
          url: affiliateUrl(p.geiger_url),
          image: largeSocialImage(p.imageUrl) ?? p.imageUrl,
        })),
      ),
    );
  }
  if (isRoot && content.faqs.length > 0) {
    schemaGraph.push(faqPageSchema(content.faqs.map((f) => ({ question: f.q, answer: f.a }))));
  }

  return (
    <>
      <Schema data={schemaGraph} />
      <CustomSchemaJsonLd path={parsed.baseUrl} />
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
        {showCTA || !sidebar ? (
          <EmptyStateCTA categoryTitle={title} sourceUrl={parsed.baseUrl} />
        ) : (
          <CategoryShell
            sidebar={sidebar}
            products={pageData.products}
            totalProducts={pageData.totalProducts}
            totalPages={pageData.totalPages}
            currentPage={parsed.page}
            baseUrl={parsed.baseUrl}
            slug={categorySlug}
          />
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

      {isRoot && (
        <Container as="section">
          <RelatedBlogsSection categorySlug={rootSlug} categoryTitle={title} />
        </Container>
      )}

      <CTABanner categoryTitle={title} />
    </>
  );
}
