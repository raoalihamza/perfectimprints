// @vitest-environment jsdom
/**
 * AUTO-117: the Blog Topics tab driven for real (React 19 `act`; the Studio
 * client, the router and the nonce fetch mocked).
 *
 *   - "Generate draft" records the topic ON the draft, in the same create.
 *   - The drafts are re-read live BEFORE the AI is called; a draft made since
 *     the list loaded stops the generation unless Patrick confirms.
 *   - The row leaves the usable list the moment the draft exists.
 *   - If the live check fails, nothing is generated.
 */
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WRITTEN_TOPICS_QUERY, applyGuard, countTopics, groupIntoTopics } from '../../lib/blog-automation/topic-pool';

const m = vi.hoisted(() => ({
  log: [] as string[],
  drafts: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  checkFails: false,
  authFetch: vi.fn(),
  navigateIntent: vi.fn(),
}));

vi.mock('sanity', () => ({
  useClient: () => client,
  useCurrentUser: () => ({ id: 'user-1' }),
}));
vi.mock('sanity/router', () => ({
  useRouter: () => ({ navigateIntent: m.navigateIntent }),
}));
vi.mock('../components/useGenerateAuthFetch', () => ({
  useGenerateAuthFetch: () => m.authFetch,
}));

const client = {
  fetch: vi.fn(async (query: string) => {
    if (query === WRITTEN_TOPICS_QUERY) {
      m.log.push('check-drafts');
      if (m.checkFails) throw new Error('network down');
      return m.drafts;
    }
    return []; // the negative keyword list: nothing blocked
  }),
  create: vi.fn(async (doc: Record<string, unknown>) => {
    m.log.push('create');
    m.created.push(doc);
    return doc;
  }),
};

// eslint-disable-next-line import/first
import { blogTopicsTool } from './blog-topics-tool';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SUNGLASSES = 'custom printed sunglasses';

function poolResponse() {
  const topics = groupIntoTopics([
    { query: SUNGLASSES, clicks: 0, impressions: 333, position: 14.2, page: '/cat/sunglasses' },
    { query: 'sunglasses custom', clicks: 0, impressions: 30, position: 18, page: '/cat/sunglasses' },
    { query: 'engraved sunglasses', clicks: 0, impressions: 40, position: 22, page: '/cat/sunglasses' },
  ]).map((c) => applyGuard(c, null));
  return {
    ok: true,
    generatedAt: '2026-09-28T09:00:00.000Z',
    property: 'https://www.perfectimprints.com/',
    window: { start: '2026-07-01', end: '2026-09-28', days: 90 },
    floor: 10,
    band: { low: 8, high: 40 },
    threshold: 2,
    publishedPosts: 659,
    gsc: { allQueries: 3, poolQueries: 3 },
    buildMs: 1,
    writtenDocuments: 0,
    counts: countTopics(topics),
    topics,
  };
}

const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });

let root: Root;
let container: HTMLDivElement;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render() {
  const Component = blogTopicsTool.component as ComponentType;
  await act(async () => {
    root.render(<Component />);
  });
  await flush();
}

function button(text: string | RegExp, within: ParentNode = container): HTMLButtonElement {
  const all = [...within.querySelectorAll('button')];
  const b = all.find((x) => (typeof text === 'string' ? x.textContent?.trim() === text : text.test(x.textContent ?? '')));
  if (!b) throw new Error(`no button ${String(text)} in: ${all.map((x) => x.textContent).join(' | ')}`);
  return b as HTMLButtonElement;
}

