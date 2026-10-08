/**
 * AUTO-201: topic to saved draft in one server-side function, and what
 * happens when half of it fails. The REAL `createBlogDraftFromTopic` and the
 * REAL draft builder run; the generator, the live drafts read and the Sanity
 * client are fakes at their module boundaries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  log: [] as string[],
  written: [] as { documentId: string; title: string; status: 'draft' | 'published'; via: 'recorded' | 'keyword'; queries: string[] }[],
  /** Set per test: the drafts read AFTER the AI answers (null = same as before). */
  writtenAfterAi: null as null | typeof m.written,
  readFails: false,
  aiFails: null as null | Error,
  createFails: null as null | Error,
  created: [] as Record<string, unknown>[],
}));

vi.mock('./written-topics', async (importOriginal) => {
  const real = await importOriginal<typeof import('./written-topics')>();
  return {
    ...real,
    readWrittenTopicSources: vi.fn(async () => {
      m.log.push('read-drafts');
      if (m.readFails) throw new real.WrittenTopicsReadError('Could not read your blog drafts: socket hang up', 'Try again.');
      const aiDone = m.log.includes('ai');
      return aiDone && m.writtenAfterAi ? m.writtenAfterAi : m.written;
    }),
  };
});

// Mocked without the original: the real generator imports the hidden-SKU
// context, which carries the `server-only` marker vitest cannot load.
vi.mock('./generate-blog-post', () => {
  return {
    BlogGenerationError: class BlogGenerationError extends Error {
      status = 502;
    },
    generateBlogPost: vi.fn(async (input: { title: string; keywords: string[]; template: string }) => {
      m.log.push('ai');
      if (m.aiFails) throw m.aiFails;
      return {
        title: `${input.title}: 9 Ideas for Trade Shows`,
        // AUTO-203: the generator reports the template it built with; 'auto' resolves to one of the two.
        titleShape: input.template === 'single' ? 'guide' : 'list',
        template: input.template === 'single' ? 'single' : 'list',
        metaTitle: 'Meta',
        metaDescription: 'Desc',
        excerpt: 'Excerpt',
        body: [{ _type: 'block', _key: 'b1', style: 'normal', markDefs: [{ _type: 'link', _key: 'l1', href: '/cat/sunglasses', openInNewTab: false }], children: [{ _type: 'span', _key: 's1', text: 'custom sunglasses', marks: ['l1'] }] }],
        suggestedLinks: [{ label: 'Custom Sunglasses', href: '/cat/sunglasses', reason: 'Category page matching the keywords: sunglasses (placed in the body)' }],
        placedLinks: [{ href: '/cat/sunglasses', anchor: 'custom sunglasses', label: 'Custom Sunglasses', kind: 'category' }],
        words: 1512,
      };
    }),
  };
});

vi.mock('../sanity/studio-nonce-auth', () => ({
  serverSanityClient: vi.fn(() => client),
}));

// AUTO-202: the four fields beside the body. The real resolver is covered in
// resolve-draft-fields.test.ts; here it answers a fixed result (or throws,
// per test) so what the creator does with the answer is what is tested.
const fieldsState = vi.hoisted(() => ({
  throws: null as null | Error,
  result: null as null | Record<string, unknown>,
  inputs: [] as unknown[],
}));
const GENERATED_IMAGE = { _type: 'image', asset: { _type: 'reference', _ref: 'image-generated-1376x768-jpg' }, alt: 'alt' };
function fixedFields() {
  return (
    fieldsState.result ?? {
      authorId: 'author-patrick-black',
      categoryIds: ['blog-category-promotional-product-ideas'],
      relatedCategorySlugs: ['sunglasses'],
      headerImage: { kind: 'asset', source: 'ai', image: GENERATED_IMAGE, notes: [] },
      notes: [],
    }
  );
}
vi.mock('./resolve-draft-fields', () => ({
  defaultDraftFieldsDeps: vi.fn(async () => ({})),
  resolveDraftFields: vi.fn(async (input: unknown) => {
    m.log.push('fields');
    fieldsState.inputs.push(input);
    if (fieldsState.throws) throw fieldsState.throws;
    return fixedFields();
  }),
}));

