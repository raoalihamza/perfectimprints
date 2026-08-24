import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GeigerProduct } from '../product-types';
import type {
  StripProductEntry,
  StripProductRefEntry,
} from '../sanity/strip-product-entries';
import { productItemListSchema } from '../seo/product-list-schema';
import { buildSkuSet } from './hidden-skus';
import {
  dedupeProductsBySku,
  isGeigerUrl,
  resolveStripCards,
  stripCardProducts,
  type StripCardContext,
} from './strip-cards';

function product(overrides: Partial<GeigerProduct> & { sku: string; name: string }): GeigerProduct {
  return {
    brand: null,
    low_price: 1.5,
    high_price: 2.5,
    msrp: 2.5,
    min_qty: 100,
    imageUrl: `https://imgsirv.geiger.com/${overrides.sku}.jpg?format=webp&thumbnail=275&w=275&h=275`,
    description: null,
    category_paths: [],
    badges: [],
    is_new_item: false,
    is_on_sale: false,
    product_type_unigram: null,
    geiger_url: `https://www.geiger.com/p/item-${overrides.sku}`,
    ...overrides,
  };
}

const catalogA = product({ sku: '501003', name: 'Reflective Backpack' });
const catalogB = product({ sku: '506414', name: 'Fan-Ta-Sticks Noisemakers' });
const replacementPage = product({
  sku: 'custom-page-1',
  name: 'Fan-Ta-Sticks Noisemakers (Perfect Imprints)',
  imageUrl: 'https://cdn.sanity.io/images/ii96lcy9/production/abc-400x400.jpg?w=400&fit=max',
  geiger_url: null,
  detailUrl: '/products/fan-ta-sticks-noisemakers-pairs-galaxy',
});

const pageRef: StripProductRefEntry = {
  _type: 'productPage',
  _id: 'page-1',
  title: 'Fan-Ta-Sticks Noisemakers (Perfect Imprints)',
  slug: 'fan-ta-sticks-noisemakers-pairs-galaxy',
} as StripProductRefEntry;

/** A stand-in for the server-only stripRefToGeigerProduct binding. */
function resolveRef(entry: StripProductRefEntry): GeigerProduct | null {
  if (entry._type === 'productPage' && entry._id === 'page-1') return replacementPage;
  return null;
}

function ctx(overrides: Partial<StripCardContext> = {}): StripCardContext {
  return {
    skuProducts: new Map([
      [catalogA.sku, catalogA],
      [catalogB.sku, catalogB],
    ]),
    resolveRef,
    ...overrides,
  };
}

