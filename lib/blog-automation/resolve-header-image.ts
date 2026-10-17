/**
 * The header image chain (AUTO-202): `ai` -> `library` -> `product` -> none,
 * starting wherever the chosen source says, and NEVER THROWING. Server side
 * (it fetches product photos, calls Gemini, uploads an asset, reserves the
 * daily cap in Sanity), but every effect is behind `HeaderImageDeps`, so the
 * tests drive the real chain with fakes and the two callers (the draft
 * creator and the generate-blog-image route) pass `defaultHeaderImageDeps`.
 *
 * The AI step, in order, each failure a note and a fall to the next source:
 *   1. the client and the key: no write client or no GOOGLE_GEMINI_API_KEY
 *      means no cap slot is spent and no image is tried (the review of the
 *      proof run: before this, an environment without the key burned a slot
 *      of the daily cap on every draft for a call that was never made);
 *   2. the cap, RESERVED BEFORE anything else is spent (lib/blog-automation/
 *      header-image-usage.ts): refused, the refusal is the note;
 *   3. the reference photos: the post's own strip products that carry a
 *      topic word, up to four, fetched IN PARALLEL from Geiger's image server
 *      at HEADER_IMAGE_REFERENCE_WIDTH inside the budget (a failed fetch is
 *      skipped; with none the prompt describes the item);
 *   4. the scene plan (AUTO-203): one cheap call on the vision model that
 *      says where this product lives (its surface, its setting, what is
 *      around it, what text belongs on it, what would be physically wrong)
 *      and, since AUTO-207, HOW MANY of it to show and IN WHAT STATE, read
 *      from the reference PHOTOS (the planner sees them; a name like "Gold
 *      First Aid Kit" no longer becomes a gold tin) and answered through a
 *      response schema. Made ONCE per picture (the retry reuses it); a
 *      planner that fails or answers unreadably is asked ONCE more, and a
 *      second failure is said LOUDLY (an error line and a note) and the
 *      picture is drawn from the standard composition, which carries the
 *      same count rule and no-signs rule as a plan;
 *   5. the generation on GEMINI_IMAGE_MODEL (Pro since AUTO-207), with a
 *      timeout inside the chain's own budget. ANY failure of it (an HTTP
 *      error, a 503, a timeout, an answer with NO picture in it) is handed
 *      ONCE to GEMINI_IMAGE_FALLBACK_MODEL, a second slot reserved, if the
 *      budget allows; a second failure is a note and a fall;
 *   6. the check: the vision model reads the picture back IMAGE_CHECK_READS
 *      times in parallel (AUTO-204: the one read the chain used to make
 *      missed an Apple logo that five reads of nine saw) and lists every
 *      readable piece of text with its object
 *      and its kind; a logo, a brand or company name or a contact detail,
 *      display text on anything, or an impossible placement seen by ANY read
 *      refuses the picture, while the product's own markings and small page
 *      text pass (the rule is `imageCheckProblem` in header-image.ts); a
 *      refusal is ONE retry with the problem named (a second slot reserved,
 *      the cap counts attempts) on the main model when there is time for it,
 *      on the backup when there is only time for that, else a fall;
 *   7. the upload, inside the budget: the bytes become a Sanity image asset
 *      carrying the BLOG_HEADER_ASSET_SOURCE marker (AUTO-207: how a replaced
 *      generated picture is told from an upload when it is removed), and the
 *      outcome carries the value to write onto the post.
 *
 * Before step 1, AUTO-207: a post in a DEVICE_MOUNTED_ROOTS category skips
 * the AI entirely (no slot, no call): the library, then the product photo.
 *
 * NO PICTURE IS JUDGED FOR BELIEVABILITY, AND NONE IS CHOSEN FROM SEVERAL.
 * AUTO-206 measured all three ways of doing that and each is dead: no vision
 * model on the key can tell a believable product from an unbelievable one,
 * and every one of them calls real catalogue photographs fake (CLAUDE.md
 * AUTO-207, "the closed roads"). The last check is a human eye, which is what
 * "Generate another header image" is for.
 *
 * THE BUDGET IS A DEADLINE, NOT A HOPE. HEADER_IMAGE_BUDGET_MS = 70 s for
 * the whole chain, and EVERY effect after the reservation runs under
 * `withDeadline(remaining())`: a reference fetch, the plan, the generation,
 * the check and the upload each give up when the budget is gone, so the chain cannot
 * run past 70 s however slow Google or the CDN is (a step cut off by the
 * deadline is a note and a fall, exactly like a failure). The measured
 * chain is 11 to 21 s (AUTO-202), plus about 2 s for the planner (AUTO-203). The blog-topics route's 240 s must hold the DeepSeek
 * deadline of 150 s (BLOG_AI_TIMEOUT_MS), two live drafts reads, this chain
 * and the create: 150 + 3 + 70 + 1 is 224, inside 240 with room to answer.
 * Do not widen this budget without re-doing that sum.
 */
