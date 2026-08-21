import { describe, expect, it } from 'vitest';

import type { GeigerProduct } from '../product-types';
import {
  aggregatorItemListSchema,
  productItemListSchema,
  productListItem,
} from './product-list-schema';

/** A fully-populated real-catalog-shaped product. */
function fullProduct(overrides: Partial<GeigerProduct> = {}): GeigerProduct {
  return {
    sku: '501014 90A',
    name: 'Vinyl Football',
    brand: 'BIC Graphic',
    low_price: 1.52,
    high_price: 2.84,
    msrp: 2.84,
    min_qty: 100,
    imageUrl: 'https://imgsirv.geiger.com/image.jpg?format=webp&thumbnail=275&w=275&h=275',
    description: 'A description that must never be emitted.',
    category_paths: ['Home > Outdoor'],
    badges: [],
    is_new_item: false,
    is_on_sale: false,
    product_type_unigram: 'football',
    geiger_url: 'https://www.geiger.com/p/vinyl-football-510336?pid=208667',
    ...overrides,
  };
}

describe('productListItem', () => {
  it('emits a full nested Product for a complete catalog record', () => {
    const entry = productListItem(fullProduct(), 3)!;
    expect(entry['@type']).toBe('ListItem');
    expect(entry.position).toBe(3);
    const item = entry.item as Record<string, unknown>;
    expect(item['@type']).toBe('Product');
    expect(item.name).toBe('Vinyl Football');
    expect(item.url).toBe('https://patrickblack.geiger.com/p/vinyl-football-510336?pid=208667');
    expect(item.brand).toEqual({ '@type': 'Brand', name: 'BIC Graphic' });
    expect(item.sku).toBe('501014 90A');
    expect(item.offers).toEqual({
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: 1.52,
      highPrice: 2.84,
      eligibleQuantity: { '@type': 'QuantitativeValue', value: 100, unitCode: 'C62' },
    });
  });

  it('upsizes the image to the ~1200px social variant', () => {
    const entry = productListItem(fullProduct(), 1)!;
    const item = entry.item as Record<string, unknown>;
    expect(item.image).toBe(
      'https://imgsirv.geiger.com/image.jpg?format=webp&thumbnail=1200&w=1200&h=1200',
    );
  });

  it('never emits description, availability, or msrp', () => {
    const item = productListItem(fullProduct(), 1)!.item as Record<string, unknown>;
    expect(item).not.toHaveProperty('description');
    expect(item).not.toHaveProperty('availability');
    expect(item).not.toHaveProperty('msrp');
    const offers = item.offers as Record<string, unknown>;
    expect(offers).not.toHaveProperty('availability');
    expect(offers).not.toHaveProperty('url');
  });

  it('omits brand entirely when the product has none', () => {
    const item = productListItem(fullProduct({ brand: null }), 1)!.item as Record<string, unknown>;
    expect(item).not.toHaveProperty('brand');
  });

  it('omits blank-string brand', () => {
    const item = productListItem(fullProduct({ brand: '  ' }), 1)!.item as Record<string, unknown>;
    expect(item).not.toHaveProperty('brand');
  });

  it('suppresses synthetic custom- SKUs', () => {
    const item = productListItem(fullProduct({ sku: 'custom-abc123' }), 1)!.item as Record<
      string,
      unknown
    >;
    expect(item).not.toHaveProperty('sku');
  });

  it('keeps real SKUs containing a space verbatim', () => {
    const item = productListItem(fullProduct({ sku: '501622 1BC' }), 1)!.item as Record<
      string,
      unknown
    >;
    expect(item.sku).toBe('501622 1BC');
  });

  it('omits url when there is no geiger_url and no detailUrl (never the bare homepage)', () => {
    const item = productListItem(fullProduct({ geiger_url: null }), 1)!.item as Record<
      string,
      unknown
    >;
    expect(item).not.toHaveProperty('url');
  });

  it('prefers the internal detailUrl over the affiliate url, absolutized', () => {
    const item = productListItem(
      fullProduct({ detailUrl: '/products/vinyl-football' }),
      1,
    )!.item as Record<string, unknown>;
    expect(item.url).toBe('https://www.perfectimprints.com/products/vinyl-football');
  });

  it('omits offers entirely when there is no usable price', () => {
    for (const low of [null, 0, -1, Number.NaN]) {
      const item = productListItem(fullProduct({ low_price: low as number | null }), 1)!
        .item as Record<string, unknown>;
      expect(item).not.toHaveProperty('offers');
    }
  });

  it('collapses a broken high price onto the low price', () => {
    const item = productListItem(fullProduct({ high_price: 0.5 }), 1)!.item as Record<
      string,
      unknown
    >;
    const offers = item.offers as Record<string, unknown>;
    expect(offers.lowPrice).toBe(1.52);
    expect(offers.highPrice).toBe(1.52);
  });

  it('omits eligibleQuantity when min_qty is absent or zero', () => {
    for (const qty of [null, 0]) {
      const item = productListItem(fullProduct({ min_qty: qty }), 1)!.item as Record<
        string,
        unknown
      >;
      const offers = item.offers as Record<string, unknown>;
      expect(offers).not.toHaveProperty('eligibleQuantity');
    }
  });

  it('returns null for a nameless product', () => {
    expect(productListItem(fullProduct({ name: '' }), 1)).toBeNull();
    expect(productListItem(fullProduct({ name: '   ' }), 1)).toBeNull();
  });

  it('decodes HTML entities in the image URL so JSON-LD never carries &amp;', () => {
    // The aggregator loaders (deals / new-products / rush-products) do not
    // decode imageUrl; ProductCard decodes at its own render site, so only a
    // NEW consumer like this one would have shipped a broken URL.
    const item = productListItem(
      fullProduct({
        imageUrl:
          'https://imgsirv.geiger.com/master/102385/web/102385_1.jpg?format=webp&amp;thumbnail=275&amp;w=275&amp;h=275',
      }),
      1,
    )!.item as Record<string, unknown>;
    expect(item.image).toBe(
      'https://imgsirv.geiger.com/master/102385/web/102385_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200',
    );
    expect(String(item.image)).not.toContain('&amp;');
  });

  it('leaves an already-decoded image URL byte-identical (brands and /cat unaffected)', () => {
    const item = productListItem(
      fullProduct({
        imageUrl:
          'https://imgsirv.geiger.com/master/101032/web/101032_1.jpg?format=webp&thumbnail=275&w=275&h=275',
      }),
      1,
    )!.item as Record<string, unknown>;
    expect(item.image).toBe(
      'https://imgsirv.geiger.com/master/101032/web/101032_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200',
    );
  });

  it('leaves a non-Geiger (Sanity) image URL untouched apart from decoding', () => {
    const item = productListItem(
      fullProduct({
        imageUrl: 'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1501.jpg?w=400&fit=max',
      }),
      1,
    )!.item as Record<string, unknown>;
    expect(item.image).toBe(
      'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1501.jpg?w=400&fit=max',
    );
  });

  it('omits image when the product has none', () => {
    const item = productListItem(fullProduct({ imageUrl: null }), 1)!.item as Record<
      string,
      unknown
    >;
    expect(item).not.toHaveProperty('image');
  });
});

