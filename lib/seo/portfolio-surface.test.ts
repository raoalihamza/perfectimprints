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
 *   - the page intro (PORT-115) is read through the tagged settings query
 *     the layout already performs, and the globalSettings webhook branch
 *     busts that tag, so publishing Global Settings refreshes /portfolio;
 *   - the client half imports NOTHING server-side (type imports only);
 *   - the embedded block (PORT-120) has ONE resolver and ONE renderer across
 *     all five hosts, every host keeps its rendering mode, the page
 *     projection is unchanged, /cat is untouched and the webhook's
 *     embedding lookup covers every host;
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
/** Line endings normalised: the working trees are CRLF on Windows, the index is LF. */
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

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
/** Server components under components/portfolio, by design (everything else there is a client file). */
const SERVER_COMPONENT_FILES = [
  'components/portfolio/PortfolioEmptyState.tsx',
  'components/portfolio/PortfolioGallerySection.tsx',
];
const CLIENT_FILES = filesUnder('components/portfolio').filter(
  (f) => !f.includes('.test.') && !SERVER_COMPONENT_FILES.includes(f),
);
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

  it('reads the page intro through the tagged, React-cached settings query and nothing else (PORT-115)', () => {
    // The ONE other Sanity read on the page. It must be the same
    // getSiteSettings() the layout Footer performs (React cache() dedupes it
    // within the render, so the page adds no fetch), which is non-CDN and
    // carries SETTINGS_TAG with revalidate: false: tagged, never no-store, so
    // the route stays static and a globalSettings publish refreshes it.
    expect(src).toContain("import { getSiteSettings } from '@/lib/sanity/queries/global-settings';");
    expect(src).toContain('getSiteSettings(),');
    expect(src).not.toMatch(/cachedClient|client\.fetch/);
    const settings = code('lib/sanity/queries/global-settings.ts');
    expect(settings).toContain('portfolioPage{ intro },');
    expect(settings).toContain('portfolioIntro: resolvePortfolioIntro(raw.portfolioPage?.intro),');
    expect(settings).toContain(
      'const SETTINGS_FETCH_OPTS = { next: { tags: [SETTINGS_TAG], revalidate: false as const } };',
    );
    expect(settings).toContain('export const getSiteSettings = cache(async');
    expect(settings).not.toContain('no-store');
    // Never in the empty state, which has its own copy.
    expect(src).toContain('const intro = tiles.length > 0 ? settings.portfolioIntro : null;');
    // Rendered through the shared richAnswer renderer, never a second one.
    expect(src).toContain("import { RichAnswer } from '@/components/portable-text/RichAnswer';");
    expect(src).toContain('<RichAnswer value={intro}');
    expect(src).not.toContain('PortableText ');
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
  it('has client files and every one is marked, and the server ones are not', () => {
    expect(CLIENT_FILES.length).toBeGreaterThanOrEqual(4);
    for (const file of CLIENT_FILES) {
      expect(read(file).startsWith("'use client';"), file).toBe(true);
    }
    for (const file of SERVER_COMPONENT_FILES) {
      expect(read(file).startsWith("'use client';"), file).toBe(false);
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

  it('a globalSettings publish reaches the page intro through SETTINGS_TAG (PORT-115)', () => {
    // The intro rides the settings read, so the mechanism is the tag bust in
    // the globalSettings branch (a tag bust invalidates every prerendered
    // route whose fetches carried the tag) with the layout-wide path
    // revalidation as the belt. Both must stay; no portfolio path is needed.
    const src = code('app/api/sanity/revalidate/route.ts');
    const branch = src.slice(src.indexOf("if (type === 'globalSettings') {"));
    const body = branch.slice(0, branch.indexOf('return NextResponse.json'));
    expect(body).toContain("revalidateTag(SETTINGS_TAG, 'max');");
    expect(body).toContain("revalidatePath('/', 'layout');");
  });

  it('the intro field is on globalSettings, never a new document type (no webhook Filter change)', () => {
    const schema = code('sanity/schemas/singletons/global-settings.ts');
    expect(schema).toContain("name: 'portfolioPage',");
    expect(schema).toContain("type: 'richAnswer',");
    expect(readdirSync(resolve(root, 'sanity/schemas/documents')).some((f) => /portfolio-?(page|intro|settings)/i.test(f))).toBe(false);
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

// ---------------------------------------------------------------------------
// PORT-120: the gallery block on five hosts, one resolver, one renderer.
// ---------------------------------------------------------------------------

const HOST_ROUTES = {
  blog: 'app/blog/[slug]/page.tsx',
  product: 'app/products/[slug]/page.tsx',
  video: 'app/videos/[slug]/page.tsx',
  catchAll: 'app/[...slug]/page.tsx',
  services: 'app/services/[slug]/page.tsx',
};
const BLOCK = 'components/portfolio/PortfolioGalleryBlock.tsx';
const SECTION = 'components/portfolio/PortfolioGallerySection.tsx';
const QUERIES = 'lib/sanity/queries/portfolio.ts';

/** Every .ts/.tsx source under app/, components/, lib/ and sanity/, tests excluded. */
function allSource(): string[] {
  return ['app', 'components', 'lib', 'sanity']
    .flatMap((dir) => filesUnder(dir))
    .filter((f) => !f.includes('.test.'));
}

function filesContaining(needle: string | RegExp, files = allSource()): string[] {
  return files
    .filter((f) => {
      const src = code(f);
      return typeof needle === 'string' ? src.includes(needle) : needle.test(src);
    })
    .sort();
}

describe('PORT-120: one resolver and one renderer serve every host', () => {
  it('the pure resolver is called from the server binding alone', () => {
    expect(filesContaining('resolvePortfolioGalleryItems(')).toEqual(['lib/portfolio/gallery.ts', QUERIES]);
  });

  it('the server binding and the tile helper are called only where the module comment says', () => {
    expect(filesContaining('resolvePortfolioGallery(')).toEqual([QUERIES]);
    expect(filesContaining('resolvePortfolioGalleryTiles(')).toEqual([SECTION, QUERIES]);
    expect(filesContaining('collectPortfolioGalleryTiles(')).toEqual([HOST_ROUTES.blog, QUERIES]);
  });

  it('the tile grid is rendered by the page browser and the block, and nothing else', () => {
    expect(filesContaining(/<PortfolioGrid\b/)).toEqual(['components/portfolio/PortfolioBrowser.tsx', BLOCK]);
    expect(filesContaining('<PortfolioLightbox')).toEqual(['components/portfolio/PortfolioBrowser.tsx', BLOCK]);
  });

  it('the block is rendered by the section and the blog body, and nothing else', () => {
    // A trailing space: the TYPE `PortfolioGalleryBlockValue` appears in a generic elsewhere.
    expect(filesContaining('<PortfolioGalleryBlock ')).toEqual(['components/blog/BlogBody.tsx', SECTION]);
  });

  it('the section is the renderer on the four fixed-position hosts and the page builder', () => {
    expect(filesContaining('<PortfolioGallerySection')).toEqual([
      HOST_ROUTES.product,
      HOST_ROUTES.video,
      'components/landing/LandingPageTemplate.tsx',
      'components/page-sections/SectionRenderer.tsx',
    ]);
    expect(code(HOST_ROUTES.product)).toContain('gallery={doc.portfolioGallery}');
    expect(code(HOST_ROUTES.product)).toContain('host="product"');
    expect(code(HOST_ROUTES.video)).toContain('gallery={video.portfolioGallery}');
    expect(code(HOST_ROUTES.video)).toContain('host="video"');
    const landing = code('components/landing/LandingPageTemplate.tsx');
    expect(landing).toContain("_type: 'portfolioGallery',");
    expect(landing).toContain("_key: 'landing-portfolio',");
    expect(landing).toContain('gallery={gallerySection} host="section" layout="section"');
    const renderer = code('components/page-sections/SectionRenderer.tsx');
    expect(renderer).toContain("case 'portfolioGallery':");
    expect(renderer).toContain('<PortfolioGallerySection gallery={section} host="section" layout="section" />');
  });

  it('the blog body renders the block from the tiles the page resolved, keyed by _key', () => {
    const body = code('components/blog/BlogBody.tsx');
    expect(body).toContain('portfolioGallery: ({ value }) => {');
    expect(body).toContain('portfolioGalleries.get(v._key)');
    expect(body).toContain('<PortfolioGalleryBlock heading={v.heading} tiles={tiles}');
    expect(code(HOST_ROUTES.blog)).toContain("collectPortfolioGalleryTiles(post.body, 'blog')");
    expect(code(HOST_ROUTES.blog)).toContain('portfolioGalleries={portfolioGalleries}');
  });

  it('the block sizes its tiles per host through the one arithmetic module', () => {
    expect(filesContaining('embeddedTileSizes(')).toEqual(['lib/portfolio/image-sizes.ts', QUERIES]);
    expect(code(QUERIES)).toContain('toPortfolioTiles(items, { sizes: embeddedTileSizes(host) })');
  });
});

describe('PORT-120: the hosts read the block as stored, and the projections say so', () => {
  it('the page projection is unchanged: a bare spread, no conditional for the gallery', () => {
    const pages = code('lib/sanity/queries/pages.ts');
    expect(pages).toContain("sections[]{\n    ...,\n    _type == 'productStrip' => {");
    expect(pages).not.toContain("_type == 'portfolioGallery'");
    expect(pages).toContain("| PortfolioGalleryPageSection;");
  });

  it('product, video and landing project the field by name, with no dereference', () => {
    expect(code('lib/sanity/queries/product-pages.ts')).toContain('\n  portfolioGallery,\n');
    expect(code('lib/sanity/queries/landing-pages.ts')).toContain('\n  portfolioGallery,\n');
    expect(code('lib/sanity/queries/videos.ts')).toContain('${SUMMARY_PROJECTION}, portfolioGallery }');
    for (const f of [
      'lib/sanity/queries/product-pages.ts',
      'lib/sanity/queries/landing-pages.ts',
      'lib/sanity/queries/videos.ts',
      'lib/sanity/queries/blogs.ts',
    ]) {
      expect(code(f), f).not.toContain('PORTFOLIO_GALLERY_PROJECTION');
      expect(code(f), f).not.toContain('portfolioGallery{');
    }
  });

  it('the server binding resolves references through tagged reads and never no-store', () => {
    const q = code(QUERIES);
    expect(q).toContain('export async function getPortfolioCategoryById(');
    expect(q).toContain('portfolioGalleryCategoryRefId(gallery)');
    expect(q).toContain('portfolioGalleryItemRefIds(gallery)');
    expect(q).toContain('await getPortfolioItemsByIds(refIds)');
    expect(q).not.toContain('no-store');
    expect((q.match(/opts\(/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(code(SECTION)).not.toContain('no-store');
    expect(code(SECTION)).not.toContain('searchParams');
  });

  it('the block type is registered once, through the page sections, and placed on four documents', () => {
    const sections = code('sanity/schemas/objects/page-sections.ts');
    expect(sections).toContain("import portfolioGallery from './portfolio-gallery';");
    expect(sections).toMatch(/productStrip,\n\s+portfolioGallery,\n\];/);
    const index = code('sanity/schemas/index.ts');
    expect(index).not.toContain("from './objects/portfolio-gallery'");
    expect(index).not.toMatch(/^\s+portfolioGallery,$/m);
    expect(code('sanity/schemas/documents/blog-post.ts')).toContain("{ type: 'portfolioGallery' },");
    for (const f of [
      'sanity/schemas/documents/product-page.ts',
      'sanity/schemas/documents/video.ts',
      'sanity/schemas/documents/landing-page.ts',
    ]) {
      const src = code(f);
      expect(src, f).toContain("name: 'portfolioGallery',");
      expect(src, f).toContain("type: 'portfolioGallery',");
    }
    // No new document type: the block is an object on existing types only.
    expect(readdirSync(resolve(root, 'sanity/schemas/documents')).some((f) => /gallery/i.test(f))).toBe(false);
  });
});

describe('PORT-120: every host keeps its rendering mode and its client boundary', () => {
  it('the five host routes stay on-demand or prebuilt static, reading no dynamic API', () => {
    for (const file of Object.values(HOST_ROUTES)) {
      const src = code(file);
      expect(src, file).toContain('export const dynamicParams = true;');
      expect(src, file).toContain('export const revalidate = false;');
      expect(src, file).not.toContain('searchParams');
      expect(src, file).not.toContain('no-store');
      expect(src, file).not.toMatch(/\b(headers|cookies)\(\)/);
    }
  });

  it('the block, the section and the body renderer never read the URL during render', () => {
    for (const file of [BLOCK, SECTION, 'components/blog/BlogBody.tsx', 'components/landing/LandingPageTemplate.tsx']) {
      const src = code(file);
      expect(src, file).not.toContain('useSearchParams');
      expect(src, file).not.toContain('next/navigation');
    }
  });

  it('the block is a client component that takes plain tiles and imports nothing server-side', () => {
    const src = code(BLOCK);
    expect(read(BLOCK).startsWith("'use client';")).toBe(true);
    expect(src).toMatch(/import type \{ PortfolioTile \} from '@\/lib\/portfolio\/tile-data';/);
    expect(src).toContain('if (tiles.length === 0) return null;');
    expect(src).toContain('eagerCount={0}');
  });

  it('the section is the client boundary: it resolves on the server and passes props', () => {
    const src = code(SECTION);
    expect(src).toContain("from '@/lib/sanity/queries/portfolio'");
    expect(src).toContain('if (tiles.length === 0) return null;');
    expect(src).toContain('<PortfolioGalleryBlock heading={gallery.heading} tiles={tiles}');
  });
});

describe('PORT-120: freshness and the boundaries', () => {
  it('the webhook embedding lookup covers all five hosts and busts the blog tag', () => {
    const src = code('app/api/sanity/revalidate/route.ts');
    const lookup = src.slice(src.indexOf('async function findEmbeddingContentDocs('));
    expect(lookup).toContain(
      '`*[_type in ["blogPost", "page", "landingPage", "video", "catalogPage", "productPage"] && references($id)]',
    );
    const bust = src.slice(src.indexOf('function bustEmbeddingContentDocs('));
    expect(bust).toContain("case 'blogPost':\n        bustTag(blogPostTag(d.slug));");
    for (const t of ['video', 'landingPage', 'page', 'productPage']) {
      expect(bust).toContain(`case '${t}':`);
    }
    const branch = src.slice(src.indexOf("if (type === 'portfolioItem' || type === 'portfolioCategory')"));
    const body = branch.slice(0, branch.indexOf('return NextResponse.json'));
    expect(body).toContain("revalidateTag(PORTFOLIO_TAG, 'max');");
    expect(body).toContain('findEmbeddingContentDocs(payload._id, undefined)');
  });

  it('category pages are untouched: nothing under app/cat or components/category mentions the portfolio', () => {
    for (const file of [...filesUnder('app/cat'), ...filesUnder('components/category')]) {
      expect(read(file).toLowerCase(), file).not.toContain('portfolio');
    }
  });

  it('no route or link for an individual portfolio item exists', () => {
    expect(readdirSync(resolve(root, 'app/portfolio'))).not.toContain('[slug]');
    expect(filesContaining(/\/portfolio\/\$\{/)).toEqual([]);
    expect(code(BLOCK)).toContain('href="/portfolio"');
  });

  it('no em dash in the files this ticket created', () => {
    for (const file of [BLOCK, SECTION, 'components/portfolio/PortfolioGalleryBlock.test.tsx']) {
      expect(read(file).includes(EM_DASH), file).toBe(false);
    }
  });
});

describe('FIX-861: an untouched gallery block is invisible to validation, on every surface', () => {
  const SCHEMA = 'sanity/schemas/objects/portfolio-gallery.ts';
  const RULES = 'sanity/schemas/objects/portfolio-gallery-rules.ts';
  const RULES_TEST = 'sanity/schemas/objects/portfolio-gallery-rules.test.ts';

  it('no field of the block carries an initial value or a required rule', () => {
    // The block is a document FIELD on three types as well as an array member.
    // Sanity resolves an initialValue into every object field on document
    // creation, so any default here is written into every new product page and
    // video, and the block's own rules then block Publish on a gallery nobody
    // opened. That is the PORT-120 defect. An untouched block must stay absent.
    const src = code(SCHEMA);
    expect(src).not.toContain('initialValue');
    expect(src).not.toContain('required()');
  });

  it('both conditional rules delegate to the pure rules module, which imports nothing', () => {
    const src = code(SCHEMA);
    expect(src).toContain("from './portfolio-gallery-rules';");
    expect(src).toContain('portfolioGalleryItemsProblem(ctx.parent)');
    expect(src).toContain('portfolioGalleryCategoryProblem(ctx.parent)');
    expect(code(RULES)).not.toMatch(/^\s*import\b/m);
    expect(code(RULES)).not.toMatch(/\brequire\(/);
  });

  it('the rule is defined once: no other schema file re-implements a gallery check', () => {
    // The five surfaces reference ONE object type (asserted above), so a
    // field host and a page section cannot validate differently; this pins
    // that no host grew its own copy of the rule.
    for (const f of filesUnder('sanity/schemas').filter((f) => !f.includes('portfolio-gallery'))) {
      expect(code(f), f).not.toMatch(/portfolioGallery(Items|Category)Problem|galleryIsStarted/);
    }
  });

  it('no em dash in the files this fix touched', () => {
    for (const file of [SCHEMA, RULES, RULES_TEST]) {
      expect(read(file).includes(EM_DASH), file).toBe(false);
    }
  });
});
