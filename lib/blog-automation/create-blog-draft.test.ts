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
    generateBlogPost: vi.fn(async (input: { title: string; keywords: string[] }) => {
      m.log.push('ai');
      if (m.aiFails) throw m.aiFails;
      return {
        title: `${input.title}: 9 Ideas for Trade Shows`,
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
  client.create.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe('createBlogDraftFromTopic: the happy path', () => {
  it('reads the drafts, calls the AI, reads again, then makes ONE create with everything in it', async () => {
    const created = await createBlogDraftFromTopic({ topic, template: 'list', now: fixedNow, client });
    expect(m.log).toEqual(['read-drafts', 'ai', 'read-drafts', 'create']);
    expect(m.created).toHaveLength(1);
    const doc = m.created[0];
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
        keyFor: () => (doc.aiSuggestedLinks as { _key: string }[])[0]._key,
      }),
    );
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

  it('a draft made while the AI was writing stops the create; the message says the call was spent', async () => {
    m.writtenAfterAi = [{ documentId: 'other', title: 'Made During The Wait', status: 'draft', via: 'recorded', queries: [SUNGLASSES] }];
    const err = await thrown(() => createBlogDraftFromTopic({ topic, template: 'list', client }));
    expect(err).toBeInstanceOf(TopicAlreadyWrittenError);
    expect((err as TopicAlreadyWrittenError).aiSpent).toBe(true);
    expect((err as Error).message).toContain('appeared while this one was being written');
    expect(m.log).toEqual(['read-drafts', 'ai', 'read-drafts']);
    expect(m.created).toHaveLength(0);
  });

  it('allowDuplicate skips both checks: the AI runs and the draft is created beside the existing one', async () => {
    m.written = [{ documentId: 'abc', title: 'Existing', status: 'draft', via: 'recorded', queries: [SUNGLASSES] }];
    await createBlogDraftFromTopic({ topic, template: 'list', client, allowDuplicate: true });
    expect(m.log).toEqual(['ai', 'create']);
    expect(m.created).toHaveLength(1);
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