describe('productItemListSchema', () => {
  it('numbers positions sequentially and counts only emitted items', () => {
    const list = productItemListSchema([
      fullProduct({ name: 'One' }),
      fullProduct({ name: '' }),
      fullProduct({ name: 'Three' }),
    ]);
    expect(list['@context']).toBe('https://schema.org');
    expect(list['@type']).toBe('ItemList');
    expect(list.numberOfItems).toBe(2);
    const elements = list.itemListElement as Array<Record<string, unknown>>;
    expect(elements.map((e) => e.position)).toEqual([1, 2]);
    expect((elements[0].item as Record<string, unknown>).name).toBe('One');
    expect((elements[1].item as Record<string, unknown>).name).toBe('Three');
  });

  it('degrades to a valid empty list when every entry is skipped', () => {
    const list = productItemListSchema([fullProduct({ name: '' })]);
    expect(list.numberOfItems).toBe(0);
    expect(list.itemListElement).toEqual([]);
  });
});

/**
 * SNIP-120: the client-paginated aggregator pages (Deals / New / Rush). One URL
 * each, paging is React state, so the block must cover only the slice the
 * initial HTML renders.
 */
describe('aggregatorItemListSchema', () => {
  it('describes only the first rendered page, positions restarting at 1', () => {
    const products = Array.from({ length: 7 }, (_, i) =>
      fullProduct({ name: `Product ${i + 1}`, sku: `SKU${i + 1}` }),
    );
    const list = aggregatorItemListSchema(products, 3)!;
    expect(list.numberOfItems).toBe(3);
    const elements = list.itemListElement as Array<Record<string, unknown>>;
    expect(elements.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(elements.map((e) => (e.item as Record<string, unknown>).name)).toEqual([
      'Product 1',
      'Product 2',
      'Product 3',
    ]);
  });

  it('preserves the page order, so pinned and custom products stay first', () => {
    const list = aggregatorItemListSchema(
      [
        fullProduct({ name: 'Pinned', sku: 'PIN1' }),
        fullProduct({ name: 'Scraped', sku: 'SCR1' }),
      ],
      60,
    )!;
    const elements = list.itemListElement as Array<Record<string, unknown>>;
    expect(elements.map((e) => (e.item as Record<string, unknown>).name)).toEqual([
      'Pinned',
      'Scraped',
    ]);
  });

  it('describes the whole list when it is shorter than one page', () => {
    const list = aggregatorItemListSchema([fullProduct(), fullProduct({ sku: 'B' })], 60)!;
    expect(list.numberOfItems).toBe(2);
  });

  it('returns null for an empty grid so the caller emits no block at all', () => {
    expect(aggregatorItemListSchema([], 60)).toBeNull();
  });

  it('never implies a markdown: no msrp, list price, or discount is emitted', () => {
    // Every record in deals.json carries msrp === high_price (SNIP-000), so
    // there is no genuine sale price anywhere in the data to state.
    const list = aggregatorItemListSchema([fullProduct({ msrp: 2.84, is_on_sale: true })], 60)!;
    const item = (list.itemListElement as Array<Record<string, unknown>>)[0].item as Record<
      string,
      unknown
    >;
    const offers = item.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('AggregateOffer');
    expect(offers).not.toHaveProperty('msrp');
    expect(offers).not.toHaveProperty('price');
    expect(offers).not.toHaveProperty('priceValidUntil');
    expect(JSON.stringify(list)).not.toContain('ListPrice');
  });

  it("represents Patrick's own product pages by their internal detail URL, with no synthetic sku", () => {
    const list = aggregatorItemListSchema(
      [
        fullProduct({
          name: 'Patrick Tumbler',
          sku: 'custom-abc123',
          geiger_url: null,
          detailUrl: '/products/patrick-tumbler',
        }),
      ],
      60,
    )!;
    const item = (list.itemListElement as Array<Record<string, unknown>>)[0].item as Record<
      string,
      unknown
    >;
    expect(item.url).toBe('https://www.perfectimprints.com/products/patrick-tumbler');
    expect(item).not.toHaveProperty('sku');
  });

  it('cannot describe a product the page removed, because it serializes the page list', () => {
    // Mirrors the route: applyHiddenSkus() drops hidden + replaced SKUs from
    // `data.products` first, and the block is built from that same array.
    const visible = [fullProduct({ name: 'Kept', sku: 'KEEP1' })];
    const list = aggregatorItemListSchema(visible, 60)!;
    expect(JSON.stringify(list)).not.toContain('HIDDEN1');
    expect(list.numberOfItems).toBe(1);
  });
});