import type { SanityClient } from '@sanity/client';
import {
  GEMINI_IMAGE_FALLBACK_MODEL,
  GEMINI_IMAGE_MODEL,
  GeminiError,
  generateImage,
  generateJsonFromImage,
  generateJsonFromImages,
  generateJsonFromText,
  type GeminiImageInput,
} from '../ai/gemini';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';
import {
  PLANNER_RESPONSE_SCHEMA,
  deviceMountedRoot,
  photosForPicture,
  buildHeaderImagePrompt,
  buildImageCheckPrompt,
  buildScenePlanPrompt,
  buildTileCheckPrompt,
  parseTileCheck,
  tilePassProblem,
  TILE_REGIONS,
  firstProductImage,
  geigerReferenceUrl,
  headerImageAlt,
  headerImageFilename,
  HEADER_IMAGE_ASPECT_RATIO,
  HEADER_IMAGE_SIZE,
  IMAGE_CHECK_READS,
  imageValueFor,
  parseImageCheck,
  parseScenePlan,
  pickLibraryImage,
  pickReferenceProducts,
  UNREADABLE_IMAGE_CHECK,
  worstImageCheckProblem,
  type HeaderImageLibraryEntry,
  type HeaderImageOutcome,
  type HeaderImageSource,
  type HeaderImageUsage,
  type ImageCheck,
  type ImageCheckContext,
  type ReferenceProduct,
  type ScenePlan,
  type TileCheck,
} from './header-image';
import { reserveBlogImageCall, type BlogImageReservation } from './header-image-usage';

/**
 * The whole chain's deadline (AUTO-207: 70 s to 90 s, raised deliberately).
 * Measured per step, worst observed: reference photos 2.1 s, the planner
 * 4.4 s (96 calls), a Pro generation 26 s (28 calls: AUTO-207's 20 at 15.8 to
 * 22.2 s, AUTO-206's 8 at 17 to 26 s), the two reads 6.7 s, the close look
 * 5.3 s, the upload about 3 s. A refusal and a second Pro picture at the
 * WORST of every step is 2.1 + 4.4 + (26 + 6.7 + 5.3) x 2 + 3 = 85.5 s; a Pro
 * failure at its 45 s timeout and the backup at its worst observed 22 s is
 * 2.1 + 4.4 + 45 + 22 + 6.7 + 5.3 + 3 = 88.5 s. At the median the first sum is
 * 52 s. 70 s held at the median but not in the tail, where a refused picture
 * would have fallen to the product photo for want of time; 90 s holds both.
 * The routes that carry this chain were raised with it (generate-blog-image
 * 90 to 120 s, blog-topics 240 to 270 s). Do not widen it again without
 * re-doing both sums.
 */
