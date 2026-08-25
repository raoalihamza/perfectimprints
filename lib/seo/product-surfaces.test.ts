/**
 * SNIP-160: every surface that renders a product card either emits the shared
 * full-product ItemList over the very list it renders, or is one of the four
 * deliberate exceptions. These checks read source as text because the
 * surfaces are server components (and a Next route) that vitest cannot import.
 *
 * The point is structural: the guard that a card and its structured data are
 * one resolution only holds while each emitter passes the SAME array it
 * renders. A later edit that computes the schema from a second list would
 * pass typecheck; it should not pass this file.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripSchemaProducts, type StripCard } from '../products/strip-cards';
import type { GeigerProduct } from '../product-types';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

function product(sku: string, name = `Product ${sku}`): GeigerProduct {
  return {
    sku,
    name,
    brand: null,
    low_price: 1,
    high_price: 2,
    msrp: null,
    min_qty: 1,
    imageUrl: null,
    geiger_url: `https://www.geiger.com/p/x-${sku}`,
    description: null,
    category_paths: [],
    badges: [],
    is_new_item: false,
    is_on_sale: false,
    product_type_unigram: null,
  } as unknown as GeigerProduct;
}

describe('stripSchemaProducts', () => {
  it('names the product cards in order, once each, and never a manual card', () => {
    const cards: StripCard[] = [
      { kind: 'product', key: 'a', product: product('501003') },
      { kind: 'manual', key: 'm', title: 'Hand-typed', href: null, isExternal: true },
      { kind: 'product', key: 'b', product: product('502000') },
      { kind: 'product', key: 'c', product: product(' 501003 ') },
    ];
    expect(stripSchemaProducts(cards).map((p) => p.sku)).toEqual(['501003', '502000']);
  });

  it('is empty for a strip of only manual cards, so the emitter skips the block', () => {
    const cards: StripCard[] = [
      { kind: 'manual', key: 'm', title: 'Hand-typed', href: null, isExternal: true },
    ];
    expect(stripSchemaProducts(cards)).toEqual([]);
  });
});

describe('the strip surfaces emit their ItemList from the cards they render', () => {
  it.each([
    'components/videos/VideoRelatedProducts.tsx',
    'components/page-sections/ProductStrip.tsx',
  ])('%s', (rel) => {
    const src = read(rel);
    expect(src).toContain("from '@/lib/seo/product-list-schema'");
    expect(src).toContain('const schemaProducts = stripSchemaProducts(cards);');
    expect(src).toContain('<StripCardGrid cards={cards} />');
    expect(src).toContain(
      '{schemaProducts.length > 0 && <Schema data={productItemListSchema(schemaProducts)} />}',
    );
    // The schema must be computed from `cards`, never from a second resolution.
    expect(src.match(/resolveStripCards\(/g)).toHaveLength(1);
  });

  it('the landing template renders its strip through the page-builder ProductStrip (no strip of its own)', () => {
    const src = read('components/landing/LandingPageTemplate.tsx');
    expect(src).toContain("from '@/components/page-sections/ProductStrip'");
    expect(src).not.toContain('productItemListSchema');
    expect(src).not.toContain('resolveStripCards');
  });
});

describe('the home rails and the shop-by-theme preview emit over the list they render', () => {
  it('NewProductsRail builds its list from its `products` prop and renders that same prop', () => {
    const src = read('components/home/NewProductsRail.tsx');
    expect(src).toContain('const itemList = productItemListSchema(products);');
    expect(src).toContain('{products.map((p) => (');
    expect(src).toContain('<Schema data={itemList} />');
  });

  it('the home page hands both rails a post-hide list', () => {
    const src = read('app/page.tsx');
    expect(src).toContain('getNewProducts(12, hiddenNew)');
    expect(src).toContain('getRushProducts(12, hiddenRush)');
  });

  it('the shop-by-theme landing applies the site-wide hide list before the slice and lists the same four', () => {
    const src = read('app/shop-by-theme/[slug]/page.tsx');
    expect(src).toContain('getCatalogPreviewProducts(doc.catalogKey, 4, hiddenSkus)');
    expect(src).toContain('productItemListSchema(previewProducts)');
    expect(src).toContain('<ProductGrid products={previewProducts} priorityCount={0} />');
    const catalogs = read('lib/catalogs.ts');
    expect(catalogs).toContain(
      'filterHiddenSkuItems(products, buildSkuSet(hiddenSkus)).slice(0, limit)',
    );
  });

  it('the gated catalog grid stays without a list: it is noindex + nofollow', () => {
    const src = read('app/shop-by-theme/[slug]/catalog/page.tsx');
    expect(src).toContain('robots: { index: false, follow: false }');
    expect(src).not.toContain('productItemListSchema');
    expect(src).not.toContain('aggregatorItemListSchema');
  });

  it('the product detail page keeps its single Product block and no list over its related carousel', () => {
    const src = read('app/products/[slug]/page.tsx');
    expect(src).not.toContain('productItemListSchema');
    expect(src).not.toContain('aggregatorItemListSchema');
  });
});