describe('resolveStripCards', () => {
  it('renders catalog SKUs as product cards in entry order and keeps duplicate SKU entries', () => {
    const entries: StripProductEntry[] = [
      { _type: 'blogProduct', _key: 'a', sku: '501003' },
      { _type: 'blogProduct', _key: 'b', sku: '506414' },
      { _type: 'blogProduct', _key: 'c', sku: '501003' },
    ];
    const cards = resolveStripCards(entries, ctx());
    expect(cards.map((c) => c.kind)).toEqual(['product', 'product', 'product']);
    expect(stripCardProducts(cards).map((p) => p.sku)).toEqual(['501003', '506414', '501003']);
    expect(cards.map((c) => c.key)).toEqual(['a', 'b', 'c']);
  });

  it('drops null (dangling) entries and references that cannot render a card', () => {
    const entries: (StripProductEntry | null)[] = [
      null,
      { _type: 'customProduct', _id: 'cp-no-url', title: 'Orphan' } as StripProductRefEntry,
      { _type: 'blogProduct', sku: '501003' },
    ];
    const cards = resolveStripCards(entries, ctx());
    expect(cards).toHaveLength(1);
    expect(stripCardProducts(cards)[0].sku).toBe('501003');
  });

  it('renders a productPage reference once even when attached twice in the strip', () => {
    const cards = resolveStripCards([pageRef, pageRef], ctx());
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe('ref-page-1-0');
    expect(stripCardProducts(cards)[0].detailUrl).toBe(
      '/products/fan-ta-sticks-noisemakers-pairs-galaxy',
    );
  });

  /**
   * HIDE-100: a hidden SKU is dropped ENTIRELY, manual fallback included. The
   * resolver is what both the renderer and the structured data read, so the
   * product is absent from the cards AND from the products handed to the
   * serializer in one decision.
   */
  it('drops a HIDE-100 hidden SKU from the cards and the schema, manual fallback included', () => {
    const entries: StripProductEntry[] = [
      { _type: 'blogProduct', sku: '501003' },
      {
        _type: 'blogProduct',
        sku: '506414',
        title: 'Hand-typed fallback for the hidden product',
        url: 'https://www.geiger.com/p/should-not-resurrect',
      },
    ];
    const cards = resolveStripCards(entries, ctx({ hiddenSkus: buildSkuSet(['506414']) }));
    expect(cards).toHaveLength(1);
    const skus = stripCardProducts(cards).map((p) => p.sku);
    expect(skus).toEqual(['501003']);
    const json = JSON.stringify(productItemListSchema(stripCardProducts(cards)));
    expect(json).not.toContain('506414');
    expect(json).not.toContain('should-not-resurrect');
  });

  it('matches the hide list case- and whitespace-insensitively, as every other surface does', () => {
    const entries: StripProductEntry[] = [{ _type: 'blogProduct', sku: ' 506414 ' }];
    const cards = resolveStripCards(entries, ctx({ hiddenSkus: buildSkuSet(['506414']) }));
    expect(cards).toHaveLength(0);
  });

  /**
   * HIDE-110: a SKU claimed by a published product page is SWAPPED for that
   * page's card, so the strip keeps its length and the schema describes the
   * replacing product (internal url, no Geiger sku) and never the hidden one.
   */
  it('substitutes a HIDE-110 replaced SKU with the product page card in both cards and schema', () => {
    const entries: StripProductEntry[] = [
      { _type: 'blogProduct', _key: 'x', sku: '506414' },
      { _type: 'blogProduct', _key: 'y', sku: '501003' },
    ];
    const cards = resolveStripCards(
      entries,
      ctx({
        hiddenSkus: buildSkuSet(['506414']),
        replacementBySku: new Map([['506414', replacementPage]]),
      }),
    );
    expect(cards.map((c) => c.key)).toEqual(['rep-custom-page-1-0', 'y']);
    const products = stripCardProducts(cards);
    expect(products.map((p) => p.sku)).toEqual(['custom-page-1', '501003']);
    const list = productItemListSchema(products);
    const json = JSON.stringify(list);
    expect(json).not.toContain('506414');
    expect(json).not.toContain('custom-page-1'); // synthetic id never emitted as sku
    const first = (list.itemListElement as Record<string, unknown>[])[0].item as Record<string, unknown>;
    expect(first.url).toBe(
      'https://www.perfectimprints.com/products/fan-ta-sticks-noisemakers-pairs-galaxy',
    );
    expect(first.sku).toBeUndefined();
  });

  it('does not render a replacement twice when the same page also sits in the strip as a reference', () => {
    const entries: (StripProductEntry | null)[] = [
      pageRef,
      { _type: 'blogProduct', sku: '506414' },
    ];
    const cards = resolveStripCards(
      entries,
      ctx({
        hiddenSkus: buildSkuSet(['506414']),
        replacementBySku: new Map([['506414', replacementPage]]),
      }),
    );
    expect(cards).toHaveLength(1);
  });

  it('renders the manual fallback with the affiliate-rewritten Geiger URL, and skips empty entries', () => {
    const entries: StripProductEntry[] = [
      { _type: 'blogProduct', _key: 'm', sku: 'GONE-123', title: 'Dropped from catalog', url: 'https://www.geiger.com/p/x?pid=1' },
      { _type: 'blogProduct', _key: 'n', url: '/cat/pens' },
      { _type: 'blogProduct', _key: 'o', title: 'No link at all' },
      { _type: 'blogProduct', _key: 'p', sku: 'GONE-456' }, // nothing to show
    ];
    const cards = resolveStripCards(entries, ctx());
    expect(cards.map((c) => c.kind)).toEqual(['manual', 'manual', 'manual']);
    const [m, n, o] = cards as Extract<(typeof cards)[number], { kind: 'manual' }>[];
    expect(m.title).toBe('Dropped from catalog');
    expect(m.href).toBe('https://patrickblack.geiger.com/p/x?pid=1');
    expect(m.isExternal).toBe(true);
    expect(n.title).toBe('Product');
    expect(n.href).toBe('/cat/pens');
    expect(n.isExternal).toBe(false);
    expect(o.href).toBeNull();
    expect(o.isExternal).toBe(true);
    // Manual cards carry no sku/price/destination worth a Product entity.
    expect(stripCardProducts(cards)).toEqual([]);
  });

  it('recognizes geiger.com and affiliate subdomains as Geiger URLs', () => {
    expect(isGeigerUrl('https://www.geiger.com/p/x')).toBe(true);
    expect(isGeigerUrl('https://patrickblack.geiger.com/p/x')).toBe(true);
    expect(isGeigerUrl('https://example.com/p/x')).toBe(false);
  });
});

