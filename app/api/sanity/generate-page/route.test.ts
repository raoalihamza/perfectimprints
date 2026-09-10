/**
 * FIX-871 write-side test for the generate-page route. The route assembles the
 * `productStrip` section itself (the Studio action appends what it returns),
 * so this drives the real POST handler with the matcher, DeepSeek, the link
 * engine, the nonce check and the hidden-SKU read mocked at their module
 * boundaries, and asserts the strip it returns stores a Product Page as the
 * reference entry the strip renderer resolves.
 */
import { describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const paragraph = Array.from({ length: 95 }, (_, i) => `word${i}`).join(' ');
  const section = (heading: string) => ({ heading, paragraphs: [paragraph, paragraph] });
  return {
    generated: {
      heroHeading: 'Custom Pens for Employee Welcome Kits',
      heroSubheading: 'Sub.',
      heroCtaLabel: 'Get a Free Quote',
      bodySections: [section('Why pens'), section('Which pens'), section('How to order')],
      stat: { statText: 'Decades of experience', subtext: 'Serving businesses.' },
      faqs: [{ question: 'Minimum?', answer: 'Most start at 100.' }],
      ctaHeading: 'Ready to order?',
      ctaButtonLabel: 'Get a Quote',
      productType: 'pens',
      metaTitle: 'Custom Pens',
      metaDescription: 'Custom pens for businesses.',
    },
    products: [
      {
        sku: 'custom-327d0759-17bb-49c0-9e0d-342e25de5a29',
        name: 'U Brands Monterey Earthly Pens - Laser Engraved',
        detailUrl: '/products/laser-engraved-u-brands-monterey-earthly-pens',
      },
      { sku: '506872', name: 'Souvenir Jalan Pen' },
      { sku: '507338', name: 'Javalina Pen' },
    ],
  };
});

vi.mock('@/lib/sanity/studio-nonce-auth', () => ({
  verifyStudioNonce: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/products/site-wide-hidden', () => ({
  siteWideHiddenSkus: vi.fn(async () => []),
}));
vi.mock('@/lib/ai/deepseek', () => ({
  generateJson: vi.fn(async () => fixtures.generated),
  DeepSeekError: class DeepSeekError extends Error {
    status = 502;
  },
}));
vi.mock('@/lib/ai/internal-links', () => ({
  suggestInternalLinks: vi.fn(async () => []),
}));
vi.mock('@/lib/ai/related-products', () => ({
  matchRelatedProducts: vi.fn(async () => fixtures.products),
  resolveCategoryForKeywords: vi.fn(() => 'pens'),
}));

describe('POST /api/sanity/generate-page (FIX-871)', () => {
  it('stores a Product Page suggestion in the productStrip section as a relatedProductRef, first, with Geiger SKUs after it', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/sanity/generate-page', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Custom Pens for Welcome Kits', keywords: ['custom pens'] }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { sections: Record<string, unknown>[] };
    const strip = json.sections.find((s) => s._type === 'productStrip') as
      | { products: Record<string, unknown>[] }
      | undefined;
    expect(strip).toBeDefined();
    expect(strip!.products.map(({ _key, ...rest }) => rest)).toEqual([
      { _type: 'relatedProductRef', _ref: '327d0759-17bb-49c0-9e0d-342e25de5a29' },
      { _type: 'blogProduct', sku: '506872' },
      { _type: 'blogProduct', sku: '507338' },
    ]);
    for (const p of strip!.products) expect(p._key).toMatch(/^sku-/);
    expect(JSON.stringify(json)).not.toContain('"sku":"custom-');
  });
});
