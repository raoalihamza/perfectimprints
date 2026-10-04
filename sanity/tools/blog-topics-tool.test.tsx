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

import { WRITTEN_TOPICS_QUERY, applyGuard, buildTopSevenIndex, countTopics, findTopSevenNow, groupIntoTopics, type PoolQuery } from '../../lib/blog-automation/topic-pool';

const m = vi.hoisted(() => ({
  log: [] as string[],
  drafts: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  checkFails: false,
  authFetch: vi.fn(),
  navigateIntent: vi.fn(),
  /** AUTO-201: every `generate` request body the tab sent to the route. */
  generateBodies: [] as Record<string, unknown>[],
  /** AUTO-201: what the route answers a `generate` with (null = the happy answer). */
  generateAnswer: null as null | { status: number; body: Record<string, unknown> },
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
  m.generateBodies = [];
  m.generateAnswer = null;
  m.authFetch.mockImplementation(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { action?: string };
    if (url === '/api/sanity/blog-topics' && body.action === 'pool') return json(poolResponse());
    if (url === '/api/sanity/blog-topics' && body.action === 'generate') {
      // AUTO-201: the server does the whole job and answers with the draft it wrote.
      m.log.push('generate');
      m.generateBodies.push(body);
      if (m.generateAnswer) return json(m.generateAnswer.body, m.generateAnswer.status);
      return json({
        ok: true,
        documentId: 'd1',
        draftId: 'drafts.d1',
        title: 'Custom Printed Sunglasses for Summer Events',
        slug: 'custom-printed-sunglasses-for-summer-events',
        variants: [SUNGLASSES, 'sunglasses custom'],
        placedLinks: [{ href: '/cat/sunglasses', anchor: 'custom sunglasses', label: 'Custom Sunglasses', kind: 'category' }],
        words: 1500,
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

describe('Blog Topics tab: Generate draft (AUTO-117, server-side since AUTO-201)', () => {
  it('asks the server to write the draft after a live check, creates nothing itself, and the row leaves Usable at once', async () => {
    await render();
    expect(button(/^Usable \(/).textContent).toBe('Usable (2)');

    await click(button('Generate draft', row(SUNGLASSES)));

    // Order: live check of the drafts, then ONE request to the server, which
    // writes the draft. The tab's Studio client never creates anything.
    expect(m.log).toEqual(['check-drafts', 'generate']);
    expect(client.create).not.toHaveBeenCalled();
    expect(m.created).toHaveLength(0);
    expect(m.generateBodies).toHaveLength(1);
    expect(m.generateBodies[0]).toMatchObject({
      action: 'generate',
      topic: { key: 'sunglass', query: SUNGLASSES, variants: [SUNGLASSES, 'sunglasses custom'] },
      template: 'list',
      wordCount: 1500,
      allowDuplicate: false,
    });

    // Excluded immediately, no reload, no Search Console refresh.
    expect(button(/^Usable \(/).textContent).toBe('Usable (1)');
    expect(button(/^Excluded \(/).textContent).toBe('Excluded (1)');
    expect(container.textContent).toContain('Drafts created from this tab');
    // The links the server placed are shown before the draft is opened.
    expect(container.textContent).toContain('1 internal link placed in the text, opening in the same tab: "custom sunglasses" to /cat/sunglasses.');
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
    expect(m.generateBodies).toHaveLength(0);
    expect(client.create).not.toHaveBeenCalled();
    // The row now shows what the check found.
    expect(button(/^Usable \(/).textContent).toBe('Usable (1)');
  });

  it('confirming "generate anyway" sends allowDuplicate, the only thing that skips the server check', async () => {
    await render();
    m.drafts.push({ _id: 'drafts.other', title: 'Sunglasses From Another Tab', sourceTopic: { query: SUNGLASSES } });
    vi.mocked(window.confirm).mockReturnValue(true);
    await click(button('Generate draft', row(SUNGLASSES)));
    expect(m.log).toEqual(['check-drafts', 'generate']);
    expect(m.generateBodies[0]).toMatchObject({ allowDuplicate: true });
  });

  it('when the live check fails, nothing is sent and nothing is created', async () => {
    await render();
    m.checkFails = true;
    await click(button('Generate draft', row(SUNGLASSES)));
    expect(m.log).toEqual(['check-drafts']);
    expect(m.generateBodies).toHaveLength(0);
    expect(client.create).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Could not check whether this topic already has a draft');
  });

  it('a server refusal (409) is shown on the row with its hint, and no draft is listed', async () => {
    await render();
    m.generateAnswer = {
      status: 409,
      body: { error: 'You already generated a draft from this topic: "Made Elsewhere". It counts even though it is not published yet. Nothing was created.', hint: 'Open that draft instead.' },
    };
    await click(button('Generate draft', row(SUNGLASSES)));
    expect(m.log).toEqual(['check-drafts', 'generate']);
    expect(container.textContent).toContain('"Made Elsewhere"');
    expect(container.textContent).toContain('Open that draft instead.');
    expect(container.textContent).not.toContain('Drafts created from this tab');
    expect(button(/^Usable \(/).textContent).toBe('Usable (2)');
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
    const closest = cells[10].textContent ?? '';
    expect(closest).toContain('engraved sunglasses 99');
    expect(closest).toContain('Custom Sunglasses With Logo 81');
    // The check column says what it said without the figures.
    expect(cells[9].textContent).toContain('Usable');
    expect(counts()).toEqual(['Usable (2)', 'Excluded (0)', 'Blocked (0)', 'All (2)']);
    expect(button('Generate draft', r).disabled).toBe(false);
    expect(container.textContent).toContain('A high score means the words are alike, not that the posts');
    expect(container.textContent).not.toMatch(/duplicate/i);

    // Clicking a closest topic only finds it in the list: no write, no block, no AI.
    await click(button('engraved sunglasses', cells[10]));
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(search.value).toBe('engraved sunglasses');
    expect(client.create).not.toHaveBeenCalled();
    expect(m.log).toEqual([]);
  });

  it('figures for another snapshot are not shown against this list', async () => {
    answerSimilar(() => json(similarResponse('2026-09-27T09:00:00.000Z')));
    await render();
    expect(row(SUNGLASSES).querySelectorAll('td')[10].textContent).toBe('');
    expect(counts()).toEqual(['Usable (2)', 'Excluded (0)', 'Blocked (0)', 'All (2)']);
  });
});

describe('Blog Topics tab: the wider window (AUTO-121)', () => {
  /** A pool with one 90-day topic and two the 16 months added, one of them already in the top 7 now. */
  function widePoolResponse() {
    const queries: PoolQuery[] = [
      { query: SUNGLASSES, clicks: 3, impressions: 333, position: 14.2, page: '/cat/sunglasses', long: { impressions: 1200, clicks: 10, position: 16.1 }, seenDays: 30, window: 'recent' },
      { query: 'custom church fans', clicks: 0, impressions: 0, position: null, page: '/cat/paper-hand-fans', long: { impressions: 1212, clicks: 12, position: 33.9 }, seenDays: 180, window: 'older' },
      { query: 'value calendars', clicks: 20, impressions: 233, position: 6.0, page: '/cat/calendars', long: { impressions: 969, clicks: 40, position: 14.5 }, seenDays: 30, window: 'older' },
    ];
    const index = buildTopSevenIndex([
      { query: 'value calendars', position: 6.0, impressions: 233, page: '/cat/calendars' },
      { query: 'rubber duck', position: 2.1, impressions: 49, page: '/blog/10-facts-rubber-ducks' },
    ]);
    const candidates = groupIntoTopics(queries);
    for (const c of candidates) c.topSevenNow = findTopSevenNow(c, index);
    const topics = candidates.map((c) => applyGuard(c, null));
    return {
      ...poolResponse(),
      longWindow: { start: '2025-06-09', end: '2026-09-28', days: 480, floor: 55 },
      gsc: { allQueries: 3, poolQueries: 1, longQueries: 3, addedQueries: 2 },
      cacheBytes: 940545,
      omittedOlderTopics: 0,
      cacheWarning: null,
      counts: countTopics(topics),
      topics,
    };
  }

  function answerPool(respond: () => ReturnType<typeof json>) {
    const base = m.authFetch.getMockImplementation()!;
    m.authFetch.mockImplementation(async (url: string, init: { body: string }) => {
      if (url === '/api/sanity/blog-topics' && JSON.parse(init.body).action === 'pool') return respond();
      return base(url, init);
    });
  }

  const seenSelect = () => container.querySelector('select[aria-label="Which searches to show"]') as HTMLSelectElement;

  async function chooseSeen(value: string) {
    await act(async () => {
      const el = seenSelect();
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
  }

  it('opens on the 90-day list exactly as before, and the added topics sit behind the Seen filter', async () => {
    answerPool(() => json(widePoolResponse()));
    await render();
    expect(seenSelect().value).toBe('recent');
    expect(row(SUNGLASSES)).toBeTruthy();
    expect(() => row('custom church fans')).toThrow();
    expect(container.textContent).toContain('1 seen in the last 90 days, 2 added by the 16 months');
    // The 16-month figures and Last seen sit on the 90-day row too.
    const cells = row(SUNGLASSES).querySelectorAll('td');
    expect(cells[2].textContent).toBe('333');
    expect(cells[6].textContent).toContain('1,200 impr.');
    expect(cells[6].textContent).toContain('pos. 16.1');
    expect(cells[7].textContent).toBe('in the last 30 days');

    await chooseSeen('older');
    expect(() => row(SUNGLASSES)).toThrow();
    const fans = row('custom church fans');
    const fansCells = fans.querySelectorAll('td');
    expect(fansCells[2].textContent).toBe('none in the last 90 days');
    expect(fansCells[4].textContent).toContain('1,212 impr.');
    expect(fansCells[5].textContent).toBe('3 to 6 months ago');
    expect(fansCells[7].textContent).toContain('Usable');
    expect(button('Generate draft', fans).disabled).toBe(false);
    // No colour and no word that judges the age: the fact only.
    expect(container.textContent).not.toMatch(/stale|dead/i);

    await chooseSeen('all');
    expect(row(SUNGLASSES)).toBeTruthy();
    expect(row('custom church fans')).toBeTruthy();
  });

  it('a topic whose own search already ranks in the top 7 is excluded and says so; the count is on the line', async () => {
    answerPool(() => json(widePoolResponse()));
    await render();
    await chooseSeen('all');
    // Excluded rows are hidden by the default state filter; show them.
    await click(button(/^Excluded \(/));
    const calendars = row('value calendars');
    const check = calendars.querySelectorAll('td')[9].textContent ?? '';
    expect(check).toContain('Excluded');
    expect(check).toContain('You already rank in the top 7 for this topic (average position 6.0 over 233 impressions in the last 90 days, best for "value calendars" at 6.0 with /cat/calendars)');
    expect(container.textContent).toContain('1 because you already rank in the top 7 for them');
    expect(button(/^Usable \(/).textContent).toBe('Usable (2)');
  });

  it('shows the cache warning and the trimmed count when the route reports them', async () => {
    answerPool(() => json({ ...widePoolResponse(), cacheWarning: 'The saved list is not being kept between opens (the entry is 2.10 MB).', omittedOlderTopics: 12, cacheBytes: 1600000 }));
    await render();
    expect(container.textContent).toContain('The saved list is not being kept between opens');
    expect(container.textContent).toContain('12 of the older topics');
    expect(container.textContent).toContain('Every topic seen in the last 90 days is here');
  });
});

describe('Blog Topics tab: search volume is a column, never a rule (AUTO-123)', () => {
  const volumeFile = {
    source: 'Google Ads Keyword Planner, via DataForSEO keywords_data/google_ads/search_volume (United States, English)',
    locationId: 2840,
    language: 'en',
    terms: {
      [SUNGLASSES]: { v: 9900, f: '2026-10-02', m: '2026-05' },
      'engraved sunglasses': { v: 0, f: '2026-09-01', m: '2026-04' },
    },
    failed: {},
  };

  function withVolumes(searchVolumes: unknown) {
    m.authFetch.mockImplementation(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { action?: string };
      if (url === '/api/sanity/blog-topics' && body.action === 'pool') return json({ ...poolResponse(), searchVolumes });
      if (url === '/api/sanity/blog-topics' && body.action === 'similar') return json({ ok: false, unavailable: true }, 503);
      return json({ error: 'unexpected' }, 500);
    });
  }

  function cellText(query: string): string {
    const r = row(query);
    const headers = [...container.querySelectorAll('thead th')].map((h) => h.textContent?.trim());
    const at = headers.indexOf('Searches a month (Google Ads)');
    expect(at).toBeGreaterThan(-1);
    return r.querySelectorAll('td')[at].textContent?.trim() ?? '';
  }

  it('with the file missing, the column reads "not looked up" on every row, the notice says so, and the counts are what they were', async () => {
    withVolumes(null);
    await render();
    expect(button('Usable (2)')).toBeTruthy();
    expect(button('Excluded (0)')).toBeTruthy();
    expect(cellText(SUNGLASSES)).toBe('not looked up');
    expect(cellText('engraved sunglasses')).toBe('not looked up');
    expect(container.textContent).toContain('No search volumes have been looked up yet');
    expect(container.textContent).not.toMatch(/\b0\b searches/);
  });

  it('with the file present, the figure shows (0 as 0, a number as a number), the age is visible, and no state or count moves', async () => {
    withVolumes(volumeFile);
    await render();
    expect(button('Usable (2)')).toBeTruthy();
    expect(button('Excluded (0)')).toBeTruthy();
    expect(cellText(SUNGLASSES)).toBe('9,900');
    expect(cellText('engraved sunglasses')).toBe('0');
    expect(container.textContent).toContain('Figures for 2 of the 2 topics');
    expect(container.textContent).toContain('between 1 September 2026 and 2 October 2026');
    expect(container.textContent).toContain("Google's own figures run to between April 2026 and May 2026");
    // The default order is by impressions: the 9,900 row is first because it has the most impressions, not because of the volume.
    const order = [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td div')?.textContent);
    expect(order).toEqual([SUNGLASSES, 'engraved sunglasses']);
    // The sort box offers volume and does not start on it.
    const sortSelect = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'volume')) as HTMLSelectElement;
    expect(sortSelect.value).toBe('impressions');
  });

  it('a figure looked up for another wording of the topic is shown and named; a partial file leaves the rest "not looked up"', async () => {
    withVolumes({ ...volumeFile, terms: { 'sunglasses custom': { v: 320, f: '2026-10-02', m: '2026-05' } } });
    await render();
    expect(cellText(SUNGLASSES)).toContain('320');
    expect(cellText(SUNGLASSES)).toContain('for "sunglasses custom"');
    expect(cellText('engraved sunglasses')).toBe('not looked up');
    expect(container.textContent).toContain('Figures for 1 of the 2 topics');
    expect(button('Usable (2)')).toBeTruthy();
  });
});
