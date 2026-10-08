/**
 * FIX-900: the generate-blog route asks the matcher for a stricter catalog
 * floor per idea, and a strip with too few relevant products is left out of
 * the body rather than padded (the rule AUTO-000 asked for).
 *
 * Drives the real POST handler with DeepSeek, the matcher, the link engine,
 * the nonce check and the hidden-SKU read mocked at their module boundaries
 * (the generate-page route test's pattern). `catalogTopUpFloor` stays REAL,
 * so what the route passes is what the route would pass in production.
 */
import { describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const paragraph = Array.from({ length: 110 }, (_, i) => `word${i}`).join(' ');
  const section = (heading: string, productType: string) => ({
    heading,
    paragraphs: [paragraph, paragraph],
    productType,
  });
  return {
    generated: {
      title: '9 Custom Sunscreen Giveaway Ideas',
      metaTitle: 'Custom Sunscreen Giveaways',
      metaDescription: 'Custom sunscreen giveaways for outdoor teams.',
      excerpt: 'Nine ideas.',
      intro: [paragraph, paragraph],
      sections: [
        section('Idea 1: Sunscreen sticks', 'sunscreen sticks'),
        section('Idea 2: Koozies', 'koozies'),
        section('Idea 3: Generic', 'custom items'),
        section('Idea 4: Lip balm', 'spf lip balm'),
        section('Idea 5: Bottles', 'sunscreen bottles'),
        section('Idea 6: Carabiners', 'sunscreen with carabiner'),
      ],
    },
    calls: [] as { keywords: string[]; catalogMinScore?: number; minScore?: number }[],
    product: (sku: string, name: string) => ({ sku, name, brand: '', imageUrl: '', geiger_url: '' }),
  };
});

vi.mock('@/lib/sanity/studio-nonce-auth', () => ({
  verifyStudioNonce: vi.fn(async () => ({ ok: true })),
  // AUTO-203: the generator reads the current drafts for the duplicate-title check; no client here means none.
  serverSanityClient: vi.fn(() => null),
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
  // AUTO-203: the published posts, for the duplicate-title check.
  loadLinkDocsForKind: vi.fn(async () => []),
}));
vi.mock('@/lib/ai/related-products', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/related-products')>();
  return {
    ...real,
    resolveCategoryForKeywords: vi.fn(() => null),
    matchRelatedProducts: vi.fn(async (opts: { keywords: string[]; catalogMinScore?: number; minScore?: number }) => {
      fixtures.calls.push({ keywords: opts.keywords, catalogMinScore: opts.catalogMinScore, minScore: opts.minScore });
      const phrase = opts.keywords[0];
      // One relevant product only: below MIN_STRIP_PRODUCTS, so the strip must be skipped.
      if (phrase === 'sunscreen sticks') return [fixtures.product('508598', 'SPF 30 Sunscreen in Jumbo Sunstick')];
      // Nothing clears the floor.
      if (phrase === 'custom items') return [];
      return [fixtures.product(`${phrase}-1`, `${phrase} one`), fixtures.product(`${phrase}-2`, `${phrase} two`)];
    }),
  };
});

describe('POST /api/sanity/generate-blog (FIX-900)', () => {
  it('passes the catalog floor per idea and leaves out a strip with too few relevant products', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/sanity/generate-blog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Custom sunscreen giveaways', template: 'list', keywords: ['custom sunscreen'] }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { body: { _type: string; style?: string; products?: unknown[] }[] };

    // The dial as the route computes it: two shared words for a two-word idea,
    // one for a one-word idea, one for an idea made only of generic words.
    const floorFor = (phrase: string) => fixtures.calls.find((c) => c.keywords[0] === phrase)?.catalogMinScore;
    expect(floorFor('sunscreen sticks')).toBe(2);
    expect(floorFor('koozies')).toBe(1);
    expect(floorFor('custom items')).toBe(1);
    expect(floorFor('spf lip balm')).toBe(2);
    expect(floorFor('sunscreen with carabiner')).toBe(2);
    for (const c of fixtures.calls) expect(c.minScore).toBe(1);

    // Six ideas, six headings; strips only where at least two products came back.
    const headings = json.body.filter((b) => b._type === 'block' && b.style === 'h2').length;
    const strips = json.body.filter((b) => b._type === 'blogProducts');
    expect(headings).toBe(6);
    expect(strips.length).toBe(4);
    for (const s of strips) expect((s.products ?? []).length).toBe(2);
  });
});
