/**
 * SNIP-170, revised by SNIP-172: what this site is willing to say about an
 * image, and what it will never say. This file exists so neither half can be
 * changed by accident - not the credit that is emitted, and not the three
 * fields that must never be.
 *
 * THE FEATURE. Google's image metadata structured data
 * (developers.google.com/search/docs/appearance/structured-data/image-license-metadata,
 * read 2026-08-28) is an `ImageObject` requiring `contentUrl` PLUS at least one
 * of `creator`, `creditText`, `copyrightNotice` or `license`. Its documented
 * benefit is display only: "Google Images can show more details about the
 * image, such as who the creator is, how people can use an image, and credit
 * information", and Google states plainly that it "does not guarantee that
 * structured data or IPTC photo metadata will show up in search results".
 *
 * WHAT SNIP-170 GOT RIGHT AND KEEPS. Patrick's account of these images,
 * verbatim: "With a majority of the images, they come from the individual
 * suppliers. Distributors like me and Geiger have permission to use them on our
 * side or for presentations", and "I don't want people approaching me about
 * licensing images." Permission to USE is not ownership. So:
 *
 *  - `creator` would claim Perfect Imprints produced a supplier's photograph.
 *  - `copyrightNotice` would assert intellectual property the business has
 *    explicitly disclaimed, and on the one Adobe Stock blog header it would
 *    contradict a paid licence.
 *  - `license` is the Licensable badge trigger ("you must include the `license`
 *    property for your image to be eligible to be shown with the Licensable
 *    badge"), and the badge exists to invite the enquiries Patrick declined.
 *    We also could not grant rights in an image we do not own.
 *
 * Those three are NEVER emitted, anywhere, on any surface, for any group. The
 * source scans below are what enforce that.
 *
 * WHAT SNIP-172 REVISED. `creditText` is not an ownership claim. Google defines
 * it as "the name of the person and/or organization that is credited for the
 * image when it's published", and their own example is a bare organisation
 * name. Every scraped product photograph is served by Geiger from Geiger's own
 * host - 9,602 of 9,602 measured across all five catalog data files - and
 * Perfect Imprints hot-links them as an authorised Geiger distributor. So
 * "credited to Geiger" is checkable from the URL and claims nothing about
 * authorship or ownership. It is derived from the host, never from a stored
 * field, so it cannot drift and it fails safe.
 *
 * Everything not served by Geiger keeps the plain URL string it always had,
 * because no true credit exists for it: Patrick's own uploads are supplier
 * catalogue assets by every available signal (SNIP-171), and nothing in Sanity
 * records a source for any of the 2,290 image assets in the dataset.
 *
 * Google's structured data policies say the same thing from the other side
 * (developers.google.com/search/docs/appearance/structured-data/sd-policies,
 * read 2026-08-28): "Don't use structured data to deceive or mislead users.
 * Don't impersonate any person or organization, or misrepresent your ownership,
 * affiliation, or primary purpose."
 *
 * WEIGHT IS NOT THE REASON FOR ANY OF THIS and must not be offered as one. The
 * full five-field upgrade was measured at about 290 bytes per item raw and
 * under 0.4 KB gzip per document; the credit that shipped is smaller again.
 * The reason is honesty.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GeigerProduct } from '../product-types';
import { GEIGER_IMAGE_CREDIT, imageCreditFor, schemaImage } from './image-credit';
import {
  aggregatorItemListSchema,
  productItemListSchema,
  productListItem,
} from './product-list-schema';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

/**
 * The qualifying properties that make a claim about ownership or usage terms,
 * plus the badge link. None may appear in emitted markup or in any rendered
 * source file. `creator` is checked separately below, because it is also a
 * legitimate X card property. `creditText` is deliberately absent from every
 * one of these lists - it is the one that ships.
 */
const FORBIDDEN_FIELDS = ['copyrightNotice', 'acquireLicensePage'] as const;

/** A Geiger-served catalog image, upsized exactly as the serializer does. */
const GEIGER_IMAGE_1200 =
  'https://imgsirv.geiger.com/image.jpg?format=webp&thumbnail=1200&w=1200&h=1200';

/** One of Patrick's own uploads, as it reaches a listing page. */
const OWN_IMAGE = 'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1500.jpg?w=400';

