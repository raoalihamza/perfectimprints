/**
 * AUTO-117: the guard remembers what it has already written.
 *
 * AUTO-115 generated a post from "custom printed sunglasses", published it,
 * and found ZERO of 2,423 topics changed state: rule one cannot fire on a
 * one-token topic, rule two waits for Google, and drafts were invisible. These
 * tests pin the record that replaces that guessing: stored on the post,
 * read with drafts included, matched by the same key the row was grouped
 * under, and applied on every request rather than from the cached snapshot.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  CANNIBALIZATION_THRESHOLD,
  SOURCE_TOPIC_MAX_VARIANTS,
  WRITTEN_TOPICS_QUERY,
  applyGuard,
  applyNegativeKeywords,
  applyWrittenTopics,
  buildSourceTopicRecord,
  countTopics,
  decideGuard,
  detectorInput,
  findWrittenTopic,
  groupIntoTopics,
  isVagueTopicKeyword,
  queryTopicKey,
  topicBlockRule,
  topicKey,
  writtenSentence,
  writtenTopicIndex,
  writtenTopicSources,
  type Topic,
  type WrittenTopicDoc,
} from './topic-pool';
import { WrittenTopicsReadError, readWrittenTopicSources } from './written-topics';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** A topic straight out of the guard, the way the route receives it from the snapshot. */
function topic(query: string, page: string | null = '/cat/sunglasses', shared: string[] = []): Topic {
  const [candidate] = groupIntoTopics([{ query, clicks: 0, impressions: 333, position: 14.2, page }]);
  return applyGuard(
    candidate,
    shared.length ? { sharedTokens: shared, postTitle: 'An Older Post', postHref: '/blog/an-older-post' } : null,
  );
}

const SUNGLASSES = 'custom printed sunglasses';

/** What the panel creates, as the read returns it. */
function panelDraft(id: string, query: string, title = 'Custom Printed Sunglasses for Summer Events'): WrittenTopicDoc {
  const t = topic(query);
  return {
    _id: `drafts.${id}`,
    title,
    sourceTopic: buildSourceTopicRecord(t, '2026-09-28T10:00:00.000Z'),
    aiTopicKeywords: [query],
  };
}

describe('the blind spot this closes (AUTO-115, reproduced)', () => {
  it('rule one can never fire on a one-token topic: "custom printed sunglasses" reaches the detector as one word', () => {
    expect(detectorInput(SUNGLASSES)).toBe('sunglasses');
    // Even a perfect detector hit carries at most the one token it was given.
    const d = decideGuard({ page: '/cat/sunglasses' }, { sharedTokens: ['sunglasses'], postTitle: 'P', postHref: '/blog/p' });
    expect(1).toBeLessThan(CANNIBALIZATION_THRESHOLD);
    expect(d.state).toBe('usable');
  });

  it('with a DRAFT from that topic, never published, the topic is excluded', () => {
    const before = topic(SUNGLASSES);
    expect(before.state).toBe('usable');
    const sources = writtenTopicSources([panelDraft('abc', SUNGLASSES)]);
    expect(sources).toEqual([
      expect.objectContaining({ documentId: 'abc', status: 'draft', via: 'recorded' }),
    ]);
    const [after] = applyWrittenTopics([before], sources);
    expect(after.state).toBe('excluded');
    expect(after.rule).toBe('already-written');
    expect(after.writtenAs).toEqual({
      documentId: 'abc',
      title: 'Custom Printed Sunglasses for Summer Events',
      status: 'draft',
      via: 'recorded',
      matchedQuery: SUNGLASSES,
    });
  });

  it('the reason reads plainly and says an unpublished draft counts', () => {
    const [after] = applyWrittenTopics([topic(SUNGLASSES)], writtenTopicSources([panelDraft('abc', SUNGLASSES)]));
    expect(after.reason).toBe(
      'You already generated a draft from this topic: "Custom Printed Sunglasses for Summer Events". It counts even though it is not published yet.',
    );
  });
});