export const HEADER_IMAGE_BUDGET_MS = 90_000;
/** One generation's own timeout on GEMINI_IMAGE_MODEL (worst observed 26 s). */
export const HEADER_IMAGE_GENERATE_TIMEOUT_MS = 45_000;
/** One generation's own timeout on GEMINI_IMAGE_FALLBACK_MODEL (worst observed 22 s, AUTO-206). */
export const HEADER_IMAGE_FALLBACK_GENERATE_TIMEOUT_MS = 30_000;
/** A second attempt on GEMINI_IMAGE_MODEL is made only with this much budget left: a worst Pro picture, its reads, its close look and the upload (26 + 6.7 + 5.3 + 2). */
export const HEADER_IMAGE_RETRY_MIN_REMAINING_MS = 40_000;
/** A second attempt on GEMINI_IMAGE_FALLBACK_MODEL is made only with this much budget left (22 + 6.7 + 5.3 + 1). */
export const HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS = 35_000;
/** Kept back from a generation's timeout for the reads, the close look and the upload that follow it (worst observed 6.7 + 5.3 s). */
const AFTER_GENERATION_RESERVE_MS = 12_000;
/** The check's own ceiling (the measured read is about 2.5 s; the reads run in parallel). */
const CHECK_TIMEOUT_MS = 15_000;
/** Room for the whole listed answer (AUTO-204): eight entries are about 350 tokens; a cut-off answer cannot be parsed and refuses the picture. */
const CHECK_MAX_OUTPUT_TOKENS = 1024;
/** The scene planner's own ceiling. */
const PLAN_TIMEOUT_MS = 15_000;
/** Planner calls per picture (AUTO-207): a failed or unreadable plan is asked for once more. */
export const PLANNER_ATTEMPTS = 2;
/** Room for the whole plan: about 300 tokens; a cut-off answer is unreadable. */
const PLAN_MAX_OUTPUT_TOKENS = 1024;

/**
 * The planner ANSWERED, but with nothing usable (AUTO-207): not JSON, a
 * malformed object, an empty reply, a refusal, or a plan with no surface and
 * no setting. Distinct from "unavailable" (no answer at all), so the chain can
 * say which, loudly.
 */
export class PlannerAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerAnswerError';
  }
}
/** Each reference photo fetch; the four run in parallel. */
const REFERENCE_FETCH_TIMEOUT_MS = 8_000;
const REFERENCE_MAX_BYTES = 3 * 1024 * 1024;

/** The planner's answer with what it cost. */
export interface PlannedScene {
  scene: ScenePlan;
  usage: { model: string; promptTokens: number; outputTokens: number; elapsedMs: number };
}

export interface GeneratedPicture {
  bytes: Buffer;
  mimeType: string;
  base64: string;
  usage: { imageTokens: number; promptTokens: number; elapsedMs: number; model: string };
}

/** Every effect of the chain, injectable. */
export interface HeaderImageDeps {
  /** Whether the image service is configured at all (the key is present); false skips the AI step with no slot spent. */
  keyConfigured: () => boolean;
  /** Reserve one generated image for today (the cap). */
  reserve: (now: Date) => Promise<BlogImageReservation>;
  /** The bytes of one product photo, or null when it could not be fetched. */
  fetchReference: (url: string) => Promise<GeminiImageInput | null>;
  /**
   * AUTO-203: plan the scene for this product. AUTO-207: the planner is given
   * the reference photos (`references`, in the order of `productNames`) so the
   * plan describes what they show. Null when the planner was unavailable (no
   * answer); throws `PlannerAnswerError` when it answered with nothing usable.
   */
  plan: (args: { title: string; topic: string; productNames: readonly string[]; references: GeminiImageInput[] }) => Promise<PlannedScene | null>;
  /** AUTO-207: `model` is GEMINI_IMAGE_MODEL, or GEMINI_IMAGE_FALLBACK_MODEL on the fallback attempt. */
  generate: (args: { prompt: string; references: GeminiImageInput[]; timeoutMs: number; model: string }) => Promise<GeneratedPicture>;
  /** ONE read of a generated picture; null when the check itself was unavailable. The chain calls it IMAGE_CHECK_READS times per picture. `context` says what the picture is about, so the check knows which objects are the product. */
  check: (image: GeminiImageInput, context: ImageCheckContext) => Promise<ImageCheck | null>;
  /**
   * AUTO-205: one close look at one region of a picture that passed the
   * reads (the tile pass); null when unavailable. The chain calls it once per
   * TILE_REGIONS entry, in parallel. Optional so a test's fake deps need not
   * provide it; the real deps always do.
   */
  checkRegion?: (image: GeminiImageInput, region: string) => Promise<TileCheck | null>;
  /** Store the bytes as a Sanity image asset; returns the asset document id. */
  upload: (bytes: Buffer, filename: string, contentType: string) => Promise<string>;
  now: () => number;
}

