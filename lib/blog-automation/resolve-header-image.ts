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
 *   4. the scene plan (AUTO-203): one cheap text call on the vision model
 *      that says where this product lives (its surface, its setting, what is
 *      around it, what text belongs on it, what would be physically wrong),
 *      inside the budget, ONCE per picture (the retry reuses it); a planner
 *      that fails is a note and the prompt falls back to AUTO-202's, with
 *      its blanket no-text rule;
 *   5. the generation, with a timeout inside the chain's own budget; an
 *      answer with NO picture in it (the model's NO_IMAGE finish, seen once
 *      in four on the AUTO-203 proof run, on a tote bag scene) is retried
 *      ONCE like a failed check, a second slot reserved, if the budget
 *      allows; any other failure is a note and a fall;
 *   6. the check: the vision model reads the picture back for logos, brand
 *      or company names and contact details, text off the product (or any
 *      text, when none was allowed), and an impossible placement, inside the
 *      budget; a hit is ONE retry with the problem named (a second slot
 *      reserved, the cap counts attempts) if the budget allows, else a fall;
 *   7. the upload, inside the budget: the bytes become a Sanity image asset
 *      and the outcome carries the value to write onto the post.
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
  GEMINI_IMAGE_MODEL,
  GeminiError,
  generateImage,
  generateJsonFromImage,
  generateJsonFromText,
  type GeminiImageInput,
} from '../ai/gemini';
import {
  buildHeaderImagePrompt,
  buildImageCheckPrompt,
  buildScenePlanPrompt,
  firstProductImage,
  geigerReferenceUrl,
  headerImageAlt,
  headerImageFilename,
  HEADER_IMAGE_ASPECT_RATIO,
  HEADER_IMAGE_SIZE,
  imageCheckProblem,
  imageValueFor,
  parseImageCheck,
  parseScenePlan,
  pickLibraryImage,
  pickReferenceProducts,
  type HeaderImageLibraryEntry,
  type HeaderImageOutcome,
  type HeaderImageSource,
  type HeaderImageUsage,
  type ImageCheck,
  type ReferenceProduct,
  type ScenePlan,
} from './header-image';
import { reserveBlogImageCall, type BlogImageReservation } from './header-image-usage';

/** The whole chain's deadline. See the header before changing it. */
export const HEADER_IMAGE_BUDGET_MS = 70_000;
/** One generation's own timeout (the measured call is 10 to 21 s). */
export const HEADER_IMAGE_GENERATE_TIMEOUT_MS = 45_000;
/** A retry after a failed check is attempted only with at least this much budget left. */
export const HEADER_IMAGE_RETRY_MIN_REMAINING_MS = 25_000;
/** The check's own ceiling (the measured read is about 2.5 s). */
const CHECK_TIMEOUT_MS = 15_000;
/** The scene planner's own ceiling (the measured call is about 2 s). */
const PLAN_TIMEOUT_MS = 15_000;
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
  /** AUTO-203: plan the scene for this product; null when the planner itself was unavailable (the prompt then falls back to AUTO-202's). */
  plan: (args: { title: string; topic: string; productNames: readonly string[] }) => Promise<PlannedScene | null>;
  generate: (args: { prompt: string; references: GeminiImageInput[]; timeoutMs: number }) => Promise<GeneratedPicture>;
  /** Read a generated picture back; null when the check itself was unavailable (the picture is then accepted with a note). `allowedProductText` is what the prompt let the product carry, or null. */
  check: (image: GeminiImageInput, allowedProductText: string | null) => Promise<ImageCheck | null>;
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
}

