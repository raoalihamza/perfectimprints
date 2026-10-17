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

/**
 * The embedding model behind the Blog Topics tab's advisory "closest wording"
 * figures (AUTO-119). Chosen by AUTO-118's measurement: gemini-embedding-2,
 * called WITHOUT the task prefix Google recommends (the prefix squeezed every
 * score into 0.84 to 0.99 and made the classes overlap more), at 768
 * dimensions (measured as good as 3072). Paid tier USD 0.20 per million text
 * tokens (https://ai.google.dev/gemini-api/docs/pricing, read 2026-09-28).
 * Named here, beside GEMINI_MODEL, so both Gemini model names live in this one
 * file.
 */
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
/** Output dimensions requested from the embedding model. */
export const GEMINI_EMBEDDING_DIMENSIONS = 768;
/** Google's limit on one batchEmbedContents call (a 101-item batch answers 400, measured 2026-09-28). */
export const GEMINI_EMBEDDING_BATCH = 100;
/**
 * The project's embedding quota, from Google's own 429 on 2026-09-28: metric
 * `embed_content_paid_tier_requests`, quota id
 * `EmbedContentPerMinutePerProjectPerUserPerModel-PaidTier`, value 3000. EACH
 * TEXT in a batch counts as one request, and a full Blog Topics build is about
 * 3,100 texts, so the batches are sent ONE AT A TIME (measured about 2.6 s per
 * 100, which is about 2,300 texts a minute) and a 429 waits the `retryDelay`
 * Google names. Two or three batches in flight measured 7 and 28 failures of 31.
 */
export const GEMINI_EMBEDDING_REQUESTS_PER_MINUTE = 3000;
/** Retries per batch after a 429; each waits Google's retryDelay (capped). */
const EMBED_MAX_RETRIES = 4;
const EMBED_MAX_RETRY_WAIT_MS = 20_000;
/** USD per million text tokens for the embedding model (paid tier). */
export const GEMINI_EMBEDDING_USD_PER_MILLION_TOKENS = 0.2;

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

/** A text-only JSON call on the same model (AUTO-203: the header image scene planner). */
export interface GenerateJsonFromTextOptions {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** Default GEMINI_TIMEOUT_MS. */
  timeoutMs?: number;
  /**
   * AUTO-207: a response schema (Google's OpenAPI subset, `generationConfig.responseSchema`).
   * With one, the model's decoding is CONSTRAINED to valid JSON of that shape;
   * without one, JSON mode alone is a request the model can break. The scene
   * planner broke it 3 times in 64 calls (AUTO-206: a missing key name,
   * `"people": "...", [ ... ]`, and unquoted keys, `setting: "..."`), which
   * silently dropped the plan. Measured with the schema: see CLAUDE.md AUTO-207.
   */
  responseSchema?: Record<string, unknown>;
}

/**
 * AUTO-207: a JSON call with SEVERAL images (the scene planner reads the
 * reference photos, so the plan describes the product the photos show and
 * not what its catalogue name says). Same model, key handling and errors.
 */