export interface ResolveHeaderImageInput {
  /** Where the chain starts: the effective source for this post. */
  source: HeaderImageSource;
  title: string;
  topic: string;
  /** The post's strip products in reading order (the server resolves the SKUs before calling, hidden products removed). */
  products: readonly ReferenceProduct[];
  /** Root slugs the library may match, in preference order. */
  rootSlugs: readonly string[];
  library: readonly HeaderImageLibraryEntry[];
  /** For the asset filename. */
  slug: string;
  /** True when there is no write client at all (the AI step is then skipped with a note). */
  clientMissing?: boolean;
  log?: (line: string) => void;
  /** AUTO-207: where a planner failure is said LOUDLY (default console.error, which Vercel keeps as an error line). */
  logError?: (line: string) => void;
}

/**
 * True when the check call ANSWERED but gave no verdict (AUTO-204): the reply
 * was not JSON, was cut off, was empty, or the model declined to look at the
 * picture. Such a read refuses the picture. A call that never answered (a
 * network failure, an HTTP error, a timeout, a missing key) is "unavailable"
 * instead. The four wordings are lib/ai/gemini.ts's own; a test pins them.
 */
export function checkAnsweredWithoutVerdict(message: string): boolean {
  return /not JSON|malformed JSON|Empty response|declined this/i.test(message);
}

/** The real effects, over the server write client. */
export function defaultHeaderImageDeps(client: SanityClient): HeaderImageDeps {
  return {
    keyConfigured: () => Boolean(process.env.GOOGLE_GEMINI_API_KEY),
    reserve: (now) => reserveBlogImageCall(client, now),
    fetchReference: fetchReferencePhoto,
    generate: async ({ prompt, references, timeoutMs, model }) => {
      const out = await generateImage({
        prompt,
        references,
        model,
        aspectRatio: HEADER_IMAGE_ASPECT_RATIO,
        imageSize: HEADER_IMAGE_SIZE,
        timeoutMs,
      });
      return {
        bytes: out.bytes,
        mimeType: out.mimeType,
        base64: out.base64,
        usage: { imageTokens: out.usage.imageTokens, promptTokens: out.usage.promptTokens, elapsedMs: out.elapsedMs, model: out.model },
      };
    },
    plan: async ({ title, topic, productNames, references }) => {
      // AUTO-207: the planner SEES the reference photos (the naming trap) and
      // answers through a response schema (the malformed answers).
      const { system, user } = buildScenePlanPrompt({ title, topic, productNames, photos: references.length });
      let data: unknown;
      let usage: PlannedScene['usage'];
      try {
        const common = { system, user, maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS, temperature: 0.3, timeoutMs: PLAN_TIMEOUT_MS, responseSchema: PLANNER_RESPONSE_SCHEMA };
        const result = references.length > 0 ? await generateJsonFromImages<unknown>({ ...common, images: references }) : await generateJsonFromText<unknown>(common);
        data = result.data;
        usage = { model: result.model, promptTokens: result.usage.promptTokens, outputTokens: result.usage.outputTokens + result.usage.thoughtTokens, elapsedMs: result.elapsedMs };
      } catch (err) {
        // Answered without a usable plan (not JSON, malformed, empty, declined): say so. No answer at all: unavailable.
        if (err instanceof GeminiError) {
          if (checkAnsweredWithoutVerdict(err.message)) throw new PlannerAnswerError(err.message);
          return null;
        }
        throw err;
      }
      const scene = parseScenePlan(data);
      if (!scene) throw new PlannerAnswerError('the plan named no surface and no setting');
      return { scene, usage };
    },
    check: async (image, context) => {
      const { system, user } = buildImageCheckPrompt(context);
      try {
        const result = await generateJsonFromImage<unknown>({ system, user, image, maxOutputTokens: CHECK_MAX_OUTPUT_TOKENS, temperature: 0 });
        return parseImageCheck(result.data);
      } catch (err) {
        // An answer that arrived without a verdict is a REFUSAL, not an
        // unavailable check (AUTO-204): the picture with the most text is the
        // one whose answer is longest, so "could not parse" must never mean
        // "accepted unchecked". Only a call that never answered is unavailable.
        if (err instanceof GeminiError) return checkAnsweredWithoutVerdict(err.message) ? UNREADABLE_IMAGE_CHECK : null;
        throw err;
      }
    },
    checkRegion: async (image, region) => {
      const { system, user } = buildTileCheckPrompt(region);
      try {
        const result = await generateJsonFromImage<unknown>({ system, user, image, maxOutputTokens: 256, temperature: 0 });
        return parseTileCheck(region, result.data);
      } catch (err) {
        // A region read that failed is left out; the two full reads already passed, and the tile pass is the belt.
        if (err instanceof GeminiError) return null;
        throw err;
      }
    },
    upload: async (bytes, filename, contentType) => {
      // AUTO-207: the marker that lets lib/blog-automation/discard-header-image.ts
      // tell a generated header from a picture Patrick uploaded.
      const asset = await client.assets.upload('image', bytes, { filename, contentType, source: { name: BLOG_HEADER_ASSET_SOURCE, id: filename } });
      return asset._id;
    },
    now: () => Date.now(),
  };
}