/** The real effects, over the server write client. */
export function defaultHeaderImageDeps(client: SanityClient): HeaderImageDeps {
  return {
    keyConfigured: () => Boolean(process.env.GOOGLE_GEMINI_API_KEY),
    reserve: (now) => reserveBlogImageCall(client, now),
    fetchReference: fetchReferencePhoto,
    generate: async ({ prompt, references, timeoutMs }) => {
      const out = await generateImage({
        prompt,
        references,
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
    plan: async (args) => {
      const { system, user } = buildScenePlanPrompt(args);
      try {
        const result = await generateJsonFromText<unknown>({ system, user, maxOutputTokens: 512, temperature: 0.3, timeoutMs: PLAN_TIMEOUT_MS });
        const scene = parseScenePlan(result.data);
        return scene
          ? { scene, usage: { model: result.model, promptTokens: result.usage.promptTokens, outputTokens: result.usage.outputTokens + result.usage.thoughtTokens, elapsedMs: result.elapsedMs } }
          : null;
      } catch (err) {
        if (err instanceof GeminiError) return null;
        throw err;
      }
    },
    check: async (image, allowedProductText) => {
      const { system, user } = buildImageCheckPrompt(allowedProductText);
      try {
        const result = await generateJsonFromImage<unknown>({ system, user, image, maxOutputTokens: 384, temperature: 0 });
        return parseImageCheck(result.data);
      } catch (err) {
        if (err instanceof GeminiError) return null;
        throw err;
      }
    },
    upload: async (bytes, filename, contentType) => {
      const asset = await client.assets.upload('image', bytes, { filename, contentType });
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

  for (const step of steps) {
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
  /** Set when the first attempt came back with no picture and a second was made. */
  let noImageOnce: string | null = null;

  while (attempts < 2) {
    if (attempts > 0 && remaining() < HEADER_IMAGE_RETRY_MIN_REMAINING_MS) {
      notes.push(`the first picture showed ${previousProblem}, and there was no time left in the image budget for a second attempt`);
      return null;
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
      notes.push(previousProblem ? `the first picture showed ${previousProblem}, and ${reservation.message}` : reservation.message);
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

    // The scene, once (AUTO-203): where this product lives. A failed or
    // unavailable planner is a note, and the prompt is AUTO-202's.
    if (planned === undefined) {
      try {
        planned = await withDeadline(deps.plan({ title: input.title, topic: input.topic, productNames: names }), Math.min(PLAN_TIMEOUT_MS, remaining()), 'the scene planner');
      } catch (err) {
        planned = null;
        log(`[header-image] planner failed: ${errorText(err)}`);
      }
      if (!planned) notes.push('the scene planner was unavailable, so the picture was composed without a planned setting and with no text allowed');
      else log(`[header-image] plan surface="${planned.scene.surface}" setting="${planned.scene.setting}" productText="${planned.scene.productText}" avoid="${planned.scene.avoid}" tokens=${planned.usage.promptTokens}+${planned.usage.outputTokens} ms=${planned.usage.elapsedMs}`);
    }
    const scene = planned?.scene ?? null;
    const allowedProductText = scene?.productText ? scene.productText : null;

    const timeoutMs = Math.max(5_000, Math.min(HEADER_IMAGE_GENERATE_TIMEOUT_MS, remaining() - 5_000));
    let picture: GeneratedPicture;
    try {
      picture = await withDeadline(
        deps.generate({
          prompt: buildHeaderImagePrompt({ title: input.title, topic: input.topic, productNames: names, scene, previousProblem }),
          references,
          timeoutMs,
        }),
        timeoutMs + 1_000,
        'the image model',
      );
    } catch (err) {
      const why = errorText(err);
      log(`[header-image] generate failed (attempt ${attempts}): ${why}`);
      // The model answered without a picture (AUTO-203): one more try, as for a refused picture.
      if (attempts < 2 && !previousProblem && /returned no image/i.test(why) && remaining() >= HEADER_IMAGE_RETRY_MIN_REMAINING_MS) {
        noImageOnce = why;
        continue;
      }
      notes.push(`${previousProblem ? `the first picture showed ${previousProblem}, and then ` : noImageOnce ? 'the image model returned no image twice: ' : ''}the image model failed: ${why}`);
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
      `[header-image] ${GEMINI_IMAGE_MODEL} attempt=${attempts} references=${references.length} imageTokens=${picture.usage.imageTokens} promptTokens=${picture.usage.promptTokens} ms=${picture.usage.elapsedMs} cap=${reservation.used}/${reservation.cap}`,
    );

    let check: ImageCheck | null = null;
    try {
      check = await withDeadline(deps.check({ mimeType: picture.mimeType, base64: picture.base64 }, allowedProductText), Math.min(CHECK_TIMEOUT_MS, remaining()), 'the text-and-logo check');
    } catch (err) {
      check = null;
      log(`[header-image] check unavailable: ${errorText(err)}`);
    }
    const problem = check ? imageCheckProblem(check, allowedProductText !== null) : null;
    if (check === null) notes.push('the text-and-logo check was unavailable, so the picture was accepted unchecked; look at it before publishing');
    if (problem) {
      log(`[header-image] check refused attempt ${attempts}: ${problem}`);
      if (attempts >= 2) {
        notes.push(`both generated pictures were refused (the first showed ${previousProblem}, the second ${problem}), so neither was used`);
        return null;
      }
      previousProblem = problem;
      continue;
    }

    try {
      const assetId = await withDeadline(deps.upload(picture.bytes, headerImageFilename(input.slug, attempts), picture.mimeType), remaining(), 'saving the picture');
      if (attempts > 1 && previousProblem) notes.push(`the first picture showed ${previousProblem} and was replaced`);
      if (attempts > 1 && noImageOnce) notes.push('the image model returned no picture on its first try and was asked again');
      return { kind: 'asset', source: 'ai', image: imageValueFor(assetId, headerImageAlt(input.topic)), notes, usage };
    } catch (err) {
      notes.push(`the generated picture could not be saved: ${errorText(err)}`);
      log(`[header-image] upload failed: ${errorText(err)}`);
      return null;
    }
  }
  return null;
}
