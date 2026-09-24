/**
 * FIX-890: the guard that stops the disaster.
 *
 * Production must never gain a `noindex`; staging must never lose it. These
 * tests pin both, prove the rule fails towards indexing on every malformed
 * input, exercise the real app/robots.ts under both environments, render the
 * metadata through Next's own resolver so the emitted meta tag is what is
 * asserted, and check as source text that every consumer still routes its
 * decision through the one module (a Next route cannot be imported under
 * vitest, the portfolio-surface.test.ts idiom).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NON_PRODUCTION_HOSTS,
  PRODUCTION_HOST,
  indexingPolicy,
  isIndexableSiteUrl,
  nonProductionRobotsHeader,
  siteRobotsMetadata,
  siteUrlHost,
} from './indexing-policy';

const PRODUCTION_URL = 'https://www.perfectimprints.com';
const STAGING_URL = 'https://dev.perfectimprints.com';

/** The layout's robots object EXACTLY as it was before FIX-890 (M-SEO5). */
const PRODUCTION_ROBOTS_BEFORE_FIX_890 = { googleBot: { 'max-image-preview': 'large' } };

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');
// Requirements and prohibitions are both checked against the RAW source with
// code-shaped patterns (a quoted host, a process.env read, an object key), so
// prose in a comment can neither satisfy nor trip a check. A comment stripper
// was tried and rejected: the '/**' in next.config.ts remotePatterns opens a
// false block comment that swallows the rest of that file.

describe('siteUrlHost', () => {
  it('reads the host from every shape an operator might type', () => {
    expect(siteUrlHost('https://www.perfectimprints.com')).toBe('www.perfectimprints.com');
    expect(siteUrlHost('https://www.perfectimprints.com/')).toBe('www.perfectimprints.com');
    expect(siteUrlHost('http://www.perfectimprints.com')).toBe('www.perfectimprints.com');
    expect(siteUrlHost('www.perfectimprints.com')).toBe('www.perfectimprints.com');
    expect(siteUrlHost('  https://www.perfectimprints.com  ')).toBe('www.perfectimprints.com');
    expect(siteUrlHost('HTTPS://WWW.PERFECTIMPRINTS.COM')).toBe('www.perfectimprints.com');
    expect(siteUrlHost('https://www.perfectimprints.com:443/')).toBe('www.perfectimprints.com');
    expect(siteUrlHost('https://dev.perfectimprints.com')).toBe('dev.perfectimprints.com');
    expect(siteUrlHost('https://dev.perfectimprints.com/some/path?x=1')).toBe(
      'dev.perfectimprints.com',
    );
  });

  it('returns null for missing, blank and unparseable values', () => {
    expect(siteUrlHost(undefined)).toBeNull();
    expect(siteUrlHost(null)).toBeNull();
    expect(siteUrlHost('')).toBeNull();
    expect(siteUrlHost('   ')).toBeNull();
    expect(siteUrlHost('https://')).toBeNull();
    expect(siteUrlHost('not a url at all')).toBeNull();
    expect(siteUrlHost('://nope')).toBeNull();
  });
});

describe('the decision', () => {
  it('PRODUCTION: the production host is indexable, in every spelling', () => {
    for (const raw of [
      PRODUCTION_URL,
      `${PRODUCTION_URL}/`,
      'http://www.perfectimprints.com',
      'www.perfectimprints.com',
      ` ${PRODUCTION_URL} `,
      'HTTPS://WWW.PERFECTIMPRINTS.COM/',
      `${PRODUCTION_URL}:443`,
    ]) {
      expect(isIndexableSiteUrl(raw), raw).toBe(true);
      expect(indexingPolicy(raw), raw).toEqual({
        indexable: true,
        reason: 'production-host',
        host: PRODUCTION_HOST,
      });
    }
  });

  it('STAGING: the staging host is not indexable, in every spelling', () => {
    for (const raw of [
      STAGING_URL,
      `${STAGING_URL}/`,
      'http://dev.perfectimprints.com',
      'dev.perfectimprints.com',
      ` ${STAGING_URL} `,
      'HTTPS://DEV.PERFECTIMPRINTS.COM',
      `${STAGING_URL}:443/`,
    ]) {
      expect(isIndexableSiteUrl(raw), raw).toBe(false);
      expect(indexingPolicy(raw), raw).toEqual({
        indexable: false,
        reason: 'non-production-host',
        host: 'dev.perfectimprints.com',
      });
    }
  });

  it('FAILS TOWARDS INDEXING: missing, empty, blank and unparseable stay indexable', () => {
    expect(indexingPolicy(undefined)).toEqual({ indexable: true, reason: 'unset', host: null });
    expect(indexingPolicy(null)).toEqual({ indexable: true, reason: 'unset', host: null });
    expect(indexingPolicy('')).toEqual({ indexable: true, reason: 'unset', host: null });
    expect(indexingPolicy('   ')).toEqual({ indexable: true, reason: 'unset', host: null });
    expect(indexingPolicy('https://')).toEqual({ indexable: true, reason: 'unparseable', host: null });
    expect(indexingPolicy('not a url')).toEqual({
      indexable: true,
      reason: 'unparseable',
      host: null,
    });
  });

  it('FAILS TOWARDS INDEXING: an unrecognised host stays indexable', () => {
    for (const raw of [
      'https://preview.perfectimprints.com',
      'https://staging.perfectimprints.com',
      'https://www.perfectimprint.com', // the production typo that must not de-index anything
      'https://perfectimprints.com',
      'http://localhost:3000',
      'https://example.com',
      'https://staging-perfectimprints.vercel.app',
    ]) {
      expect(isIndexableSiteUrl(raw), raw).toBe(true);
      expect(indexingPolicy(raw).reason, raw).toBe('unlisted-host');
    }
  });

  it('a host that merely CONTAINS the staging host is not staging', () => {
    expect(isIndexableSiteUrl('https://dev.perfectimprints.com.example.com')).toBe(true);
    expect(isIndexableSiteUrl('https://example.com/?next=https://dev.perfectimprints.com')).toBe(
      true,
    );
    expect(isIndexableSiteUrl('https://dev.perfectimprints.com@www.perfectimprints.com')).toBe(
      true,
    );
  });

  it('the host lists are well formed and can never overlap', () => {
    expect(PRODUCTION_HOST).toBe('www.perfectimprints.com');
    expect(NON_PRODUCTION_HOSTS).toContain('dev.perfectimprints.com');
    expect(NON_PRODUCTION_HOSTS).not.toContain(PRODUCTION_HOST);
    for (const h of [PRODUCTION_HOST, ...NON_PRODUCTION_HOSTS]) {
      expect(h).toBe(h.toLowerCase());
      expect(h).not.toMatch(/[:/\s]/);
    }
  });
});

