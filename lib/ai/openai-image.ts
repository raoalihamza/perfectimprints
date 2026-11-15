/**
 * The OpenAI Images client (AUTO-220): the one place the site talks to OpenAI
 * and the one place `OPENAI_API_KEY` is read. Server side only; the key
 * travels in the Authorization header, is never logged, never put in an error
 * message and must never gain a `NEXT_PUBLIC_` name (a test scans for one).
 *
 * WHAT IT IS FOR. The blog header picture (lib/blog-automation/
 * resolve-header-image.ts). Patrick makes his own headers in ChatGPT from the
 * post's product photos; CHECK-openai-image-api and CHECK-image-brief-26
 * (2026-11-09 and 2026-11-10, 54 paid pictures) measured the API doing the
 * same thing, title included, and Ali and Patrick chose it.
 *
 * THE MODEL, measured against the live API and not the docs:
 *   - `gpt-image-2.6-sunburst`, quality `medium`, size `1536x864`. The size is
 *     NATIVE 16:9 (2.5 and 2.6 take any WIDTHxHEIGHT divisible by 16; the docs
 *     say 2.6 does not, and they are wrong), so nothing is cropped anywhere.
 *   - It is an ALIAS WITH NO DATED SNAPSHOT (`GET /v1/models` on 2026-11-10:
 *     created 2026-10-28, no shutdown date, no `-2026-..` sibling). It can
 *     change underneath us, which is why the Gemini image model stays as the
 *     fallback in the chain and why the picture is read back every time.
 *   - Reference photos go to `POST /v1/images/edits` as `image[]` parts (up to
 *     16 are accepted); with no photo at all the same prompt goes to
 *     `POST /v1/images/generations`.
 *   - Price (pricing page read 2026-11-09): USD 5 per million text input
 *     tokens, USD 8 per million image input tokens, USD 30 per million image
 *     output tokens. Measured: 924 output tokens a picture, 1,024 input tokens
 *     per 600 px reference photo, so USD 0.0528 with three photos.
 *   - Time: 22.8 / 27.3 / 34.1 s (min / median / max over 35 pictures).
 */

/** The image model. Named here and nowhere else (a test fails on a second spelling). */
export const OPENAI_IMAGE_MODEL = 'gpt-image-2.6-sunburst';
export const OPENAI_IMAGE_QUALITY = 'medium';
/** Native 16:9; the blog hero and every card are 16:9, so nothing is cropped. */
export const OPENAI_IMAGE_WIDTH = 1536;
export const OPENAI_IMAGE_HEIGHT = 864;
export const OPENAI_IMAGE_SIZE = `${OPENAI_IMAGE_WIDTH}x${OPENAI_IMAGE_HEIGHT}`;
/**
 * The picture is asked for as a JPEG: it is kept as the copy without the P!
 * mark and sent back for "Change this picture", and a PNG of a 1536 x 864
 * photograph is about 2 MB where the JPEG is a fraction of it (measured,
 * CLAUDE.md AUTO-220). The bytes are sniffed in any case, never trusted.
 */
export const OPENAI_IMAGE_OUTPUT_FORMAT = 'jpeg';
export const OPENAI_IMAGE_OUTPUT_COMPRESSION = 90;

const OPENAI_IMAGES_ENDPOINT = 'https://api.openai.com/v1/images';

/** USD per million tokens (pricing page read 2026-11-09). */
export const OPENAI_IMAGE_PRICES = {
  textInput: 5,
  imageInput: 8,
  imageOutput: 30,
} as const;

/** A call that has not answered in this long is not going to (the measured worst is 34 s). */
export const OPENAI_IMAGE_TIMEOUT_MS = 60_000;

export class OpenAiImageError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'OpenAiImageError';
    this.status = status;
  }
}

export interface OpenAiImageInput {
  /** `image/jpeg`, `image/png` or `image/webp`. */
  mimeType: string;
  base64: string;
}

export interface OpenAiImageUsage {
  textInputTokens: number;
  imageInputTokens: number;
  imageOutputTokens: number;
}

export interface OpenAiImageResult {
  bytes: Buffer;
  base64: string;
  /** Read from the bytes themselves, never trusted from the answer. */
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  model: string;
  /** What the API says it drew at, e.g. "1536x864". */
  size: string | null;
  usage: OpenAiImageUsage;
  /** From the tokens the API reported, at OPENAI_IMAGE_PRICES. */
  usd: number;
  elapsedMs: number;
}