function catalogProduct(overrides: Partial<GeigerProduct> = {}): GeigerProduct {
  return {
    sku: '501014 90A',
    name: 'Vinyl Football',
    brand: 'BIC Graphic',
    low_price: 1.52,
    high_price: 2.84,
    msrp: 2.84,
    min_qty: 100,
    imageUrl: 'https://imgsirv.geiger.com/image.jpg?format=webp&thumbnail=275&w=275&h=275',
    description: null,
    category_paths: [],
    badges: [],
    is_new_item: false,
    is_on_sale: false,
    product_type_unigram: null,
    geiger_url: 'https://www.geiger.com/p/vinyl-football-510336?pid=208667',
    ...overrides,
  } as GeigerProduct;
}

/** One of Patrick's own product pages as it reaches a listing page. */
function ownProduct(overrides: Partial<GeigerProduct> = {}): GeigerProduct {
  return catalogProduct({
    sku: 'custom-abc123',
    name: '1785 Illini Cap',
    imageUrl: OWN_IMAGE,
    detailUrl: '/products/1785-illini',
    ...overrides,
  } as Partial<GeigerProduct>);
}

/**
 * Source with comments removed, so the scan below reads what a file EMITS and
 * not what it says about what it does not emit. This matters immediately:
 * image-credit.ts and product-list-schema.ts document this decision by naming
 * the very fields they refuse to emit, and a naive text scan flags their own
 * reasoning.
 *
 * String and template literals are tracked so that a `//` inside a URL cannot
 * swallow the rest of a line, which would silently weaken the guard rather
 * than break it. Regex literals are not tracked, because a `/` division or a
 * regex cannot introduce one of the identifiers being searched for.
 */
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

/**
 * Every `.ts`/`.tsx` file the site renders from, minus this file (which names
 * the forbidden fields in order to forbid them) and minus the other tests,
 * which are free to describe what is not emitted.
 */
function sourceFiles(): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of ['app', 'components', 'lib']) {
    const base = resolve(root, dir);
    for (const name of readdirSync(base, { recursive: true }) as string[]) {
      const rel = join(dir, name);
      if (!['.ts', '.tsx'].includes(extname(rel))) continue;
      if (rel.includes('.test.')) continue;
      const key = rel.split(sep).join('/');
      out.set(key, stripComments(read(key)));
    }
  }
  return out;
}

/** Paths whose source matches `predicate`, sorted so a failure reads cleanly. */
function offending(
  files: Map<string, string>,
  predicate: (src: string) => boolean,
): string[] {
  return [...files].filter(([, src]) => predicate(src)).map(([path]) => path).sort();
}

describe('the credit rule names Geiger, and only where Geiger actually serves the image', () => {
  it.each([
    'https://imgsirv.geiger.com/master/105589/web/105589_1.jpg?format=webp&w=275',
    'https://imgsirv.geiger.com/x.jpg',
    'https://patrickblack.geiger.com/media/x.jpg',
    'https://geiger.com/x.jpg',
    'HTTPS://IMGSIRV.GEIGER.COM/X.JPG',
  ])('credits Geiger for %s', (url) => {
    expect(imageCreditFor(url)).toBe(GEIGER_IMAGE_CREDIT);
  });

  it.each([
    ['one of the uploads Patrick owns', OWN_IMAGE],
    ['a video thumbnail', 'https://img.youtube.com/vi/abc/hqdefault.jpg'],
    ['the site own mark', 'https://www.perfectimprints.com/logo.svg'],
    ['a self-hosted brand logo', 'https://www.perfectimprints.com/brand-logos/bic.webp'],
    ['a look-alike host', 'https://imgsirv.geiger.com.evil.test/x.jpg'],
    ['a host that merely ends in geiger.com text', 'https://notgeiger.com/x.jpg'],
    ['the host hidden in a query string', 'https://evil.test/?x=imgsirv.geiger.com'],
    ['the host hidden in userinfo', 'https://imgsirv.geiger.com@evil.test/x.jpg'],
    ['the host hidden in a path', 'https://evil.test/imgsirv.geiger.com/x.jpg'],
    ['a relative path', '/placeholder-product.svg'],
    ['a non-URL', 'not a url at all'],
    ['an empty string', ''],
  ])('credits nobody for %s', (_label, url) => {
    expect(imageCreditFor(url)).toBeNull();
  });

  it('credits nobody for a missing image', () => {
    expect(imageCreditFor(null)).toBeNull();
    expect(imageCreditFor(undefined)).toBeNull();
  });

  it('returns the plain URL string when there is no credit, never a bare ImageObject', () => {
    const value = schemaImage(OWN_IMAGE);
    expect(typeof value).toBe('string');
    expect(value).toBe(OWN_IMAGE);
  });

  it('returns exactly contentUrl and creditText when there is a credit, and nothing more', () => {
    const value = schemaImage(GEIGER_IMAGE_1200) as unknown as Record<string, unknown>;
    expect(Object.keys(value).sort()).toEqual(['@type', 'contentUrl', 'creditText']);
    expect(value).toEqual({
      '@type': 'ImageObject',
      contentUrl: GEIGER_IMAGE_1200,
      creditText: 'Geiger',
    });
  });

  it('returns null for a missing image so the caller omits the property', () => {
    expect(schemaImage(null)).toBeNull();
    expect(schemaImage('')).toBeNull();
  });
});

