/**
 * PORT-110: the /portfolio route's contracts, checked as source text because
 * a Next route and its server page cannot be imported under vitest. Each one
 * is something that passed typecheck and broke a deployment before:
 *   - the route stays static: no searchParams, no useSearchParams, no
 *     no-store, revalidate = false (the /cat CSR-bailout lesson);
 *   - the canonical is the clean URL and indexability follows the data;
 *   - the SEO image paths never carry `auto=format` (IMG-120) and the
 *     shared IMG-110 helper is called, not re-implemented;
 *   - ProductPageGallery is neither imported nor modified for this page;
 *   - the webhook refreshes the sitemap alongside the page;
 *   - the client half imports NOTHING server-side (type imports only);
 *   - no em dash anywhere in the files this ticket wrote.
 *
 * Prohibitions are checked against source with comments removed, because
 * the files document what they avoid by naming it (the same reason
 * image-metadata.test.ts strips comments). Requirements are checked against
 * the raw source.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

/** Source without `//` and block comments; string and template literals are kept intact. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      out += quote;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** A JSX block comment inside braces survives the stripper as empty braces; harmless here. */
const code = (rel: string) => stripComments(read(rel));

function filesUnder(dir: string): string[] {
  const base = resolve(root, dir);
  return (readdirSync(base, { recursive: true }) as string[])
    .filter((name) => ['.ts', '.tsx'].includes(extname(name)))
    .map((name) => join(dir, name).split(sep).join('/'));
}

const ROUTE = 'app/portfolio/page.tsx';
const CLIENT_FILES = filesUnder('components/portfolio').filter((f) => !f.includes('.test.'));
const LIB_FILES = filesUnder('lib/portfolio').filter((f) => !f.includes('.test.'));
const TICKET_FILES = [
  ROUTE,
  ...filesUnder('components/portfolio'),
  ...filesUnder('lib/portfolio'),
  'lib/seo/portfolio-surface.test.ts',
  'lib/deals-filter.ts',
  'components/deals/ClientPagination.tsx',
];
const EM_DASH = '\u2014';

describe('the /portfolio route is static by contract', () => {
  const raw = read(ROUTE);
  const src = code(ROUTE);

  it('declares itself static and never self-refreshing', () => {
    expect(src).toContain("export const dynamic = 'force-static';");
    expect(src).toContain('export const revalidate = false;');
  });

  it('reads no searchParams and no dynamic request API', () => {
    expect(src).not.toContain('searchParams');
    expect(src).not.toMatch(/\b(headers|cookies)\(\)/);
    expect(src).not.toContain('no-store');
  });

  it('reads Sanity only through the tagged portfolio query module, with the THROWING reads', () => {
    expect(src).toContain("from '@/lib/sanity/queries/portfolio'");
    expect(src).not.toMatch(/from '@\/lib\/sanity\/client'/);
    // An outage must not be mistaken for an empty portfolio (which means
    // noindex): the page uses the reads that throw, never the forgiving ones.
    expect(src).toContain('getAllPortfolioItemsOrThrow()');
    expect(src).toContain('getAllPortfolioCategoriesOrThrow()');
    expect(src).not.toMatch(/getAllPortfolioItems\(\)/);
    expect(src).not.toMatch(/getAllPortfolioCategories\(\)/);
    const queries = code('lib/sanity/queries/portfolio.ts');
    expect(queries).toContain('revalidate: false as const');
    expect(queries).not.toContain('no-store');
    expect(queries).toContain('PORTFOLIO_TAG');
  });

  it('canonicalises to the clean URL and makes indexability follow the data', () => {
    expect(src).toContain('alternates: { canonical: PORTFOLIO_URL }');
    expect(src).toContain("const PORTFOLIO_PATH = '/portfolio';");
    expect(src).toContain('tiles.length === 0 ? { robots: { index: false, follow: true } } : {}');
  });

  it('calls the shared IMG-110 helper for its social image rather than sizing its own', () => {
    expect(src).toContain('largeSocialImage(portfolioRepresentativeImage(items))');
    expect(src).toContain("from '@/lib/seo/open-graph'");
  });

  it('emits CollectionPage only with items, and nothing else of its own', () => {
    expect(src).toContain('collectionPageSchema(');
    expect(src).toContain('{tiles.length > 0 ? (');
    expect(src).not.toContain('ItemList');
    expect(src).not.toContain('ImageObject');
    expect(src).not.toMatch(/'@type'/);
  });

  it('carries the static-contract header comment', () => {
    expect(raw).toContain('STATIC BY CONTRACT');
    expect(raw).toContain('useSearchParams()');
  });
});

