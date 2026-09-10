/**
 * FIX-872: the write side and the render side of a product strip must agree,
 * and this file is where that agreement is tested, case by case.
 *
 * The FIX-870 bug lived BETWEEN two halves that were each correct alone: the
 * writer stored a shape, the resolver dropped it, and no test ever ran an
 * entry from one end to the other. FIX-871's test added the first round trip
 * (four cases). This file takes EVERY shape the helper can produce, plus every
 * legacy shape that can still be sitting in Sanity, and runs each through the
 * real pipeline:
 *
 *   suggestion  ->  stripEntriesForSuggestions (the real write helper)
 *               ->  dereference (the ONE simulated step: what the GROQ
 *                   projection `defined(_ref) => @->{...}` returns under the
 *                   PUBLISHED perspective; a Map lookup, null for a missing
 *                   target, and never a draft)
 *               ->  resolveStripCards (the real resolver)
 *                   with stripRefToGeigerProduct (the real reference
 *                   normalizer, which calls the real card converters)
 *               ->  cards
 *
 * The hidden / replaced contexts are built with the SAME primitives the site
 * builds them with: `buildSkuSet` for the HIDE-100 list plus HIDE-110 claims,
 * `normalizeSku` + `productPageToGeigerProduct` for the replacement map,
 * exactly as lib/sanity/queries/product-replacements.ts assembles it.
 *
 * Every case asserts what SHOULD happen. Where the current behaviour was
 * judged and found right, the reason is beside the assertion. Nothing in the
 * helper, the resolver, the normalizers or the matcher was changed to make a
 * case pass; if one of these ever fails, the code is telling you something.
 */
import { describe, expect, it, vi } from 'vitest';

import type { GeigerProduct } from '../product-types';
import type { StripProductEntry, StripProductRefEntry } from '../sanity/strip-product-entries';
import { buildSkuSet, normalizeSku } from './hidden-skus';
import { resolveStripCards, type StripCard, type StripCardContext } from './strip-cards';
import {
  STRIP_REF_TYPE,
  stripEntriesForSuggestions,
  type StripWriteEntry,
} from './strip-entry-write';

// `server-only` is a build-time poison pill with no runtime behaviour to test.
vi.mock('server-only', () => ({}));
// eslint-disable-next-line import/first
import { productPageToGeigerProduct, type ProductPageCard } from '../sanity/queries/product-pages';
// eslint-disable-next-line import/first
import { stripRefToGeigerProduct } from '../sanity/queries/strip-entries';

// ---------------------------------------------------------------------------
// Fixtures: a catalog, a published dataset, and what the matcher would return.
// ---------------------------------------------------------------------------

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

const PEN = product({ sku: '506872', name: 'Souvenir Jalan Pen' });
const NOTEBOOK = product({ sku: '507338', name: 'Spiral Notebook' });
const SPACED = product({ sku: '501014 90A', name: 'Vinyl Football' });
const FOOTBALL_HIDDEN = product({ sku: '519423', name: 'Hidden Everywhere Football' });
const NOISEMAKER = product({ sku: '506414', name: 'Fan-Ta-Sticks Noisemakers' });

const catalog = new Map<string, GeigerProduct>(
  [PEN, NOTEBOOK, SPACED, FOOTBALL_HIDDEN, NOISEMAKER].map((p) => [p.sku, p]),
);

const PAGE_ID = '327d0759-17bb-49c0-9e0d-342e25de5a29';
const PAGE: ProductPageCard = {
  _id: PAGE_ID,
  title: 'U Brands Monterey Earthly Pens - Laser Engraved',
  slug: 'laser-engraved-u-brands-monterey-earthly-pens',
  pricingTiers: [{ minQty: 50, price: 6.06 }],
} as ProductPageCard;

/** The page that CLAIMS the noisemaker SKU through replacesGeigerSkus (HIDE-110). */
const REPLACING_ID = 'page-noisemakers';
const REPLACING: ProductPageCard = {
  _id: REPLACING_ID,
  title: 'Fan-Ta-Sticks Noisemakers (Perfect Imprints)',
  slug: 'fan-ta-sticks-noisemakers-pairs-galaxy',
  pricingTiers: [{ minQty: 100, price: 1.1 }],
} as ProductPageCard;