describe('the product serializer credits an image, it does not license one', () => {
  it('emits a Geiger catalog image as a credited ImageObject at the 1200px variant', () => {
    const item = productListItem(catalogProduct(), 1)!.item as Record<string, unknown>;
    expect(item.image).toEqual({
      '@type': 'ImageObject',
      contentUrl: GEIGER_IMAGE_1200,
      creditText: 'Geiger',
    });
  });

  it('leaves one of the images Patrick uploaded as a plain URL string', () => {
    const item = productListItem(ownProduct(), 1)!.item as Record<string, unknown>;
    expect(typeof item.image).toBe('string');
    expect(item.image).toBe(OWN_IMAGE);
  });

  it.each(FORBIDDEN_FIELDS)('never emits %s on a product entity', (field) => {
    const item = productListItem(catalogProduct(), 1)!.item as Record<string, unknown>;
    expect(JSON.stringify(item)).not.toContain(field);
  });

  it('carries no forbidden field anywhere in a whole rendered page of products', () => {
    const page = productItemListSchema([
      catalogProduct(),
      ownProduct(),
      catalogProduct({ sku: '503000', imageUrl: null }),
    ]);
    const json = JSON.stringify(page);
    for (const field of FORBIDDEN_FIELDS) expect(json).not.toContain(field);
    expect(json).not.toContain('creator');
    expect(json).not.toContain('"license"');
    // The credit is present, once, on the one item that has a true credit.
    expect(json.match(/"creditText"/g)).toHaveLength(1);
    expect(json.match(/"ImageObject"/g)).toHaveLength(1);
  });

  it('holds for the client-paginated aggregator helper too', () => {
    const json = JSON.stringify(aggregatorItemListSchema([catalogProduct(), ownProduct()], 60));
    for (const field of FORBIDDEN_FIELDS) expect(json).not.toContain(field);
    expect(json).not.toContain('"license"');
    expect(json).toContain('"creditText":"Geiger"');
  });

  it('still omits image entirely when the product has none, rather than an empty object', () => {
    const item = productListItem(catalogProduct({ imageUrl: null }), 1)!.item as Record<
      string,
      unknown
    >;
    expect(item).not.toHaveProperty('image');
  });

  it('credits every Geiger item on a full page and no others', () => {
    const products = [
      ...Array.from({ length: 58 }, (_, i) => catalogProduct({ sku: `50${i}` })),
      ownProduct({ sku: 'custom-a' }),
      ownProduct({ sku: 'custom-b' }),
    ];
    const json = JSON.stringify(productItemListSchema(products));
    expect(json.match(/"creditText":"Geiger"/g)).toHaveLength(58);
  });
});