export interface GenerateOpenAiImageOptions {
  prompt: string;
  /** Reference photos, or the one picture to change. Empty means a plain generation. */
  images?: OpenAiImageInput[];
  /** Default OPENAI_IMAGE_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** True when the server holds a key at all (the chain skips OpenAI without spending a cap slot when it does not). */
export function openAiImageConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** What one call cost, from the tokens the API reported. */
export function openAiImageUsd(usage: OpenAiImageUsage): number {
  return (
    (usage.textInputTokens * OPENAI_IMAGE_PRICES.textInput +
      usage.imageInputTokens * OPENAI_IMAGE_PRICES.imageInput +
      usage.imageOutputTokens * OPENAI_IMAGE_PRICES.imageOutput) /
    1_000_000
  );
}

/** Anything key-shaped is removed before a string leaves this module. */
export function scrubOpenAiSecret(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_*.-]{6,}/g, '[key removed]').replace(/Bearer\s+[A-Za-z0-9_.-]{6,}/gi, 'Bearer [key removed]');
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** PNG, JPEG or WebP, by magic number; null for anything else. */
export function sniffImageMime(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function extensionFor(mimeType: string): string {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
}

interface OpenAiImagesResponse {
  data?: { b64_json?: string }[];
  size?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
    output_tokens_details?: { image_tokens?: number };
  };
  error?: { message?: string; code?: string; type?: string };
}

/**
 * Draw ONE picture. With `images` it is an edit (the photos are the
 * references, or the picture to change); with none it is a plain generation.
 * Throws `OpenAiImageError` when the key is missing, the call fails or times
 * out, or no picture comes back. The message never carries the key.
 */
export async function generateOpenAiImage(opts: GenerateOpenAiImageOptions): Promise<OpenAiImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAiImageError('OPENAI_API_KEY is not configured on the server.', 500);
  const timeoutMs = opts.timeoutMs ?? OPENAI_IMAGE_TIMEOUT_MS;
  const images = opts.images ?? [];
  const startedAt = Date.now();

  let res: Response;
  try {
    if (images.length > 0) {
      const form = new FormData();
      form.append('model', OPENAI_IMAGE_MODEL);
      form.append('prompt', opts.prompt);
      form.append('n', '1');
      form.append('size', OPENAI_IMAGE_SIZE);
      form.append('quality', OPENAI_IMAGE_QUALITY);
      form.append('output_format', OPENAI_IMAGE_OUTPUT_FORMAT);
      form.append('output_compression', String(OPENAI_IMAGE_OUTPUT_COMPRESSION));
      images.forEach((img, i) => {
        const bytes = Buffer.from(img.base64, 'base64');
        form.append('image[]', new Blob([new Uint8Array(bytes)], { type: img.mimeType }), `photo-${i + 1}.${extensionFor(img.mimeType)}`);
      });
      res = await fetch(`${OPENAI_IMAGES_ENDPOINT}/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } else {
      res = await fetch(`${OPENAI_IMAGES_ENDPOINT}/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt: opts.prompt,
          n: 1,
          size: OPENAI_IMAGE_SIZE,
          quality: OPENAI_IMAGE_QUALITY,
          output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
          output_compression: OPENAI_IMAGE_OUTPUT_COMPRESSION,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new OpenAiImageError(
      timedOut
        ? `The image model did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
        : `Image request failed: ${scrubOpenAiSecret(err instanceof Error ? err.message : 'network error')}.`,
    );
  }

  const text = await res.text().catch(() => '');
  let data: OpenAiImagesResponse | null = null;
  try {
    data = JSON.parse(text) as OpenAiImagesResponse;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = scrubOpenAiSecret(data?.error?.message ?? text).replace(/\s+/g, ' ').trim().slice(0, 200);
    const hint =
      res.status === 401
        ? ' The key was refused; check OPENAI_API_KEY on the server.'
        : res.status === 429
          ? " OpenAI's own rate or spending limit was hit."
          : '';
    throw new OpenAiImageError(`Image request failed (${res.status}).${hint}${detail ? ` ${detail}` : ''}`.trim(), res.status);
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new OpenAiImageError('The image model returned no image.', res.status);
  const bytes = Buffer.from(b64, 'base64');
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) throw new OpenAiImageError('The image model returned something that is not a picture.', res.status);
  const usage: OpenAiImageUsage = {
    textInputTokens: num(data?.usage?.input_tokens_details?.text_tokens),
    imageInputTokens: num(data?.usage?.input_tokens_details?.image_tokens),
    imageOutputTokens: num(data?.usage?.output_tokens_details?.image_tokens) || num(data?.usage?.output_tokens),
  };
  return {
    bytes,
    base64: b64,
    mimeType,
    model: OPENAI_IMAGE_MODEL,
    size: typeof data?.size === 'string' ? data.size : null,
    usage,
    usd: openAiImageUsd(usage),
    elapsedMs: Date.now() - startedAt,
  };
}
