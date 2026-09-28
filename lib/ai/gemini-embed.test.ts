/**
 * AUTO-119: the embedding call behind the Blog Topics "closest wording"
 * figures. `fetch` is mocked: no network, no key material.
 *
 *   - Batches of at most 100 (Google answers 400 above that), in input order,
 *     one batch at a time by default (the project quota is 3,000 texts a
 *     minute and one build is about 3,100 texts).
 *   - A 429 waits Google's `retryDelay` and tries again; a failure that does
 *     not clear throws, so a caller never shows figures from half a list.
 *   - The key goes in a header, never the URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GEMINI_EMBEDDING_BATCH,
  GEMINI_EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  GeminiError,
  embedTexts,
  retryDelayMs,
} from './gemini';

const vec = (x: number) => Array.from({ length: GEMINI_EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? x : 0));
const ok = (texts: string[]) =>
  new Response(JSON.stringify({ embeddings: texts.map((_, i) => ({ values: vec(i + 1) })), usageMetadata: { promptTokenCount: texts.length * 3 } }), { status: 200 });
const tooMany = (delay = '4.86s') =>
  new Response(
    JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: delay }] } }),
    { status: 429 },
  );

const saved = process.env.GOOGLE_GEMINI_API_KEY;
let calls: { url: string; init: RequestInit; texts: string[] }[];
let active = 0;
let maxActive = 0;

beforeEach(() => {
  process.env.GOOGLE_GEMINI_API_KEY = 'test-key-not-real';
  calls = [];
  active = 0;
  maxActive = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (saved === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
  else process.env.GOOGLE_GEMINI_API_KEY = saved;
});

function stubFetch(answer: (texts: string[], n: number) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const texts = (JSON.parse(String(init.body)) as { requests: { content: { parts: { text: string }[] } }[] }).requests.map(
        (r) => r.content.parts[0].text,
      );
      calls.push({ url, init, texts });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return answer(texts, calls.length);
    }),
  );
}

describe('embedTexts', () => {
  it('sends batches of at most 100, one at a time, and returns vectors in input order', async () => {
    stubFetch((texts) => ok(texts));
    const texts = Array.from({ length: 250 }, (_, i) => `topic ${i}`);
    const out = await embedTexts(texts);
    expect(calls.map((c) => c.texts.length)).toEqual([100, 100, 50]);
    expect(calls[0].texts[0]).toBe('topic 0');
    expect(calls[2].texts[49]).toBe('topic 249');
    expect(maxActive).toBe(1);
    expect(out.vectors).toHaveLength(250);
    expect(out.calls).toBe(3);
    expect(out.promptTokens).toBe(750);
    expect(GEMINI_EMBEDDING_BATCH).toBe(100);
  });

  it('asks the named model for the named dimensions, with the key in a header only', async () => {
    stubFetch((texts) => ok(texts));
    await embedTexts(['custom pens']);
    const { url, init } = calls[0];
    expect(url).toContain(`/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`);
    expect(url).not.toContain('test-key-not-real');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key-not-real');
    const body = JSON.parse(String(init.body));
    expect(body.requests[0].outputDimensionality).toBe(768);
    // No task prefix: AUTO-118 measured it squeezing every score together.
    expect(body.requests[0].content.parts[0].text).toBe('custom pens');
    expect(body.requests[0]).not.toHaveProperty('taskType');
  });

  it("waits Google's retryDelay after a 429 and then succeeds", async () => {
    const waits: number[] = [];
    stubFetch((texts, n) => (n === 1 ? tooMany('4.86s') : ok(texts)));
    const out = await embedTexts(['a', 'b'], { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([5110]);
    expect(out.vectors).toHaveLength(2);
  });

  it('gives up with a GeminiError when the 429 does not clear, returning nothing partial', async () => {
    stubFetch(() => tooMany('1s'));
    await expect(embedTexts(['a'], { sleep: async () => undefined })).rejects.toBeInstanceOf(GeminiError);
    expect(calls).toHaveLength(5);
  });

  it('throws on any other failure or on an answer of the wrong shape', async () => {
    stubFetch(() => new Response('{"error":{"code":500}}', { status: 500 }));
    await expect(embedTexts(['a'])).rejects.toBeInstanceOf(GeminiError);
    stubFetch(() => new Response(JSON.stringify({ embeddings: [{ values: [1, 2] }] }), { status: 200 }));
    await expect(embedTexts(['a'])).rejects.toThrow('wrong shape');
  });

  it('refuses with a clean 500 when the key is missing, before any network call', async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    stubFetch((texts) => ok(texts));
    await expect(embedTexts(['a'])).rejects.toMatchObject({ name: 'GeminiError', status: 500 });
    expect(calls).toHaveLength(0);
  });
});

describe('retryDelayMs', () => {
  it("reads Google's RetryInfo, and nothing else", () => {
    expect(retryDelayMs(JSON.stringify({ error: { details: [{ '@type': 'x.RetryInfo', retryDelay: '4s' }] } }))).toBe(4000);
    expect(retryDelayMs('{"error":{}}')).toBeNull();
    expect(retryDelayMs('not json')).toBeNull();
  });
});