const client = {
  create: vi.fn(async (doc: BlogDraftDocument) => {
    m.log.push('create');
    if (m.createFails) throw m.createFails;
    m.created.push(doc as unknown as Record<string, unknown>);
    return doc;
  }),
};

// eslint-disable-next-line import/first
import { createBlogDraftFromTopic, DraftClientError, DraftWriteError, TopicAlreadyWrittenError } from './create-blog-draft';
// eslint-disable-next-line import/first
import { buildBlogDraftDocument, topicDraftTitle, type BlogDraftDocument } from './draft-document';
// eslint-disable-next-line import/first
import { serverSanityClient } from '../sanity/studio-nonce-auth';
// eslint-disable-next-line import/first
import { queryTopicKey } from './topic-pool';

const SUNGLASSES = 'custom printed sunglasses';
const topic = { key: queryTopicKey(SUNGLASSES), query: SUNGLASSES, variants: [SUNGLASSES, 'sunglasses custom'] };
const fixedNow = () => new Date('2026-10-05T10:00:00.000Z');

/** The error a call threw (the call must throw). */
async function thrown(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (e) {
    return e;
  }
  throw new Error('expected the call to throw');
}

beforeEach(() => {
  m.log = [];
  m.written = [];
  m.writtenAfterAi = null;
  m.readFails = false;
  m.aiFails = null;
  m.createFails = null;
  m.created = [];
  fieldsState.throws = null;
  fieldsState.result = null;
  fieldsState.inputs = [];
  client.create.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe('createBlogDraftFromTopic: the happy path', () => {
  it('reads the drafts, calls the AI, reads again, then makes ONE create with everything in it', async () => {
    const created = await createBlogDraftFromTopic({ topic, template: 'list', now: fixedNow, client });
    // AUTO-202: the fields (image included) are resolved after the AI; the
    // second drafts read sits JUST before the create.
    expect(m.log).toEqual(['read-drafts', 'ai', 'fields', 'read-drafts', 'create']);
    expect(m.created).toHaveLength(1);
    const doc = m.created[0];
    const keys = [(doc.aiSuggestedLinks as { _key: string }[])[0]._key, (doc.categories as { _key: string }[])[0]._key];
    let k = 0;
    expect(doc).toEqual(
      buildBlogDraftDocument({
        documentId: created.documentId,
        generated: {
          title: 'Custom Printed Sunglasses: 9 Ideas for Trade Shows',
          metaTitle: 'Meta',
          metaDescription: 'Desc',
          excerpt: 'Excerpt',
          body: doc.body as unknown[],
          suggestedLinks: [{ label: 'Custom Sunglasses', href: '/cat/sunglasses', reason: 'Category page matching the keywords: sunglasses (placed in the body)' }],
        },
        template: 'list',
        wordCount: 1500,
        topic,
        recordedAt: '2026-10-05T10:00:00.000Z',
        keyFor: () => keys[k++],
        fields: fixedFields(),
      }),
    );
    // The four fields, on the document and in the answer.
    expect(doc.author).toEqual({ _type: 'reference', _ref: 'author-patrick-black' });
    expect(doc.categories).toEqual([{ _type: 'reference', _ref: 'blog-category-promotional-product-ideas', _key: keys[1] }]);
    expect(doc.relatedCategorySlugs).toEqual(['sunglasses']);
    expect(doc.headerImage).toEqual(GENERATED_IMAGE);
    expect(doc).not.toHaveProperty('externalHeaderImage');
    expect(created.fields).toEqual({ authorId: 'author-patrick-black', categoryIds: ['blog-category-promotional-product-ideas'], relatedCategorySlugs: ['sunglasses'], notes: [] });
    expect(created.headerImage).toMatchObject({ kind: 'asset', source: 'ai' });
    // The resolver was handed the topic (page included), the AI title, its slug and the body.
    expect(fieldsState.inputs[0]).toMatchObject({ topic, title: 'Custom Printed Sunglasses: 9 Ideas for Trade Shows', slug: 'custom-printed-sunglasses-9-ideas-for-trade-shows' });
    expect(doc._id).toBe(`drafts.${created.documentId}`);
    expect(doc._type).toBe('blogPost');
    expect(doc.slug).toEqual({ _type: 'slug', current: 'custom-printed-sunglasses-9-ideas-for-trade-shows' });
    expect(doc.sourceTopic).toEqual({ query: SUNGLASSES, variants: [SUNGLASSES, 'sunglasses custom'], key: topic.key, recordedAt: '2026-10-05T10:00:00.000Z' });
    expect(doc.aiTopicKeywords).toEqual([SUNGLASSES]);
    expect(doc).not.toHaveProperty('publishDate');
    expect(created.placedLinks).toEqual([{ href: '/cat/sunglasses', anchor: 'custom sunglasses', label: 'Custom Sunglasses', kind: 'category' }]);
    expect(created.variants).toEqual([SUNGLASSES, 'sunglasses custom']);
    expect(created.slug).toBe('custom-printed-sunglasses-9-ideas-for-trade-shows');
  });

  it('titles the AI input from the search the way the panel did', () => {
    expect(topicDraftTitle('custom mini footballs for the office')).toBe('Custom Mini Footballs for the Office');
  });

  it('uses the server write client when none is passed', async () => {
    await createBlogDraftFromTopic({ topic, template: 'single', now: fixedNow });
    expect(serverSanityClient).toHaveBeenCalled();
    expect(m.created).toHaveLength(1);
  });
});

describe('createBlogDraftFromTopic: nothing half made', () => {
  it('a topic that already has a draft is refused BEFORE the AI is called (no spend, no create)', async () => {
    m.written = [{ documentId: 'abc', title: 'Sunglasses From Another Tab', status: 'draft', via: 'recorded', queries: [SUNGLASSES] }];
    await expect(createBlogDraftFromTopic({ topic, template: 'list', client })).rejects.toBeInstanceOf(TopicAlreadyWrittenError);
    expect(m.log).toEqual(['read-drafts']);
    expect(m.created).toHaveLength(0);
    try {
      await createBlogDraftFromTopic({ topic, template: 'list', client });
    } catch (e) {
      const err = e as TopicAlreadyWrittenError;
      expect(err.status).toBe(409);
      expect(err.aiSpent).toBe(false);
      expect(err.message).toContain('You already generated a draft from this topic: "Sunglasses From Another Tab".');
      expect(err.message).toContain('Nothing was created.');
    }
  });

  it('a draft made while the AI was writing stops the create; the message says the call was spent; the picture already uploaded is removed', async () => {
    m.writtenAfterAi = [{ documentId: 'other', title: 'Made During The Wait', status: 'draft', via: 'recorded', queries: [SUNGLASSES] }];
    const deleted: string[] = [];
    const deletingClient = { ...client, delete: vi.fn(async (id: string) => void deleted.push(id)) };
    const err = await thrown(() => createBlogDraftFromTopic({ topic, template: 'list', client: deletingClient }));
    expect(err).toBeInstanceOf(TopicAlreadyWrittenError);
    expect((err as TopicAlreadyWrittenError).aiSpent).toBe(true);
    expect((err as Error).message).toContain('appeared while this one was being written');
    expect(m.log).toEqual(['read-drafts', 'ai', 'fields', 'read-drafts']);
    expect(m.created).toHaveLength(0);
    expect(deleted).toEqual(['image-generated-1376x768-jpg']);
    // Without a delete on the client, the refusal still stands and nothing throws.
    expect(await thrown(() => createBlogDraftFromTopic({ topic, template: 'list', client }))).toBeInstanceOf(TopicAlreadyWrittenError);
  });

  it('allowDuplicate skips both checks: the AI runs and the draft is created beside the existing one', async () => {
    m.written = [{ documentId: 'abc', title: 'Existing', status: 'draft', via: 'recorded', queries: [SUNGLASSES] }];
    await createBlogDraftFromTopic({ topic, template: 'list', client, allowDuplicate: true });
    expect(m.log).toEqual(['ai', 'fields', 'create']);
    expect(m.created).toHaveLength(1);
  });

  it('AUTO-202: the second drafts read is the last thing before the create', async () => {
    await createBlogDraftFromTopic({ topic, template: 'list', client });
    expect(m.log.slice(-2)).toEqual(['read-drafts', 'create']);
  });

  it('AUTO-202: a draft with no picture, no author and no categories is still created, with the keys absent rather than null', async () => {
    fieldsState.result = {
      authorId: null,
      categoryIds: [],
      relatedCategorySlugs: [],
      headerImage: { kind: 'none', notes: ['the image model failed: 503', 'the header image library is empty', 'the post has no product photo to fall back on'] },
      notes: ['no author: the author document "author-patrick-black" does not exist'],
    };
    const created = await createBlogDraftFromTopic({ topic, template: 'list', client });
    expect(m.created).toHaveLength(1);
    const doc = m.created[0];
    for (const key of ['author', 'categories', 'relatedCategorySlugs', 'headerImage', 'externalHeaderImage']) expect(doc, key).not.toHaveProperty(key);
    expect(created.headerImage.kind).toBe('none');
    expect(created.fields.notes).toEqual(['no author: the author document "author-patrick-black" does not exist']);
  });

  it('AUTO-202: the product-photo fallback is written as the hot link', async () => {
    fieldsState.result = {
      authorId: null,
      categoryIds: [],
      relatedCategorySlugs: [],
      headerImage: { kind: 'url', source: 'product', url: 'https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?w=275', alt: 'Bottle', notes: [] },
      notes: [],
    };
    await createBlogDraftFromTopic({ topic, template: 'list', client });
    expect(m.created[0].externalHeaderImage).toEqual({ url: 'https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?w=275', alt: 'Bottle' });
    expect(m.created[0]).not.toHaveProperty('headerImage');
  });

  it('AUTO-202: even the field resolver throwing never stops the draft', async () => {
    fieldsState.throws = new Error('settings exploded');
    const created = await createBlogDraftFromTopic({ topic, template: 'list', client });
    expect(m.log).toEqual(['read-drafts', 'ai', 'fields', 'read-drafts', 'create']);
    expect(m.created).toHaveLength(1);
    expect(created.headerImage).toEqual({ kind: 'none', notes: ['the fields beside the body could not be resolved: settings exploded'] });
    expect(created.fields.authorId).toBeNull();
  });

  it('a failed drafts read stops the generation: nothing sent to the AI, nothing created', async () => {
    m.readFails = true;
    await expect(createBlogDraftFromTopic({ topic, template: 'list', client })).rejects.toThrow('Could not read your blog drafts');
    expect(m.log).toEqual(['read-drafts']);
    expect(m.created).toHaveLength(0);
  });

  it('the AI failing (or timing out) leaves nothing: no create', async () => {
    m.aiFails = Object.assign(new Error('DeepSeek did not answer within 150 seconds. Try again.'), { status: 504 });
    await expect(createBlogDraftFromTopic({ topic, template: 'list', client })).rejects.toThrow('did not answer within 150 seconds');
    expect(m.log).toEqual(['read-drafts', 'ai']);
    expect(m.created).toHaveLength(0);
  });

  it('the AI answering and the write failing leaves nothing; the error says the post was written and nothing was saved', async () => {
    m.createFails = new Error('Insufficient permissions');
    const err = await thrown(() => createBlogDraftFromTopic({ topic, template: 'list', client }));
    expect(err).toBeInstanceOf(DraftWriteError);
    expect((err as DraftWriteError).status).toBe(502);
    expect((err as Error).message).toBe('The post was written but the draft could not be saved (Insufficient permissions). Nothing was created. Try again.');
    expect(m.created).toHaveLength(0);
    // Create was the LAST step: there was nothing after it to half-finish.
    expect(m.log[m.log.length - 1]).toBe('create');
  });

  it('with no write client in the environment it refuses before anything runs', async () => {
    await expect(createBlogDraftFromTopic({ topic, template: 'list', client: null })).rejects.toBeInstanceOf(DraftClientError);
    expect(m.log).toEqual([]);
  });

  it('an AI title that slugifies to nothing is refused before the create', async () => {
    const gen = await import('./generate-blog-post');
    vi.mocked(gen.generateBlogPost).mockImplementationOnce(async () => ({
      title: '!!!',
      titleShape: 'list',
      template: 'list',
      metaTitle: '',
      metaDescription: '',
      excerpt: '',
      body: [],
      suggestedLinks: [],
      placedLinks: [],
      words: 1500,
    }));
    await expect(createBlogDraftFromTopic({ topic, template: 'list', client })).rejects.toThrow('did not return a usable title');
    expect(m.created).toHaveLength(0);
  });
});