describe('the layout robots metadata', () => {
  it('PRODUCTION emits exactly what it emitted before FIX-890', () => {
    expect(siteRobotsMetadata(PRODUCTION_URL)).toEqual(PRODUCTION_ROBOTS_BEFORE_FIX_890);
    expect(siteRobotsMetadata(`${PRODUCTION_URL}/`)).toEqual(PRODUCTION_ROBOTS_BEFORE_FIX_890);
    expect(siteRobotsMetadata(undefined)).toEqual(PRODUCTION_ROBOTS_BEFORE_FIX_890);
    expect(siteRobotsMetadata('')).toEqual(PRODUCTION_ROBOTS_BEFORE_FIX_890);
    expect(siteRobotsMetadata('https://preview.perfectimprints.com')).toEqual(
      PRODUCTION_ROBOTS_BEFORE_FIX_890,
    );
    const asText = JSON.stringify(siteRobotsMetadata(PRODUCTION_URL));
    expect(asText).not.toMatch(/index|follow/i);
  });

  it('STAGING emits noindex, nofollow', () => {
    expect(siteRobotsMetadata(STAGING_URL)).toEqual({ index: false, follow: false });
  });

  it('renders through the resolver Next itself uses, to the expected meta content', async () => {
    const mod = (await import('next/dist/lib/metadata/resolvers/resolve-basics.js')) as {
      resolveRobots: (r: unknown) => { basic: string | null; googleBot: string | null } | null;
    };
    expect(mod.resolveRobots(siteRobotsMetadata(PRODUCTION_URL))).toEqual({
      basic: '',
      googleBot: 'max-image-preview:large',
    });
    expect(mod.resolveRobots(siteRobotsMetadata(STAGING_URL))).toEqual({
      basic: 'noindex, nofollow',
      googleBot: null,
    });
  });
});

describe('the staging X-Robots-Tag header', () => {
  it('is absent on production and on every fail-safe input', () => {
    for (const raw of [PRODUCTION_URL, `${PRODUCTION_URL}/`, undefined, '', 'garbage', 'https://x.test']) {
      expect(nonProductionRobotsHeader(raw), String(raw)).toBeNull();
    }
  });
  it('is exactly noindex, nofollow on staging', () => {
    expect(nonProductionRobotsHeader(STAGING_URL)).toEqual({
      key: 'X-Robots-Tag',
      value: 'noindex, nofollow',
    });
  });
});

describe('app/robots.ts under each environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function robotsFor(value: string | undefined) {
    vi.resetModules();
    if (value === undefined) vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    else vi.stubEnv('NEXT_PUBLIC_SITE_URL', value);
    const mod = await import('../../app/robots');
    return mod.default();
  }

  it('PRODUCTION is exactly what it was before FIX-890', async () => {
    expect(await robotsFor(PRODUCTION_URL)).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin3773752', '/api'] },
      sitemap: 'https://www.perfectimprints.com/sitemap.xml',
      host: 'https://www.perfectimprints.com',
    });
  });

  it('an unset variable behaves as production', async () => {
    expect(await robotsFor(undefined)).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin3773752', '/api'] },
      sitemap: 'https://www.perfectimprints.com/sitemap.xml',
      host: 'https://www.perfectimprints.com',
    });
  });

  it('STAGING keeps crawling allowed and advertises no sitemap and no host', async () => {
    const r = await robotsFor(STAGING_URL);
    expect(r).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin3773752', '/api'] },
    });
    expect(r).not.toHaveProperty('sitemap');
    expect(r).not.toHaveProperty('host');
    // Never a blanket Disallow: an already-indexed host whose pages cannot be
    // crawled never has its noindex read.
    expect(JSON.stringify(r)).not.toContain('"disallow":"/"');
    expect(JSON.stringify(r)).not.toContain('"disallow":["/"');
  });
});

