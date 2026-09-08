/**
 * PORT-170: the defensive JSON extraction and the offline contract of the
 * Gemini wrapper (no network: the key is deliberately absent here).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GEMINI_MODEL, GeminiError, extractJsonObject, generateJsonFromImage } from './gemini';

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
