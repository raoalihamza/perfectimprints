/**
 * FIX-871: the write side of a product strip must produce a shape the render
 * side reads. Three layers, because the original defect lived between them:
 *
 *  1. The helper's own rules (Geiger SKU unchanged, synthetic id becomes a
 *     reference, unusable ids dropped, order and keys preserved).
 *  2. WRITE THEN RENDER: entries produced by the write helper, dereferenced
 *     the way the GROQ projection dereferences them, fed to the REAL strip
 *     resolver with the REAL reference normalizer, produce a card. The same
 *     test records the old shape producing NO card, which is the bug FIX-870
 *     found and the reason this file exists: `strip-cards.test.ts` rightly
 *     asserts an unmatched SKU-only entry is dropped, and nothing asserted
 *     that the write side never produced one for a Product Page.
 *  3. Structural: every writer of a strip entry goes through the helper, the
 *     helper imports nothing (the Studio bundle takes it), no em dash.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { GeigerProduct } from '../product-types';
import type { StripProductEntry, StripProductRefEntry } from '../sanity/strip-product-entries';
import { resolveStripCards, type StripCard } from './strip-cards';
import {
  isStorableTargetId,
  STRIP_REF_TYPE,
  stripEntriesForSuggestions,
  stripEntryForSuggestion,
  syntheticTargetId,
  type StripWriteEntry,
} from './strip-entry-write';

// The real server-side binding (stripRefToGeigerProduct -> productPageToGeigerProduct).
// `server-only` is a build-time poison pill with no runtime behaviour to test.
vi.mock('server-only', () => ({}));
// eslint-disable-next-line import/first
import { stripRefToGeigerProduct } from '../sanity/queries/strip-entries';

const ROOT = join(__dirname, '..', '..');

function product(overrides: Partial<GeigerProduct> & { sku: string; name: string }): GeigerProduct {
  return {
    brand: null,
    low_price: 1.5,
    high_price: 2.5,
    msrp: 2.5,
    min_qty: 100,
    imageUrl: `https://imgsirv.geiger.com/${overrides.sku}.jpg?format=webp&thumbnail=275&w=275&h=275`,
    description: null,
    category_paths: [],
    badges: [],
    is_new_item: false,
    is_on_sale: false,
    product_type_unigram: null,
    geiger_url: `https://www.geiger.com/p/item-${overrides.sku}`,
    ...overrides,
  };
}

/** What the matcher returns for one of Patrick's own product pages: a synthetic SKU + detailUrl. */
const pageSuggestion = product({
  sku: 'custom-327d0759-17bb-49c0-9e0d-342e25de5a29',
  name: 'U Brands Monterey Earthly Pens - Laser Engraved',
  geiger_url: null,
  detailUrl: '/products/laser-engraved-u-brands-monterey-earthly-pens',
});
const geigerSuggestion = product({ sku: '506872', name: 'Souvenir Jalan Pen' });

let n = 0;
const nextKey = () => `rp-test-${(n += 1)}`;