/** The deps used when there is no write client at all: nothing can be reserved, generated or stored. */
export function noClientHeaderImageDeps(): HeaderImageDeps {
  return {
    keyConfigured: () => false,
    reserve: async () => ({ ok: false, reason: 'unavailable', used: 0, cap: 0, day: '', message: 'the server has no Sanity write access' }),
    fetchReference: async () => null,
    plan: async () => null,
    generate: async () => {
      throw new Error('the server has no Sanity write access');
    },
    check: async () => null,
    upload: async () => {
      throw new Error('the server has no Sanity write access');
    },
    now: () => Date.now(),
  };
}

/** One Geiger product photo as inline data for the model; null on any failure. Only the Geiger host is ever fetched. */
export async function fetchReferencePhoto(url: string): Promise<GeminiImageInput | null> {
  const target = geigerReferenceUrl(url);
  if (!target) return null;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > REFERENCE_MAX_BYTES) return null;
    return { mimeType, base64: bytes.toString('base64') };
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A model failure as Patrick reads it in the notes (AUTO-207): the first
 * sentence only ("Image request failed (404)."), never Google's raw error
 * body, which the forced-failure proof showed reaching the Studio dialog as
 * JSON. The full message still goes to the log.
 */
export function shortFailure(message: string): string {
  const first = message.split(/(?<=[.!?])\s/)[0] ?? message;
  return first.length > 120 ? `${first.slice(0, 117)}...` : first;
}

/** Reject when `ms` passes before the promise settles; the underlying work is abandoned, not cancelled. */
export function withDeadline<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  if (ms <= 0) return Promise.reject(new Error(`${what} skipped: the image budget is spent`));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} gave up after ${Math.round(ms / 1000)} s (the image budget)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Resolve the header image for one post. Never throws: every failure is a
 * note on the outcome and the chain moves to the next source.
 */
export async function resolveHeaderImage(input: ResolveHeaderImageInput, deps: HeaderImageDeps): Promise<HeaderImageOutcome> {
  const notes: string[] = [];
  const log = input.log ?? (() => {});
  const startedAt = deps.now();
  const remaining = () => HEADER_IMAGE_BUDGET_MS - (deps.now() - startedAt);
  const order: HeaderImageSource[] = ['ai', 'library', 'product'];
  const from = order.indexOf(input.source);
  const steps = order.slice(from === -1 ? 0 : from);

  // AUTO-207: a product that only makes sense on a phone or a laptop is not
  // drawn at all (the device rule would leave an empty frame); the library,
  // then the product photo, take over.
  const mounted = deviceMountedRoot(input.rootSlugs);

  for (const step of steps) {
    if (step === 'ai' && mounted) {
      notes.push(
        `products in the "${mounted}" category only make sense on a phone or a laptop, which a header picture may not show, so the AI does not draw one; a picture for this category in the header image library (Global Settings) is used instead when there is one`,
      );
      log(`[header-image] device-mounted root ${mounted}: AI skipped`);
      continue;
    }
    if (step === 'ai') {
      let made: HeaderImageOutcome | null = null;
      try {
        made = await aiStep(input, deps, notes, remaining, log);
      } catch (err) {
        // The belt: aiStep catches its own effects; this catches a fault in the chain itself.
        notes.push(`the image step failed: ${errorText(err)}`);
        log(`[header-image] step threw: ${errorText(err)}`);
      }
      if (made) return made;
      continue;
    }
    if (step === 'library') {
      const hit = pickLibraryImage(input.library, input.rootSlugs);
      if (hit) {
        return { kind: 'asset', source: 'library', image: imageValueFor(hit.assetRef, hit.alt ?? headerImageAlt(input.topic)), notes };
      }
      notes.push(input.library.length === 0 ? 'the header image library is empty' : 'the header image library has no picture for this category');
      continue;
    }
    const first = firstProductImage(input.products, input.topic);
    if (first) return { kind: 'url', source: 'product', url: first.url, alt: first.alt, notes };
    notes.push(
      input.products.length > 0 && firstProductImage(input.products) !== null
        ? "none of the post's product photos matched the topic, so none was used as the header"
        : 'the post has no product photo to fall back on',
    );
  }
  return { kind: 'none', notes };
}