function row(query: string): HTMLTableRowElement {
  const r = [...container.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td div')?.textContent === query);
  if (!r) throw new Error(`no row ${query}`);
  return r as HTMLTableRowElement;
}

async function click(b: HTMLButtonElement) {
  await act(async () => {
    b.click();
  });
  await flush();
}

beforeEach(() => {
  m.log = [];
  m.drafts = [];
  m.created = [];
  m.checkFails = false;
  m.authFetch.mockReset();
  m.authFetch.mockImplementation(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { action?: string };
    if (url === '/api/sanity/blog-topics' && body.action === 'pool') return json(poolResponse());
    if (url === '/api/sanity/generate-blog') {
      m.log.push('ai');
      return json({
        title: 'Custom Printed Sunglasses for Summer Events',
        metaTitle: 'M',
        metaDescription: 'D',
        excerpt: 'E',
        body: [{ _type: 'block', _key: 'b', style: 'normal', markDefs: [], children: [{ _type: 'span', _key: 's', text: 'x', marks: [] }] }],
        suggestedLinks: [],
      });
    }
    return json({ error: 'unexpected' }, 500);
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('Blog Topics tab: Generate draft (AUTO-117)', () => {
  it('records the topic on the draft in the same create, after a live check, and the row leaves Usable at once', async () => {
    await render();
    expect(button(/^Usable \(/).textContent).toBe('Usable (2)');

    await click(button('Generate draft', row(SUNGLASSES)));

    // Order: live check of the drafts, then the AI, then ONE create.
    expect(m.log).toEqual(['check-drafts', 'ai', 'create']);
    expect(m.created).toHaveLength(1);
    const doc = m.created[0];
    expect(String(doc._id)).toMatch(/^drafts\./);
    expect(doc._type).toBe('blogPost');
    expect(doc.sourceTopic).toEqual({
      query: SUNGLASSES,
      variants: [SUNGLASSES, 'sunglasses custom'],
      key: 'sunglass',
      recordedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    // No publish date: AUTO-116 stamps it on Publish.
    expect(doc).not.toHaveProperty('publishDate');

    // Excluded immediately, no reload, no Search Console refresh.
    expect(button(/^Usable \(/).textContent).toBe('Usable (1)');
    expect(button(/^Excluded \(/).textContent).toBe('Excluded (1)');
    expect(container.textContent).toContain('Drafts created from this tab');
    expect(m.authFetch.mock.calls.filter(([, init]) => JSON.parse(init.body).action === 'refresh')).toHaveLength(0);
  });

  it('a draft made since the list loaded stops a second generation unless confirmed', async () => {
    await render();
    // Another tab (or Stage 2) made a draft after this list loaded.
    m.drafts.push({ _id: 'drafts.other', title: 'Sunglasses From Another Tab', sourceTopic: { query: SUNGLASSES } });
    vi.mocked(window.confirm).mockReturnValue(false);

    await click(button('Generate draft', row(SUNGLASSES)));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toContain(
      'You already generated a draft from this topic: "Sunglasses From Another Tab".',
    );
    expect(m.log).toEqual(['check-drafts']);
    expect(m.created).toHaveLength(0);
    // The row now shows what the check found.
    expect(button(/^Usable \(/).textContent).toBe('Usable (1)');
  });

  it('when the live check fails, nothing is sent to the AI and nothing is created', async () => {
    await render();
    m.checkFails = true;
    await click(button('Generate draft', row(SUNGLASSES)));
    expect(m.log).toEqual(['check-drafts']);
    expect(m.created).toHaveLength(0);
    expect(container.textContent).toContain('Could not check whether this topic already has a draft');
  });
});

describe('Blog Topics tab: closest wording is advisory (AUTO-119)', () => {
  /** What the route's `similar` action returns: every topic "99" like the next. */
  function similarResponse(generatedAt = '2026-09-28T09:00:00.000Z') {
    const topics = poolResponse().topics;
    return {
      ok: true,
      generatedAt,
      model: 'gemini-embedding-2',
      dimensions: 768,
      texts: topics.length + 1,
      calls: 1,
      promptTokens: 12,
      costUsd: 0,
      buildMs: 1,
      topicKeys: topics.map((t) => t.key),
      topicQueries: topics.map((t) => t.query),
      posts: [{ title: 'Custom Sunglasses With Logo', href: '/blog/custom-sunglasses' }],
      rows: topics.map((_, i) => [(i + 1) % topics.length, 0.99, 0, 0.812]),
    };
  }

  function answerSimilar(respond: () => ReturnType<typeof json>) {
    const base = m.authFetch.getMockImplementation()!;
    m.authFetch.mockImplementation(async (url: string, init: { body: string }) => {
      if (url === '/api/sanity/blog-topics' && JSON.parse(init.body).action === 'similar') return respond();
      return base(url, init);
    });
  }

  const counts = () => ['Usable', 'Excluded', 'Blocked', 'All'].map((l) => button(new RegExp(`^${l} \\(`)).textContent);

  it('with the embedding service failing, every row renders, every state is unchanged, and it says so in one line', async () => {
    answerSimilar(() => json({ ok: false, unavailable: true, error: 'The closest-wording figures are not available right now.' }, 503));
    await render();
    expect(row(SUNGLASSES)).toBeTruthy();
    expect(row('engraved sunglasses')).toBeTruthy();
    expect(counts()).toEqual(['Usable (2)', 'Excluded (0)', 'Blocked (0)', 'All (2)']);
    expect(container.textContent).toContain('The closest-wording figures are not available right now.');
    expect(container.textContent).toContain('Everything else in this tab works as normal');
    // Still generatable.
    expect(button('Generate draft', row(SUNGLASSES)).disabled).toBe(false);
  });

  it('with the service throwing outright, the same', async () => {
    answerSimilar(() => {
      throw new Error('network down');
    });
    await render();
    expect(counts()).toEqual(['Usable (2)', 'Excluded (0)', 'Blocked (0)', 'All (2)']);
    expect(container.textContent).toContain('not available right now');
  });

  it('with figures present, they show in their own cell and nothing else changes', async () => {
    answerSimilar(() => json(similarResponse()));
    await render();
    const r = row(SUNGLASSES);
    const cells = r.querySelectorAll('td');
    const closest = cells[7].textContent ?? '';
    expect(closest).toContain('engraved sunglasses 99');
    expect(closest).toContain('Custom Sunglasses With Logo 81');
    // The check column says what it said without the figures.
    expect(cells[6].textContent).toContain('Usable');
    expect(counts()).toEqual(['Usable (2)', 'Excluded (0)', 'Blocked (0)', 'All (2)']);
    expect(button('Generate draft', r).disabled).toBe(false);
    expect(container.textContent).toContain('A high score means the words are alike, not that the posts');
    expect(container.textContent).not.toMatch(/duplicate/i);

    // Clicking a closest topic only finds it in the list: no write, no block, no AI.
    await click(button('engraved sunglasses', cells[7]));
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(search.value).toBe('engraved sunglasses');
    expect(client.create).not.toHaveBeenCalled();
    expect(m.log).toEqual([]);
  });

  it('figures for another snapshot are not shown against this list', async () => {
    answerSimilar(() => json(similarResponse('2026-09-27T09:00:00.000Z')));
    await render();
    expect(row(SUNGLASSES).querySelectorAll('td')[7].textContent).toBe('');
    expect(counts()).toEqual(['Usable (2)', 'Excluded (0)', 'Blocked (0)', 'All (2)']);
  });
});
