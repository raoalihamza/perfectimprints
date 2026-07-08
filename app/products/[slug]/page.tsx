import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PortableText } from '@portabletext/react';

import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CTABanner } from '@/components/category/CTABanner';
import { ProductGrid } from '@/components/category/ProductGrid';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import {
  ProductPageGallery,
  type GalleryVariant,
} from '@/components/products/ProductPageGallery';
import { GetQuoteButton } from '@/components/products/GetQuoteButton';
import { pagePortableComponents } from '@/components/page-sections/portable-text';
import { buildImageUrl } from '@/lib/sanity/client';
import {
  getAllProductPageSlugs,
  getProductPageBySlug,
  productPageMinQty,
  productPagePriceRange,
  productPageToGeigerProduct,
  productPageValidTiers,
  type ProductPageDoc,
} from '@/lib/sanity/queries/product-pages';
import {
  customProductToGeigerProduct,
  type CustomProductDoc,
} from '@/lib/sanity/queries/custom-products';
import { matchRelatedProducts } from '@/lib/ai/related-products';
import { resolveProductsBySku } from '@/lib/categories';
import { portableTextToPlain } from '@/lib/portable-text/to-plain';
import { socialMeta } from '@/lib/seo/open-graph';
import type { GeigerProduct } from '@/lib/product-types';

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// Prebuild every published productPage (the set is small, Patrick-authored) —
// but keep dynamicParams TRUE so a product published in Studio AFTER the last
// deploy renders on-demand (SSG'd on first hit, cached until the next deploy)
// instead of 404ing until a rebuild. Same pattern as /services/[slug]; unlike
// brands, this slug set is runtime-created in Sanity, not committed JSON, so
// `dynamicParams = false` would break "Publish → live in seconds".
export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getAllProductPageSlugs();
  return slugs.map((slug) => ({ slug }));
}