const NO_SLUG_ID = 'page-without-slug';
const CUSTOM_ID = 'custom-product-1';
const CUSTOM_NO_URL_ID = 'custom-product-no-url';

/** The published documents a reference can point at, as the projection returns them. */
const published = new Map<string, StripProductRefEntry>([
  [PAGE_ID, { _type: 'productPage', ...PAGE }],
  [REPLACING_ID, { _type: 'productPage', ...REPLACING }],
  [NO_SLUG_ID, { _type: 'productPage', _id: NO_SLUG_ID, title: 'Half-built page' } as StripProductRefEntry],
  [
    CUSTOM_ID,
    {
      _type: 'customProduct',
      _id: CUSTOM_ID,
      title: '12" #1 Foam Fingers',
      externalUrl: 'https://example-vendor.test/foam-fingers',
    },
  ],
  [
    CUSTOM_NO_URL_ID,
    { _type: 'customProduct', _id: CUSTOM_NO_URL_ID, title: 'Vendor link missing' },
  ],
]);

/** What the matcher returns for one of Patrick's own products: the synthetic SKU. */
const synthetic = (id: string) => ({ sku: `custom-${id}` });

/**
 * The GROQ dereference under the published perspective: a `blogProduct`
 * passes through verbatim; a reference becomes its target's card fields, or
 * null when the target is missing, unpublished, or a draft id.
 */
function dereference(stored: readonly StripWriteEntry[]): (StripProductEntry | null)[] {
  return stored.map((entry) => {
    if (entry._type !== STRIP_REF_TYPE) return entry;
    if (entry._ref.startsWith('drafts.')) return null;
    return published.get(entry._ref) ?? null;
  });
}

/** The HIDE-100 + HIDE-110 context as lib/products/site-wide-hidden.ts assembles it. */
function siteWideContext(opts: { hiddenEverywhere?: string[]; claims?: [string, ProductPageCard][] } = {}) {
  const claimedSkus: string[] = [];
  const replacementBySku = new Map<string, GeigerProduct>();
  for (const [raw, page] of opts.claims ?? []) {
    const key = normalizeSku(raw);
    if (!key || replacementBySku.has(key)) continue;
    replacementBySku.set(key, productPageToGeigerProduct(page));
    claimedSkus.push(raw.trim());
  }
  return {
    hiddenSkus: buildSkuSet([...(opts.hiddenEverywhere ?? []), ...claimedSkus]),
    replacementBySku,
  };
}

let n = 0;
const nextKey = () => `rp-${(n += 1)}`;

function write(suggestions: Parameters<typeof stripEntriesForSuggestions>[0]) {
  return stripEntriesForSuggestions(suggestions, nextKey);
}

function render(
  stored: readonly StripWriteEntry[],
  ctx: Partial<Omit<StripCardContext, 'resolveRef' | 'skuProducts'>> = {},
): StripCard[] {
  return resolveStripCards(dereference(stored), {
    skuProducts: catalog,
    resolveRef: stripRefToGeigerProduct,
    ...ctx,
  });
}

const skus = (cards: StripCard[]) => cards.map((c) => (c.kind === 'product' ? c.product.sku : `manual:${c.title}`));
const productCard = (card: StripCard | undefined): GeigerProduct => {
  if (!card || card.kind !== 'product') throw new Error('expected a product card');
  return card.product;
};

// ---------------------------------------------------------------------------
// The cases.
// ---------------------------------------------------------------------------

