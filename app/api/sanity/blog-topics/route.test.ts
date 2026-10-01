/**
 * AUTO-117: the blog-topics route excludes a topic the moment it has a draft,
 * with no Search Console refresh.
 *
 * Drives the real POST handler and the REAL drafts read
 * (lib/blog-automation/written-topics.ts); only the edges are mocked: the
 * nonce check, the Global Settings read, `revalidateTag`, the 24-hour cache
 * (modelled as a real memo that counts rebuilds), and `@sanity/client`, whose
 * `fetch` answers from an in-memory dataset the test writes a draft into.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  builds: 0,
  cached: null as unknown,
  fetchFails: false,
  fetchCalls: [] as { query: string; options: unknown }[],
  similarityCalls: 0,
  similarityFails: false,
  // AUTO-121: when true the "cache" rebuilds on every call, the failure the route must report.
  rebuildEveryCall: false,
}));

vi.mock('@/lib/sanity/studio-nonce-auth', () => ({
  verifyStudioNonce: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/sanity/queries/global-settings', () => ({
  getSiteSettings: vi.fn(async () => ({ blogAutomation: { negativeKeywords: [] } })),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@sanity/client', () => ({
  createClient: vi.fn(() => ({
    fetch: vi.fn(async (query: string, _params: unknown, options: unknown) => {
      state.fetchCalls.push({ query, options });
      if (state.fetchFails) throw new Error('socket hang up');
      // The query asks for blogPost documents carrying either record, drafts
      // included; the in-memory dataset holds only such documents.
      return state.dataset;
    }),
  })),
}));
vi.mock('@/lib/blog-automation/cached-topic-pool', async () => {
  const pool = await import('@/lib/blog-automation/topic-pool');
  const build = () => {
    state.builds += 1;
    const candidates = pool.groupIntoTopics([
      { query: 'custom printed sunglasses', clicks: 0, impressions: 333, position: 14.2, page: '/cat/sunglasses' },
      { query: 'engraved sunglasses', clicks: 0, impressions: 40, position: 22, page: '/cat/sunglasses' },
    ]);
    return {
      generatedAt: state.rebuildEveryCall ? new Date().toISOString() : '2026-09-28T09:00:00.000Z',
      property: pool.GSC_PROPERTY,
      window: { start: '2026-07-01', end: '2026-09-28', days: 90 },
      longWindow: { start: '2025-06-09', end: '2026-09-28', days: 480, floor: 55 },
      floor: 10,
      band: { low: 8, high: 40 },
      threshold: pool.CANNIBALIZATION_THRESHOLD,
      publishedPosts: 659,
      gsc: { allQueries: 2, poolQueries: 2, queryPages: 1, queryPagePages: 1, queryPageRows: 2, longQueries: 2, longPoolQueries: 0, longQueryPages: 1, addedQueries: 0, pageRequests: 0, pageRequestRows: 0, requests: 7 },
      // The detector found the one-token overlap AUTO-115 reported: never enough.
      topics: candidates.map((c) =>
        pool.applyGuard(c, { sharedTokens: ['sunglasses'], postTitle: 'Old Sunglasses Post', postHref: '/blog/old' }),
      ),
      buildMs: 1,
      cacheBytes: 1234,
      omittedOlderTopics: 0,
    };
  };
  return {
    // A day-long memo: built once, then served, exactly what unstable_cache does.
    getCachedTopicPoolSnapshot: vi.fn(async () => {
      if (!state.cached || state.rebuildEveryCall) state.cached = build();
      return state.cached;
    }),
    // AUTO-119: the advisory figures. Either the embedding service is down, or
    // it says every topic is a near-duplicate of every other (a score of 99).
    getCachedTopicSimilarity: vi.fn(async (snapshot: { generatedAt: string; topics: { key: string; query: string }[] }) => {
      state.similarityCalls += 1;
      if (state.similarityFails) throw new Error('Embedding request failed (429).');
      return {
        generatedAt: snapshot.generatedAt,
        model: 'gemini-embedding-test',
        dimensions: 768,
        texts: snapshot.topics.length,
        calls: 1,
        promptTokens: 10,
        costUsd: 0,
        buildMs: 1,
        topicKeys: snapshot.topics.map((t) => t.key),
        topicQueries: snapshot.topics.map((t) => t.query),
        posts: [{ title: 'Old Sunglasses Post', href: '/blog/old' }],
        rows: snapshot.topics.map((_, i) => [i === 0 ? 1 : 0, 0.99, 0, 0.99]),
      };
    }),
  };
});

// eslint-disable-next-line import/first
import { revalidateTag } from 'next/cache';
// eslint-disable-next-line import/first
import { resetCacheWatchForTests } from '@/lib/blog-automation/cache-watch';

const env = { SANITY_API_TOKEN: process.env.SANITY_API_TOKEN, NEXT_PUBLIC_SANITY_PROJECT_ID: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID };
beforeAll(() => {
  process.env.SANITY_API_TOKEN = 'test-token';
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'test-project';
});
afterAll(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  state.dataset = [];
  state.cached = null;
  state.builds = 0;
  state.fetchFails = false;
  state.fetchCalls = [];
  state.similarityCalls = 0;
  state.similarityFails = false;
  state.rebuildEveryCall = false;
  resetCacheWatchForTests();
  vi.mocked(revalidateTag).mockClear();
});

async function call(action: string) {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/sanity/blog-topics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function pool() {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/sanity/blog-topics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pool' }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { topics: { query: string; state: string; rule: string | null; reason: string | null }[] } };
}

const stateOf = (topics: { query: string; state: string }[], q: string) => topics.find((t) => t.query === q)?.state;

describe('POST /api/sanity/blog-topics (AUTO-117)', () => {
  it('a one-token topic is usable with no draft, and excluded on the NEXT call once an unpublished draft exists, with no refresh', async () => {
    const first = await pool();
    expect(first.status).toBe(200);
    expect(stateOf(first.body.topics, 'custom printed sunglasses')).toBe('usable');

    // What the panel's create writes: a DRAFT (never published) carrying its topic.
    state.dataset.push({
      _id: 'drafts.4f1c',
      title: 'Custom Printed Sunglasses for Summer Events',
      sourceTopic: { query: 'custom printed sunglasses', variants: ['custom printed sunglasses'] },
      aiTopicKeywords: ['custom printed sunglasses'],
    });

    const second = await pool();
    expect(second.status).toBe(200);
    const t = second.body.topics.find((x) => x.query === 'custom printed sunglasses')!;
    expect(t.state).toBe('excluded');
    expect(t.rule).toBe('already-written');
    expect(t.reason).toContain('You already generated a draft from this topic');
    // The near synonym is a different topic and stays usable.
    expect(stateOf(second.body.topics, 'engraved sunglasses')).toBe('usable');
    expect(second.body.writtenDocuments).toBe(1);
    expect((second.body.counts as Record<string, number>).excludedAlreadyWritten).toBe(1);

    // Same cached snapshot both times: nothing was rebuilt, nothing expired.
    expect(state.builds).toBe(1);
    expect(revalidateTag).not.toHaveBeenCalled();
    // And the drafts were read live on both calls, never from a data cache.
    expect(state.fetchCalls).toHaveLength(2);
    for (const c of state.fetchCalls) expect(c.options).toEqual({ cache: 'no-store' });
  });

  it('deleting the draft brings the topic back on the next call', async () => {
    state.dataset.push({ _id: 'drafts.4f1c', title: 'T', sourceTopic: { query: 'custom printed sunglasses' } });
    expect(stateOf((await pool()).body.topics, 'custom printed sunglasses')).toBe('excluded');
    state.dataset = [];
    expect(stateOf((await pool()).body.topics, 'custom printed sunglasses')).toBe('usable');
  });

  it('when the drafts cannot be read it answers an error, never a list that skipped the check', async () => {
    state.fetchFails = true;
    const res = await pool();
    expect(res.status).toBe(502);
    expect(res.body.topics).toBeUndefined();
    expect(String(res.body.error)).toContain('Could not read your blog drafts');
    expect(res.body.hint).toBeTruthy();
  });
});

describe('POST /api/sanity/blog-topics, closest wording (AUTO-119)', () => {
  it('the pool never asks for the figures, and its answer is identical before and after they are computed', async () => {
    const before = await pool();
    expect(before.status).toBe(200);
    expect(state.similarityCalls).toBe(0);

    const figures = await call('similar');
    expect(figures.status).toBe(200);
    expect(figures.body.ok).toBe(true);
    expect(Array.isArray(figures.body.rows)).toBe(true);
    expect(state.similarityCalls).toBe(1);

    // Every topic "scored 99" against another: nothing moved.
    const after = await pool();
    expect(after.body.topics).toEqual(before.body.topics);
    expect(after.body.counts).toEqual(before.body.counts);
    expect(state.similarityCalls).toBe(1);
  });

  it('with the embedding service failing, `similar` answers unavailable and the pool works exactly as normal', async () => {
    state.similarityFails = true;
    const figures = await call('similar');
    expect(figures.status).toBe(503);
    expect(figures.body).toMatchObject({ ok: false, unavailable: true });
    expect(String(figures.body.hint)).toContain('Everything else in this tab works as normal');
    expect(JSON.stringify(figures.body)).not.toContain('429');

    const list = await pool();
    expect(list.status).toBe(200);
    expect(stateOf(list.body.topics, 'custom printed sunglasses')).toBe('usable');
    expect(stateOf(list.body.topics, 'engraved sunglasses')).toBe('usable');
  });

  it('an unknown action is still refused', async () => {
    const res = await call('merge');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/sanity/blog-topics, the wider window and the cache watch (AUTO-121)', () => {
  it('the pool answer carries the wider window, the entry size and no warning while the cache is kept', async () => {
    const first = await pool();
    expect(first.status).toBe(200);
    expect(first.body.longWindow).toEqual({ start: '2025-06-09', end: '2026-09-28', days: 480, floor: 55 });
    expect(first.body.cacheBytes).toBe(1234);
    expect(first.body.omittedOlderTopics).toBe(0);
    expect(first.body.cacheWarning).toBeNull();
    expect((first.body.counts as Record<string, number>).recent).toBe(2);
    expect((first.body.counts as Record<string, number>).older).toBe(0);
    for (const t of first.body.topics as Record<string, unknown>[]) {
      expect(t.long).toEqual({ impressions: t.impressions, clicks: t.clicks, position: t.position });
      expect(t.seenDays).toBe(90);
      expect(t.window).toBe('recent');
      expect(t.topSevenNow).toBeNull();
    }
    // The same cached snapshot again: still no warning.
    const second = await pool();
    expect(second.body.cacheWarning).toBeNull();
    expect(state.builds).toBe(1);
  });

  it('a list rebuilt on every call with no Refresh between is reported, not silent', async () => {
    state.rebuildEveryCall = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await pool();
    expect(first.body.cacheWarning).toBeNull();
    const second = await pool();
    expect(state.builds).toBe(2);
    expect(String(second.body.cacheWarning)).toContain('not being kept between opens');
    expect(String(second.body.cacheWarning)).toContain('Ali');
    expect(spy.mock.calls.some((c) => String(c[1]).includes('not being kept'))).toBe(true);
    // The list itself is still correct and complete.
    expect(second.body.topics).toHaveLength(2);
    spy.mockRestore();
  });

  it('a rebuild that Refresh asked for is not a warning', async () => {
    state.rebuildEveryCall = true;
    await pool();
    const refreshed = await call('refresh');
    expect(refreshed.status).toBe(200);
    const after = await pool();
    expect(after.body.cacheWarning).toBeNull();
  });
});
