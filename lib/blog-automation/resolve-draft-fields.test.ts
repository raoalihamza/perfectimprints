/**
 * AUTO-202: the four fields beside the body, resolved with fakes for every
 * read: the settings, the root list, the catalog, the author and category
 * existence checks and the image chain. Nothing throws; a field that cannot
 * be determined is empty and named in the notes.
 */
import { describe, expect, it } from 'vitest';
import { resolveDraftFields, type DraftFieldsDeps, type DraftFieldSettings, type ResolveDraftFieldsInput } from './resolve-draft-fields';
import type { HeaderImageOutcome, ReferenceProduct } from './header-image';
import type { ResolveHeaderImageInput } from './resolve-header-image';

const geiger = 'https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?format=webp&thumbnail=275&w=275&h=275';
const strip = { _type: 'blogProducts', _key: 'bp1', products: [{ _type: 'blogProduct', _key: 'p1', sku: '501003' }, { _type: 'relatedProductRef', _key: 'p2', _ref: 'x' }] };
const body = [{ _type: 'block', _key: 'b1', style: 'normal', markDefs: [], children: [{ _type: 'span', _key: 's', text: 'x', marks: [] }] }, strip];

const imageOutcome: HeaderImageOutcome = { kind: 'asset', source: 'ai', image: { _type: 'image', asset: { _type: 'reference', _ref: 'image-gen' } }, notes: [] };

interface FakeOptions {
  settings?: DraftFieldSettings | (() => Promise<DraftFieldSettings>);
  authors?: string[];
  categories?: string[];
  roots?: string[];
  rootsThrow?: boolean;
  productsThrow?: boolean;
  authorThrows?: boolean;
  categoryForTopic?: string | null;
}

function fakeDeps(opts: FakeOptions = {}) {
  const imageInputs: ResolveHeaderImageInput[] = [];
  const log: string[] = [];
  const settingsOption = opts.settings;
  const settings: DraftFieldsDeps['settings'] = typeof settingsOption === 'function' ? settingsOption : async () => settingsOption ?? {};
  const deps: DraftFieldsDeps = {
    settings,
    knownRoots: () => {
      if (opts.rootsThrow) throw new Error('fs down');
      return new Set(opts.roots ?? ['pens', 'tote-bags', 'sports-balls']);
    },
    productsBySku: (skus) => {
      log.push(`products:${skus.join(',')}`);
      if (opts.productsThrow) throw new Error('catalog down');
      return skus.map<ReferenceProduct>((sku) => ({ sku, name: `Product ${sku}`, imageUrl: geiger }));
    },
    categoryForTopic: async () => opts.categoryForTopic ?? null,
    authorExists: async (id) => {
      if (opts.authorThrows) throw new Error('sanity down');
      return (opts.authors ?? ['author-patrick-black']).includes(id);
    },
    existingCategoryIds: async (ids) => ids.filter((id) => (opts.categories ?? []).includes(id)),
    headerImage: async (input) => {
      imageInputs.push(input);
      return imageOutcome;
    },
    log: (line) => log.push(line),
  };
  return { deps, imageInputs, log };
}

const input: ResolveDraftFieldsInput = {
  topic: { query: 'custom tote bags', page: 'https://www.perfectimprints.com/cat/tote-bags/material/vinyl' },
  title: '9 Smart Ways Businesses Use Custom Tote Bags',
  slug: '9-smart-ways-businesses-use-custom-tote-bags',
  body,
};

describe('the four fields', () => {
  it('fills all four when everything is there, and hands the image chain the post\'s own products and roots', async () => {
    const f = fakeDeps({
      settings: { headerImageSource: 'ai', defaultAuthorId: 'author-sarah-garcia', defaultCategoryIds: ['blog-category-promotional-product-ideas', 'gone'], headerImageLibrary: [] },
      authors: ['author-sarah-garcia'],
      categories: ['blog-category-promotional-product-ideas'],
      categoryForTopic: 'bags',
    });
    const out = await resolveDraftFields(input, f.deps);
    expect(out.authorId).toBe('author-sarah-garcia');
    expect(out.categoryIds).toEqual(['blog-category-promotional-product-ideas']);
    expect(out.relatedCategorySlugs).toEqual(['tote-bags']);
    expect(out.headerImage).toBe(imageOutcome);
    expect(out.notes).toEqual(['a default category in Global Settings no longer exists and was skipped']);
    expect(f.imageInputs).toHaveLength(1);
    expect(f.imageInputs[0]).toMatchObject({
      source: 'ai',
      title: input.title,
      topic: 'custom tote bags',
      slug: input.slug,
      rootSlugs: ['tote-bags', 'bags'],
      library: [],
    });
    // Only the SKU entries of the strips reach the catalog; the reference is skipped.
    expect(f.imageInputs[0].products).toEqual([{ sku: '501003', name: 'Product 501003', imageUrl: geiger }]);
  });

  it('with no settings at all: the default author (when it exists), no categories, the related slug, AI image', async () => {
    const f = fakeDeps();
    const out = await resolveDraftFields(input, f.deps);
    expect(out.authorId).toBe('author-patrick-black');
    expect(out.categoryIds).toEqual([]);
    expect(out.relatedCategorySlugs).toEqual(['tote-bags']);
    expect(out.notes).toEqual(['no categories: Global Settings names no default categories']);
    expect(f.imageInputs[0].source).toBe('ai');
  });

  it('the post\'s own source override starts the chain where it says', async () => {
    const f = fakeDeps({ settings: { headerImageSource: 'ai' } });
    await resolveDraftFields({ ...input, headerImageSource: 'library' }, f.deps);
    expect(f.imageInputs[0].source).toBe('library');
    const g = fakeDeps({ settings: { headerImageSource: 'product' } });
    await resolveDraftFields(input, g.deps);
    expect(g.imageInputs[0].source).toBe('product');
  });
});