describe('the empty staging sitemap', () => {
  it('renders as a valid empty urlset through the resolver Next itself uses', async () => {
    const mod = (await import(
      'next/dist/build/webpack/loaders/metadata/resolve-route-data.js'
    )) as { resolveSitemap: (d: unknown[]) => string };
    const xml = mod.resolveSitemap([]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('</urlset>');
    expect(xml).not.toContain('<url>');
  });
});

describe('every consumer routes through the one module (source text)', () => {
  it('the root layout takes its robots object from siteRobotsMetadata and spells no noindex of its own', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain("import { siteRobotsMetadata } from '@/lib/seo/indexing-policy';");
    expect(layout).toContain('robots: siteRobotsMetadata(process.env.NEXT_PUBLIC_SITE_URL),');
    expect(layout).not.toMatch(/index:\s*false/);
    expect(layout).not.toMatch(/max-image-preview/); // lives in the module now, once
  });

  it('robots.txt decides through isIndexableSiteUrl and never emits a blanket Disallow', () => {
    const robots = read('app/robots.ts');
    expect(robots).toContain("import { isIndexableSiteUrl } from '@/lib/seo/indexing-policy';");
    expect(robots).toContain('if (!isIndexableSiteUrl(process.env.NEXT_PUBLIC_SITE_URL))');
    expect(robots).not.toMatch(/disallow:\s*['"]\/['"]/);
    expect(robots).not.toMatch(/disallow:\s*\[\s*['"]\/['"]/);
  });

  it('the sitemap returns [] on staging before any read', () => {
    const sitemap = read('app/sitemap.ts');
    expect(sitemap).toContain("import { isIndexableSiteUrl } from '@/lib/seo/indexing-policy';");
    const fn = sitemap.indexOf('export default async function sitemap()');
    expect(fn).toBeGreaterThan(-1);
    const body = sitemap.slice(fn);
    const guard = body.indexOf('if (!isIndexableSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)) return [];');
    expect(guard).toBeGreaterThan(-1);
    // Nothing executable between the function's opening brace and the guard
    // (line comments are allowed there; nothing else is).
    const between = body
      .slice(body.indexOf('{') + 1, guard)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'));
    expect(between).toEqual([]);
  });

  it('next.config.ts imports the header helper by relative path and adds nothing else', () => {
    const cfg = read('next.config.ts');
    expect(cfg).toContain("import { nonProductionRobotsHeader } from './lib/seo/indexing-policy';");
    expect(cfg).toContain('nonProductionRobotsHeader(process.env.NEXT_PUBLIC_SITE_URL)');
    // The staging block is conditional on the helper's result, never unconditional.
    expect(cfg).toMatch(/\.\.\.\(stagingNoindex \? \[\{ source: '\/\(\.\*\)', headers: \[stagingNoindex\] \}\] : \[\]\)/);
    // The quote route's own header is untouched.
    expect(cfg).toContain("headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }]");
  });

  it('the module itself is dependency-free (next.config.ts loads it through the require hook)', () => {
    const mod = read('lib/seo/indexing-policy.ts');
    expect(mod).not.toMatch(/^\s*import\s/m);
    expect(mod).not.toMatch(/require\(/);
  });
});

/** Every .ts/.tsx under the app's source dirs, minus tests and node_modules. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name.startsWith('.')) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (['.ts', '.tsx'].includes(extname(name)) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
  };
  for (const d of ['app', 'components', 'lib', 'sanity']) walk(resolve(root, d));
  out.push(resolve(root, 'next.config.ts'));
  return out;
}

describe('the wrong signals are not used anywhere', () => {
  it('no source file reads VERCEL_ENV or VERCEL_URL (staging is its own Vercel project)', () => {
    const offenders = sourceFiles().filter((f) => /process\.env\.VERCEL_(ENV|URL)/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('the staging host and the bare production host are spelled in the policy module only', () => {
    const policy = resolve(root, 'lib', 'seo', 'indexing-policy.ts');
    const offenders = sourceFiles()
      .filter((f) => f !== policy)
      .filter((f) => {
        const src = read(f);
        return (
          /['"`]dev\.perfectimprints\.com['"`]/.test(src) ||
          /['"`]www\.perfectimprints\.com['"`]/.test(src)
        );
      })
      .map((f) => f.slice(root.length + 1).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });
});

describe('no em dash in the files this ticket wrote', () => {
  it.each([
    'lib/seo/indexing-policy.ts',
    'lib/seo/indexing-policy.test.ts',
    'app/robots.ts',
  ])('%s', (rel) => {
    expect(read(rel)).not.toContain(String.fromCharCode(0x2014));
  });
});
