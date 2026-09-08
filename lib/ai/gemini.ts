/**
 * Shared server-side Google Gemini vision call (PORT-170). The image-reading
 * counterpart of lib/ai/deepseek.ts: one fetch, one typed error, JSON out.
 *
 * THE MODEL NAME LIVES HERE AND NOWHERE ELSE. Google retires models on a
 * schedule (the Gemini deprecations page lists earliest shutdown dates per
 * model), so swapping the model must be a one-line change in this file.
 * Chosen 2026-09-08 from https://ai.google.dev/gemini-api/docs/pricing and
 * https://ai.google.dev/gemini-api/docs/deprecations, then CORRECTED by a real
 * call: the pricing page lists gemini-2.5-flash-lite as the cheapest model
 * that reads images (USD 0.10 per million input tokens, 0.40 per million
 * output tokens) with no shutdown date, but a request to it from Patrick's
 * new account answered 404 "no longer available to new users. Please update
 * your code to use models/gemini-3.5-flash-lite". So the 2.5 line is closed
 * to new keys whatever the deprecations page says, and the model here is
 * gemini-3.5-flash-lite: USD 0.30 per million input tokens, 2.50 per million
 * output tokens on the paid tier, "No shutdown date announced" on the
 * deprecations page (released 2026-07-21). Its 3.1-flash-lite sibling is
 * cheaper but already carries a 2027-05-07 shutdown date, so it was not
 * picked. The model that shuts down on 2026-10-02 is gemini-2.5-flash-image
 * (image GENERATION), not a vision model. Re-check both pages before changing
 * this constant, and never pick a model with a listed shutdown date.
 *
 * Server-side ONLY: it reads GOOGLE_GEMINI_API_KEY, which must never gain a
 * NEXT_PUBLIC_ prefix. The key travels in the `x-goog-api-key` header, never
 * in the URL, so it cannot land in a request log; and it is never included in
 * any error message this module throws. No node:fs, no Sanity; callers are API
 * routes and scripts, never Studio bundle code.
 */

/** The ONE place the Gemini model is named. See the header comment before changing it. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** A vision call that has not answered in this long is not going to. */
const GEMINI_TIMEOUT_MS = 40_000;

/**
 * Typed failure so a route can turn any Gemini problem into a clean 500/502
 * with a plain "try again or fill it in by hand" message. `status` is the
 * suggested HTTP status.
 */
export class GeminiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

export interface GeminiImageInput {
  /** `image/jpeg`, `image/png` or `image/webp`. */
  mimeType: string;
  /** The image bytes, base64 encoded. */
  base64: string;
}

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  /** Reasoning tokens, when the model spends any (billed as output). */
  thoughtTokens: number;
  totalTokens: number;
}

export interface GenerateJsonFromImageOptions {
  system: string;
  user: string;
  image: GeminiImageInput;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GeminiJsonResult<T> {
  data: T;
  usage: GeminiUsage;
  model: string;
  /** Wall-clock time of the HTTP call in milliseconds. */
  elapsedMs: number;
}

/**
 * The model is told to return JSON only, but "defensive" means we still cope
 * with a fenced block or a sentence around the object: take the first `{`
 * through the last `}`. Returns null when there is no object at all.
 */
export function extractJsonObject(text: string): string | null {
  const unfenced = text.replace(/```(?:json)?/gi, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return unfenced.slice(start, end + 1);
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * One image-plus-instructions call returning parsed JSON. Throws `GeminiError`
 * when the key is missing, the HTTP call fails or times out, the answer is
 * blocked or empty, or the content is not valid JSON. The caller validates the
 * SHAPE of `T` itself (this only guarantees parseable JSON).
 */
export async function generateJsonFromImage<T>(
  opts: GenerateJsonFromImageOptions,
): Promise<GeminiJsonResult<T>> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError('GOOGLE_GEMINI_API_KEY is not configured on the server.', 500);
  }

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: opts.image.mimeType, data: opts.image.base64 } },
              { text: opts.user },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
        },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new GeminiError(
      timedOut
        ? `Gemini did not answer within ${Math.round(GEMINI_TIMEOUT_MS / 1000)} seconds.`
        : `Gemini request failed: ${err instanceof Error ? err.message : 'network error'}.`,
    );
  }

  if (!res.ok) {
    // Google's error bodies name the problem (billing, API not enabled, bad
    // model name); they never echo the key, and the key is not in the URL.
    const detail = await res.text().catch(() => '');
    const hint =
      res.status === 400 || res.status === 403 || res.status === 404
        ? ' Check that the Generative Language API is enabled and billing is set up on the Google project the key belongs to.'
        : res.status === 429
          ? " Google's own rate limit was hit; wait a minute and try again."
          : '';
    throw new GeminiError(
      `Gemini request failed (${res.status}).${hint} ${detail.slice(0, 200)}`.trim(),
    );
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (data?.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini declined this image (${data.promptFeedback.blockReason}).`);
  }
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) {
    throw new GeminiError('Empty response from Gemini.');
  }

  const json = extractJsonObject(text);
  if (!json) {
    throw new GeminiError('Gemini returned something that is not JSON.');
  }
  let parsed: T;
  try {
    parsed = JSON.parse(json) as T;
  } catch {
    throw new GeminiError('Gemini returned malformed JSON.');
  }

  const meta = data?.usageMetadata;
  return {
    data: parsed,
    model: GEMINI_MODEL,
    elapsedMs: Date.now() - startedAt,
    usage: {
      promptTokens: num(meta?.promptTokenCount),
      outputTokens: num(meta?.candidatesTokenCount),
      thoughtTokens: num(meta?.thoughtsTokenCount),
      totalTokens: num(meta?.totalTokenCount),
    },
  };
}