describe('the record', () => {
  it('stores the search, the searches grouped with it, the key, and when', () => {
    const [t] = groupIntoTopics([
      { query: 'custom printed sunglasses', clicks: 1, impressions: 90, position: 12, page: null },
      { query: 'sunglasses custom  printed', clicks: 0, impressions: 20, position: 30, page: null },
    ]);
    const r = buildSourceTopicRecord(t, '2026-09-28T10:00:00.000Z');
    expect(r).toEqual({
      query: 'custom printed sunglasses',
      variants: ['custom printed sunglasses', 'sunglasses custom printed'],
      key: 'sunglass',
      recordedAt: '2026-09-28T10:00:00.000Z',
    });
  });

  it('caps the variants and never repeats the representative', () => {
    const variants = Array.from({ length: 60 }, (_, i) => `sunglasses ${i}`);
    const r = buildSourceTopicRecord({ key: 'k', query: 'sunglasses 0', variants }, 'now');
    expect(r.variants).toHaveLength(SOURCE_TOPIC_MAX_VARIANTS);
    expect(r.variants.filter((v) => v === 'sunglasses 0')).toHaveLength(1);
  });

  it('matching recomputes the key from the stored searches, the way the row was grouped', () => {
    // A differently worded search of the same topic lands on the same row.
    expect(queryTopicKey('Sunglasses Custom')).toBe(queryTopicKey(SUNGLASSES));
    const [after] = applyWrittenTopics(
      [topic('sunglasses custom')],
      writtenTopicSources([panelDraft('abc', SUNGLASSES)]),
    );
    expect(after.state).toBe('excluded');
    // An all-generic search is its own topic and is keyed the same way on both sides.
    expect(queryTopicKey('  Custom   Branded ')).toBe('custom branded');
    expect(groupIntoTopics([{ query: 'custom branded', clicks: 0, impressions: 10, position: 9, page: null }])[0].key).toBe(
      queryTopicKey('custom branded'),
    );
  });

  it('is exact: a near synonym is a different topic and stays usable', () => {
    const sources = writtenTopicSources([panelDraft('abc', SUNGLASSES)]);
    const out = applyWrittenTopics([topic('engraved sunglasses'), topic('neon sunglasses'), topic(SUNGLASSES)], sources);
    expect(out.map((t) => [t.query, t.state])).toEqual([
      ['engraved sunglasses', 'usable'],
      ['neon sunglasses', 'usable'],
      [SUNGLASSES, 'excluded'],
    ]);
  });
});

describe('reading the documents', () => {
  it('collapses a draft and its published copy into one PUBLISHED source, published title first', () => {
    const sources = writtenTopicSources([
      { _id: 'drafts.p1', title: 'Draft Title', sourceTopic: { query: SUNGLASSES, variants: [SUNGLASSES] } },
      { _id: 'p1', title: 'Published Title', sourceTopic: { query: SUNGLASSES, variants: [SUNGLASSES] } },
    ]);
    expect(sources).toEqual([
      { documentId: 'p1', title: 'Published Title', status: 'published', via: 'recorded', queries: [SUNGLASSES] },
    ]);
  });

  it('a document with only topic keywords (every panel draft since AUTO-110) is a keyword source', () => {
    const [s] = writtenTopicSources([{ _id: 'drafts.k1', title: 'T', aiTopicKeywords: ['  custom  mini footballs ', '', 7] }]);
    expect(s).toEqual({ documentId: 'k1', title: 'T', status: 'draft', via: 'keyword', queries: ['custom mini footballs'] });
    const [after] = applyWrittenTopics([topic('mini football custom', '/cat/mini-footballs')], [s]);
    expect(after.reason).toBe('Your draft "T" was written for the keyword "custom mini footballs". It counts even though it is not published yet.');
  });

  it('a keyword made only of near-generic words claims nothing (the live "80\'s promotional products" case)', () => {
    expect(isVagueTopicKeyword("80's promotional products")).toBe(true);
    expect(isVagueTopicKeyword('business gifts')).toBe(true);
    expect(isVagueTopicKeyword('custom water bottles')).toBe(false);
    expect(isVagueTopicKeyword('custom branded')).toBe(false); // empty key: exact raw match only
    const sources = writtenTopicSources([
      { _id: 'drafts.retro', title: 'Retro', aiTopicKeywords: ["80's promotional products", 'retro promotional items'] },
    ]);
    const [after] = applyWrittenTopics([topic('promotional product ideas', '/cat/products')], sources);
    expect(after.state).toBe('usable');
    // A RECORDED topic is exact and is kept even when its words are near-generic.
    const recorded = writtenTopicSources([{ _id: 'drafts.r', title: 'R', sourceTopic: { query: 'promotional products' } }]);
    expect(applyWrittenTopics([topic('promotional products', '/cat/products')], recorded)[0].state).toBe('excluded');
  });

  it('ignores Content Releases versions, empty records and malformed rows', () => {
    expect(
      writtenTopicSources([
        { _id: 'versions.r1.p1', title: 'x', aiTopicKeywords: [SUNGLASSES] },
        { _id: 'p2', title: 'no record' },
        { _id: 'p3', sourceTopic: { query: 42 }, aiTopicKeywords: 'not an array' },
        null as unknown as WrittenTopicDoc,
      ]),
    ).toEqual([]);
  });

  it('when several documents cover one topic, a published post wins over a draft, a record over a keyword', () => {
    const sources = writtenTopicSources([
      { _id: 'drafts.a', title: 'Draft keyword', aiTopicKeywords: [SUNGLASSES] },
      { _id: 'drafts.b', title: 'Draft recorded', sourceTopic: { query: SUNGLASSES } },
      { _id: 'c', title: 'Published keyword', aiTopicKeywords: [SUNGLASSES] },
    ]);
    expect(writtenTopicIndex(sources).get('sunglass')?.title).toBe('Published keyword');
    expect(findWrittenTopic({ key: 'sunglass' }, sources.filter((s) => s.status === 'draft'))?.title).toBe('Draft recorded');
    expect(findWrittenTopic({ key: 'nothing' }, sources)).toBeNull();
  });

  it('the sentence for each kind', () => {
    const base = { documentId: 'x', title: 'T', matchedQuery: 'q' } as const;
    expect(writtenSentence({ ...base, status: 'published', via: 'recorded' })).toBe(
      'You already have a post generated from this topic: "T".',
    );
    expect(writtenSentence({ ...base, status: 'published', via: 'keyword' })).toBe('Your post "T" was written for the keyword "q".');
  });
});