async function aiStep(
  input: ResolveHeaderImageInput,
  deps: HeaderImageDeps,
  notes: string[],
  remaining: () => number,
  log: (line: string) => void,
): Promise<HeaderImageOutcome | null> {
  const logError = input.logError ?? ((line: string) => console.error(line));
  if (input.clientMissing) {
    notes.push('the server has no Sanity write access, so no image could be generated');
    return null;
  }
  if (!deps.keyConfigured()) {
    notes.push('the AI image service is not set up (GOOGLE_GEMINI_API_KEY is missing on the server), so no image was generated');
    return null;
  }

  let previousProblem: string | null = null;
  let attempts = 0;
  let usage: HeaderImageUsage | undefined;
  let references: GeminiImageInput[] | null = null;
  let names: string[] = [];
  let planned: PlannedScene | null | undefined;
  /** The model the next attempt draws with (AUTO-207: the main model, then the backup after a failure). */
  let model = GEMINI_IMAGE_MODEL;
  /** Why the main model's attempt produced no picture, when the next attempt is the backup's. */
  let modelFailure: string | null = null;

  while (attempts < 2) {
    if (attempts > 0) {
      // The second attempt (AUTO-207). After a FAILURE the backup model
      // draws (twice as fast); after a REFUSAL the main model draws again,
      // or the backup when there is no longer time for the main one.
      if (modelFailure) {
        if (remaining() < HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS) {
          notes.push(`the image model failed (${modelFailure}), and there was no time left in the image budget for the backup model`);
          return null;
        }
        model = GEMINI_IMAGE_FALLBACK_MODEL;
      } else if (remaining() >= HEADER_IMAGE_RETRY_MIN_REMAINING_MS) {
        model = GEMINI_IMAGE_MODEL;
      } else if (remaining() >= HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS) {
        model = GEMINI_IMAGE_FALLBACK_MODEL;
      } else {
        notes.push(`the first picture showed ${previousProblem}, and there was no time left in the image budget for a second attempt`);
        return null;
      }
    }

    // The cap, before anything else is spent on this attempt.
    let reservation: BlogImageReservation;
    try {
      reservation = await deps.reserve(new Date(deps.now()));
    } catch (err) {
      notes.push(`the daily-limit counter could not be reached (${errorText(err)}), so no image was generated`);
      return null;
    }
    if (reservation.ok === false) {
      const first = previousProblem ? `the first picture showed ${previousProblem}, and ` : modelFailure ? `the image model failed (${modelFailure}), and ` : '';
      notes.push(`${first}${reservation.message}`);
      return null;
    }
    attempts += 1;

    // The reference photos, once, in parallel, inside the budget.
    if (references === null) {
      const candidates = pickReferenceProducts(input.products, undefined, input.topic);
      if (candidates.length === 0 && pickReferenceProducts(input.products).length > 0) {
        notes.push("none of the post's product photos matched the topic, so the picture was drawn from the title alone");
      }
      const fetched = await Promise.all(
        candidates.map(async (p) => {
          try {
            return { p, img: await withDeadline(deps.fetchReference(p.imageUrl as string), Math.min(REFERENCE_FETCH_TIMEOUT_MS, remaining()), `the photo of ${p.sku}`) };
          } catch (err) {
            log(`[header-image] reference fetch failed for ${p.sku}: ${errorText(err)}`);
            return { p, img: null };
          }
        }),
      );
      references = [];
      names = [];
      for (const { p, img } of fetched) {
        if (img) {
          references.push(img);
          names.push(p.name);
        }
      }
    }

    // The scene, once per picture (AUTO-203), from the photos (AUTO-207). A
    // planner that fails is asked ONCE more; a second failure is said LOUDLY
    // (an error line in the server log and a note on the outcome), and the
    // picture is drawn from the standard composition, which carries the same
    // count and state rule and the same no-signs rule as a plan does, so it
    // is never weaker than a planned picture on either.
    if (planned === undefined) {
      planned = null;
      let failure: 'malformed' | 'unavailable' = 'unavailable';
      let detail = '';
      let tries = 0;
      for (let p = 1; p <= PLANNER_ATTEMPTS; p += 1) {
        if (p > 1 && remaining() < PLAN_TIMEOUT_MS + HEADER_IMAGE_RETRY_MIN_REMAINING_MS) break;
        tries = p;
        try {
          const got = await withDeadline(
            deps.plan({ title: input.title, topic: input.topic, productNames: names, references }),
            Math.min(PLAN_TIMEOUT_MS, remaining()),
            'the scene planner',
          );
          if (got) {
            planned = got;
            break;
          }
          failure = 'unavailable';
          detail = 'no answer';
        } catch (err) {
          failure = err instanceof PlannerAnswerError ? 'malformed' : 'unavailable';
          detail = errorText(err);
        }
        logError(
          `[header-image] SCENE PLANNER ${failure === 'malformed' ? 'ANSWERED WITH NO USABLE PLAN' : 'UNAVAILABLE'} (try ${p} of ${PLANNER_ATTEMPTS}) for "${input.topic}": ${detail}`,
        );
      }
      if (!planned) {
        notes.push(
          `the scene planner ${failure === 'malformed' ? 'answered with a plan that could not be read' : 'was unavailable'} (${tries === 1 ? 'one try' : `${tries} tries`}: ${detail}), so the picture was drawn from the standard composition (one to three items in a plain setting, no signs or screens); look at it before publishing`,
        );
      } else {
        log(
          `[header-image] plan surface="${planned.scene.surface}" setting="${planned.scene.setting}" arrangement="${planned.scene.arrangement}" productText="${planned.scene.productText}" avoid="${planned.scene.avoid}" tokens=${planned.usage.promptTokens}+${planned.usage.outputTokens} ms=${planned.usage.elapsedMs}`,
        );
      }
    }
    const scene = planned?.scene ?? null;
    // AUTO-207, the overshoot: the image model is sent ONLY the photo(s) the
    // plan's arrangement shows (four different photos made it draw one of
    // each, whatever the words said); with no plan, the first photo alone.
    const pick = scene ? photosForPicture(scene.photos, references.length) : references.length > 0 ? [0] : [];
    const drawRefs = pick.map((i) => (references as GeminiImageInput[])[i]);
    const drawNames = pick.map((i) => names[i]);
    if (attempts === 1 && references.length > 0) log(`[header-image] photos sent to the image model: ${pick.map((i) => i + 1).join(', ')} of ${references.length}`);
    const checkContext: ImageCheckContext = { topic: input.topic, productNames: drawNames, productText: scene?.productText ? scene.productText : null };

    const perModel = model === GEMINI_IMAGE_MODEL ? HEADER_IMAGE_GENERATE_TIMEOUT_MS : HEADER_IMAGE_FALLBACK_GENERATE_TIMEOUT_MS;
    const timeoutMs = Math.max(5_000, Math.min(perModel, remaining() - AFTER_GENERATION_RESERVE_MS));
    let picture: GeneratedPicture;
    try {
      picture = await withDeadline(
        deps.generate({
          prompt: buildHeaderImagePrompt({ title: input.title, topic: input.topic, productNames: drawNames, scene, previousProblem }),
          references: drawRefs,
          timeoutMs,
          model,
        }),
        timeoutMs + 1_000,
        'the image model',
      );
    } catch (err) {
      const why = errorText(err);
      log(`[header-image] generate failed on ${model} (attempt ${attempts}): ${why}`);
      // AUTO-207: a failure of the main model (an HTTP error, a 503, a
      // timeout, an answer with no picture) is handed to the backup model
      // once; it never stops the draft either way.
      if (attempts < 2 && !previousProblem && model !== GEMINI_IMAGE_FALLBACK_MODEL) {
        modelFailure = shortFailure(why);
        continue;
      }
      notes.push(
        `${previousProblem ? `the first picture showed ${previousProblem}, and then ` : modelFailure ? `the image model failed (${modelFailure}), and then ` : ''}the ${model === GEMINI_IMAGE_FALLBACK_MODEL && modelFailure ? 'backup ' : ''}image model failed: ${shortFailure(why)}`,
      );
      return null;
    }
    usage = {
      model: picture.usage.model,
      imageTokens: (usage?.imageTokens ?? 0) + picture.usage.imageTokens,
      promptTokens: (usage?.promptTokens ?? 0) + picture.usage.promptTokens,
      elapsedMs: (usage?.elapsedMs ?? 0) + picture.usage.elapsedMs,
      attempts,
      capUsed: reservation.used,
      cap: reservation.cap,
      planner: planned ? planned.usage : null,
      scene,
    };
    log(
      `[header-image] ${picture.usage.model} attempt=${attempts} references=${drawRefs.length}/${references.length} imageTokens=${picture.usage.imageTokens} promptTokens=${picture.usage.promptTokens} ms=${picture.usage.elapsedMs} cap=${reservation.used}/${reservation.cap}`,
    );

    // The reads, in parallel, the worst answer winning (AUTO-204).
    const pictureInput: GeminiImageInput = { mimeType: picture.mimeType, base64: picture.base64 };
    const checkDeadline = Math.min(CHECK_TIMEOUT_MS, remaining());
    const reads = await Promise.all(
      Array.from({ length: IMAGE_CHECK_READS }, async (): Promise<ImageCheck | null> => {
        try {
          return await withDeadline(deps.check(pictureInput, checkContext), checkDeadline, 'the text-and-logo check');
        } catch (err) {
          log(`[header-image] check unavailable: ${errorText(err)}`);
          return null;
        }
      }),
    );
    let problem = worstImageCheckProblem(reads);
    if (reads.every((r) => r === null)) notes.push('the text-and-logo check was unavailable, so the picture was accepted unchecked; look at it before publishing');
    // The tile pass (AUTO-205): six close looks, one per region, in parallel,
    // only on a picture the full reads passed; any logo seen refuses it like
    // a failed read. A region whose call failed is left out.
    if (!problem && deps.checkRegion) {
      const tileDeadline = Math.min(CHECK_TIMEOUT_MS, remaining());
      const tiles = await Promise.all(
        TILE_REGIONS.map(async (region): Promise<TileCheck | null> => {
          try {
            return await withDeadline(deps.checkRegion!(pictureInput, region), tileDeadline, `the close look at the ${region}`);
          } catch (err) {
            log(`[header-image] tile pass unavailable (${region}): ${errorText(err)}`);
            return null;
          }
        }),
      );
      problem = tilePassProblem(tiles);
      if (problem) log(`[header-image] tile pass refused attempt ${attempts}: ${problem}`);
    }
    if (problem) {
      log(`[header-image] check refused attempt ${attempts}: ${problem}`);
      if (attempts >= 2) {
        notes.push(
          modelFailure && !previousProblem
            ? `the image model failed (${modelFailure}), and the backup model's picture showed ${problem}, so it was not used`
            : `both generated pictures were refused, so neither was used: the first showed ${previousProblem}; the second showed ${problem}`,
        );
        return null;
      }
      previousProblem = problem;
      continue;
    }

    try {
      const assetId = await withDeadline(deps.upload(picture.bytes, headerImageFilename(input.slug, attempts), picture.mimeType), remaining(), 'saving the picture');
      if (attempts > 1 && previousProblem) notes.push(`the first picture showed ${previousProblem} and was replaced`);
      if (attempts > 1 && modelFailure && !previousProblem) notes.push(`the image model failed (${modelFailure}), so the backup model drew this picture`);
      return { kind: 'asset', source: 'ai', image: imageValueFor(assetId, headerImageAlt(input.topic)), notes, usage };
    } catch (err) {
      notes.push(`the generated picture could not be saved: ${errorText(err)}`);
      log(`[header-image] upload failed: ${errorText(err)}`);
      return null;
    }
  }
  return null;
}