describe('stripEntryForSuggestion (the helper)', () => {
  it('stores a Geiger SKU exactly as before: a blogProduct entry carrying the bare SKU', () => {
    expect(stripEntryForSuggestion({ sku: ' 506872 ' }, 'k1')).toEqual({
      _type: 'blogProduct',
      _key: 'k1',
      sku: '506872',
    });
    // A real item number with an inner space is kept verbatim (the HIDE-100 rule).
    expect(stripEntryForSuggestion({ sku: '501014 90A' }, 'k2')).toEqual({
      _type: 'blogProduct',
      _key: 'k2',
      sku: '501014 90A',
    });
  });

  it('stores a synthetic custom-<id> SKU (a Product Page or Custom Product) as the reference entry hand-picking stores', () => {
    expect(stripEntryForSuggestion(pageSuggestion, 'k3')).toEqual({
      _type: 'relatedProductRef',
      _key: 'k3',
      _ref: '327d0759-17bb-49c0-9e0d-342e25de5a29',
    });
    // The bulk-import id shape (slug-derived) is a plain id too.
    expect(
      stripEntryForSuggestion({ sku: 'custom-productPage-christmas-stocking-holiday-ornaments' }, 'k4'),
    ).toEqual({
      _type: 'relatedProductRef',
      _key: 'k4',
      _ref: 'productPage-christmas-stocking-holiday-ornaments',
    });
    expect(STRIP_REF_TYPE).toBe('relatedProductRef');
  });

  it('drops a blank, missing or non-string SKU (never stores an empty entry)', () => {
    expect(stripEntryForSuggestion({ sku: '' }, 'k')).toBeNull();
    expect(stripEntryForSuggestion({ sku: '   ' }, 'k')).toBeNull();
    expect(stripEntryForSuggestion({}, 'k')).toBeNull();
    expect(stripEntryForSuggestion(null, 'k')).toBeNull();
    expect(stripEntryForSuggestion({ sku: 12345 as unknown as string }, 'k')).toBeNull();
  });

  it('drops a synthetic id the published render could never dereference, instead of storing a dangling reference', () => {
    expect(stripEntryForSuggestion({ sku: 'custom-' }, 'k')).toBeNull();
    expect(stripEntryForSuggestion({ sku: 'custom-drafts.abc' }, 'k')).toBeNull();
    expect(stripEntryForSuggestion({ sku: 'custom-has space' }, 'k')).toBeNull();
    expect(stripEntryForSuggestion({ sku: 'custom-.leading-dot' }, 'k')).toBeNull();
    expect(isStorableTargetId('abc-123')).toBe(true);
    expect(isStorableTargetId('drafts.abc')).toBe(false);
  });

  it('drops a suggestion whose target the caller says no longer exists', () => {
    const gone = stripEntryForSuggestion(pageSuggestion, 'k', { targetExists: () => false });
    expect(gone).toBeNull();
    const there = stripEntryForSuggestion(pageSuggestion, 'k', { targetExists: () => true });
    expect(there?._type).toBe('relatedProductRef');
    // The check never sees a Geiger SKU: there is no target to look up.
    const seen: string[] = [];
    stripEntryForSuggestion(geigerSuggestion, 'k', {
      targetExists: (id) => {
        seen.push(id);
        return false;
      },
    });
    expect(seen).toEqual([]);
  });

  it('parses the synthetic id and leaves catalog SKUs alone', () => {
    expect(syntheticTargetId('custom-abc')).toBe('abc');
    expect(syntheticTargetId(' custom-abc ')).toBe('abc');
    expect(syntheticTargetId('506872')).toBeNull();
    expect(syntheticTargetId('CUSTOM-abc')).toBeNull();
    expect(syntheticTargetId(undefined)).toBeNull();
  });
});