describe('a Geiger SKU', () => {
  it('that exists in the catalog renders the live product, linking to the affiliate host', () => {
    const stored = write([PEN]);
    expect(stored).toEqual([{ _type: 'blogProduct', _key: expect.any(String), sku: '506872' }]);
    const cards = render(stored);
    expect(skus(cards)).toEqual(['506872']);
    expect(productCard(cards[0]).geiger_url).toBe('https://www.geiger.com/p/item-506872');
    expect(productCard(cards[0]).detailUrl).toBeUndefined();
  });

  it('that does NOT exist in the catalog renders nothing, because the helper writes no manual fallback', () => {
    // Right: a SKU that resolves to no product has nothing to show. The helper
    // writes only `sku`, never a title/image/url, so the resolver's manual
    // fallback cannot invent a card either. The entry stays in the document and
    // renders again the day the SKU returns to the catalog.
    const stored = write([{ sku: 'GONE-456' }]);
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty('title');
    expect(stored[0]).not.toHaveProperty('url');
    expect(render(stored)).toEqual([]);
  });

  it('with padding is stored trimmed and resolves; an inner space is kept verbatim', () => {
    const stored = write([{ sku: '  506872 ' }, { sku: '501014 90A' }]);
    expect(stored.map((e) => (e._type === 'blogProduct' ? e.sku : null))).toEqual(['506872', '501014 90A']);
    expect(skus(render(stored))).toEqual(['506872', '501014 90A']);
  });

  it('on the site-wide hidden list (HIDE-100) is stored by the helper but renders nothing', () => {
    // The helper has no hide knowledge on purpose: the routes hand the hidden
    // list to the MATCHER, which never suggests a hidden product, so the
    // helper never sees one. If a writer ever bypasses the matcher, the render
    // side still drops it. Written down here so nobody adds a second hide
    // check to the helper and the two lists drift.
    const stored = write([FOOTBALL_HIDDEN, PEN]);
    expect(stored).toHaveLength(2);
    const cards = render(stored, siteWideContext({ hiddenEverywhere: ['519423'] }));
    expect(skus(cards)).toEqual(['506872']);
    // Case- and whitespace-insensitive, as on every other surface.
    expect(skus(render(stored, siteWideContext({ hiddenEverywhere: [' 519423 '] })))).toEqual(['506872']);
  });

  it('claimed by a published product page (replacesGeigerSkus, HIDE-110) renders that page in its slot', () => {
    const stored = write([PEN, NOISEMAKER, NOTEBOOK]);
    const cards = render(stored, siteWideContext({ claims: [['506414', REPLACING]] }));
    expect(skus(cards)).toEqual(['506872', `custom-${REPLACING_ID}`, '507338']);
    const card = productCard(cards[1]);
    expect(card.detailUrl).toBe('/products/fan-ta-sticks-noisemakers-pairs-galaxy');
    expect(card.name).toBe('Fan-Ta-Sticks Noisemakers (Perfect Imprints)');
    // The strip keeps its length: the replacement takes the exact index.
    expect(cards).toHaveLength(3);
  });

  it('claimed by a page that is ALSO suggested as itself renders once, at the first position', () => {
    const stored = write([synthetic(REPLACING_ID), NOISEMAKER]);
    const cards = render(stored, siteWideContext({ claims: [['506414', REPLACING]] }));
    expect(skus(cards)).toEqual([`custom-${REPLACING_ID}`]);
  });
});