describe('the client half stays on its side of the boundary', () => {
  it('has client files and every one is marked', () => {
    expect(CLIENT_FILES.length).toBeGreaterThanOrEqual(3);
    for (const file of CLIENT_FILES) {
      if (file.endsWith('PortfolioEmptyState.tsx')) continue; // server component, by design
      expect(read(file).startsWith("'use client';")).toBe(true);
    }
  });

  it('never reads the URL during render, including the shared client components the route mounts', () => {
    // The route's real client tree is components/portfolio PLUS the shared
    // deals sidebar / pagination and the category FilterSection it reuses. A
    // useSearchParams() added to any of those would reach /portfolio.
    const mounted = [
      ...CLIENT_FILES,
      'components/deals/DealsFilterSidebar.tsx',
      'components/deals/ClientPagination.tsx',
      'components/category/FilterSection.tsx',
    ];
    for (const file of mounted) {
      const src = code(file);
      expect(src, file).not.toContain('useSearchParams');
      expect(src, file).not.toContain('next/navigation');
    }
  });

  it('imports nothing that touches Sanity, the filesystem or server-only code', () => {
    for (const file of CLIENT_FILES) {
      const src = code(file);
      const valueImports = [...src.matchAll(/^import (?!type )[^;]*from '([^']+)';/gm)].map((m) => m[1]);
      for (const spec of valueImports) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/sanity|tile-data|node:|server-only|categories/);
      }
      // The tile shape crosses the boundary as a TYPE only.
      if (src.includes('tile-data')) {
        expect(src).toMatch(/import type \{[^}]*PortfolioTile[^}]*\} from '@\/lib\/portfolio\/tile-data';/);
      }
    }
  });

  it('does not import ProductPageGallery', () => {
    for (const file of [...CLIENT_FILES, ROUTE]) {
      expect(code(file), file).not.toMatch(/ProductPageGallery/);
    }
  });

  it('reuses the deals sidebar, pagination and facet rule rather than forking them', () => {
    const browser = code('components/portfolio/PortfolioBrowser.tsx');
    expect(browser).toContain("from '@/components/deals/DealsFilterSidebar'");
    expect(browser).toContain("from '@/components/deals/ClientPagination'");
    expect(browser).toContain('applyFacetFilters(tiles, sections, filterState, (t) => t.id)');
    expect(code('lib/deals-filter.ts')).toContain(
      'return applyFacetFilters(products, facets, state, (p) => p.sku);',
    );
    expect(CLIENT_FILES.some((f) => /Sidebar|Pagination/.test(f))).toBe(false);
  });

  it('writes the URL with the history API, and reads it after mount', () => {
    const browser = code('components/portfolio/PortfolioBrowser.tsx');
    expect(browser).toContain('window.history.pushState(null');
    expect(browser).toContain("window.addEventListener('popstate', read)");
    expect(browser).toContain('portfolioFilterStateFromSearch(window.location.search, sections)');
  });
});

describe('the SEO image surfaces', () => {
  it('the sitemap uses the plain-builder helper and lists the page only with items', () => {
    const sitemap = code('app/sitemap.ts');
    expect(sitemap).toContain("from '@/lib/portfolio/tile-data'");
    expect(sitemap).toContain('portfolioSitemapImages(items)');
    expect(sitemap).toContain('if (items.length === 0) return null;');
    expect(sitemap).toContain('portfolio.images.map(xmlEscape)');
    // Never a fixed STATIC_PATHS entry: the listing must follow the data.
    expect(sitemap).not.toMatch(/^\s*'\/portfolio',\s*$/m);
  });

  it('the tile mapper separates rendered URLs from SEO URLs', () => {
    const src = code('lib/portfolio/tile-data.ts');
    expect(src).toContain("urlForRenderImage(image).width(width).height(width).fit('crop')");
    expect(src).toContain("urlForRenderImage(image).width(width).fit('max')");
    expect(src).toContain("buildImageUrl(item.image, (b) => b.width(400).fit('max'))");
    expect(src).toContain("buildImageUrl(item.image, (b) => b.width(1200).fit('max'))");
    expect(src).not.toContain('buildRenderImageUrl');
  });

  it('the shared helpers were not edited for this page', () => {
    expect(read('lib/seo/open-graph.ts')).not.toMatch(/portfolio/i);
    expect(read('components/products/ProductPageGallery.tsx')).not.toMatch(/portfolio/i);
  });
});

describe('the webhook refreshes the page and the sitemap together', () => {
  it('revalidates /sitemap.xml in the portfolio branch', () => {
    const src = code('app/api/sanity/revalidate/route.ts');
    const branch = src.slice(src.indexOf("if (type === 'portfolioItem' || type === 'portfolioCategory')"));
    const body = branch.slice(0, branch.indexOf('return NextResponse.json'));
    expect(body).toContain("const paths = ['/portfolio', '/sitemap.xml'];");
    expect(body).toContain('for (const p of paths) revalidatePath(p);');
  });
});

describe('house rules', () => {
  it('no path segment under the route or components begins with an underscore', () => {
    for (const file of [ROUTE, ...CLIENT_FILES, ...LIB_FILES]) {
      for (const segment of file.split('/')) expect(segment.startsWith('_'), file).toBe(false);
    }
  });

  /**
   * Scoped to the files this ticket CREATED plus the two shared files it
   * rewrote in full. app/sitemap.ts, the webhook route, lib/reserved-slugs.ts
   * and DealsFilterSidebar.tsx were also edited, but each carries em dashes
   * from earlier tickets outside the PORT-110 hunks; those hunks were checked
   * by diff, which a whole-file scan cannot express.
   */
  it('no em dash in any file this ticket created', () => {
    for (const file of TICKET_FILES) {
      expect(read(file).includes(EM_DASH), file).toBe(false);
    }
  });
});