export interface GenerateJsonFromImagesOptions extends GenerateJsonFromTextOptions {
  images: GeminiImageInput[];
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

interface GeminiJsonCall {
  system: string;
  user: string;
  /** The image part, sent before the text when present. */
  image?: GeminiImageInput;
  /** Several image parts, in order, sent before the text (AUTO-207). */
  images?: GeminiImageInput[];
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  responseSchema?: Record<string, unknown>;
}

/**
 * The one JSON call on GEMINI_MODEL, with or without an image part. Throws
 * `GeminiError` when the key is missing, the HTTP call fails or times out,
 * the answer is blocked or empty, or the content is not valid JSON. The
 * caller validates the SHAPE of `T` itself (this only guarantees parseable
 * JSON). The key travels in the header only and is never in a message.
 */
async function generateJsonCall<T>(opts: GeminiJsonCall): Promise<GeminiJsonResult<T>> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError('GOOGLE_GEMINI_API_KEY is not configured on the server.', 500);
  }
  const timeoutMs = opts.timeoutMs ?? GEMINI_TIMEOUT_MS;

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [
          {
            role: 'user',
            parts: [
              ...[...(opts.image ? [opts.image] : []), ...(opts.images ?? [])].map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
              { text: opts.user },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
          ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
        },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new GeminiError(
      timedOut
        ? `Gemini did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
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
    throw new GeminiError(`Gemini declined this ${opts.image ? 'image' : 'request'} (${data.promptFeedback.blockReason}).`);
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

/**
 * One image-plus-instructions call returning parsed JSON (PORT-170). See
 * `generateJsonCall` for what it throws.
 */
export async function generateJsonFromImage<T>(
  opts: GenerateJsonFromImageOptions,
): Promise<GeminiJsonResult<T>> {
  return generateJsonCall<T>(opts);
}

/**
 * One text-only call returning parsed JSON on the same cheap model (AUTO-203:
 * the scene planner that runs before a header image is drawn). The request
 * is `generateJsonFromImage`'s without the image part; same errors, same
 * key handling. No search tool is attached: Google Search grounding is
 * "Not available" on the standard tier of every Gemini 3.x model (pricing
 * page, read 2026-10-08), and a probe with `tools: [{google_search: {}}]`
 * answered 200 with no groundingMetadata on both 3.5 Flash-Lite and 3.5
 * Flash, so attaching it would buy nothing and claim something it does not
 * do.
 */
export async function generateJsonFromText<T>(opts: GenerateJsonFromTextOptions): Promise<GeminiJsonResult<T>> {
  return generateJsonCall<T>(opts);
}

/**
 * One call with several images and the instructions, returning parsed JSON
 * (AUTO-207: the scene planner reads the reference photos). The images go
 * first, in order, then the text; same model, errors and key handling as
 * `generateJsonFromImage`.
 */
export async function generateJsonFromImages<T>(opts: GenerateJsonFromImagesOptions): Promise<GeminiJsonResult<T>> {
  return generateJsonCall<T>(opts);
}

// -- Image generation (AUTO-202) --------------------------------------------------

/**
 * The model that DRAWS the blog header images (AUTO-202). A different model
 * from GEMINI_MODEL, which READS images; named here so every Gemini model
 * name on the site is in this one file. Chosen 2026-10-05 from
 * https://ai.google.dev/gemini-api/docs/pricing (page dated 2026-10-01) and
 * https://ai.google.dev/gemini-api/docs/deprecations, then confirmed by a
 * real call:
 *
 *   - gemini-3.1-flash-image ("Nano Banana 2"): USD 0.50 per million input
 *     tokens, USD 60 per million image output tokens, quoted as "$0.067 per
 *     1K image"; released 2026-05-28, "No shutdown date announced". A real
 *     1K 16:9 call answered in 9.7 s with a 1376 x 768 JPEG and
 *     1,120 image tokens, which is the quoted 6.7 cents. It was the one
 *     until AUTO-207 and is now GEMINI_IMAGE_FALLBACK_MODEL.
 *   - gemini-3.1-flash-lite-image: "$0.0336 per 1K resolution image", 1K
 *     only, listed as stable on the models page and ABSENT from the
 *     deprecations page; half the price, not measured here.
 *   - gemini-3-pro-image: "$0.134 per 1K/2K image". AUTO-202 judged it more
 *     than a blog header needs; AUTO-206 measured otherwise (articulated
 *     tools and printed scales, see GEMINI_IMAGE_FALLBACK_MODEL's comment)
 *     and AUTO-207 soaked it before switching. It is GEMINI_IMAGE_MODEL.
 *   - gemini-2.5-flash-image: "deprecated and will be shut down on October
 *     2, 2026", already gone when this was written. Never pick a model with
 *     a listed shutdown date.
 *
 * REST shape, confirmed by the same call: `models/<model>:generateContent`
 * with `generationConfig.responseModalities: ['IMAGE']` and
 * `generationConfig.imageConfig: { aspectRatio, imageSize }`; reference
 * photographs travel as `inlineData` parts before the text; the picture
 * comes back as `candidates[0].content.parts[].inlineData` with
 * `usageMetadata.candidatesTokensDetails[modality IMAGE]` carrying the
 * billed image tokens. (Google's current docs page describes the newer
 * Interactions API; generateContent still serves these models.) Every image
 * carries Google's invisible SynthID watermark.
 */
export const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image';

/**
 * AUTO-207: the model that draws when GEMINI_IMAGE_MODEL fails (an HTTP
 * error, a 503, a timeout, an answer with no picture): the AUTO-202 model,
 * twice as fast and half the price, which drew 47 of 47 pictures without a
 * failure in AUTO-206. A failure on the primary never stops a draft: the
 * chain asks this model once, then falls to the library and the product
 * photo (lib/blog-automation/resolve-header-image.ts).
 *
 * WHY THE PRIMARY MOVED TO PRO (AUTO-206, then AUTO-207's soak; the figures
 * are in CLAUDE.md AUTO-207). PORT-171 found a dearer model WORSE at reading
 * a photograph; drawing came out the other way. On the same cases Pro drew 5
 * believable pictures of 6 against flash's 2 of 7, and it drew correct scales
 * on all three measuring pictures, which no prompt had fixed on flash (AUTO-205
 * measured the jumbled cups and concluded it could not be fixed at an
 * acceptable cost). Pricing page dated 2026-10-15: gemini-3-pro-image USD 2
 * per million input tokens, USD 12 per million text and thinking tokens, USD
 * 120 per million image tokens, "$0.134 per 1K/2K image"; deprecations page
 * dated 2026-10-12: released 2026-05-28, "No shutdown date announced" (its
 * -preview sibling shut down 2026-06-25; never pick a preview).
 */
export const GEMINI_IMAGE_FALLBACK_MODEL = 'gemini-3.1-flash-image';

/** What a model costs, paid tier, for the cost line in logs and reports (pricing page dated 2026-10-15). */
export interface GeminiImagePrice {
  /** Google's quoted price for one 1K image. */
  usdPer1kImage: number;
  usdPerMillionInputTokens: number;
  /** Text and thinking output. */
  usdPerMillionTextOutputTokens: number;
  usdPerMillionImageTokens: number;
}

export const GEMINI_IMAGE_PRICES: Readonly<Record<string, GeminiImagePrice>> = {
  [GEMINI_IMAGE_MODEL]: { usdPer1kImage: 0.134, usdPerMillionInputTokens: 2, usdPerMillionTextOutputTokens: 12, usdPerMillionImageTokens: 120 },
  [GEMINI_IMAGE_FALLBACK_MODEL]: { usdPer1kImage: 0.067, usdPerMillionInputTokens: 0.5, usdPerMillionTextOutputTokens: 3, usdPerMillionImageTokens: 60 },
};

/** Google's quoted price for one 1K image on GEMINI_IMAGE_MODEL, for the cost line in logs and reports. */
export const GEMINI_IMAGE_USD_PER_1K_IMAGE = GEMINI_IMAGE_PRICES[GEMINI_IMAGE_MODEL].usdPer1kImage;
/** USD per million image output tokens on GEMINI_IMAGE_MODEL. */
export const GEMINI_IMAGE_USD_PER_MILLION_IMAGE_TOKENS = GEMINI_IMAGE_PRICES[GEMINI_IMAGE_MODEL].usdPerMillionImageTokens;

/** What one image call cost, from the tokens Google reported; null for a model with no price on record. */
export function imageCallUsd(model: string, usage: { promptTokens: number; imageTokens: number; outputTokens: number; thoughtTokens: number }): number | null {
  const price = GEMINI_IMAGE_PRICES[model];
  if (!price) return null;
  const textOut = Math.max(0, usage.outputTokens - usage.imageTokens) + usage.thoughtTokens;
  return (
    (usage.promptTokens * price.usdPerMillionInputTokens + usage.imageTokens * price.usdPerMillionImageTokens + textOut * price.usdPerMillionTextOutputTokens) /
    1_000_000
  );
}

/** An image call that has not answered in this long is not going to (the measured call is about 10 s on flash, 21 s on Pro). */
const GEMINI_IMAGE_TIMEOUT_MS = 60_000;

export type GeminiImageSize = '512px' | '1K' | '2K' | '4K';

export interface GenerateImageOptions {
  prompt: string;
  /** Which image model draws; default GEMINI_IMAGE_MODEL (AUTO-207: the chain passes GEMINI_IMAGE_FALLBACK_MODEL on its fallback attempt). */
  model?: string;
  /** Reference photographs, sent before the prompt. */
  references?: GeminiImageInput[];
  /** e.g. '16:9'. */
  aspectRatio?: string;
  imageSize?: GeminiImageSize;
  /** Default GEMINI_IMAGE_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface GeneratedImageResult {
  bytes: Buffer;
  base64: string;
  mimeType: string;
  usage: GeminiUsage & { imageTokens: number };
  model: string;
  elapsedMs: number;
  finishReason: string | null;
}

interface GeminiImageResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
    candidatesTokensDetails?: { modality?: string; tokenCount?: number }[];
  };
  promptFeedback?: { blockReason?: string };
}

/**
 * Generate ONE image. Throws `GeminiError` when the key is missing, the call
 * fails or times out, the prompt is blocked, or no image comes back (the
 * finish reason is in the message). The key travels in the header only.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<GeneratedImageResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError('GOOGLE_GEMINI_API_KEY is not configured on the server.', 500);
  }
  const timeoutMs = opts.timeoutMs ?? GEMINI_IMAGE_TIMEOUT_MS;
  const model = opts.model ?? GEMINI_IMAGE_MODEL;
  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              ...(opts.references ?? []).map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.base64 } })),
              { text: opts.prompt },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: opts.aspectRatio ?? '16:9',
            imageSize: opts.imageSize ?? '1K',
          },
        },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new GeminiError(
      timedOut
        ? `The image model did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
        : `Image request failed: ${err instanceof Error ? err.message : 'network error'}.`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const hint =
      res.status === 400 || res.status === 403 || res.status === 404
        ? ' Check that the Generative Language API is enabled and billing is set up on the Google project the key belongs to.'
        : res.status === 429
          ? " Google's own rate limit was hit; wait a minute and try again."
          : '';
    throw new GeminiError(`Image request failed (${res.status}).${hint} ${detail.slice(0, 200)}`.trim());
  }

  const data = (await res.json().catch(() => null)) as GeminiImageResponse | null;
  if (data?.promptFeedback?.blockReason) {
    throw new GeminiError(`The image model declined this prompt (${data.promptFeedback.blockReason}).`);
  }
  const candidate = data?.candidates?.[0];
  const part = (candidate?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    const reason = candidate?.finishReason ? ` (${candidate.finishReason})` : '';
    throw new GeminiError(`The image model returned no image${reason}.`);
  }
  const mimeType = (part.inlineData.mimeType || 'image/jpeg').toLowerCase();
  const base64 = part.inlineData.data;
  const meta = data?.usageMetadata;
  const imageTokens = (meta?.candidatesTokensDetails ?? [])
    .filter((d) => (d.modality ?? '').toUpperCase() === 'IMAGE')
    .reduce((sum, d) => sum + num(d.tokenCount), 0);
  return {
    bytes: Buffer.from(base64, 'base64'),
    base64,
    mimeType,
    model,
    elapsedMs: Date.now() - startedAt,
    finishReason: candidate?.finishReason ?? null,
    usage: {
      promptTokens: num(meta?.promptTokenCount),
      outputTokens: num(meta?.candidatesTokenCount),
      thoughtTokens: num(meta?.thoughtsTokenCount),
      totalTokens: num(meta?.totalTokenCount),
      imageTokens,
    },
  };
}

// -- Text embeddings (AUTO-119) ---------------------------------------------------

export interface EmbedTextsOptions {
  /** Aborts every outstanding batch (the caller's overall deadline). */
  signal?: AbortSignal;
  /** Batches in flight at once. Default 1: see GEMINI_EMBEDDING_REQUESTS_PER_MINUTE before raising it. */
  concurrency?: number;
  /** Waits between retries (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

export interface EmbedTextsResult {
  /** One vector per input text, in input order, each GEMINI_EMBEDDING_DIMENSIONS long. */
  vectors: number[][];
  /** Tokens Google reports it read (summed over the batches), for the cost figure. */
  promptTokens: number;
  calls: number;
  elapsedMs: number;
}

interface EmbedResponse {
  embeddings?: { values?: number[] }[];
  usageMetadata?: { promptTokenCount?: number; totalTokenCount?: number };
}

/** Google's RetryInfo `retryDelay` ("4s", "4.86s") from a 429 body, in ms; null when absent. */
export function retryDelayMs(body: string): number | null {
  try {
    const data = JSON.parse(body) as { error?: { details?: { '@type'?: string; retryDelay?: string }[] } };
    const info = (data.error?.details ?? []).find((d) => typeof d['@type'] === 'string' && d['@type'].endsWith('RetryInfo'));
    const secs = info?.retryDelay ? Number.parseFloat(info.retryDelay) : Number.NaN;
    return Number.isFinite(secs) && secs >= 0 ? Math.round(secs * 1000) : null;
  } catch {
    return null;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Embed a list of short texts with GEMINI_EMBEDDING_MODEL, in batches of
 * GEMINI_EMBEDDING_BATCH. Throws `GeminiError` on a missing key, any failed
 * batch, a timeout, or an answer of the wrong shape: there is no partial
 * result, so a caller never shows figures computed from half the list.
 * The key travels in the header only, as in `generateJsonFromImage`.
 */
export async function embedTexts(texts: readonly string[], opts: EmbedTextsOptions = {}): Promise<EmbedTextsResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError('GOOGLE_GEMINI_API_KEY is not configured on the server.', 500);
  }
  const startedAt = Date.now();
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += GEMINI_EMBEDDING_BATCH) batches.push(texts.slice(i, i + GEMINI_EMBEDDING_BATCH));
  const results: number[][][] = new Array(batches.length);
  let promptTokens = 0;
  let next = 0;

  const sleep = opts.sleep ?? defaultSleep;
  const runOne = async (index: number, attempt = 0): Promise<void> => {
    const batch = batches[index];
    let res: Response;
    try {
      res = await fetch(`${GEMINI_ENDPOINT}/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(GEMINI_TIMEOUT_MS)]) : AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${GEMINI_EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
          })),
        }),
      });
    } catch (err) {
      const aborted = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new GeminiError(aborted ? 'The embedding service did not answer in time.' : `Embedding request failed: ${err instanceof Error ? err.message : 'network error'}.`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status === 429 && attempt < EMBED_MAX_RETRIES && !opts.signal?.aborted) {
        await sleep(Math.min(EMBED_MAX_RETRY_WAIT_MS, (retryDelayMs(detail) ?? 5_000) + 250));
        return runOne(index, attempt + 1);
      }
      throw new GeminiError(`Embedding request failed (${res.status}). ${detail.slice(0, 200)}`.trim());
    }
    const data = (await res.json().catch(() => null)) as EmbedResponse | null;
    const vectors = (data?.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== batch.length || vectors.some((v) => v.length !== GEMINI_EMBEDDING_DIMENSIONS)) {
      throw new GeminiError('The embedding service returned an answer of the wrong shape.');
    }
    results[index] = vectors;
    promptTokens += num(data?.usageMetadata?.promptTokenCount ?? data?.usageMetadata?.totalTokenCount);
  };

  const workers = Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 1, batches.length)) }, async () => {
    while (next < batches.length) {
      const index = next;
      next += 1;
      await runOne(index);
    }
  });
  await Promise.all(workers);
  return { vectors: results.flat(), promptTokens, calls: batches.length, elapsedMs: Date.now() - startedAt };
}
