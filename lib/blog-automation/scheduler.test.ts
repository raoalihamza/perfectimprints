/**
 * AUTO-208: one scheduled post, end to end, with every effect faked at its
 * boundary and the REAL orchestration, the REAL run log over a dataset with
 * real conflict semantics, and the REAL cost estimate. What is proven:
 * nothing happens when paused; the cap and the claim decline; a draft is
 * created with the measured depth handed on; publish mode publishes in one
 * step; every failure leaves nothing half written and is on the run log;
 * a failed slot is retried once, by the next firing.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CreatedBlogDraft } from './create-blog-draft';
import type { ChosenTopic } from './choose-topic';
import { runLogId, type RunLogClient, type RunLogDocument } from './run-log';
import { runScheduledPost, type SchedulerDeps } from './scheduler';
import type { SchedulerSettings } from './scheduler-settings';
import type { Topic } from './topic-pool';

type Stored = RunLogDocument & { _rev: string };

function fakeRunLog() {
  const docs = new Map<string, Stored>();
  let rev = 0;
  const client: RunLogClient = {
    async create(doc) {
      if (docs.has(doc._id)) throw new Error('exists');
      docs.set(doc._id, { ...doc, _rev: `r${(rev += 1)}` });
    },
    async fetch<T>(query: string, params: Record<string, unknown> = {}): Promise<T> {
      if (query.startsWith('*[_id == $id][0]')) {
        const d = docs.get(String(params.id));
        return (d ? { _rev: d._rev, status: d.status, attempts: d.attempts, updatedAt: d.updatedAt, claimedAt: d.claimedAt } : null) as T;
      }
      if (query.startsWith('count(')) return [...docs.values()].filter((d) => d.day === params.day && (d.status === 'written' || d.status === 'published')).length as T;
      throw new Error(`unknown query ${query}`);
    },
    patch(id) {
      const apply = (attrs: Record<string, unknown>, guard?: string) => ({
        async commit() {
          const d = docs.get(id);
          if (!d) throw new Error('missing');
          if (guard !== undefined && guard !== d._rev) throw new Error('revision mismatch');
          docs.set(id, { ...d, ...(attrs as Partial<Stored>), _rev: `r${(rev += 1)}` });
        },
      });
      return { set: (a) => apply(a), ifRevisionId: (g) => ({ set: (a) => apply(a, g) }) };
    },
  };
  return { client, docs };
}

const T0 = new Date('2026-10-17T02:00:03.000Z');
const DAY = '2026-10-17';

function chosen(query = 'custom koozies'): ChosenTopic {
  const topic = { key: 'koozie', query, variants: [query], page: '/cat/koozies', spacingGroups: [] } as unknown as Topic;
  return {
    topic,
    key: 'koozie',
    category: 'koozies',
    depth: { category: 'koozies', supply: 40, categorySize: 76, depth: 76, variants: ['neoprene', 'foam'] },
    shape: 'list',
    queuePosition: 3,
    candidates: [{ query, key: 'koozie', shape: 'list' }],
    recent: { keys: ['pen', 'disc'], shape: 'guide' },
    usable: 900,
  };
}

function created(over: Partial<CreatedBlogDraft> = {}): CreatedBlogDraft {
  const body = [
    { _type: 'block', children: [{ text: 'words' }] },
    { _type: 'blogProducts', products: [{ sku: '1' }, { sku: '2' }, { sku: '3' }] },
    { _type: 'blogProducts', products: [{ sku: '4' }, { sku: '5' }] },
  ];
  return {
    documentId: 'doc-1',
    draftId: 'drafts.doc-1',
    title: '7 Custom Koozie Ideas for Trade Shows',
    slug: '7-custom-koozie-ideas-for-trade-shows',
    titleShape: 'list',
    deepseekCalls: 1,
    variants: ['custom koozies'],
    placedLinks: [{ href: '/cat/koozies', anchor: 'custom koozies', label: 'Koozies', kind: 'category' }],
    suggestedLinks: [],
    words: 1712,
    document: { _id: 'drafts.doc-1', body, aiTemplate: 'list' } as unknown as CreatedBlogDraft['document'],
    fields: { authorId: 'a', categoryIds: [], relatedCategorySlugs: ['koozies'], notes: [] },
    headerImage: {
      kind: 'asset',
      source: 'ai',
      image: { _type: 'image', asset: { _type: 'reference', _ref: 'image-x-1376x768-jpg' }, alt: 'alt' },
      notes: [],
      usage: { model: 'gemini-3-pro-image', imageTokens: 1120, promptTokens: 2000, elapsedMs: 17000, attempts: 1 },
    },
    ...over,
  };
}

function settings(over: Partial<SchedulerSettings> = {}): SchedulerSettings {
  return { paused: false, publishMode: 'draft', negativeKeywords: [], ...over };
}

function makeDeps(over: Partial<SchedulerDeps> & { runLog?: RunLogClient } = {}) {
  const log = fakeRunLog();
  let t = T0.getTime();
  const deps: SchedulerDeps = {
    now: () => new Date((t += 1000)),
    runLog: over.runLog ?? log.client,
    readSettings: over.readSettings ?? (async () => settings()),
    chooseTopic: over.chooseTopic ?? vi.fn(async () => chosen()),
    createDraft: over.createDraft ?? vi.fn(async () => created()),
    publishDraft: over.publishDraft ?? vi.fn(async (c: CreatedBlogDraft) => ({ publishedId: c.documentId })),
    log: () => {},
    ...(over.postsPerDay ? { postsPerDay: over.postsPerDay } : {}),
  };
  return { deps, docs: log.docs };
}

describe('the switches and the cap, before any claim', () => {
  it('PAUSED: nothing happens (no run document, no topic chosen, no call made)', async () => {
    const { deps, docs } = makeDeps({ readSettings: async () => settings({ paused: true }) });
    const out = await runScheduledPost('a', deps);
    expect(out).toMatchObject({ kind: 'skipped', reason: 'paused', day: DAY, slot: 'a' });
    expect(docs.size).toBe(0);
    expect(deps.chooseTopic).not.toHaveBeenCalled();
    expect(deps.createDraft).not.toHaveBeenCalled();
  });

  it('a settings read that fails means nothing happens either', async () => {
    const { deps, docs } = makeDeps({ readSettings: async () => { throw new Error('socket hang up'); } });
    const out = await runScheduledPost('a', deps);
    expect(out).toMatchObject({ kind: 'skipped', reason: 'settings-unreadable' });
    expect(docs.size).toBe(0);
    expect(deps.createDraft).not.toHaveBeenCalled();
  });

  it('the daily cap is the number of slots: with two finished runs today a third slot declines before claiming', async () => {
    const { deps, docs } = makeDeps();
    expect((await runScheduledPost('a', deps)).kind).toBe('written');
    expect((await runScheduledPost('b', deps)).kind).toBe('written');
    const third = await runScheduledPost('proof-x', deps);
    expect(third).toMatchObject({ kind: 'skipped', reason: 'cap' });
    expect(docs.has(runLogId(DAY, 'proof-x'))).toBe(false);
    expect(deps.createDraft).toHaveBeenCalledTimes(2);
  });

  it('a hand-made post eats no slot: the cap counts run documents only', async () => {
    const { deps } = makeDeps();
    // No run documents exist; however many posts the tab made, the firing runs.
    expect((await runScheduledPost('a', deps)).kind).toBe('written');
  });
});

describe('the claim', () => {
  it('a second firing into a finished slot declines as done and makes no call', async () => {
    const { deps } = makeDeps();
    expect((await runScheduledPost('a', deps)).kind).toBe('written');
    const again = await runScheduledPost('a', deps);
    expect(again).toMatchObject({ kind: 'declined', reason: 'done', runId: runLogId(DAY, 'a') });
    expect(deps.createDraft).toHaveBeenCalledTimes(1);
  });
});

describe('a draft, the normal night', () => {
  it('claims, chooses, creates ONE draft with the measured depth handed on, records everything, publishes nothing', async () => {
    const { deps, docs } = makeDeps();
    const out = await runScheduledPost('a', deps);
    expect(out).toMatchObject({ kind: 'written', day: DAY, slot: 'a', attempt: 1, draftId: 'drafts.doc-1', publishedId: null, title: '7 Custom Koozie Ideas for Trade Shows', words: 1712, shape: 'list', topic: 'custom koozies' });
    expect(deps.createDraft).toHaveBeenCalledWith(expect.objectContaining({ depth: expect.objectContaining({ depth: 76 }) }));
    expect(deps.publishDraft).not.toHaveBeenCalled();
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d.status).toBe('written');
    expect(d.stage).toBe('record');
    expect(d.switches).toEqual({ paused: false, publishMode: 'draft' });
    expect(d.topic).toEqual({ query: 'custom koozies', key: 'koozie', page: '/cat/koozies', queuePosition: 3 });
    expect(d.titleShape).toBe('list');
    expect(d.title).toBe('7 Custom Koozie Ideas for Trade Shows');
    expect(d.strips).toEqual({ rows: 2, products: 5 });
    expect(d.placedLinks).toBe(1);
    expect(d.pictureSource).toBe('ai');
    expect(d.choice).toEqual({ recentKeys: ['pen', 'disc'], recentShape: 'guide', candidates: ['custom koozies [koozie / list]'], shape: 'list' });
    expect(d.cost?.totalUsd).toBeGreaterThan(0.1);
    expect(d.cost?.deepseekCalls).toBe(1);
    expect(d.timings?.totalMs).toBeGreaterThan(0);
    expect(d.finishedAt).toBeTruthy();
    expect(d.error).toBeUndefined();
  });

  it('notes a shortened title, a picture that fell back, and the fields it could not fill', async () => {
    const { deps, docs } = makeDeps({
      createDraft: async () =>
        created({
          titleRepair: 'shortened',
          deepseekCalls: 2,
          headerImage: { kind: 'url', source: 'product', url: 'https://imgsirv.geiger.com/x.jpg', alt: 'a', notes: ['the generated picture was refused twice'] },
          fields: { authorId: null, categoryIds: [], relatedCategorySlugs: [], notes: ['no author document exists'] },
        }),
    });
    await runScheduledPost('a', deps);
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d.notes).toEqual(['The title ran past 75 characters and was shortened.', 'Header image: The generated picture was refused twice.', 'no author document exists']);
    expect(d.pictureSource).toBe('product');
    expect(d.cost?.deepseekCalls).toBe(2);
    expect(d.cost?.imageUsd).toBe(0);
  });
});

describe('publish mode', () => {
  it('publishes the created draft in one step and records the published id', async () => {
    const { deps, docs } = makeDeps({ readSettings: async () => settings({ publishMode: 'publish' }) });
    const out = await runScheduledPost('b', deps);
    expect(out).toMatchObject({ kind: 'published', publishedId: 'doc-1' });
    expect(deps.publishDraft).toHaveBeenCalledTimes(1);
    const d = docs.get(runLogId(DAY, 'b'))!;
    expect(d.status).toBe('published');
    expect(d.publishedId).toBe('doc-1');
    expect(d.switches?.publishMode).toBe('publish');
  });
});

describe('failures leave nothing half written and are on the run log', () => {
  it('no usable topic: failed at choose, no draft, no call', async () => {
    const { deps, docs } = makeDeps({ chooseTopic: async () => null });
    const out = await runScheduledPost('a', deps);
    expect(out).toMatchObject({ kind: 'failed', stage: 'choose', draftId: null });
    expect(deps.createDraft).not.toHaveBeenCalled();
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d.status).toBe('failed');
    expect(d.error?.message).toContain('No usable topic');
  });

  it('the generation failing (a DeepSeek timeout): failed at generate, nothing created, nothing published', async () => {
    const { deps, docs } = makeDeps({ createDraft: async () => { throw new Error('DeepSeek did not answer within 150 seconds. Try again.'); } });
    const out = await runScheduledPost('a', deps);
    expect(out).toMatchObject({ kind: 'failed', stage: 'generate', draftId: null });
    expect(deps.publishDraft).not.toHaveBeenCalled();
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d.status).toBe('failed');
    expect(d.error).toEqual({ stage: 'generate', message: 'DeepSeek did not answer within 150 seconds. Try again.' });
    expect(d.draftId).toBeUndefined();
  });

  it('the publish failing: a COMPLETE draft remains and the run names it', async () => {
    const { deps, docs } = makeDeps({
      readSettings: async () => settings({ publishMode: 'publish' }),
      publishDraft: async () => { throw new Error('transaction refused'); },
    });
    const out = await runScheduledPost('a', deps);
    expect(out).toMatchObject({ kind: 'failed', stage: 'publish', draftId: 'drafts.doc-1' });
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d.status).toBe('failed');
    expect(d.draftId).toBe('drafts.doc-1');
    expect(d.title).toBe('7 Custom Koozie Ideas for Trade Shows');
  });

  it('a failed slot is retried ONCE, by the next firing, which takes the claim over (attempt 2); a third firing after success declines', async () => {
    let fail = true;
    const { deps, docs } = makeDeps({
      createDraft: vi.fn(async () => {
        if (fail) {
          fail = false;
          throw new Error('thin post');
        }
        return created();
      }),
    });
    expect((await runScheduledPost('a', deps)).kind).toBe('failed');
    const retry = await runScheduledPost('a', deps);
    expect(retry).toMatchObject({ kind: 'written', attempt: 2 });
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d.attempts).toBe(2);
    expect(d.takenOverFrom).toBe('failed');
    expect(d.status).toBe('written');
    expect(d.notes?.[0]).toContain('took the slot over from a failed run');
    expect((await runScheduledPost('a', deps)).kind).toBe('declined');
    expect(deps.createDraft).toHaveBeenCalledTimes(2);
  });

  it('the ceiling: four firings of a day that always fails make four calls at most, never a loop', async () => {
    const createDraft = vi.fn(async () => { throw new Error('always'); });
    const { deps } = makeDeps({ createDraft });
    for (const slot of ['a', 'a', 'b', 'b']) expect((await runScheduledPost(slot, deps)).kind).toBe('failed');
    expect(createDraft).toHaveBeenCalledTimes(4);
  });
});