describe('how it sits with the other rules', () => {
  const sources = writtenTopicSources([panelDraft('abc', SUNGLASSES)]);

  it('when the guard also excluded the topic, the record reason comes first and the guard sentence follows', () => {
    const excluded = topic(SUNGLASSES, '/blog/sunglasses-guide');
    expect(excluded.rule).toBe('ranking-page');
    const [after] = applyWrittenTopics([excluded], sources);
    expect(after.rule).toBe('already-written');
    expect(after.reason).toBe(`${writtenSentence(after.writtenAs!)} Your post /blog/sunglasses-guide already ranks for this search.`);
  });

  it('a block still wins, and unblocking restores the already-written verdict, not "usable"', () => {
    const written = applyWrittenTopics([topic(SUNGLASSES)], sources);
    const blocked = applyNegativeKeywords(written, [topicBlockRule(written[0])]);
    expect(blocked[0].state).toBe('blocked');
    const unblocked = applyNegativeKeywords(blocked, []);
    expect(unblocked[0].state).toBe('excluded');
    expect(unblocked[0].rule).toBe('already-written');
  });

  it('re-applying with a longer list does not double the sentence (the panel adds its fresh draft)', () => {
    const once = applyWrittenTopics([topic(SUNGLASSES)], sources);
    const twice = applyWrittenTopics(once, [...sources, ...writtenTopicSources([panelDraft('zzz', SUNGLASSES, 'Another')])]);
    expect(twice[0]).toEqual(once[0]);
  });

  it('no sources changes nothing', () => {
    const t = topic(SUNGLASSES);
    expect(applyWrittenTopics([t], [])).toEqual([t]);
  });

  it('counts already-written separately, so the excluded counts still add up', () => {
    const topics = applyWrittenTopics(
      [topic(SUNGLASSES), topic('drink tokens', '/blog/free-drink-tokens'), topic('engraved sunglasses')],
      sources,
    );
    const c = countTopics(topics);
    expect(c).toMatchObject({ usable: 1, excluded: 2, excludedAlreadyWritten: 1, excludedByRankingPage: 1 });
    expect(c.excludedAlreadyWritten + c.excludedByBoth + c.excludedByRankingPage + c.excludedBySharedTokens).toBe(c.excluded);
  });

  it('a topic made of generic words only can be covered too, which no token rule could do', () => {
    expect(topicKey('custom branded')).toBe('');
    const t = applyGuard(groupIntoTopics([{ query: 'custom branded', clicks: 0, impressions: 50, position: 10, page: null }])[0], null);
    const [after] = applyWrittenTopics([t], writtenTopicSources([{ _id: 'drafts.g', title: 'G', aiTopicKeywords: ['Custom Branded'] }]));
    expect(after.state).toBe('excluded');
  });
});