describe('no rendered source claims authorship, copyright or a licence for an image', () => {
  const files = sourceFiles();

  it('scans a real, non-trivial set of source files', () => {
    expect(files.size).toBeGreaterThan(300);
  });

  it('strips comments without eating the code that follows a URL', () => {
    const stripped = stripComments(
      ["const u = 'https://x.test/a'; // copyrightNotice", 'const v = 2;'].join('\n'),
    );
    expect(stripped).toContain("'https://x.test/a'");
    expect(stripped).toContain('const v = 2;');
    expect(stripped).not.toContain('copyrightNotice');
  });

  it.each(FORBIDDEN_FIELDS)('%s appears in no source file', (field) => {
    expect(offending(files, (src) => src.includes(field))).toEqual([]);
  });

  /**
   * `license` is checked as a JSON-LD key rather than as a bare word, because
   * the word itself is legitimate in prose and in a package name.
   */
  it('no source file emits a schema.org license key', () => {
    const keyed = /(?:^|[\s,{])(?:'license'|"license"|license)\s*:/m;
    expect(offending(files, (src) => keyed.test(src))).toEqual([]);
  });

  /**
   * `creator` cannot be banned outright: it is also the X (Twitter) card handle
   * property and the PDF document author. This pins the four places it
   * legitimately appears, all of them non-schema.org, so a fifth means someone
   * added a schema.org creator and must come back through this file.
   */
  it('creator appears only as an X card handle and a PDF field, never as schema.org', () => {
    const keyed = /(?:^|[\s,{(])(?:'creator'|"creator"|creator)\s*[:=]/m;
    expect(offending(files, (src) => keyed.test(src))).toEqual(
      [
        'app/layout.tsx',
        'app/videos/[slug]/page.tsx',
        'lib/quotes/pdf/QuotePdfDocument.tsx',
        'lib/seo/open-graph.ts',
      ].sort(),
    );
  });

  /**
   * The credit itself lives in ONE place. If `creditText` appears anywhere
   * else, a second image-metadata rule has grown and the two will disagree.
   */
  it('creditText is emitted from exactly one module', () => {
    expect(offending(files, (src) => src.includes('creditText'))).toEqual([
      'lib/seo/image-credit.ts',
    ]);
  });

  /**
   * "Do it once, in the shared serializer." The credit module is imported by
   * the serializer and by nothing else, so no surface can grow its own image
   * handling and drift.
   */
  it('the credit module is imported by the shared serializer alone', () => {
    const importers = offending(files, (src) => /from '[^']*image-credit'/.test(src));
    expect(importers).toEqual(['lib/seo/product-list-schema.ts']);
  });

  /**
   * ImageObject now has exactly two homes: the Organization publisher logo
   * inside BlogPosting, which is the site's own mark and carries only `url`,
   * and the credit module. A third appearance means an image entity grew
   * somewhere, and should come back through this file.
   */
  it('ImageObject appears in exactly two places, the publisher logo and the credit module', () => {
    expect(offending(files, (src) => src.includes('ImageObject'))).toEqual([
      'lib/seo/content-schema.ts',
      'lib/seo/image-credit.ts',
    ]);
    expect(read('lib/seo/content-schema.ts')).toContain(
      "logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.svg` },",
    );
  });

  /**
   * The one page that emits a standalone Product rather than an ItemList entry
   * (FIX-830) builds its images through its own helper. Its images are all
   * Sanity uploads, for which no true credit exists, so it must keep returning
   * plain URLs.
   */
  it('the product detail page builds plain image URLs, not image entities', () => {
    const src = read('app/products/[slug]/page.tsx');
    expect(src).toContain('function buildSchemaImages(doc: ProductPageDoc): string[] {');
    expect(src).not.toContain('ImageObject');
  });
});

describe('nothing in the content model records image provenance', () => {
  /**
   * The reason the Sanity uploads carry no credit is a DATA fact, not a coding
   * preference, so it is asserted rather than asserted-in-prose. If someone
   * adds a photographer, credit, copyright or licence field to a Sanity image,
   * this breaks - and it should, because a real credit field is exactly what
   * would let the rule in image-credit.ts be extended to cover those images.
   * The revisit must be deliberate, not incidental.
   */
  it('no Sanity schema defines a creator, credit, copyright or licence field for an image', () => {
    const base = resolve(root, 'sanity', 'schemas');
    const offenders: string[] = [];
    for (const name of readdirSync(base, { recursive: true }) as string[]) {
      const rel = join('sanity', 'schemas', name);
      if (extname(rel) !== '.ts' || rel.includes('.test.')) continue;
      const src = read(rel.split(sep).join('/'));
      // `copyrightText` is the footer's site-wide copyright line, not an image's.
      const cleaned = src.replace(/copyrightText/g, '');
      if (/name:\s*'(creator|creditText|copyrightNotice|license|photographer)'/.test(cleaned)) {
        offenders.push(relative(root, resolve(root, rel)));
      }
    }
    expect(offenders).toEqual([]);
  });
});
