/**
 * SEC-100, Part 4.4: the Sanity webhook still revalidates once the dataset is
 * private.
 *
 * Drives the REAL webhook route with correctly signed payloads (the same
 * HMAC scheme Sanity uses, `t=<ts>,v1=<base64url HMAC-SHA256 of "<ts>.<body>">`)
 * and asserts the tag and path revalidations each branch has always made.
 * The branches that look up embedding documents (a product page published:
 * which categories and content docs show it?) read through the REAL read
 * client against a simulated private dataset, so the test also proves those
 * lookups carry the read token.
 *
 * Sanity sends webhooks from its own side with project access; making the
 * dataset private does not change what it sends (proven live by Part 5's
 * publish, not here).
 */
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPrivateDataset } from '@/lib/sanity/private-dataset.testkit';
import { BLOG_LIST_TAG, PRODUCT_PAGES_TAG, QUOTES_TAG, SETTINGS_TAG, blogPostTag, quoteTag } from '@/lib/sanity/cache-tags';

vi.mock('server-only', () => ({}));
const next = vi.hoisted(() => ({ tags: [] as string[], paths: [] as string[] }));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn((tag: string) => {
    next.tags.push(tag);
  }),
  revalidatePath: vi.fn((p: string) => {
    next.paths.push(p);
  }),
}));

const SECRET = 'whsec-test-sec100';
const READ_TOKEN = 'test-read-token-sec100';
const QUOTE_TOKEN = '0123456789abcdef0123456789abcdef';

let sim: ReturnType<typeof installPrivateDataset> | null = null;
async function loadRoute() {
  sim = installPrivateDataset({
    token: READ_TOKEN,
    // The two embedding lookups, in their real shapes: override slugs, then content docs.
    answer: (req) =>
      req.query.includes('"categoryOverride" && references($id)')
        ? ['pens']
        : req.query.includes('references($id)')
          ? [{ _type: 'blogPost', slug: 'best-pens' }]
          : undefined,
  });
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'testproj');
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production');
  vi.stubEnv('SANITY_API_READ_TOKEN', READ_TOKEN);
  vi.stubEnv('SANITY_WEBHOOK_SECRET', SECRET);
  return import('./route');
}

function signed(payload: Record<string, unknown>, secret = SECRET): Request {
  const body = JSON.stringify(payload);
  const t = String(Date.now());
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('base64url');
  return new Request('https://www.perfectimprints.com/api/sanity/revalidate', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'sanity-webhook-signature': `t=${t},v1=${v1}` },
  });
}

afterEach(() => {
  sim?.restore();
  sim = null;
  next.tags = [];
  next.paths = [];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the webhook still revalidates, against a PRIVATE dataset', () => {
  it('a quote publish busts the quote tags and the private quote page', async () => {
    const route = await loadRoute();
    const res = await route.POST(signed({ _type: 'quote', _id: 'q1', slug: { current: QUOTE_TOKEN } }));
    expect(res.status).toBe(200);
    expect(next.tags).toEqual(expect.arrayContaining([QUOTES_TAG, quoteTag(QUOTE_TOKEN)]));
    expect(next.paths).toContain(`/quote/${QUOTE_TOKEN}`);
    // The response never echoes the full token (it lands in Sanity's delivery log).
    expect(JSON.stringify(await res.json())).not.toContain(QUOTE_TOKEN);
  });

  it('a blog post publish busts its own tag, the blog lists and its page', async () => {
    const route = await loadRoute();
    const res = await route.POST(signed({ _type: 'blogPost', _id: 'b1', slug: { current: 'a-post' } }));
    expect(res.status).toBe(200);
    expect(next.tags).toEqual(expect.arrayContaining([blogPostTag('a-post'), BLOG_LIST_TAG]));
    expect(next.paths).toContain('/blog/a-post');
  });

  it('a Global Settings publish busts the settings tag (footer, header CTA, every page)', async () => {
    const route = await loadRoute();
    const res = await route.POST(signed({ _type: 'globalSettings', _id: 'globalSettings' }));
    expect(res.status).toBe(200);
    expect(next.tags).toContain(SETTINGS_TAG);
  });

  it('a product page publish revalidates it, and its embedding lookups read WITH the token', async () => {
    const route = await loadRoute();
    const res = await route.POST(signed({ _type: 'productPage', _id: 'pp1', slug: { current: 'test-pen' } }));
    expect(res.status).toBe(200);
    expect(next.tags).toContain(PRODUCT_PAGES_TAG);
    expect(next.paths).toContain('/products/test-pen');
    expect(next.paths).toContain('/cat/pens');
    expect(next.paths).toContain('/blog/best-pens');
    expect(sim!.requests.length).toBeGreaterThan(0);
    expect(sim!.requests.every((r) => r.authorized && r.perspective === 'published')).toBe(true);
  });

  it('a bad signature is still refused', async () => {
    const route = await loadRoute();
    const res = await route.POST(signed({ _type: 'quote', slug: { current: QUOTE_TOKEN } }, 'wrong-secret'));
    expect(res.status).toBe(401);
    expect(next.paths).toEqual([]);
  });
});
