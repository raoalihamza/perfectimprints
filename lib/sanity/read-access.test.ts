/**
 * SEC-100: the Sanity dataset is private, and every site read carries a
 * server-only read token. These tests fail if that ever regresses.
 *
 *  1. The helper: which failures count as "no usable credential".
 *  2. The read client: carries the token, stays on the published
 *     perspective, and REFUSES to send an anonymous query when the token is
 *     missing (an anonymous query against a private dataset returns HTTP 200
 *     and an empty result, which the site would render and cache).
 *  3. Real read modules against a simulated private dataset
 *     (./private-dataset.testkit.ts): with the token they get data; with the
 *     token missing or revoked they THROW instead of rendering a fallback;
 *     any other failure still gets its old fallback.
 *  4. Structural rules: one place reads the token, no NEXT_PUBLIC_ token, no
 *     browser path to the read client, no second anonymous client, every
 *     render-path catch rethrows a credential failure, the prebuild check
 *     runs first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  degradeOnSanityAccessError,
  isConfiguredSanityProject,
  isSanityAccessError,
  rethrowIfSanityAccessError,
  SANITY_READ_TOKEN_ENV,
  SanityReadTokenMissingError,
} from './read-access';
import { installPrivateDataset, type SimRequest } from './private-dataset.testkit';

vi.mock('server-only', () => ({}));

const ROOT = path.resolve(__dirname, '../..');
const TOKEN = 'test-read-token-sec100';
const QUOTE_TOKEN = '0123456789abcdef0123456789abcdef';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('1. what counts as a credential failure', () => {
  it('a missing token, a 401 and a 403 do; a 404, a 500 and a network error do not', () => {
    expect(isSanityAccessError(new SanityReadTokenMissingError())).toBe(true);
    expect(isSanityAccessError(Object.assign(new Error('x'), { statusCode: 401 }))).toBe(true);
    expect(isSanityAccessError(Object.assign(new Error('x'), { statusCode: 403 }))).toBe(true);
    expect(isSanityAccessError({ response: { statusCode: 401 } })).toBe(true);
    // Across bundles `instanceof` can fail; the name is enough.
    expect(isSanityAccessError({ name: 'SanityReadTokenMissingError' })).toBe(true);
    expect(isSanityAccessError(Object.assign(new Error('x'), { statusCode: 404 }))).toBe(false);
    expect(isSanityAccessError(Object.assign(new Error('x'), { statusCode: 500 }))).toBe(false);
    expect(isSanityAccessError(new TypeError('fetch failed'))).toBe(false);
    expect(isSanityAccessError(null)).toBe(false);
  });

  it('rethrowIfSanityAccessError rethrows only a credential failure', () => {
    const missing = new SanityReadTokenMissingError();
    expect(() => rethrowIfSanityAccessError(missing)).toThrow(missing);
    expect(() => rethrowIfSanityAccessError(new Error('network'))).not.toThrow();
  });

  it('degradeOnSanityAccessError falls back (loudly) only on a credential failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(degradeOnSanityAccessError('t', () => Promise.reject(new SanityReadTokenMissingError()), 'fallback')).resolves.toBe('fallback');
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain(SANITY_READ_TOKEN_ENV);
    await expect(degradeOnSanityAccessError('t', () => Promise.reject(new Error('boom')), 'fallback')).rejects.toThrow('boom');
    await expect(degradeOnSanityAccessError('t', () => Promise.resolve('value'), 'fallback')).resolves.toBe('value');
  });

  it('the CI placeholder project is not a configured project', () => {
    expect(isConfiguredSanityProject('placeholder')).toBe(false);
    expect(isConfiguredSanityProject(undefined)).toBe(false);
    expect(isConfiguredSanityProject('  ')).toBe(false);
    expect(isConfiguredSanityProject('ii96lcy9')).toBe(true);
  });

  it('the missing-token message names the variable and says nothing was read', () => {
    const m = new SanityReadTokenMissingError().message;
    expect(m).toContain('SANITY_API_READ_TOKEN');
    expect(m).toContain('Nothing was read');
  });
});

// ---------------------------------------------------------------------------
async function loadClient(env: { project?: string; token?: string }) {
  vi.resetModules();
  if (env.project !== undefined) vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', env.project);
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production');
  vi.stubEnv('SANITY_API_READ_TOKEN', env.token ?? '');
  return import('./client');
}

describe('2. the read client', () => {
  it('with a project and a token: carries the token, published perspective, no CDN', async () => {
    const { cachedClient, sanityReadTokenConfigured } = await loadClient({ project: 'testproj', token: TOKEN });
    const config = cachedClient.config();
    expect(sanityReadTokenConfigured).toBe(true);
    expect(config.token).toBe(TOKEN);
    expect(config.perspective).toBe('published');
    expect(config.useCdn).toBe(false);
  });

  it('sends the token as a bearer header and perspective=published on every query', async () => {
    const sim = installPrivateDataset({ token: TOKEN, answer: () => 'globalSettings' });
    try {
      const { cachedClient } = await loadClient({ project: 'testproj', token: TOKEN });
      await cachedClient.fetch('*[_id == "globalSettings"][0]._id', {}, { next: { tags: ['t'], revalidate: false } });
      expect(sim.requests).toHaveLength(1);
      expect(sim.requests[0].authorized).toBe(true);
      expect(sim.requests[0].perspective).toBe('published');
    } finally {
      sim.restore();
    }
  });

  it('with a project and NO token: refuses to send an anonymous query', async () => {
    const sim = installPrivateDataset({ token: TOKEN });
    try {
      const { cachedClient, sanityReadTokenConfigured } = await loadClient({ project: 'testproj' });
      expect(sanityReadTokenConfigured).toBe(false);
      // By name: vi.resetModules loads a fresh copy of the class, so instanceof would compare two copies.
      await expect(cachedClient.fetch('count(*)', {}, { cache: 'no-store' })).rejects.toMatchObject({ name: 'SanityReadTokenMissingError', statusCode: 401 });
      expect(sim.requests).toHaveLength(0);
      // Everything else on the client still works (the guard only takes over fetch).
      expect(cachedClient.config().projectId).toBe('testproj');
    } finally {
      sim.restore();
    }
  });

  it('with the CI placeholder project: no guard (the CI build reads nothing and must still build)', async () => {
    const { cachedClient } = await loadClient({ project: 'placeholder' });
    // The base client, not the refusing proxy: fetch is the client's own method.
    expect(cachedClient.fetch).toBe(Object.getPrototypeOf(cachedClient).fetch);
  });
});

// ---------------------------------------------------------------------------
// The answers a private dataset gives the site's real read modules.
function answers(req: SimRequest): unknown {
  const q = req.query;
  if (q.includes('_type == "quote"')) return { _id: 'quote-1', quoteNumber: 'Q-TEST', slug: QUOTE_TOKEN, lineItems: [] };
  if (q.includes('_type == "form"'))
    return { title: 'Kitting quote', slug: 'kitting-quote', recipientEmail: 'sales@example.com', fields: [{ _key: 'a', label: 'Email', fieldType: 'email', required: true }] };
  if (q.includes('_type == "landingPage"') && q.includes('leadRecipient')) return { leadRecipient: 'landing@example.com', product: 'Towels', title: 'Towels Destin' };
  if (q.includes('_type == "productPage"') && q.includes('leadRecipient')) return { leadRecipient: 'product@example.com', title: 'Test Pen' };
  if (q.includes('_type == "catalogPage"')) return { title: 'Holiday Guide', slug: 'holiday-guide' };
  if (q.includes('_type == "page"')) return { _id: 'page-kitting', title: 'Kitting', slug: 'kitting', sections: [] };
  if (q.includes('_type == "blogPost"') && q.includes('$slug')) return { _id: 'b1', title: 'A post', slug: 'a-post', body: [] };
  if (q.includes('megaMenu')) return { items: [{ _key: 'i1', kind: 'link', label: 'Deals', href: '/deals' }] };
  if (q.includes('globalSettings')) return { phoneNumber: '800-773-9472', contact: { phones: ['800-773-9472'] } };
  return undefined;
}

async function loadReads(env: { token?: string }) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'testproj');
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production');
  vi.stubEnv('SANITY_API_READ_TOKEN', env.token ?? '');
  const [quotes, forms, landing, product, catalog, pages, blogs, menu, settings] = await Promise.all([
    import('@/lib/sanity/queries/quotes'),
    import('@/lib/sanity/queries/forms'),
    import('@/lib/sanity/queries/landing-pages'),
    import('@/lib/sanity/queries/product-pages'),
    import('@/lib/sanity/queries/catalog-pages'),
    import('@/lib/sanity/queries/pages'),
    import('@/lib/sanity/queries/blogs'),
    import('@/lib/sanity/queries/mega-menu'),
    import('@/lib/sanity/queries/global-settings'),
  ]);
  return {
    quote: () => quotes.getQuoteByToken(QUOTE_TOKEN),
    quoteForResponse: () => quotes.getQuoteForResponse(QUOTE_TOKEN),
    form: () => forms.getFormBySlug('kitting-quote'),
    landing: () => landing.getLandingLeadInfo('towels-destin'),
    product: () => product.getProductLeadInfo('test-pen'),
    catalog: () => catalog.getCatalogLeadInfo('holiday-guide'),
    page: () => pages.getPageBySlug('kitting'),
    blogPost: () => blogs.getBlogPostBySlug('a-post'),
    megaMenu: () => menu.getMegaMenu(),
    settings: () => settings.getSiteSettings(),
  };
}

describe('3. the real read modules against a PRIVATE dataset', () => {
  it('with the token: the quote link, the lead lookups, a service page, a blog post, the menu and the footer settings all get their data', async () => {
    const sim = installPrivateDataset({ token: TOKEN, answer: answers });
    try {
      const r = await loadReads({ token: TOKEN });
      expect(await r.quote()).toMatchObject({ quoteNumber: 'Q-TEST' });
      expect(await r.quoteForResponse()).toMatchObject({ quoteNumber: 'Q-TEST' });
      expect(await r.form()).toMatchObject({ slug: 'kitting-quote', recipientEmail: 'sales@example.com' });
      expect(await r.landing()).toMatchObject({ leadRecipient: 'landing@example.com' });
      expect(await r.product()).toMatchObject({ leadRecipient: 'product@example.com' });
      expect(await r.catalog()).toMatchObject({ slug: 'holiday-guide' });
      expect(await r.page()).toMatchObject({ slug: 'kitting' });
      expect(await r.blogPost()).toMatchObject({ title: 'A post' });
      expect((await r.megaMenu()).desktopItems.length).toBeGreaterThan(0);
      expect((await r.settings()).contact.phones).toEqual(['800-773-9472']);
      // Every request the site made carried the token and stayed published.
      expect(sim.requests.length).toBeGreaterThanOrEqual(10);
      expect(sim.requests.every((q) => q.authorized && q.perspective === 'published')).toBe(true);
    } finally {
      sim.restore();
    }
  });

  it('what the site used to do: the same reads WITHOUT a token get empty answers from a private dataset, silently', async () => {
    // Shown with a raw anonymous query, because the client now refuses to send one.
    const sim = installPrivateDataset({ token: TOKEN, answer: answers });
    try {
      const res = await fetch(`https://testproj.api.sanity.io/v2024-10-01/data/query/production?query=${encodeURIComponent('*[_type == "quote" && slug.current == $slug][0]')}`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { result: unknown }).result).toBeNull();
    } finally {
      sim.restore();
    }
  });

  it('with the token MISSING: every one of them throws instead of returning an empty fallback, and nothing is sent', async () => {
    const sim = installPrivateDataset({ token: TOKEN, answer: answers });
    try {
      const r = await loadReads({});
      for (const [name, read] of Object.entries(r)) {
        await expect(read(), name).rejects.toMatchObject({ name: 'SanityReadTokenMissingError' });
      }
      expect(sim.requests).toHaveLength(0);
    } finally {
      sim.restore();
    }
  });

  it('with the token REVOKED (401): every one of them throws instead of returning an empty fallback', async () => {
    const sim = installPrivateDataset({ token: 'a-different-token', answer: answers });
    try {
      const r = await loadReads({ token: TOKEN });
      for (const [name, read] of Object.entries(r)) {
        await expect(read(), name).rejects.toMatchObject({ statusCode: 401 });
      }
    } finally {
      sim.restore();
    }
  });

  it('any OTHER failure (a Sanity 500) keeps the fallback it always had', async () => {
    const sim = installPrivateDataset({ token: TOKEN, answer: answers, statusFor: () => 500 });
    try {
      const r = await loadReads({ token: TOKEN });
      expect(await r.quote()).toBeNull();
      expect(await r.form()).toBeNull();
      expect((await r.megaMenu()).desktopItems).toEqual([]);
      expect((await r.settings()).contact.phones).toEqual([]);
    } finally {
      sim.restore();
    }
  });
});

// ---------------------------------------------------------------------------
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const isTestish = (f: string) => /\.test\.|\.testkit\./.test(f);
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');
const SOURCE = ['app', 'components', 'lib', 'sanity', 'scripts'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !isTestish(f));
const read = (f: string) => fs.readFileSync(f, 'utf8');

describe('4. structural rules', () => {
  it('the read token is read from the environment in exactly ONE file: lib/sanity/client.ts', () => {
    const readers = SOURCE.filter((f) => /process\.env(\.|\[\s*['"])SANITY_API_READ_TOKEN/.test(read(f))).map(rel);
    expect(readers).toEqual(['lib/sanity/client.ts']);
  });

  it('no token ever has a NEXT_PUBLIC_ name (that would ship it to every browser)', () => {
    const files = [...SOURCE, ...['.env.example', 'CLAUDE.md', 'next.config.ts', 'vercel.json'].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f))];
    const offenders = files.filter((f) => /NEXT_PUBLIC_[A-Z0-9_]*TOKEN/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no browser code can reach the read client (client components and the whole Studio)', () => {
    const clientMod = path.join(ROOT, 'lib', 'sanity', 'client.ts');
    const files = ['app', 'components', 'lib', 'sanity'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !isTestish(f) && /\.(ts|tsx)$/.test(f));
    const resolveSpec = (from: string, spec: string): string | null => {
      let base: string;
      if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
      else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
      else return null;
      for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const c = base + ext;
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
      }
      return null;
    };
    const deps = new Map<string, string[]>();
    for (const f of files) {
      const src = read(f);
      const list: string[] = [];
      for (const m of src.matchAll(/import\s+(type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g)) if (!m[1]) list.push(m[2]);
      for (const m of src.matchAll(/import\s+['"]([^'"]+)['"]/g)) list.push(m[1]);
      for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) list.push(m[1]);
      deps.set(f, list.map((s) => resolveSpec(f, s)).filter((x): x is string => !!x));
    }
    const browserEntries = files.filter((f) => /^\s*['"]use client['"]/m.test(read(f).slice(0, 400)) || rel(f).startsWith('sanity/'));
    expect(browserEntries.length).toBeGreaterThan(50);
    const reaching: string[] = [];
    for (const entry of browserEntries) {
      const seen = new Set([entry]);
      const stack = [entry];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const d of deps.get(cur) ?? []) {
          if (d === clientMod) reaching.push(rel(entry));
          if (!seen.has(d)) {
            seen.add(d);
            stack.push(d);
          }
        }
      }
    }
    expect([...new Set(reaching)]).toEqual([]);
  });

  it('no second anonymous Sanity client: every other createClient in app/, components/ and lib/ carries a token', () => {
    const offenders: string[] = [];
    for (const f of SOURCE.filter((x) => /^(app|components|lib)\//.test(rel(x)) && rel(x) !== 'lib/sanity/client.ts')) {
      const src = read(f);
      for (const m of src.matchAll(/createClient\(\s*\{/g)) {
        const block = src.slice(m.index, m.index + 600);
        if (!/\btoken\b/.test(block.slice(0, block.indexOf('});') + 1 || 600))) offenders.push(rel(f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no raw query to the Sanity API in app/, components/ or lib/, except the health check (an anonymous count, on purpose)', () => {
    const offenders = SOURCE.filter((f) => /^(app|components|lib)\//.test(rel(f)) && /\.api\.sanity\.io\/v[0-9]/.test(read(f))).map(rel);
    expect(offenders).toEqual(['lib/sanity/read-health.ts']);
  });

  it('the read client pins the published perspective, and only token-bearing write/server clients use another', () => {
    expect(read(path.join(ROOT, 'lib/sanity/client.ts'))).toMatch(/perspective:\s*'published'/);
    // Code lines only: a comment may name a perspective (client.ts records the removed previewDrafts client).
    const code = (f: string) =>
      read(f)
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
    const others = SOURCE.filter((f) => /^(app|components|lib)\//.test(rel(f)) && /perspective:\s*'(raw|drafts|previewDrafts)'/.test(code(f))).map(rel).sort();
    expect(others).toEqual(['app/api/sanity/workflows/route.ts', 'lib/blog-automation/written-topics.ts', 'lib/sanity/studio-nonce-auth.ts']);
  });

  it('every catch on a render-path read rethrows a credential failure, or says it is not a read', () => {
    const guarded = [
      ...walk(path.join(ROOT, 'lib/sanity/queries')).filter((f) => !isTestish(f)),
      ...[
        'lib/brands.ts',
        'lib/ai/internal-links.ts',
        'lib/ai/related-products.ts',
        'lib/ai/category-evidence.ts',
        'lib/search/sanity-index.ts',
        'lib/products/site-wide-hidden.ts',
        'app/sitemap.ts',
        'app/page.tsx',
        'app/api/search-index/route.ts',
      ].map((f) => path.join(ROOT, f)),
    ];
    const offenders: string[] = [];
    let catches = 0;
    for (const f of guarded) {
      const lines = read(f).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!/\}\s*catch\b|\.catch\s*\(/.test(line)) return;
        catches++;
        if (line.includes('sanity-read-guard: not a Sanity read')) return;
        const next = lines.slice(i, i + 5).join('\n');
        if (!next.includes('rethrowIfSanityAccessError(')) offenders.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(catches).toBeGreaterThanOrEqual(70);
    expect(offenders).toEqual([]);
  });

  it('the prebuild check runs FIRST, so a build with no usable token stops before anything reads Sanity', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json'))) as { scripts: Record<string, string> };
    expect(pkg.scripts.prebuild.startsWith('tsx scripts/security/check-sanity-read.ts && ')).toBe(true);
  });

  it('the tokenless CDN `client` is gone', () => {
    expect(read(path.join(ROOT, 'lib/sanity/client.ts'))).not.toMatch(/export const client\b/);
  });
});
