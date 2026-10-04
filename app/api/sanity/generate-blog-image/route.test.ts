/**
 * AUTO-202: the generate-blog-image route driven for real, its edges mocked:
 * the nonce check, the write client, the settings read, the catalog, the
 * hide list, the matcher and the chain. What the route must do: validate,
 * refuse a forced-AI request with no key or no client, resolve SKUs to
 * catalog products only (never a client URL), drop hidden products, start
 * the chain where the source says, and hand back the outcome without
 * writing anything itself.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authOk: true,
  client: {} as unknown,
  settings: { blogAutomation: { headerImageSource: 'ai', headerImageLibrary: [] as unknown[] } },
  hidden: [] as string[],
  chainInputs: [] as Record<string, unknown>[],
  chainOutcome: { kind: 'asset', source: 'ai', image: { _type: 'image', asset: { _type: 'reference', _ref: 'image-gen' } }, notes: [] } as unknown,
}));

vi.mock('@/lib/sanity/studio-nonce-auth', () => ({
  verifyStudioNonce: vi.fn(async () => (state.authOk ? { ok: true } : { ok: false, status: 401, error: 'Sign in.' })),
  serverSanityClient: vi.fn(() => state.client),
}));
vi.mock('@/lib/sanity/queries/global-settings', () => ({
  getSiteSettings: vi.fn(async () => state.settings),
}));
vi.mock('@/lib/categories', () => ({
  resolveProductsBySku: vi.fn((skus: string[]) =>
    skus
      .filter((s) => s === '501003' || s === '519423')
      .map((s) => ({ sku: s, name: s === '501003' ? 'Canvas Tote' : 'Hidden Tote', imageUrl: `https://imgsirv.geiger.com/master/${s}/web/${s}_1.jpg?format=webp&w=275&h=275&thumbnail=275` })),
  ),
}));
vi.mock('@/lib/ai/related-products', () => ({
  resolveCategoryForKeywords: vi.fn(() => 'tote-bags'),
}));
vi.mock('@/lib/products/site-wide-hidden', () => ({
  siteWideHiddenSkus: vi.fn(async () => state.hidden),
}));
vi.mock('@/lib/blog-automation/resolve-header-image', () => ({
  defaultHeaderImageDeps: vi.fn(() => ({ real: true })),
  noClientHeaderImageDeps: vi.fn(() => ({ real: false })),
  resolveHeaderImage: vi.fn(async (input: Record<string, unknown>, deps: { real: boolean }) => {
    state.chainInputs.push({ ...input, deps });
    return state.chainOutcome;
  }),
}));

// eslint-disable-next-line import/first
import { POST, maxDuration } from './route';

const env = { GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY };
beforeAll(() => {
  process.env.GOOGLE_GEMINI_API_KEY = 'test-key';
});
afterAll(() => {
  if (env.GOOGLE_GEMINI_API_KEY === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
  else process.env.GOOGLE_GEMINI_API_KEY = env.GOOGLE_GEMINI_API_KEY;
});
beforeEach(() => {
  state.authOk = true;
  state.client = {};
  state.settings = { blogAutomation: { headerImageSource: 'ai', headerImageLibrary: [] } };
  state.hidden = [];
  state.chainInputs = [];
  process.env.GOOGLE_GEMINI_API_KEY = 'test-key';
});

async function post(body: unknown) {
  const res = await POST(new Request('http://localhost/api/sanity/generate-blog-image', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const good = { title: 'Custom Tote Bags', keywords: ['custom tote bags'], skus: ['501003'], rootSlugs: ['tote-bags'], slug: 'custom-tote-bags', source: 'ai' };

describe('POST /api/sanity/generate-blog-image', () => {
  it('is guarded first, and a signed-out caller gets the helper status', async () => {
    state.authOk = false;
    const res = await post(good);
    expect(res.status).toBe(401);
    expect(state.chainInputs).toEqual([]);
  });

  it('refuses bad JSON and a missing title', async () => {
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ ...good, title: ' ' })).status).toBe(400);
  });

  it("source 'ai' with no Gemini key is a clear 500 naming Ali, with no chain call", async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    const res = await post(good);
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toContain('GOOGLE_GEMINI_API_KEY');
    expect(state.chainInputs).toEqual([]);
  });

  it("source 'ai' with no write client is a 500; source 'default' runs the chain with the no-client deps", async () => {
    state.client = null;
    expect((await post(good)).status).toBe(500);
    const res = await post({ ...good, source: 'default' });
    expect(res.status).toBe(200);
    expect(state.chainInputs[0]).toMatchObject({ clientMissing: true, deps: { real: false } });
  });

  it('resolves SKUs to catalog products only, drops hidden ones, adds the resolved category to the library roots, and starts at the AI', async () => {
    state.hidden = ['519423'];
    const res = await post({ ...good, skus: ['501003', '519423', 'https://evil.test/x.jpg'], rootSlugs: ['tote-bags', '/cat/bad', 'Bad Slug'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe('ai');
    expect(typeof res.body.summary).toBe('string');
    const input = state.chainInputs[0];
    expect(input.source).toBe('ai');
    expect(input.title).toBe('Custom Tote Bags');
    expect(input.topic).toBe('custom tote bags');
    expect(input.products).toEqual([{ sku: '501003', name: 'Canvas Tote', imageUrl: expect.stringContaining('imgsirv.geiger.com/master/501003/') }]);
    expect(input.rootSlugs).toEqual(['tote-bags']);
    expect(input.deps).toEqual({ real: true });
  });

  it("source 'default' starts where the post's setting says, else the site's", async () => {
    state.settings = { blogAutomation: { headerImageSource: 'library', headerImageLibrary: [{ rootSlug: null, assetRef: 'image-any', alt: null }] } };
    await post({ ...good, source: 'default' });
    expect(state.chainInputs[0]).toMatchObject({ source: 'library', library: [{ rootSlug: null, assetRef: 'image-any', alt: null }] });
    await post({ ...good, source: 'default', postSource: 'product' });
    expect(state.chainInputs[1].source).toBe('product');
    // The explicit button ignores both settings.
    await post({ ...good, source: 'ai', postSource: 'product' });
    expect(state.chainInputs[2].source).toBe('ai');
  });

  it('hands the outcome back as data and writes nothing itself', async () => {
    const src = (await import('node:fs')).readFileSync((await import('node:path')).join(__dirname, 'route.ts'), 'utf8');
    expect(src).not.toMatch(/\.create\(|\.patch\(|\.createOrReplace\(/);
    expect(maxDuration).toBe(90);
    const res = await post(good);
    expect(res.body.outcome).toEqual(state.chainOutcome);
  });
});
