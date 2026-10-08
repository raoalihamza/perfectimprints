/**
 * PORT-170: the defensive JSON extraction and the offline contract of the
 * Gemini wrapper (no network: the key is deliberately absent here).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEMINI_MODEL, GeminiError, extractJsonObject, generateJsonFromImage, generateJsonFromText } from './gemini';

describe('extractJsonObject', () => {
  it('takes a bare object as is', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('strips code fences and surrounding prose', () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a": 1}\n```\nDone.')).toBe('{"a": 1}');
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('}{')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('generateJsonFromImage', () => {
  const saved = process.env.GOOGLE_GEMINI_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = saved;
  });

  it('refuses with a clean 500 when the key is missing, before any network call', async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    await expect(
      generateJsonFromImage({ system: 's', user: 'u', image: { mimeType: 'image/jpeg', base64: '' } }),
    ).rejects.toMatchObject({ name: 'GeminiError', status: 500 });
  });

  it('names a model with no announced shutdown date (re-check the deprecations page when changing it)', () => {
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    // Google's message on 2026-09-08: the 2.5 line is "no longer available to
    // new users", and gemini-3.1-flash-lite carries a 2027-05-07 shutdown.
    expect(GEMINI_MODEL).not.toMatch(/^gemini-2\./);
    expect(GEMINI_MODEL).not.toBe('gemini-3.1-flash-lite');
  });

  it('GeminiError defaults to 502', () => {
    expect(new GeminiError('x').status).toBe(502);
  });
});

describe('generateJsonFromText (AUTO-203, the scene planner)', () => {
  const saved = process.env.GOOGLE_GEMINI_API_KEY;
  const KEY = 'test-key-never-logged';
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    process.env.GOOGLE_GEMINI_API_KEY = KEY;
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"surface":"a fridge door"}' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 190, candidatesTokenCount: 154, totalTokenCount: 344 },
      }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = saved;
  });

  it('refuses with a clean 500 when the key is missing, before any network call', async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    await expect(generateJsonFromText({ system: 's', user: 'u' })).rejects.toMatchObject({ name: 'GeminiError', status: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is the image call's request without the image part: same model, JSON mode, no search tool, the key in the header only", async () => {
    const out = await generateJsonFromText<{ surface: string }>({ system: 'plan', user: 'magnets', maxOutputTokens: 512, temperature: 0.3, timeoutMs: 15_000 });
    expect(out.data).toEqual({ surface: 'a fridge door' });
    expect(out.usage).toEqual({ promptTokens: 190, outputTokens: 154, thoughtTokens: 0, totalTokens: 344 });
    expect(out.model).toBe(GEMINI_MODEL);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'plan' }] });
    expect(body.contents[0].parts).toEqual([{ text: 'magnets' }]);
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 512 });
    expect(body.tools).toBeUndefined();
  });

  it('a non-JSON answer and an HTTP failure are GeminiErrors that never carry the key', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'no object here' }] } }] }), text: async () => '' }));
    await expect(generateJsonFromText({ system: 's', user: 'u' })).rejects.toMatchObject({ name: 'GeminiError', status: 502 });
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => 'quota' }));
    const err = await generateJsonFromText({ system: 's', user: 'u' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as Error).message).not.toContain(KEY);
    expect((err as Error).message).toContain('429');
  });
});