describe("a reference to one of Patrick's own products", () => {
  it('a published Product Page renders an internal card linking to /products/<slug>', () => {
    const stored = write([synthetic(PAGE_ID)]);
    expect(stored).toEqual([{ _type: 'relatedProductRef', _key: expect.any(String), _ref: PAGE_ID }]);
    const cards = render(stored);
    expect(cards).toHaveLength(1);
    const card = productCard(cards[0]);
    expect(card.detailUrl).toBe('/products/laser-engraved-u-brands-monterey-earthly-pens');
    expect(card.sku).toBe(`custom-${PAGE_ID}`);
    expect(card.geiger_url).toBeNull();
  });

  it('a Product Page whose target has been deleted since generation is dropped, the rest intact', () => {
    // Stored at write time (the target existed then); the projection
    // dereferences a missing target to null and the resolver drops it. No
    // dangling card, no crash, no gap in the numbering of what remains.
    const stored = write([PEN, synthetic('deleted-after-generation'), NOTEBOOK]);
    expect(stored).toHaveLength(3);
    expect(skus(render(stored))).toEqual(['506872', '507338']);
  });

  it('a Custom Product renders its external vendor card', () => {
    const stored = write([synthetic(CUSTOM_ID)]);
    expect(stored).toEqual([{ _type: 'relatedProductRef', _key: expect.any(String), _ref: CUSTOM_ID }]);
    const cards = render(stored);
    expect(productCard(cards[0]).geiger_url).toBe('https://example-vendor.test/foam-fingers');
    expect(productCard(cards[0]).detailUrl).toBeUndefined();
  });

  it('is never subject to the Geiger hide list: no catalog SKU starts with custom-, so the list cannot name one', () => {
    const stored = write([synthetic(PAGE_ID)]);
    const cards = render(stored, siteWideContext({ hiddenEverywhere: [`custom-${PAGE_ID}`, '506872'] }));
    // Right: HIDE-100's rule is that Patrick's own products are structurally
    // unhideable by that list (the pickers only offer catalog SKUs). Hiding
    // his own page is done by unpublishing it, which dereferences to null.
    expect(skus(cards)).toEqual([`custom-${PAGE_ID}`]);
  });

  it('a Product Page with no slug, or a Custom Product with no vendor URL, is dropped rather than rendered broken', () => {
    // The resolver's pre-existing rule: a card that would link to a 404 or to
    // the bare affiliate homepage is worse than no card.
    const stored = write([synthetic(NO_SLUG_ID), synthetic(CUSTOM_NO_URL_ID), PEN]);
    expect(stored).toHaveLength(3);
    expect(skus(render(stored))).toEqual(['506872']);
  });
});

describe('lists', () => {
  it('an empty list stores nothing and renders nothing', () => {
    const stored = write([]);
    expect(stored).toEqual([]);
    expect(render(stored)).toEqual([]);
  });

  it('a single entry stores one and renders one', () => {
    expect(skus(render(write([NOTEBOOK])))).toEqual(['507338']);
  });

  it('a mixed list renders exactly the resolvable entries, in the stored order', () => {
    const stored = write([
      synthetic(PAGE_ID), // renders
      { sku: 'GONE-1' }, // stored, no card
      PEN, // renders
      synthetic('deleted-later'), // stored, dereferences to null
      synthetic(CUSTOM_ID), // renders
      { sku: '' }, // never stored
      NOTEBOOK, // renders
    ]);
    expect(stored).toHaveLength(6);
    expect(skus(render(stored))).toEqual([`custom-${PAGE_ID}`, '506872', `custom-${CUSTOM_ID}`, '507338']);
  });

  it("keeps the matcher's order: Patrick's own products first, Geiger after, and allocates keys only for kept entries", () => {
    n = 0;
    const stored = write([synthetic(PAGE_ID), { sku: 'custom-drafts.x' }, PEN]);
    expect(stored.map((e) => e._key)).toEqual(['rp-1', 'rp-2']);
    expect(stored.map((e) => e._type)).toEqual(['relatedProductRef', 'blogProduct']);
  });
});

describe('duplicates', () => {
  it('the same Geiger SKU twice stores two entries and renders two cards', () => {
    // Right, and deliberate: a SKU list is the editor's list. The matcher
    // never returns a SKU twice, so a generated strip never hits this; the
    // structured data dedupes by SKU on its own (stripSchemaProducts).
    const stored = write([PEN, PEN]);
    expect(stored).toHaveLength(2);
    expect(skus(render(stored))).toEqual(['506872', '506872']);
  });

  it('the same Product Page twice stores two references and renders ONE card', () => {
    // The helper does not dedupe (the matcher already did); the resolver
    // renders a referenced document once per strip whichever way it arrives.
    const stored = write([synthetic(PAGE_ID), synthetic(PAGE_ID)]);
    expect(stored).toHaveLength(2);
    expect(skus(render(stored))).toEqual([`custom-${PAGE_ID}`]);
  });

  it('two different references render two cards', () => {
    expect(skus(render(write([synthetic(PAGE_ID), synthetic(CUSTOM_ID)])))).toEqual([
      `custom-${PAGE_ID}`,
      `custom-${CUSTOM_ID}`,
    ]);
  });
});

