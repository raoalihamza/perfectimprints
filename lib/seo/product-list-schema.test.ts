import { describe, expect, it } from 'vitest';

import type { GeigerProduct } from '../product-types';
import { productItemListSchema, productListItem } from './product-list-schema';

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