describe('the live read', () => {
  it('reads drafts: the query has no draft exclusion and the parser keeps drafts', async () => {
    expect(WRITTEN_TOPICS_QUERY).not.toContain('drafts.**');
    expect(WRITTEN_TOPICS_QUERY).toContain('_type == "blogPost"');
    expect(WRITTEN_TOPICS_QUERY).toContain('sourceTopic');
    expect(WRITTEN_TOPICS_QUERY).toContain('aiTopicKeywords');
    const fetch = vi.fn(async () => [panelDraft('abc', SUNGLASSES)]);
    const sources = await readWrittenTopicSources({ client: { fetch } as never });
    expect(sources[0]).toMatchObject({ documentId: 'abc', status: 'draft' });
    // Never a data-cache entry.
    expect(fetch).toHaveBeenCalledWith(WRITTEN_TOPICS_QUERY, {}, { cache: 'no-store' });
  });

  it('fails loudly, never with an empty list, when the read fails', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    await expect(readWrittenTopicSources({ client: { fetch } as never })).rejects.toBeInstanceOf(WrittenTopicsReadError);
  });

  it('fails loudly when the server has no token to read drafts with', async () => {
    const saved = process.env.SANITY_API_TOKEN;
    delete process.env.SANITY_API_TOKEN;
    try {
      await expect(readWrittenTopicSources()).rejects.toThrow(/cannot read blog drafts/);
    } finally {
      if (saved !== undefined) process.env.SANITY_API_TOKEN = saved;
    }
  });
});

describe('structural guards', () => {
  it('the drafts read is never inside the 24-hour cache or the snapshot builder', () => {
    for (const f of ['cached-topic-pool.ts', 'build-topic-pool.ts']) {
      const src = read('lib', 'blog-automation', f);
      expect(src, f).not.toContain('written-topics');
      expect(src, f).not.toContain('WRITTEN_TOPICS_QUERY');
    }
  });

  it('the detector still reads published posts only (it was not changed to see drafts)', () => {
    const src = read('lib', 'ai', 'internal-links.ts');
    expect(src).toContain('!(_id in path("drafts.**"))');
    expect(src).not.toContain('sourceTopic');
  });

  it('the route reads the drafts per request and applies them before the blocks', () => {
    const src = read('app', 'api', 'sanity', 'blog-topics', 'route.ts');
    expect(src).toContain('readWrittenTopicSources()');
    expect(src).toMatch(/applyNegativeKeywords\(\s*applyWrittenTopics\(snapshot\.topics, written\)/);
    expect(src).toContain('err instanceof WrittenTopicsReadError');
  });

  it('the panel records the topic in the same create that makes the draft, and checks live first', () => {
    const src = read('sanity', 'tools', 'blog-topics-tool.tsx');
    expect(src).toContain('sourceTopic: record,');
    expect(src).toContain('buildSourceTopicRecord(topic,');
    expect(src).toContain('client.fetch<WrittenTopicDoc[] | null>(WRITTEN_TOPICS_QUERY)');
    const check = src.indexOf('WRITTEN_TOPICS_QUERY)');
    const ai = src.indexOf('await authFetch(GENERATE_URL');
    expect(check).toBeGreaterThan(-1);
    expect(ai).toBeGreaterThan(check);
    // The server read (it builds a token client) never enters the Studio bundle.
    expect(src).not.toContain('written-topics');
  });

  it('the field is on blogPost, read only, with no initial value', () => {
    const src = read('sanity', 'schemas', 'documents', 'blog-post.ts');
    const at = src.indexOf("name: 'sourceTopic'");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf('defineField', at) === -1 ? undefined : src.indexOf('defineField', at));
    expect(block).toContain('readOnly: true');
    expect(block).not.toContain('initialValue');
  });

  it('only the server read builds a raw-perspective client', () => {
    expect(read('lib', 'blog-automation', 'written-topics.ts')).toContain("perspective: 'raw'");
    expect(read('lib', 'blog-automation', 'topic-pool.ts')).not.toMatch(/createClient|process\.env/);
  });
});