describe('stripEntriesForSuggestions (a whole strip)', () => {
  it("preserves the matcher's order, Patrick's own products first, and allocates keys only for kept entries", () => {
    n = 0;
    const entries = stripEntriesForSuggestions(
      [pageSuggestion, { sku: '' }, geigerSuggestion, { sku: 'custom-drafts.x' }, { sku: '507338' }],
      nextKey,
    );
    expect(entries).toEqual([
      { _type: 'relatedProductRef', _key: 'rp-test-1', _ref: '327d0759-17bb-49c0-9e0d-342e25de5a29' },
      { _type: 'blogProduct', _key: 'rp-test-2', sku: '506872' },
      { _type: 'blogProduct', _key: 'rp-test-3', sku: '507338' },
    ]);
    // Three kept, three keys: a dropped suggestion consumed none.
    expect(n).toBe(3);
  });

  it('returns an empty list for an empty or all-dropped input', () => {
    expect(stripEntriesForSuggestions([], nextKey)).toEqual([]);
    expect(stripEntriesForSuggestions([{ sku: '' }, null, undefined], nextKey)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Write, then render. The two halves that disagreed for two months.
// ---------------------------------------------------------------------------

/** The published documents a reference can point at, as the GROQ projection would return them. */
const dataset = new Map<string, StripProductRefEntry>([
  [
    '327d0759-17bb-49c0-9e0d-342e25de5a29',
    {
      _type: 'productPage',
      _id: '327d0759-17bb-49c0-9e0d-342e25de5a29',
      title: 'U Brands Monterey Earthly Pens - Laser Engraved',
      slug: 'laser-engraved-u-brands-monterey-earthly-pens',
      pricingTiers: [{ minQty: 50, price: 6.06 }],
    },
  ],
  [
    'custom-product-1',
    {
      _type: 'customProduct',
      _id: 'custom-product-1',
      title: '12" #1 Foam Fingers',
      externalUrl: 'https://example-vendor.test/foam-fingers',
    },
  ],
]);

/**
 * What `STRIP_PRODUCT_ENTRIES_PROJECTION` does to a stored array: a
 * `blogProduct` object passes through verbatim; a reference is replaced by its
 * target's card fields, or by null when the target is gone (`@->` on a
 * dangling reference). This is the only step of the pipeline not run for real.
 */
function dereference(stored: readonly StripWriteEntry[]): (StripProductEntry | null)[] {
  return stored.map((entry) =>
    entry._type === 'relatedProductRef' ? (dataset.get(entry._ref) ?? null) : entry,
  );
}

const catalog = new Map<string, GeigerProduct>([[geigerSuggestion.sku, geigerSuggestion]]);

function render(stored: readonly StripWriteEntry[]): StripCard[] {
  return resolveStripCards(dereference(stored), {
    skuProducts: catalog,
    resolveRef: stripRefToGeigerProduct,
  });
}

describe('write then render (end to end through the real resolver)', () => {
  it('the OLD shape: a Product Page stored as a bare synthetic SKU renders NO card (the FIX-870 finding)', () => {
    const oldShape: StripWriteEntry[] = [
      { _type: 'blogProduct', _key: 'a', sku: pageSuggestion.sku },
      { _type: 'blogProduct', _key: 'b', sku: geigerSuggestion.sku },
    ];
    const cards = render(oldShape);
    // Only the Geiger card survives; the page vanishes. The resolver is right
    // to drop it (strip-cards.test.ts asserts exactly that); the write was wrong.
    expect(cards.map((c) => c.kind)).toEqual(['product']);
    expect(cards[0].kind === 'product' && cards[0].product.sku).toBe('506872');
  });

  it('the NEW shape: the same suggestions written through the helper render both cards, the page first, linking to /products/<slug>', () => {
    n = 0;
    const stored = stripEntriesForSuggestions([pageSuggestion, geigerSuggestion], nextKey);
    const cards = render(stored);
    expect(cards).toHaveLength(2);
    const [page, pen] = cards;
    expect(page.kind).toBe('product');
    if (page.kind !== 'product' || pen.kind !== 'product') throw new Error('expected product cards');
    expect(page.product.detailUrl).toBe('/products/laser-engraved-u-brands-monterey-earthly-pens');
    expect(page.product.name).toBe('U Brands Monterey Earthly Pens - Laser Engraved');
    expect(page.product.sku).toBe('custom-327d0759-17bb-49c0-9e0d-342e25de5a29');
    expect(pen.product.sku).toBe('506872');
  });

  it('a Custom Product suggestion renders its external card the same way', () => {
    const stored = stripEntriesForSuggestions([{ sku: 'custom-custom-product-1' }], nextKey);
    expect(stored).toEqual([{ _type: 'relatedProductRef', _key: expect.any(String), _ref: 'custom-product-1' }]);
    const cards = render(stored);
    expect(cards).toHaveLength(1);
    expect(cards[0].kind === 'product' && cards[0].product.geiger_url).toBe(
      'https://example-vendor.test/foam-fingers',
    );
  });

  it('a reference whose target has since been deleted dereferences to null and is dropped at render, leaving the rest intact', () => {
    const stored = stripEntriesForSuggestions(
      [{ sku: 'custom-deleted-after-generation' }, geigerSuggestion],
      nextKey,
    );
    expect(stored).toHaveLength(2); // stored at write time, when the target existed
    const cards = render(stored);
    expect(cards.map((c) => c.kind === 'product' && c.product.sku)).toEqual(['506872']);
  });
});

// ---------------------------------------------------------------------------
// Structural guards.
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => relative(ROOT, file).split('\\').join('/');

/** Every place that WRITES a strip entry: the four call sites plus the landing seed. */
const WRITERS = [
  'lib/portable-text/build-blog-body.ts',
  'app/api/sanity/generate-page/route.ts',
  'sanity/actions/generate-video-with-ai.tsx',
  'sanity/actions/generate-landing-with-ai.tsx',
  'scripts/seed/seed-landing-pages.ts',
];

describe('FIX-871 structural guards', () => {
  it('every writer of a strip entry goes through stripEntriesForSuggestions', () => {
    for (const file of WRITERS) {
      const src = read(join(ROOT, file));
      expect(src, file).toContain('stripEntriesForSuggestions(');
      expect(src, file).toMatch(/strip-entry-write'/);
    }
  });

  it('no source file outside the helper builds a blogProduct entry literal by hand', () => {
    const roots = ['app', 'lib', 'sanity', 'components', 'scripts/seed', 'scripts/migrations'];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(join(ROOT, root))) {
        if (/\.test\.tsx?$/.test(file)) continue;
        if (rel(file) === 'lib/products/strip-entry-write.ts') continue;
        // An object literal in CODE, not the interface field `_type: 'blogProduct';`
        // and not a comment describing the shape.
        const code = read(file)
          .split('\n')
          .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
          .join('\n');
        if (/_type:\s*'blogProduct'\s*(,|\})/.test(code)) offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the helper imports nothing, so the Studio bundle and the routes share one copy', () => {
    const src = read(join(ROOT, 'lib/products/strip-entry-write.ts'));
    expect(src).not.toMatch(/^import /m);
    expect(src).not.toMatch(/import\s+'server-only'/);
  });

  it('the repair script exists, is dry-run by default, and converts through the same helper', () => {
    const src = read(join(ROOT, 'scripts/migrations/repair-strip-product-refs.ts'));
    expect(src).toContain("from '../../lib/products/strip-entry-write'");
    expect(src).toContain('stripEntryForSuggestion(');
    expect(src).toContain('--commit');
    expect(src).toContain('--dry-run');
    expect(src).toContain('targetExists');
    const pkg = JSON.parse(read(join(ROOT, 'package.json'))) as { scripts: Record<string, string> };
    expect(pkg.scripts['repair-strip-refs']).toBe('tsx scripts/migrations/repair-strip-product-refs.ts');
  });

  it('the resolver and its tests were not touched to make this pass (the unmatched-SKU rule stands)', () => {
    const test = read(join(ROOT, 'lib/products/strip-cards.test.ts'));
    expect(test).toContain("{ _type: 'blogProduct', _key: 'p', sku: 'GONE-456' }, // nothing to show");
    const resolver = read(join(ROOT, 'lib/products/strip-cards.ts'));
    expect(resolver).toContain('if (!entry.title && !entry.image && !entry.url) return;');
    expect(resolver).not.toContain('strip-entry-write');
  });

  it('no em dash in the files this ticket created', () => {
    for (const file of [
      'lib/products/strip-entry-write.ts',
      'lib/products/strip-entry-write.test.ts',
      'lib/portable-text/build-blog-body.test.ts',
      'app/api/sanity/generate-page/route.test.ts',
      'sanity/actions/generate-video-with-ai.test.tsx',
      'sanity/actions/generate-landing-with-ai.test.tsx',
      'scripts/migrations/repair-strip-product-refs.ts',
    ]) {
      expect(read(join(ROOT, file)), file).not.toContain('\u2014');
    }
  });
});
