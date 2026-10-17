/**
 * AUTO-202: the Gemini image call's offline contract, against a fake fetch:
 * the request shape the real call confirmed (generateContent, IMAGE
 * modality, imageConfig, reference photos as inlineData before the text),
 * the key in the header and never in the URL or an error, and the answer
 * read back with its billed image tokens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEMINI_IMAGE_FALLBACK_MODEL,
  GEMINI_IMAGE_MODEL,
  GEMINI_IMAGE_PRICES,
  GEMINI_IMAGE_USD_PER_1K_IMAGE,
  GEMINI_MODEL,
  GeminiError,
  generateImage,
  imageCallUsd,
} from './gemini';

const KEY = 'test-key-never-logged';
const png = Buffer.from('fakeimagebytes').toString('base64');

function okResponse(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: png } }] }, finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 1900,
        candidatesTokenCount: 1560,
        totalTokenCount: 3460,
        candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }, { modality: 'TEXT', tokenCount: 440 }],
      },
      ...extra,
    }),
    text: async () => '',
  } as unknown as Response;
}

describe('generateImage', () => {
  const saved = process.env.GOOGLE_GEMINI_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    process.env.GOOGLE_GEMINI_API_KEY = KEY;
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = saved;
  });

  it('refuses with a clean 500 when the key is missing, before any network call', async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    await expect(generateImage({ prompt: 'x' })).rejects.toMatchObject({ name: 'GeminiError', status: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls generateContent on the image model with the IMAGE modality, the image config, and the references before the prompt', async () => {
    await generateImage({
      prompt: 'Draw totes',
      references: [{ mimeType: 'image/webp', base64: 'QUJD' }, { mimeType: 'image/jpeg', base64: 'REVG' }],
      aspectRatio: '16:9',
      imageSize: '1K',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '1K' } });
    expect(body.contents[0].parts).toEqual([
      { inlineData: { mimeType: 'image/webp', data: 'QUJD' } },
      { inlineData: { mimeType: 'image/jpeg', data: 'REVG' } },
      { text: 'Draw totes' },
    ]);
    expect(body.systemInstruction).toBeUndefined();
  });

  it('defaults to 16:9 at 1K with no references', async () => {
    await generateImage({ prompt: 'x' });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '1K' });
    expect(body.contents[0].parts).toEqual([{ text: 'x' }]);
  });

  it('returns the bytes, the mime type and the billed image tokens', async () => {
    const out = await generateImage({ prompt: 'x' });
    expect(out.bytes.toString()).toBe('fakeimagebytes');
    expect(out.base64).toBe(png);
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.model).toBe(GEMINI_IMAGE_MODEL);
    expect(out.finishReason).toBe('STOP');
    expect(out.usage).toEqual({ promptTokens: 1900, outputTokens: 1560, thoughtTokens: 0, totalTokens: 3460, imageTokens: 1120 });
  });

  it('a blocked prompt, a missing image and an HTTP failure are GeminiErrors that never carry the key', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(generateImage({ prompt: 'x' })).rejects.toThrow('declined this prompt (SAFETY)');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'I cannot draw that.' }] }, finishReason: 'IMAGE_SAFETY' }] }),
      text: async () => '',
    } as unknown as Response);
    await expect(generateImage({ prompt: 'x' })).rejects.toThrow('returned no image (IMAGE_SAFETY)');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: 'quota' } }) } as unknown as Response);
    const err = await generateImage({ prompt: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as Error).message).toContain('Image request failed (429)');
    expect((err as Error).message).toContain('rate limit');
    expect((err as Error).message).not.toContain(KEY);
  });

  it('a timeout is a clean error naming the seconds', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    await expect(generateImage({ prompt: 'x', timeoutMs: 45_000 })).rejects.toThrow('did not answer within 45 seconds');
  });
});

describe('the image model constants (AUTO-207)', () => {
  it('the main model is Pro and the backup is the AUTO-202 model; both stable, neither a preview, both distinct from the vision model', () => {
    expect(GEMINI_IMAGE_MODEL).toBe('gemini-3-pro-image');
    expect(GEMINI_IMAGE_FALLBACK_MODEL).toBe('gemini-3.1-flash-image');
    for (const m of [GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL]) {
      expect(m).not.toBe(GEMINI_MODEL);
      // gemini-2.5-flash-image shut down on 2026-10-02; gemini-3-pro-image-preview on 2026-06-25.
      expect(m).not.toMatch(/^gemini-2\./);
      expect(m).not.toContain('preview');
    }
    expect(GEMINI_IMAGE_USD_PER_1K_IMAGE).toBe(0.134);
    expect(GEMINI_IMAGE_PRICES[GEMINI_IMAGE_FALLBACK_MODEL].usdPer1kImage).toBe(0.067);
  });

  it('prices a call from the tokens Google reports (image, input and thinking)', () => {
    // AUTO-206's measured Pro call: 1,720 prompt tokens, 1,120 image tokens, about 340 thinking tokens.
    const usd = imageCallUsd(GEMINI_IMAGE_MODEL, { promptTokens: 1720, imageTokens: 1120, outputTokens: 1120, thoughtTokens: 340 });
    expect(usd).toBeCloseTo(0.1344 + 0.00344 + 0.00408, 5);
    expect(imageCallUsd('no-such-model', { promptTokens: 1, imageTokens: 1, outputTokens: 1, thoughtTokens: 0 })).toBeNull();
  });
});

describe('generateImage on a chosen model (AUTO-207)', () => {
  const saved = process.env.GOOGLE_GEMINI_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    process.env.GOOGLE_GEMINI_API_KEY = KEY;
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = saved;
  });

  it('draws on the main model by default and on the model named when one is, and says which drew it', async () => {
    const main = await generateImage({ prompt: 'x' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`);
    expect(main.model).toBe(GEMINI_IMAGE_MODEL);
    const backup = await generateImage({ prompt: 'x', model: GEMINI_IMAGE_FALLBACK_MODEL });
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_FALLBACK_MODEL}:generateContent`);
    expect(backup.model).toBe(GEMINI_IMAGE_FALLBACK_MODEL);
  });
});
