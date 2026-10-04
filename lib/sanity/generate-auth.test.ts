/**
 * FIX-850 structural guard: every AI generate route carries the Studio nonce
 * check, and every Studio action that calls one supplies the nonce.
 *
 * These are source-level assertions, the same idiom as
 * lib/seo/product-surfaces.test.ts: a route added without the guard, an
 * action that goes back to a bare fetch, or a drift between the doc id the
 * routes verify and the one the Studio writes all fail here rather than in
 * production, where the failure mode is a silently open route (the AUTO-000
 * finding) or a Generate button that 401s for Patrick.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GENERATE_AUTH_DOC_ID,
  GENERATE_AUTH_DOC_TYPE,
  GENERATE_NONCE_HEADER,
} from './generate-auth';

const ROOT = join(__dirname, '..', '..');
const ROUTES_DIR = join(ROOT, 'app', 'api', 'sanity');
const ACTIONS_DIR = join(ROOT, 'sanity', 'actions');
const HOOK_PATH = join(ROOT, 'sanity', 'components', 'useGenerateAuthFetch.ts');

function generateRouteFiles(): string[] {
  return readdirSync(ROUTES_DIR)
    .filter((name) => name.startsWith('generate-'))
    .map((name) => join(ROUTES_DIR, name, 'route.ts'))
    .filter((file) => statSync(file).isFile())
    .sort();
}

function generateActionFiles(): string[] {
  return readdirSync(ACTIONS_DIR)
    .filter((name) => name.startsWith('generate-') && name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
    .map((name) => join(ACTIONS_DIR, name))
    .sort();
}

const read = (file: string) => readFileSync(file, 'utf8');

describe('FIX-850 shared constants', () => {
  it('names a DRAFT handshake document, as verifyStudioNonce requires', () => {
    expect(GENERATE_AUTH_DOC_ID.startsWith('drafts.')).toBe(true);
    expect(GENERATE_AUTH_DOC_ID.slice('drafts.'.length)).toBe(GENERATE_AUTH_DOC_TYPE);
  });

  it('uses a lowercase custom header distinct from the other two panels', () => {
    expect(GENERATE_NONCE_HEADER).toBe(GENERATE_NONCE_HEADER.toLowerCase());
    expect(GENERATE_NONCE_HEADER.startsWith('x-')).toBe(true);
    expect(GENERATE_NONCE_HEADER).not.toBe('x-refresh-nonce');
    expect(GENERATE_NONCE_HEADER).not.toBe('x-import-nonce');
    expect(GENERATE_AUTH_DOC_ID).not.toBe('drafts.siteRefreshAuth');
    expect(GENERATE_AUTH_DOC_ID).not.toBe('drafts.bulkImportAuth');
  });
});

describe('FIX-850 generate routes', () => {
  const routes = generateRouteFiles();

  it('finds the ten generate routes (eight FIX-850 + generate-portfolio, PORT-170 + generate-blog-image, AUTO-202)', () => {
    // Sorted by full path: the hyphen of "-image" sorts before the path separator.
    expect(routes.map((f) => basename(dirname(f)))).toEqual([
      'generate-blog-image',
      'generate-blog',
      'generate-catalog',
      'generate-content',
      'generate-landing',
      'generate-page',
      'generate-portfolio',
      'generate-product',
      'generate-schema',
      'generate-video',
    ]);
  });

  for (const file of routes) {
    const name = basename(dirname(file));

    it(`${name}: verifies the Studio nonce with the shared helper and constants`, () => {
      const src = read(file);
      expect(src).toContain("from '@/lib/sanity/studio-nonce-auth'");
      expect(src).toContain("from '@/lib/sanity/generate-auth'");
      expect(src).toMatch(
        /verifyStudioNonce\(request, \{\s*authDocId: GENERATE_AUTH_DOC_ID,\s*headerName: GENERATE_NONCE_HEADER,\s*\}\)/,
      );
      // Rejection returns the helper's own status (401 / 403 / 500), never a
      // status picked by the route.
      expect(src).toContain('{ status: auth.status }');
    });

    it(`${name}: the guard runs before the body is read or any key is checked`, () => {
      const src = read(file);
      const postStart = src.indexOf('export async function POST(request: Request) {');
      expect(postStart).toBeGreaterThan(-1);
      const body = src.slice(postStart);
      const guardAt = body.indexOf('verifyStudioNonce(request');
      expect(guardAt).toBeGreaterThan(-1);
      for (const marker of [
        'request.json()',
        'DEEPSEEK_API_KEY',
        'GOOGLE_GEMINI_API_KEY',
        'generateJson(',
        'generateJsonFromImage(',
        'generateLandingContent(',
      ]) {
        const at = body.indexOf(marker);
        if (at !== -1) expect(at).toBeGreaterThan(guardAt);
      }
    });
  }
});

describe('AUTO-110 blog-topics route carries the identical guard', () => {
  const file = join(ROUTES_DIR, 'blog-topics', 'route.ts');
  const src = read(file);

  it('verifies the Studio nonce with the shared helper and constants, returning the helper status', () => {
    expect(src).toContain("from '@/lib/sanity/studio-nonce-auth'");
    expect(src).toContain("from '@/lib/sanity/generate-auth'");
    expect(src).toMatch(
      /verifyStudioNonce\(request, \{\s*authDocId: GENERATE_AUTH_DOC_ID,\s*headerName: GENERATE_NONCE_HEADER,\s*\}\)/,
    );
    expect(src).toContain('{ status: auth.status }');
  });

  it('the guard runs before the body is read and before any call to Google or the cache', () => {
    const postStart = src.indexOf('export async function POST(request: Request) {');
    expect(postStart).toBeGreaterThan(-1);
    const body = src.slice(postStart);
    const guardAt = body.indexOf('verifyStudioNonce(request');
    expect(guardAt).toBeGreaterThan(-1);
    for (const marker of ['request.json()', 'getCachedTopicPoolSnapshot(', 'revalidateTag(', 'getSiteSettings(', 'readWrittenTopicSources(']) {
      const at = body.indexOf(marker);
      expect(at, marker).toBeGreaterThan(guardAt);
    }
  });

  it('sets an explicit maxDuration and is nodejs + force-dynamic', () => {
    expect(src).toMatch(/export const maxDuration = \d+;/);
    expect(src).toContain("export const runtime = 'nodejs';");
    expect(src).toContain("export const dynamic = 'force-dynamic';");
  });

  it('never reads the key itself; only the client module does', () => {
    expect(src).not.toContain('process.env.GSC_SERVICE_ACCOUNT_JSON_B64');
    const readers = readdirSync(join(ROOT, 'lib', 'blog-automation'))
      .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
      .filter((n) => read(join(ROOT, 'lib', 'blog-automation', n)).includes('process.env.GSC_SERVICE_ACCOUNT_JSON_B64'));
    expect(readers).toEqual(['build-topic-pool.ts']);
  });

  it('the Studio panel calls the route through useGenerateAuthFetch, never a bare fetch', () => {
    const tool = read(join(ROOT, 'sanity', 'tools', 'blog-topics-tool.tsx'));
    expect(tool).toContain("from '../components/useGenerateAuthFetch'");
    expect(tool).toContain('const authFetch = useGenerateAuthFetch();');
    expect(tool).not.toMatch(/[^a-zA-Z]fetch\('\/api\/sanity\//);
    // AUTO-201: it generates through this route's `generate` action (the one
    // server-side function), never the generate-blog route and never a
    // browser-side create; lib/blog-automation/generation-path.test.ts holds
    // the full rule.
    expect(tool).toContain("action: 'generate'");
    expect(tool).not.toContain("'/api/sanity/generate-blog'");
    // It never imports the server-side builder or the cache into the Studio bundle.
    expect(tool).not.toContain('build-topic-pool');
    expect(tool).not.toContain('cached-topic-pool');
    expect(tool).not.toContain('gsc-client');
  });
});

describe('FIX-850 Studio actions', () => {
  const actions = generateActionFiles();

  it('finds one action per route', () => {
    expect(actions).toHaveLength(generateRouteFiles().length);
  });

  for (const file of actions) {
    const name = basename(file);

    it(`${name}: calls its route through useGenerateAuthFetch, never a bare fetch`, () => {
      const src = read(file);
      expect(src).toContain("from '../components/useGenerateAuthFetch'");
      expect(src).toContain('const authFetch = useGenerateAuthFetch();');
      expect(src).toMatch(/authFetch\('\/api\/sanity\/generate-[a-z-]+'/);
      expect(src).not.toMatch(/[^a-zA-Z]fetch\('\/api\/sanity\/generate-/);
    });
  }

  it('the hook writes the same doc id + type the routes verify and sends the same header', () => {
    const src = read(HOOK_PATH);
    expect(src).toContain("from '../../lib/sanity/generate-auth'");
    expect(src).toContain('_id: GENERATE_AUTH_DOC_ID');
    expect(src).toContain('_type: GENERATE_AUTH_DOC_TYPE');
    expect(src).toContain('[GENERATE_NONCE_HEADER]: nonce');
    // Re-handshake once on a 401, the Site Refresh / Bulk Upload behaviour.
    expect(src).toContain('res.status === 401');
    // Never imports the server helper (node:crypto would break the Studio bundle).
    expect(src).not.toContain('studio-nonce-auth');
  });

  it('the handshake doc type is not a registered schema type (the siteRefreshAuth precedent)', () => {
    const index = read(join(ROOT, 'sanity', 'schemas', 'index.ts'));
    expect(index).not.toContain(`'${GENERATE_AUTH_DOC_TYPE}'`);
  });
});