describe('ids the helper must refuse', () => {
  it('a draft id is never stored (the published render could not dereference it, and a strong reference to a draft blocks Publish)', () => {
    expect(write([{ sku: 'custom-drafts.abc' }])).toEqual([]);
  });

  it('a legacy reference to a draft, if one were already in a document, dereferences to null and is dropped', () => {
    const legacy: StripWriteEntry[] = [{ _type: 'relatedProductRef', _key: 'old', _ref: `drafts.${PAGE_ID}` }];
    expect(render(legacy)).toEqual([]);
  });

  it('an empty, blank, or malformed synthetic id is never stored', () => {
    expect(
      write([
        { sku: 'custom-' },
        { sku: 'custom- ' },
        { sku: 'custom-has space' },
        { sku: 'custom-.leading-dot' },
        { sku: 'custom--leading-dash' },
        { sku: 'custom-slash/inside' },
        { sku: 'custom-éaccent' },
        { sku: '' },
        { sku: '   ' },
        null,
        undefined,
        {},
      ]),
    ).toEqual([]);
  });

  it('a target the caller says no longer exists is never stored (the repair script path)', () => {
    const stored = stripEntriesForSuggestions([synthetic(PAGE_ID), PEN], nextKey, {
      targetExists: () => false,
    });
    expect(stored.map((e) => e._type)).toEqual(['blogProduct']);
  });

  it('an upper-case CUSTOM- prefix is not a synthetic id: stored as a SKU, resolves to nothing, renders nothing', () => {
    // Observed and judged: both card normalizers emit a lower-case `custom-`
    // prefix, so this string cannot come from the matcher. Treating it as a
    // Geiger SKU is the conservative reading (no reference is invented from a
    // string that might be a real item number), and the render side drops it
    // for the same reason it drops any unknown SKU.
    const stored = write([{ sku: `CUSTOM-${PAGE_ID}` }]);
    expect(stored[0]?._type).toBe('blogProduct');
    expect(render(stored)).toEqual([]);
  });
});

describe('the old shape, kept as the record of the bug', () => {
  it('a Product Page stored as a bare synthetic SKU renders NO card (FIX-870)', () => {
    const old: StripWriteEntry[] = [{ _type: 'blogProduct', _key: 'a', sku: `custom-${PAGE_ID}` }];
    expect(render(old)).toEqual([]);
    // ...and the same suggestion through the helper renders the page.
    expect(skus(render(write([synthetic(PAGE_ID)])))).toEqual([`custom-${PAGE_ID}`]);
  });
});

// ---------------------------------------------------------------------------
// The two halves name the same two shapes. If the schema member is renamed,
// the projection re-keyed, or the helper's constant changed on its own, this
// is the test that fails first.
// ---------------------------------------------------------------------------

describe('the write side, the schema and the read side name the same shapes', () => {
  it("the helper's reference type is the schema's named array member", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const root = resolve(__dirname, '..', '..');
    const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
    for (const schema of ['sanity/schemas/objects/blog-products.ts', 'sanity/schemas/documents/product-page.ts']) {
      expect(read(schema), schema).toContain(`name: '${STRIP_REF_TYPE}'`);
      expect(read(schema), schema).toContain("type: 'blogProduct'");
    }
    const projection = read('lib/sanity/strip-product-entries.ts');
    expect(projection).toContain("_type == 'blogProduct' => { _type, _key, sku, title, image, url },");
    expect(projection).toContain('defined(_ref) => @->{');
  });

  it('no em dash in this file', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    expect(readFileSync(resolve(__dirname, 'strip-entry-roundtrip.test.ts'), 'utf8')).not.toContain(
      String.fromCharCode(0x2014),
    );
  });
});