describe('dedupeProductsBySku', () => {
  it('keeps the first occurrence of each SKU across strips, case-insensitively', () => {
    const a2 = product({ sku: '501003', name: 'Second copy' });
    const out = dedupeProductsBySku([catalogA, catalogB, a2, product({ sku: ' 501003', name: 'x' })]);
    expect(out.map((p) => p.name)).toEqual(['Reflective Backpack', 'Fan-Ta-Sticks Noisemakers']);
  });
});

/**
 * Structural guard (the decode-product.test.ts precedent): every strip
 * renderer and the blog post's schema must go through the ONE resolver. A
 * renderer that grows its own hidden/replaced/manual logic again would let the
 * cards and the structured data drift apart, which is the bug class this
 * module exists to close. Reads the source as text because the renderers are
 * server components that cannot be imported into vitest.
 */
describe('every strip surface goes through the shared resolver', () => {
  const root = resolve(__dirname, '..', '..');
  const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

  const renderers = [
    'components/blog/BlogBody.tsx',
    'components/page-sections/ProductStrip.tsx',
    'components/videos/VideoRelatedProducts.tsx',
  ];

  it.each(renderers)('%s resolves its cards through resolveStripCards and owns no hide/affiliate logic', (rel) => {
    const src = read(rel);
    expect(src).toContain("from '@/lib/sanity/queries/strip-entries'");
    expect(src).toMatch(/\bresolveStripCards\(/);
    expect(src).toContain('StripCardGrid');
    expect(src).not.toContain('isHiddenSku(');
    expect(src).not.toContain('affiliateUrl(');
    expect(src).not.toContain('GEIGER_HOST_PATTERN');
    expect(src).not.toContain('stripRefToGeigerProduct(');
  });

  it('the blog post page builds its ItemList from the same resolver via collectBlogStripProducts', () => {
    const src = read('app/blog/[slug]/page.tsx');
    expect(src).toContain('collectBlogStripProducts(');
    expect(src).toContain('productItemListSchema(stripProducts)');
  });

  it('collectBlogStripProducts and the renderer binding are the same function', () => {
    const src = read('lib/sanity/queries/strip-entries.ts');
    expect(src).toMatch(/export function resolveStripCards\(/);
    expect(src).toMatch(/export function collectBlogStripProducts\(/);
    // The collector calls the exported binding, not the pure core directly.
    const body = src.slice(src.indexOf('export function collectBlogStripProducts('));
    expect(body).toContain('resolveStripCards(block.products ?? [], ctx)');
  });
});