describe('what cannot be determined stays empty, with a reason', () => {
  it('a topic that ranks with a video gets no related category slug, and nothing is guessed from the title', async () => {
    const f = fakeDeps({ categoryForTopic: 'tote-bags' });
    const out = await resolveDraftFields({ ...input, topic: { query: 'custom tote bags', page: '/videos/custom-tote-bags' } }, f.deps);
    expect(out.relatedCategorySlugs).toEqual([]);
    expect(out.notes).toContain('no related category slug: the topic does not rank with a category page');
    // The title resolver still widens the LIBRARY lookup.
    expect(f.imageInputs[0].rootSlugs).toEqual(['tote-bags']);
  });

  it('a root the site does not generate is dropped', async () => {
    const f = fakeDeps({ roots: ['pens'] });
    const out = await resolveDraftFields(input, f.deps);
    expect(out.relatedCategorySlugs).toEqual([]);
  });

  it('an author document that does not exist is not referenced', async () => {
    const f = fakeDeps({ authors: [] });
    const out = await resolveDraftFields(input, f.deps);
    expect(out.authorId).toBeNull();
    expect(out.notes).toContain('no author: the author document "author-patrick-black" does not exist');
  });

  it('the image chain throwing (against its contract) is caught: the draft gets no picture and a note', async () => {
    const f = fakeDeps();
    f.deps.headerImage = async () => {
      throw new Error('chain exploded');
    };
    const out = await resolveDraftFields(input, f.deps);
    expect(out.headerImage).toEqual({ kind: 'none', notes: ['the header image could not be resolved: chain exploded'] });
    expect(out.notes).toContain('the header image could not be resolved: chain exploded');
    expect(out.authorId).toBe('author-patrick-black');
  });

  it('the real default dependencies load and answer without a client (the wiring the creator uses)', async () => {
    const { defaultDraftFieldsDeps } = await import('./resolve-draft-fields');
    const deps = await defaultDraftFieldsDeps(null);
    expect(deps.knownRoots().size).toBe(465);
    expect(await deps.authorExists('author-patrick-black')).toBe(false);
    expect(await deps.existingCategoryIds(['x'])).toEqual([]);
    // The matcher's lookup answers a root slug or null and never throws, whether or not the server-only module loads here.
    const resolved = await deps.categoryForTopic('custom pens');
    expect(resolved === null || typeof resolved === 'string').toBe(true);
    const out = await deps.headerImage({ source: 'ai', title: 'T', topic: 't', products: [], rootSlugs: [], library: [], slug: 't' });
    expect(out.kind).toBe('none');
  });

  it('every read failing still answers, empty, with the reasons, and the image chain still runs', async () => {
    const f = fakeDeps({
      settings: async () => {
        throw new Error('settings down');
      },
      rootsThrow: true,
      productsThrow: true,
      authorThrows: true,
    });
    const out = await resolveDraftFields(input, f.deps);
    expect(out.authorId).toBeNull();
    expect(out.categoryIds).toEqual([]);
    expect(out.relatedCategorySlugs).toEqual([]);
    expect(out.headerImage).toBe(imageOutcome);
    expect(out.notes).toEqual([
      'Global Settings could not be read (settings down), so the defaults were used',
      'the category list could not be read (fs down), so no related category slug was set',
      'no author: the author could not be checked (sanity down)',
      'no categories: Global Settings names no default categories',
      'the strip products could not be read (catalog down)',
    ]);
    expect(f.imageInputs[0].products).toEqual([]);
  });
});