/** Word-boundary clamp for meta descriptions derived from the rich description. */
function clampAtWord(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd()}…`;
}

function productOgImage(doc: ProductPageDoc): string | null {
  if (doc.seo?.ogImage) {
    const url = buildImageUrl(doc.seo.ogImage, (b) => b.width(1200).fit('max'));
    if (url) return url;
  }
  // First resolvable image at social size (~1200px) — same variant-then-default
  // scan as productPageFirstImage, but at og:image resolution.
  for (const variant of doc.colorVariants ?? []) {
    for (const img of variant.images ?? []) {
      const url = buildImageUrl(img, (b) => b.width(1200).fit('max'));
      if (url) return url;
    }
  }
  for (const img of doc.defaultImages ?? []) {
    const url = buildImageUrl(img, (b) => b.width(1200).fit('max'));
    if (url) return url;
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getProductPageBySlug(slug);
  if (!doc) return {};

  const canonical = `${SITE_URL}/products/${doc.slug}`;
  const title = doc.seo?.metaTitle?.trim() || `${doc.title} | Perfect Imprints`;
  const plain = portableTextToPlain(doc.description);
  const description =
    doc.seo?.metaDescription?.trim() ||
    (plain ? clampAtWord(plain, 155) : `Request a quote for ${doc.title} from Perfect Imprints.`);
  const image = productOgImage(doc);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...socialMeta({ title, description, url: canonical, image, imageAlt: doc.title }),
  };
}

/** Server-side resolution of the gallery: Sanity image objects → plain URLs. */
function buildGalleryVariants(doc: ProductPageDoc): GalleryVariant[] {
  const toImages = (
    images: ProductPageDoc['defaultImages'],
    colorName: string,
  ): GalleryVariant['images'] => {
    const out: GalleryVariant['images'] = [];
    for (const img of images ?? []) {
      const url = buildImageUrl(img, (b) => b.width(900).fit('max'));
      if (!url) continue;
      const zoomUrl = buildImageUrl(img, (b) => b.width(1600).fit('max')) || url;
      out.push({
        url,
        zoomUrl,
        alt: img.alt?.trim() || `${doc.title}${colorName ? ` — ${colorName}` : ''}`,
      });
    }
    return out;
  };

  const variants: GalleryVariant[] = [];
  for (const v of doc.colorVariants ?? []) {
    const colorName = v.colorName?.trim() || '';
    const images = toImages(v.images, colorName);
    if (images.length === 0) continue;
    variants.push({ colorName, swatchHex: v.swatchHex?.trim() || undefined, images });
  }
  if (variants.length === 0) {
    const images = toImages(doc.defaultImages, '');
    if (images.length > 0) variants.push({ colorName: '', images });
  }
  return variants;
}

// Pricing tiers come from productPageValidTiers() — the same list that drives
// the card price range and the JSON-LD offers, so table and price can't diverge.

/**
 * Related carousel: manual entries first (editor order), then automatic
 * matches from the related category/keywords. productPage results carry
 * `detailUrl` (internal link); Geiger/customProduct results keep affiliate.
 *
 * `includeCustom` is OFF for the automatic top-up: `getAllCustomProducts()` is
 * an untagged no-store read that would flip this route dynamic (§13). Custom
 * products still appear via the manual reference entries, which ride the
 * page's own tagged GROQ read.
 */
async function resolveRelatedProducts(doc: ProductPageDoc): Promise<GeigerProduct[]> {
  const LIMIT = 8;
  const selfSku = `custom-${doc._id}`;
  const picked: GeigerProduct[] = [];
  const seen = new Set<string>([selfSku]);
  const push = (p: GeigerProduct) => {
    if (picked.length >= LIMIT || seen.has(p.sku)) return;
    seen.add(p.sku);
    picked.push(p);
  };

  const entries = doc.relatedProducts ?? [];
  const manualSkus = entries
    .map((e) => (e._type === 'blogProduct' ? e.sku?.trim() : undefined))
    .filter((s): s is string => Boolean(s));
  const skuMap = new Map(resolveProductsBySku(manualSkus).map((p) => [p.sku, p]));

  for (const entry of entries) {
    if (picked.length >= LIMIT) break;
    if (entry._type === 'blogProduct') {
      const sku = entry.sku?.trim();
      const resolved = sku ? skuMap.get(sku) : undefined;
      if (resolved) {
        push(resolved);
        continue;
      }
      // Manual fallback entry (title/image/url). Every card in this carousel
      // is a clickable ProductCard, and a target-less product would fall
      // through to `affiliateUrl(null)` = the bare Geiger homepage (review
      // finding) — so an entry whose SKU didn't resolve AND that has no URL
      // is skipped entirely rather than rendered as a misleading link.
      const rawUrl = entry.url?.trim() || null;
      if (!rawUrl) continue;
      const isInternal = rawUrl.startsWith('/');
      const imageUrl = entry.image
        ? buildImageUrl(entry.image, (b) => b.width(400).fit('max'))
        : null;
      push({
        sku: `custom-manual-${entry._key ?? entry.title ?? String(picked.length)}`,
        name: entry.title || sku || 'Product',
        brand: null,
        low_price: null,
        high_price: null,
        msrp: null,
        min_qty: null,
        imageUrl,
        description: null,
        category_paths: [],
        badges: [],
        is_new_item: false,
        is_on_sale: false,
        product_type_unigram: null,
        geiger_url: isInternal ? null : rawUrl,
        ...(isInternal && rawUrl ? { detailUrl: rawUrl } : {}),
      });
      continue;
    }
    if (entry._type === 'customProduct') {
      push(
        customProductToGeigerProduct({
          ...entry,
          title: entry.title ?? 'Product',
          externalUrl: entry.externalUrl ?? '',
        } as CustomProductDoc),
      );
      continue;
    }
    if (entry._type === 'productPage') {
      if (entry._id === doc._id || !entry.slug) continue;
      push(productPageToGeigerProduct(entry));
    }
  }

  if (picked.length < LIMIT) {
    const keywords = doc.relatedKeywords?.length ? doc.relatedKeywords : [doc.title];
    const auto = await matchRelatedProducts({
      categorySlug: doc.relatedCategorySlug?.trim() || undefined,
      keywords,
      limit: LIMIT - picked.length,
      includeCustom: false,
      includeProductPages: true,
      exclude: new Set(seen),
    });
    for (const p of auto) push(p);
  }

  return picked;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatSaleExpires(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const doc = await getProductPageBySlug(slug);
  if (!doc) notFound();

  const canonical = `${SITE_URL}/products/${doc.slug}`;
  const galleryVariants = buildGalleryVariants(doc);
  const tiers = productPageValidTiers(doc);
  const { low, high } = productPagePriceRange(doc);
  const minQty = productPageMinQty(doc);
  const related = await resolveRelatedProducts(doc);
  const plainDescription = portableTextToPlain(doc.description);

  // Product JSON-LD — honest, quote-based commerce: name/image/brand/description
  // plus an AggregateOffer derived from the real pricing tiers. No fabricated
  // availability, ratings, or reviews.
  const schemaImages = galleryVariants.flatMap((v) => v.images.map((i) => i.url)).slice(0, 10);
  const productSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: doc.title,
    url: canonical,
    ...(schemaImages.length > 0 ? { image: schemaImages } : {}),
    ...(plainDescription ? { description: plainDescription } : {}),
    ...(doc.brand ? { brand: { '@type': 'Brand', name: doc.brand } } : {}),
    ...(low != null
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'USD',
            lowPrice: low,
            highPrice: high ?? low,
            offerCount: tiers.length || 1,
            url: canonical,
          },
        }
      : {}),
  };

  const hasBody = Array.isArray(doc.description) && doc.description.length > 0;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productSchema).replace(/</g, '\\u003c'),
        }}
      />
      <CustomSchemaJsonLd path={`/products/${doc.slug}`} />

      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Promotional Products', href: '/promotional-products' },
            { label: doc.title },
          ]}
        />
      </Container>

      <Container as="section" className="pb-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Gallery — the first color's images are in the prerendered HTML. */}
          <div>
            <ProductPageGallery variants={galleryVariants} productName={doc.title} />
          </div>

          {/* Summary column */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              {doc.onSale && (
                <span className="rounded bg-brand-red px-2.5 py-1 text-xs font-bold tracking-wide text-white">
                  SALE!{doc.salePercentOff ? ` ${doc.salePercentOff}% OFF` : ''}
                </span>
              )}
              {doc.brand && <span className="text-sm font-medium text-text-muted">{doc.brand}</span>}
            </div>

            <h1 className="mt-2 text-3xl font-bold leading-tight text-brand-ink md:text-4xl">
              {doc.title}
            </h1>

            {low != null && (
              <p className="mt-3 text-2xl font-semibold text-brand-ink">
                {high != null && high !== low
                  ? `${formatPrice(low)} – ${formatPrice(high)}`
                  : formatPrice(low)}
                <span className="ml-2 text-sm font-normal text-text-muted">each</span>
              </p>
            )}

            {doc.onSale && doc.saleExpires && (
              <p className="mt-1 text-sm font-medium text-brand-red">
                Sale pricing expires {formatSaleExpires(doc.saleExpires)}
              </p>
            )}

            {/* Tiered pricing table */}
            {tiers.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[280px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border border-border bg-bg-soft px-3 py-2 text-left font-semibold text-brand-ink">
                        QTY
                      </th>
                      {tiers.map((t, idx) => (
                        <th
                          key={`qty-${idx}`}
                          className="border border-border bg-bg-soft px-3 py-2 text-center font-semibold text-brand-ink"
                        >
                          {t.minQty.toLocaleString('en-US')}+
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-border px-3 py-2 font-semibold text-brand-ink">
                        PRICE
                      </td>
                      {tiers.map((t, idx) => (
                        <td
                          key={`price-${idx}`}
                          className="border border-border px-3 py-2 text-center text-text-primary"
                        >
                          {formatPrice(t.price)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <dl className="mt-5 space-y-1.5 text-sm text-text-primary">
              {minQty != null && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-brand-ink">Minimum quantity:</dt>
                  <dd>{minQty.toLocaleString('en-US')}</dd>
                </div>
              )}
              {typeof doc.productionTime === 'number' && doc.productionTime > 0 && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-brand-ink">Production time:</dt>
                  <dd>
                    {doc.productionTime} {doc.productionTime === 1 ? 'day' : 'days'}
                  </dd>
                </div>
              )}
              {(doc.decorationMethods ?? []).length > 0 && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-brand-ink">Decoration:</dt>
                  <dd>{(doc.decorationMethods ?? []).join(', ')}</dd>
                </div>
              )}
            </dl>

            {/* Sizes are informational only — no price/image effect. */}
            {(doc.sizes ?? []).length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-medium text-brand-ink">Available sizes</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(doc.sizes ?? []).map((size) => (
                    <span
                      key={size}
                      className="rounded border border-border bg-bg-soft px-3 py-1 text-sm text-text-primary"
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8">
              <GetQuoteButton
                productTitle={doc.title}
                productSlug={doc.slug}
                sourceUrl={`/products/${doc.slug}`}
              />
              <p className="mt-2 text-xs text-text-muted">
                No online checkout — tell us what you need and we&rsquo;ll send an exact quote.
              </p>
            </div>
          </div>
        </div>

        {/* Full description */}
        {hasBody && (
          <div className="prose mt-12 max-w-none border-t border-border pt-8">
            <h2 className="text-2xl font-bold text-brand-ink">Product Details</h2>
            <PortableText value={doc.description ?? []} components={pagePortableComponents} />
          </div>
        )}

        {/* Related products — productPage cards link internally, the rest affiliate. */}
        {related.length > 0 && (
          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-bold text-brand-ink">Related Products</h2>
            <div className="mt-6">
              <ProductGrid products={related} priorityCount={0} />
            </div>
          </section>
        )}
      </Container>

      <CTABanner categoryTitle={doc.title} />
    </>
  );
}
