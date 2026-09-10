/**
 * FIX-871 write-side test for the blog call site. The generate-blog route hands
 * `buildBlogBody` the matcher's SKUs per section; this proves a Product Page
 * among them is stored as the reference entry the strip renderer resolves,
 * not as a bare synthetic SKU that resolves to nothing.
 */
import { describe, expect, it } from 'vitest';
import { buildBlogBody, type BlogProductsBlock } from './build-blog-body';

function productsBlocks(input: Parameters<typeof buildBlogBody>[0]): BlogProductsBlock[] {
  return buildBlogBody(input).filter((b): b is BlogProductsBlock => b._type === 'blogProducts');
}

describe('buildBlogBody product strips (FIX-871)', () => {
  it('stores a Product Page suggestion as a relatedProductRef reference, in the matcher order, ahead of Geiger SKUs', () => {
    const [block] = productsBlocks({
      sections: [
        {
          heading: 'Pens for welcome kits',
          paragraphs: ['Some copy.'],
          products: {
            heading: 'Recommended Products',
            skus: ['custom-327d0759-17bb-49c0-9e0d-342e25de5a29', '506872', '507338'],
          },
        },
      ],
    });
    expect(block).toBeDefined();
    expect(block.heading).toBe('Recommended Products');
    expect(block.products.map(({ _key, ...rest }) => rest)).toEqual([
      { _type: 'relatedProductRef', _ref: '327d0759-17bb-49c0-9e0d-342e25de5a29' },
      { _type: 'blogProduct', sku: '506872' },
      { _type: 'blogProduct', sku: '507338' },
    ]);
    // Keys keep the builder's own pattern and are unique within the strip.
    for (const p of block.products) expect(p._key).toMatch(/^p-/);
    expect(new Set(block.products.map((p) => p._key)).size).toBe(3);
  });

  it('never stores a bare custom-<id> SKU entry', () => {
    const blocks = productsBlocks({
      sections: [{ products: { skus: ['custom-abc', 'custom-def', '501003'] } }],
    });
    const stored = JSON.stringify(blocks);
    expect(stored).not.toContain('"sku":"custom-');
    expect(blocks[0].products.filter((p) => p._type === 'relatedProductRef')).toHaveLength(2);
  });

  it('drops blank and unusable entries and emits no block when nothing is left (the pre-existing rule)', () => {
    expect(productsBlocks({ sections: [{ products: { skus: ['', '  ', 'custom-drafts.x'] } }] })).toEqual([]);
    const [block] = productsBlocks({ sections: [{ products: { skus: [' 501003 ', ''] } }] });
    expect(block.products).toEqual([{ _type: 'blogProduct', _key: expect.any(String), sku: '501003' }]);
  });
});
