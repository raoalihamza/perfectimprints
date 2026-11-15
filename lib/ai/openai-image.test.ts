/**
 * AUTO-220: the OpenAI Images client. `fetch` is faked; nothing here calls
 * OpenAI. What it pins: the model, quality and size that were measured, the
 * request shape (photos to /edits, none to /generations), the key in the
 * header and nowhere else, and that no error message can carry the key.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  OPENAI_IMAGE_HEIGHT,
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGE_WIDTH,
  OpenAiImageError,
  generateOpenAiImage,
  openAiImageConfigured,
  openAiImageUsd,
  scrubOpenAiSecret,
  sniffImageMime,
} from './openai-image';

const FAKE_KEY = 'sk-test-0000000000000000000000000000';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);

function answer(bytes: Buffer, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      data: [{ b64_json: bytes.toString('base64') }],
      size: '1536x864',
      usage: { input_tokens: 3142, output_tokens: 924, input_tokens_details: { text_tokens: 70, image_tokens: 3072 }, output_tokens_details: { image_tokens: 924 } },
      ...extra,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('what is asked for', () => {
  it('the model, the quality and the size are the measured ones, and the size is native 16:9', () => {
    expect(OPENAI_IMAGE_MODEL).toBe('gpt-image-2.6-sunburst');
    expect(OPENAI_IMAGE_QUALITY).toBe('medium');
    expect(OPENAI_IMAGE_SIZE).toBe('1536x864');
    expect(OPENAI_IMAGE_WIDTH / OPENAI_IMAGE_HEIGHT).toBeCloseTo(16 / 9, 10);
    expect(OPENAI_IMAGE_WIDTH % 16).toBe(0);
    expect(OPENAI_IMAGE_HEIGHT % 16).toBe(0);
  });

  it('with photos: ONE multipart POST to /v1/images/edits, each photo an image[] part, the key in the Authorization header', async () => {
    vi.stubEnv('OPENAI_API_KEY', FAKE_KEY);
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return answer(JPEG);
    });
    const photo = { mimeType: 'image/webp', base64: Buffer.from('photo').toString('base64') };
    const out = await generateOpenAiImage({ prompt: 'Create a blog header image, "T"', images: [photo, photo, photo] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.openai.com/v1/images/edits');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ Authorization: `Bearer ${FAKE_KEY}` });
    const form = calls[0].init.body as FormData;
    expect(form.get('model')).toBe(OPENAI_IMAGE_MODEL);
    expect(form.get('prompt')).toBe('Create a blog header image, "T"');
    expect(form.get('n')).toBe('1');
    expect(form.get('size')).toBe('1536x864');
    expect(form.get('quality')).toBe('medium');
    expect(form.get('output_format')).toBe(OPENAI_IMAGE_OUTPUT_FORMAT);
    expect(form.getAll('image[]')).toHaveLength(3);
    expect((form.getAll('image[]')[0] as File).type).toBe('image/webp');
    // The key is in the header only: not in the URL and not in the form.
    expect(calls[0].url).not.toContain(FAKE_KEY);
    expect([...form.keys()]).not.toContain('api_key');
    // The answer.
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.bytes.equals(JPEG)).toBe(true);
    expect(out.size).toBe('1536x864');
    expect(out.usage).toEqual({ textInputTokens: 70, imageInputTokens: 3072, imageOutputTokens: 924 });
    // 70 x 5 + 3072 x 8 + 924 x 30, per million: the measured USD 0.0526 a picture with three photos.
    expect(out.usd).toBeCloseTo(0.052646, 6);
  });

  it('with no photo: a JSON POST to /v1/images/generations with the same model, size and quality', async () => {
    vi.stubEnv('OPENAI_API_KEY', FAKE_KEY);
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return answer(PNG);
    });
    const out = await generateOpenAiImage({ prompt: 'p' });
    expect(calls[0].url).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ model: OPENAI_IMAGE_MODEL, prompt: 'p', n: 1, size: '1536x864', quality: 'medium' });
    // The format is read from the bytes, never trusted from the request.
    expect(out.mimeType).toBe('image/png');
  });
});

describe('failures', () => {
  it('no key: a clear error and no call', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(openAiImageConfigured()).toBe(false);
    await expect(generateOpenAiImage({ prompt: 'p' })).rejects.toThrow('OPENAI_API_KEY is not configured on the server.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an HTTP error carries the status and OpenAI\'s own sentence, and NEVER the key, even when OpenAI echoes it', async () => {
    vi.stubEnv('OPENAI_API_KEY', FAKE_KEY);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${FAKE_KEY}. You can find your key at ...` } }), { status: 401 }));
    const err = (await generateOpenAiImage({ prompt: 'p' }).catch((e) => e)) as OpenAiImageError;
    expect(err).toBeInstanceOf(OpenAiImageError);
    expect(err.status).toBe(401);
    expect(err.message).toContain('Image request failed (401).');
    expect(err.message).not.toContain(FAKE_KEY);
    expect(err.message).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it('a timeout, a network fault, an answer with no picture and an answer that is not a picture are each an OpenAiImageError', async () => {
    vi.stubEnv('OPENAI_API_KEY', FAKE_KEY);
    vi.stubGlobal('fetch', async () => {
      const e = new Error('timed out');
      e.name = 'TimeoutError';
      throw e;
    });
    await expect(generateOpenAiImage({ prompt: 'p', timeoutMs: 45_000 })).rejects.toThrow('The image model did not answer within 45 seconds.');
    vi.stubGlobal('fetch', async () => {
      throw new Error(`socket hang up for Bearer ${FAKE_KEY}`);
    });
    const net = (await generateOpenAiImage({ prompt: 'p' }).catch((e) => e)) as Error;
    expect(net.message).toContain('Image request failed:');
    expect(net.message).not.toContain(FAKE_KEY);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await expect(generateOpenAiImage({ prompt: 'p' })).rejects.toThrow('The image model returned no image.');
    vi.stubGlobal('fetch', async () => answer(Buffer.from('<html>not a picture</html>')));
    await expect(generateOpenAiImage({ prompt: 'p' })).rejects.toThrow('not a picture');
  });

  it('the scrubber removes anything key-shaped', () => {
    expect(scrubOpenAiSecret(`key sk-proj-abcDEF123456_xyz and Bearer abcdef123456`)).toBe('key [key removed] and Bearer [key removed]');
  });
});

describe('small helpers', () => {
  it('prices a call from its reported tokens', () => {
    expect(openAiImageUsd({ textInputTokens: 0, imageInputTokens: 0, imageOutputTokens: 924 })).toBeCloseTo(0.02772, 6);
    expect(openAiImageUsd({ textInputTokens: 60, imageInputTokens: 1024, imageOutputTokens: 924 })).toBeCloseTo(0.036212, 6);
  });

  it('tells a PNG, a JPEG and a WebP by their first bytes', () => {
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(JPEG)).toBe('image/jpeg');
    expect(sniffImageMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)]))).toBe('image/webp');
    expect(sniffImageMime(Buffer.from('GIF89a'))).toBeNull();
  });
});

describe('structure: one key, one file, never public', () => {
  const root = process.cwd();
  const SKIP = new Set(['node_modules', '.next', '.git', 'tmp', 'data', 'public', '.vercel', 'dist', '.sanity']);
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|mjs|js|json|yml|yaml)$/.test(name) || name === '.env.example') out.push(full);
    }
    return out;
  }
  const files = ['app', 'components', 'lib', 'sanity', 'scripts'].flatMap((d) => walk(join(root, d)));
  const rel = (f: string) => f.slice(root.length + 1).replace(/\\/g, '/');

  it('process.env.OPENAI_API_KEY is read in lib/ai/openai-image.ts and nowhere else', () => {
    const readers = files.filter((f) => !/\.test\.tsx?$/.test(f) && /process\.env\.OPENAI_API_KEY|process\.env\[['"]OPENAI_API_KEY['"]\]/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(readers).toEqual(['lib/ai/openai-image.ts']);
  });

  it('no NEXT_PUBLIC_ name carries an OpenAI key, anywhere (it would ship the key to every browser)', () => {
    const all = [...files, join(root, '.env.example'), join(root, 'CLAUDE.md')];
    const hits = all.filter((f) => /NEXT_PUBLIC_[A-Z_]*OPENAI/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual([]);
  });

  it('the image model is named in lib/ai/openai-image.ts and nowhere else in the source', () => {
    const hits = files.filter((f) => !/\.test\.tsx?$/.test(f) && /gpt-image-/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual(['lib/ai/openai-image.ts']);
  });

  it('nothing in the browser can reach the client: no Studio file and no component imports it', () => {
    const importers = files.filter((f) => /from ['"][^'"]*ai\/openai-image['"]/.test(readFileSync(f, 'utf8'))).map(rel).filter((f) => !/\.test\.tsx?$/.test(f));
    expect(importers.sort()).toEqual(['app/api/sanity/generate-blog-image/route.ts', 'lib/blog-automation/resolve-header-image.ts']);
    expect(importers.some((f) => f.startsWith('sanity/') || f.startsWith('components/'))).toBe(false);
  });
});
