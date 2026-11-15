/**
 * The header image chain: `ai` -> `library` -> `product` -> none, starting
 * wherever the chosen source says, and NEVER THROWING (AUTO-202). Server side
 * (it fetches product photos, calls the image services, uploads assets,
 * reserves the daily caps in Sanity), but every effect is behind
 * `HeaderImageDeps`, so the tests drive the real chain with fakes and the two
 * callers (the draft creator and the generate-blog-image route) pass
 * `defaultHeaderImageDeps`.
 *
 * AUTO-220 REPLACED THE AI STEP. The picture is drawn by OpenAI's image model
 * (lib/ai/openai-image.ts) from Patrick's own two lines and the post's own
 * product photos, title included; the Gemini image model that drew every
 * picture from AUTO-202 to AUTO-212 is now the BACKUP, and everything that
 * existed to put the title on a picture in code is gone (the compose step and
 * its layout call, the fonts, the looks, the untitled copy, the redraw
 * button, the room-for-the-title rule and the painted-band check). What code
 * still puts on a picture is the P! mark (stamp-mark.tsx).
 *
 * THE AI STEP, in order, each failure a note and a fall to the next source:
 *   1. the clients and the keys: no write client, no reader key
 *      (GOOGLE_GEMINI_API_KEY: every picture is READ BACK by the vision model,
 *      so without it no picture is drawn and no cap slot is spent) or, for
 *      the main model, no OPENAI_API_KEY (the backup model then draws);
 *   2. the cap, RESERVED BEFORE anything else is spent on this attempt,
 *      the photo reads included (openai-image-usage.ts): refused, the
 *      refusal is the note;
 *   3. the product photos, once: the post's own strip products, those whose
 *      name carries a topic word first (header-image.ts pickPhotoCandidates),
 *      up to HEADER_IMAGE_PHOTO_CANDIDATES fetched in parallel from Geiger's
 *      image server, each READ by the vision model (brand-screen.ts layer 1):
 *      a photo whose sample imprint is a well known brand, or whose logo the
 *      reader recognises, is not sent, nor is a product that only shares a
 *      word with the post's subject (the shaker bottles post: a spice shaker
 *      and a cocktail shaker), and a product whose name does not carry a
 *      topic word is sent only when the reader says it IS the subject. The
 *      first HEADER_IMAGE_PHOTOS that pass are sent. When NONE is the
 *      subject (the fidget spinners post, whose strips hold cubes, pens and
 *      worms and no spinner) the post's NEAREST real products are sent
 *      instead, name matches first, and the note names them (Ali,
 *      2026-11-15: cubes under a spinners title are a bit off, but products
 *      the model invents, carrying company names it invents, are the thing
 *      this module exists to stop). Only a post with no usable photo at all
 *      (none in its rows, none fetched, or every one left out for a brand)
 *      is drawn from the title alone, and the note says its products are
 *      the model's own;
 *   4. the picture: one `POST /v1/images/edits` with the prompt of the
 *      post's current rung of the ladder (header-brief.ts) and the photos;
 *   5. THE GATES, read off the finished picture by the vision model, in
 *      parallel: TITLE_GATE_READS transcriptions of the title (accept on ONE
 *      exact read) and PICTURE_INVENTORY_READS inventories of every readable
 *      text and recognised logo: a text is checked against the brand list, a
 *      logo the reader names is a hit listed or not (brand-screen.ts layer
 *      3). When NO inventory answers, the inventories are asked ONCE more;
 *      when that gets no answer either the picture is KEPT, the note says
 *      the brand check was not made, and `usage.brandCheckMade` is false,
 *      which is what makes the scheduler hold the post as a draft instead of
 *      publishing it (header-image.ts holdBeforePublishReason; Ali,
 *      2026-11-15: nothing is blocked, and an unknown never publishes
 *      itself);
 *   6. a failed gate is ONE redraw with the problem named, never two: the
 *      worst measured chain with one redraw is 82 s of the 100 s budget, and
 *      a second would reach 121 s;
 *   7. the mark: the P! is stamped in a corner by code (stamp-mark.tsx);
 *   8. the upload: the stamped picture (a PNG) is the header, and the picture
 *      as the model drew it is kept beside it (`unmarkedImage`) so "Change
 *      this picture" hands the model a picture with no mark on it. Both carry
 *      the BLOG_HEADER_ASSET_SOURCE marker.
 *
 * THE BACKUP MODEL (Ali, 2026-11-15; it replaced a titleless picture). When
 * OpenAI fails on the first attempt (an HTTP error, a timeout, no picture) or
 * has no key, the Gemini image model draws INSIDE THE SAME LOOP: it is sent
 * Patrick's two lines and nothing else, whatever rung the ladder is on (the
 * one prompt measured on it: 4 of 4 titles exact, and the sample imprints
 * copied better than OpenAI managed, CHECK-openai-image-api section 11), with
 * the same screened photos, and its picture passes the same title gate and
 * the same brand read-back, gets the same mark, and is stored the same way,
 * title recorded. What it does not get is a third try: after an OpenAI
 * failure it is the second attempt, so a picture of its own that fails a gate
 * is not redrawn (with no OpenAI key it is the first attempt and may be
 * redrawn once, like any picture). It draws at 1376 x 768 on its own cap of
 * 20 a day. A cap refusal and a refused picture do NOT go to the backup
 * model: they fall to the library and the product photo, as a refused picture
 * always has. The planner, the blank-product prompt, the AUTO-204 check and
 * the AUTO-205 close look that made the old titleless backup picture are no
 * longer called from this chain (their pure halves are still in
 * header-image.ts with their tests, to be deleted once the soak has shown
 * the titled backup holds).
 *
 * PATRICK'S OWN INSTRUCTION (AUTO-220). `mode: 'instruction'` draws a new
 * picture with his words in place of the ladder's block; `mode: 'edit'` sends
 * the current picture (its unmarked copy) back with his words. Both run the
 * same gates, the same stamp and the same cap; neither uses the backup
 * model (its two lines are the only prompt measured on it) or the later
 * sources.
 *
 * NO PICTURE IS JUDGED FOR BELIEVABILITY, AND NONE IS CHOSEN FROM SEVERAL
 * (AUTO-206's closed roads stand). The last check is a human eye.
 *
 * THE BUDGET IS A DEADLINE, NOT A HOPE. HEADER_IMAGE_BUDGET_MS = 100 s for
 * the whole chain, and every effect runs under `withDeadline(remaining())`.
 * Measured (CHECK-image-brief-26, 35 pictures): photos 1.4 s, picture 34.1 s
 * worst (27.3 median), reads 4.8 s, upload about 3 s; the photo screen and
 * the stamp are AUTO-220's own measurements (CLAUDE.md). One redraw at the
 * worst of every step holds; two do not. The routes that carry this chain
 * are unchanged (generate-blog-image 120 s, blog-topics 270 s, the cron
 * writer 300 s).
 */
import type { SanityClient } from '@sanity/client';
import { GEMINI_IMAGE_MODEL, GeminiError, generateImage, generateJsonFromImages, imageCallUsd, type GeminiImageInput } from '../ai/gemini';
import { generateOpenAiImage, openAiImageConfigured } from '../ai/openai-image';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';
import {
  deviceMountedRoot,
  firstProductImage,
  geigerReferenceUrl,
  headerImageAlt,
  headerImageFilename,
  type SanityImageValue,
  HEADER_IMAGE_ASPECT_RATIO,
  HEADER_IMAGE_PHOTOS,
  HEADER_IMAGE_SIZE,
  imageValueFor,
  pickLibraryImage,
  pickPhotoCandidates,
  type HeaderImageLibraryEntry,
  type HeaderImageOutcome,
  type HeaderImageSource,
  type HeaderImageUsage,
  type ReferenceProduct,
} from './header-image';
import { reserveBlogImageCall, type BlogImageReservation } from './header-image-usage';
import { reserveOpenAiImageCall } from './openai-image-usage';
import {
  MAX_HEADER_EDITS_IN_A_ROW,
  TITLE_GATE_READS,
  TITLE_READ_PROMPT,
  TITLE_READ_SCHEMA,
  buildEditBrief,
  buildHeaderBrief,
  buildInstructionBrief,
  cleanInstruction,
  drawnHeaderAlt,
  editCountOf,
  nextRung,
  parseTitleRead,
  rungOf,
  titleGate,
  type BriefRetry,
  type HeaderRung,
} from './header-brief';
import {
  PHOTO_SCREEN_SCHEMA,
  PICTURE_INVENTORY_READS,
  PICTURE_INVENTORY_SCHEMA,
  buildPhotoScreenPrompt,
  buildPictureInventoryPrompt,
  parsePhotoScreen,
  parsePictureInventory,
  photoScreenVerdict,
  pictureBrandProblem,
  type PhotoScreen,
  type PictureInventory,
} from './brand-screen';
import type { StampedPicture } from './stamp-mark';

/**
 * The whole chain's deadline. 100 s since AUTO-209; AUTO-220 keeps the number
 * and re-does the sum for the new chain, worst observed of every step:
 *   photos 1.4 + photo screen 4 + picture 34.1 + reads 4.8  = 44.3 s
 *   one redraw: + 34.1 + 4.8                                 = 83.2 s
 *   stamp 4 (the WebAssembly loading; 0.7 warm) + upload 3   = 90.2 s
 * A second redraw would be 129 s, which is why there is never one. The
 * backup model after an OpenAI failure at its 45 s timeout is 1.4 + 4 + 46 +
 * its picture 26 (worst of AUTO-207's 28) + reads 4.8 + 4 + 3 = 89.2 s, and
 * every step in it is cut off by the deadline if it does not fit. Do not
 * widen this without re-doing both sums and the three routes'.
 */
export const HEADER_IMAGE_BUDGET_MS = 100_000;
/** One picture's own timeout on the OpenAI model (worst observed 34.1 s over 35 pictures). */
export const HEADER_IMAGE_GENERATE_TIMEOUT_MS = 45_000;
/** The backup model's own timeout (worst observed 26 s over 28 pictures, AUTO-207; one of the four two-line pictures took 52 s and would be cut off here). */
export const HEADER_IMAGE_FALLBACK_GENERATE_TIMEOUT_MS = 40_000;
/** A redraw is made only with this much budget left: a worst picture, its reads, the stamp and the upload (34.1 + 4.8 + 4 + 3), and a little room. */
export const HEADER_IMAGE_RETRY_MIN_REMAINING_MS = 48_000;
/** The backup model takes over only with this much budget left: its worst picture, the reads, the stamp and the upload (26 + 4.8 + 4 + 3), and room. */
export const HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS = 45_000;
/** Kept back from a picture's timeout for the reads, the stamp and the upload that follow it. */
const AFTER_GENERATION_RESERVE_MS = 12_000;
/** The stamp's own ceiling (0.7 s warm, about 4 s the first time a function instance loads the WebAssembly). */
export const STAMP_TIMEOUT_MS = 8_000;
/** Kept back for the upload when deciding whether there is time to stamp the mark. */
const UPLOAD_RESERVE_MS = 5_000;
/** A read's own ceiling (a read is about 1.5 to 5 s; they run in parallel). */
const READ_TIMEOUT_MS = 15_000;
/** Room for a whole inventory: forty entries are about 900 tokens; a cut-off answer cannot be parsed and counts as not made. */
const INVENTORY_MAX_OUTPUT_TOKENS = 2048;
/** The photo screen's own ceiling; the photos are read in parallel. */
const PHOTO_SCREEN_TIMEOUT_MS = 10_000;
/** Each reference photo fetch; they run in parallel. */
const REFERENCE_FETCH_TIMEOUT_MS = 8_000;
const REFERENCE_MAX_BYTES = 3 * 1024 * 1024;

/** A picture or a photo as the models take it. */
export type PictureInput = GeminiImageInput;

export interface GeneratedPicture {
  bytes: Buffer;
  mimeType: string;
  base64: string;
  usage: { imageTokens: number; promptTokens: number; elapsedMs: number; model: string; usd?: number | null };
}

/** Every effect of the chain, injectable. */
export interface HeaderImageDeps {
  /** Whether the READER is configured (GOOGLE_GEMINI_API_KEY): every picture is read back, so without it nothing is drawn. It is also the backup model's key. */
  keyConfigured: () => boolean;
  /** Whether the main image model is configured (OPENAI_API_KEY); false sends the ladder straight to the backup model. */
  openAiConfigured: () => boolean;
  /** Reserve one picture on the main model for today (its own cap). */
  reserveOpenAi: (now: Date) => Promise<BlogImageReservation>;
  /** Reserve one picture on the backup model for today (the AUTO-202 cap). */
  reserve: (now: Date) => Promise<BlogImageReservation>;
  /** The bytes of one product photo, or null when it could not be fetched. */
  fetchReference: (url: string) => Promise<PictureInput | null>;
  /** Layer 1 of the brand screen, and the subject check: one read of one catalogue photo; null when the reader was unavailable. */
  screenPhoto: (photo: PictureInput, args: { productName: string; title: string; topic: string }) => Promise<PhotoScreen | null>;
  /** The main model: one picture from the prompt and the images (the product photos, or the one picture to change). */
  draw: (args: { prompt: string; images: PictureInput[]; timeoutMs: number }) => Promise<GeneratedPicture>;
  /** ONE transcription of the title on a picture: the text, '' when the reader answered with nothing usable, null when it was unavailable. */
  readTitle: (image: PictureInput) => Promise<string | null>;
  /** ONE inventory of every readable text and recognised logo on a picture; null when unavailable or unreadable. */
  readInventory: (image: PictureInput) => Promise<PictureInventory | null>;
  /** The backup model: one picture from the same prompt and the same photos the main model would have had. */
  generate: (args: { prompt: string; references: PictureInput[]; timeoutMs: number; model: string }) => Promise<GeneratedPicture>;
  /**
   * Stamp the P! mark on a picture (stamp-mark.tsx). Throws when it cannot.
   * Optional so a test's fakes need not provide it; the real deps always do,
   * and without it the picture is stored as the model drew it.
   */
  stamp?: (picture: PictureInput) => Promise<StampedPicture>;
  /** Store the bytes as a Sanity image asset; returns the asset document id. */
  upload: (bytes: Buffer, filename: string, contentType: string) => Promise<string>;
  now: () => number;
}

export type HeaderImageMode = 'ladder' | 'instruction' | 'edit';

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
  /** Where a failure that must not pass unseen is said LOUDLY (default console.error, which Vercel keeps as an error line). */
  logError?: (line: string) => void;
  /**
   * AUTO-220: the rung of the ladder the post's current picture was drawn on
   * (`headerImage.ladderRung`, as stored). The picture is drawn on the rung
   * AFTER it; absent or unreadable means a first picture, rung 1.
   */
  previousRung?: unknown;
  /**
   * AUTO-220: `ladder` (the default) draws the next rung; `instruction`
   * draws a new picture with Patrick's words in place of the rung's block;
   * `edit` sends `editBase` back with his words. The last two run the AI step
   * only: no backup model and no later source.
   */
  mode?: HeaderImageMode;
  /** Patrick's words, for `instruction` and `edit`. */
  instruction?: string;
  /** `edit`: the picture to change (the unmarked copy of the post's generated header). */
  editBase?: PictureInput | null;
  /** `edit`: how many changes in a row the current picture already carries (`headerImage.editCount`). */
  editCount?: unknown;
}

/**
 * True when a vision call ANSWERED but gave nothing usable (AUTO-204): the
 * reply was not JSON, was cut off, was empty, or the model declined to look.
 * A call that never answered (a network failure, an HTTP error, a timeout, a
 * missing key) is "unavailable" instead. The four wordings are
 * lib/ai/gemini.ts's own; a test pins them.
 */
export function checkAnsweredWithoutVerdict(message: string): boolean {
  return /not JSON|malformed JSON|Empty response|declined this/i.test(message);
}

/** The real effects, over the server write client. */
export function defaultHeaderImageDeps(client: SanityClient): HeaderImageDeps {
  return {
    keyConfigured: () => Boolean(process.env.GOOGLE_GEMINI_API_KEY),
    openAiConfigured: () => openAiImageConfigured(),
    reserveOpenAi: (now) => reserveOpenAiImageCall(client, now),
    reserve: (now) => reserveBlogImageCall(client, now),
    fetchReference: fetchReferencePhoto,
    screenPhoto: async (photo, args) => {
      const { system, user } = buildPhotoScreenPrompt(args);
      try {
        const result = await generateJsonFromImages<unknown>({ system, user, images: [photo], maxOutputTokens: 512, temperature: 0, timeoutMs: PHOTO_SCREEN_TIMEOUT_MS, responseSchema: PHOTO_SCREEN_SCHEMA });
        return parsePhotoScreen(result.data);
      } catch (err) {
        // A photo that could not be read is sent (layer 1 fails open; the finished picture is read in any case).
        if (err instanceof GeminiError) return null;
        throw err;
      }
    },
    draw: async ({ prompt, images, timeoutMs }) => {
      const out = await generateOpenAiImage({ prompt, images, timeoutMs });
      return {
        bytes: out.bytes,
        mimeType: out.mimeType,
        base64: out.base64,
        usage: {
          imageTokens: out.usage.imageOutputTokens,
          promptTokens: out.usage.textInputTokens + out.usage.imageInputTokens,
          elapsedMs: out.elapsedMs,
          model: out.model,
          usd: out.usd,
        },
      };
    },
    readTitle: async (image) => {
      try {
        const result = await generateJsonFromImages<unknown>({
          system: TITLE_READ_PROMPT.system,
          user: TITLE_READ_PROMPT.user,
          images: [image],
          maxOutputTokens: 256,
          temperature: 0,
          timeoutMs: READ_TIMEOUT_MS,
          responseSchema: TITLE_READ_SCHEMA,
        });
        return parseTitleRead(result.data) ?? '';
      } catch (err) {
        // An answer with nothing usable is a read that did not match; a call that never answered is unavailable.
        if (err instanceof GeminiError) return checkAnsweredWithoutVerdict(err.message) ? '' : null;
        throw err;
      }
    },
    readInventory: async (image) => {
      const { system, user } = buildPictureInventoryPrompt();
      try {
        const result = await generateJsonFromImages<unknown>({
          system,
          user,
          images: [image],
          maxOutputTokens: INVENTORY_MAX_OUTPUT_TOKENS,
          temperature: 0,
          timeoutMs: READ_TIMEOUT_MS,
          responseSchema: PICTURE_INVENTORY_SCHEMA,
        });
        return parsePictureInventory(result.data);
      } catch (err) {
        if (err instanceof GeminiError) return null;
        throw err;
      }
    },
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
        usage: {
          imageTokens: out.usage.imageTokens,
          promptTokens: out.usage.promptTokens,
          elapsedMs: out.elapsedMs,
          model: out.model,
          usd: imageCallUsd(out.model, out.usage),
        },
      };
    },
    // Loaded lazily: next/og (satori and resvg's WebAssembly) enters the process only when a mark is actually stamped.
    stamp: async (picture) => (await import('./stamp-mark')).stampMark(picture),
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
  const refuse = async (): Promise<BlogImageReservation> => ({ ok: false, reason: 'unavailable', used: 0, cap: 0, day: '', message: 'the server has no Sanity write access' });
  const fail = async (): Promise<never> => {
    throw new Error('the server has no Sanity write access');
  };
  return {
    keyConfigured: () => false,
    openAiConfigured: () => false,
    reserveOpenAi: refuse,
    reserve: refuse,
    fetchReference: async () => null,
    screenPhoto: async () => null,
    draw: fail,
    readTitle: async () => null,
    readInventory: async () => null,
    generate: fail,
    upload: fail,
    now: () => Date.now(),
  };
}

/** One Geiger product photo as inline data for the model; null on any failure. Only the Geiger host is ever fetched. */
export async function fetchReferencePhoto(url: string): Promise<PictureInput | null> {
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
 * sentence only ("Image request failed (404)."), never a raw error body. The
 * full message still goes to the log.
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
  const mode: HeaderImageMode = input.mode === 'instruction' || input.mode === 'edit' ? input.mode : 'ladder';
  const order: HeaderImageSource[] = ['ai', 'library', 'product'];
  const from = order.indexOf(input.source);
  // Patrick's own instruction is an AI picture or nothing: no stand-in is ever put in its place.
  const steps = mode === 'ladder' ? order.slice(from === -1 ? 0 : from) : (['ai'] as HeaderImageSource[]);

  // AUTO-207: a product that only makes sense on a phone or a laptop is not
  // drawn by the ladder (the library, then the product photo, take over).
  // With his own instruction Patrick has said what he wants, so it is drawn.
  const mounted = mode === 'ladder' ? deviceMountedRoot(input.rootSlugs) : null;

  for (const step of steps) {
    if (step === 'ai' && mounted) {
      notes.push(
        `products in the "${mounted}" category only make sense on a phone or a laptop, so the AI does not draw one on its own; a picture for this category in the header image library (Global Settings) is used instead when there is one`,
      );
      log(`[header-image] device-mounted root ${mounted}: AI skipped`);
      continue;
    }
    if (step === 'ai') {
      let made: HeaderImageOutcome | null = null;
      try {
        made = await aiStep(input, mode, deps, notes, remaining, log);
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
  mode: HeaderImageMode,
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
    notes.push('the picture checker is not set up (GOOGLE_GEMINI_API_KEY is missing on the server), and no picture is used unread, so none was generated');
    return null;
  }

  const instruction = cleanInstruction(input.instruction);
  if (mode !== 'ladder' && !instruction) {
    notes.push('no instruction was given, so no picture was made');
    return null;
  }
  const priorEdits = editCountOf(input.editCount);
  if (mode === 'edit') {
    if (!input.editBase) {
      notes.push('there is no generated picture on this post to change');
      return null;
    }
    if (priorEdits >= MAX_HEADER_EDITS_IN_A_ROW) {
      notes.push(
        `this picture has already been changed ${priorEdits} times in a row, and every change redraws the whole picture from the last one, so it gets a little rougher each time; make a new picture instead`,
      );
      return null;
    }
  }
  // The rung this picture is drawn on (the ladder), or the rung the post stays on (his own instruction does not move the ladder).
  const rung: HeaderRung = mode === 'ladder' ? nextRung(input.previousRung) : (rungOf(input.previousRung) ?? 1);
  const keptRung = mode === 'ladder' ? rung : rungOf(input.previousRung);

  // WHICH MODEL DRAWS. The main one, unless it has no key; and the backup one
  // takes over INSIDE THIS LOOP, under the same prompt, photos and gates, when
  // the main one fails on the first attempt of the ladder (Ali, 2026-11-15).
  let engine: 'main' | 'backup' = 'main';
  let mainFailed = false;
  if (!deps.openAiConfigured()) {
    notes.push('the main image service is not set up (OPENAI_API_KEY is missing on the server)');
    // Patrick's own instruction is drawn by the main model or not at all.
    if (mode !== 'ladder') return null;
    engine = 'backup';
  }

  // The product photos are gathered ONCE, after the first cap slot is held (nothing is spent before the cap).
  let photos: ScreenedPhoto[] | null = null;
  let images: PictureInput[] = mode === 'edit' ? [input.editBase as PictureInput] : [];
  let photoCounts: HeaderImageUsage['photos'] = null;
  const brandContext = { title: input.title, products: input.products.map((p) => ({ name: p.name, brand: p.brand ?? null })) };
  let retry: BriefRetry | null = null;
  let previousProblem: string | null = null;
  let attempts = 0;
  let usdTotal = 0;
  let imageTokens = 0;
  let promptTokens = 0;
  let elapsedMs = 0;

  while (attempts < 2) {
    // A redraw of a refused picture needs time for a whole picture. (The backup model taking over is checked where it takes over.)
    if (attempts > 0 && previousProblem && remaining() < HEADER_IMAGE_RETRY_MIN_REMAINING_MS) {
      notes.push(`the first picture ${previousProblem}, and there was no time left in the image budget to draw it again`);
      return null;
    }

    // The cap of the model that draws, before anything is sent on this attempt.
    let reservation: BlogImageReservation;
    try {
      reservation = engine === 'main' ? await deps.reserveOpenAi(new Date(deps.now())) : await deps.reserve(new Date(deps.now()));
    } catch (err) {
      notes.push(`the daily-limit counter could not be reached (${errorText(err)}), so no image was generated`);
      return null;
    }
    if (reservation.ok === false) {
      notes.push(`${previousProblem ? `the first picture ${previousProblem}, and ` : ''}${reservation.message}`);
      return null;
    }
    attempts += 1;

    // The photos (not for a change to the current picture: the picture itself is the input).
    if (photos === null && mode !== 'edit') {
      photos = await gatherPhotos(input, deps, remaining, log);
      const picked = selectPhotos(photos);
      images = picked.sent.map((p) => p.image);
      photoCounts = picked.counts;
      if (picked.brands.length > 0) {
        notes.push(
          `${picked.counts.brand === 1 ? 'one product photo was' : `${picked.counts.brand} product photos were`} left out of the picture because ${picked.counts.brand === 1 ? 'its' : 'their'} sample logo is a well known brand (${picked.brands.join(', ')})`,
        );
      }
      if (picked.sent.length === 0) {
        notes.push(
          `${photos.length === 0 ? 'the post has no product photo to send' : 'that left no product photo to send'}, so the picture was drawn from the title alone: the products on it are the image model's own, not items from the catalogue, so look at it before publishing`,
        );
      } else if (picked.nearest) {
        notes.push(
          `none of the post's product photos showed the post's subject itself, so its nearest products were used instead (${picked.sent.map((p) => p.product.name.replace(/\s+/g, ' ').trim()).join(', ')}): look at the picture before publishing`,
        );
      }
      log(
        `[header-image] photos fetched=${picked.counts.fetched} brand=${picked.counts.brand} offSubject=${picked.counts.offSubject} sent=${picked.counts.sent}${picked.nearest ? ' (nearest)' : ''}${picked.sent.length ? ` (${picked.sent.map((p) => p.product.sku).join(', ')})` : ''}`,
      );
    }

    const prompt =
      mode === 'edit'
        ? buildEditBrief({ title: input.title, instruction, retry })
        : mode === 'instruction'
          ? buildInstructionBrief({ title: input.title, instruction, photos: images.length, retry })
          : // The backup model is sent Patrick's two lines whatever the rung: the one prompt measured on it.
            buildHeaderBrief({ title: input.title, rung: engine === 'backup' ? 1 : rung, photos: images.length, retry });
    const timeoutMs = Math.max(5_000, Math.min(engine === 'main' ? HEADER_IMAGE_GENERATE_TIMEOUT_MS : HEADER_IMAGE_FALLBACK_GENERATE_TIMEOUT_MS, remaining() - AFTER_GENERATION_RESERVE_MS));
    let picture: GeneratedPicture;
    try {
      picture = await (engine === 'main'
        ? withDeadline(deps.draw({ prompt, images, timeoutMs }), timeoutMs + 1_000, 'the image model')
        : withDeadline(deps.generate({ prompt, references: images, timeoutMs, model: GEMINI_IMAGE_MODEL }), timeoutMs + 1_000, 'the backup image model'));
    } catch (err) {
      const why = errorText(err);
      log(`[header-image] ${engine} draw failed (attempt ${attempts}): ${why}`);
      if (engine === 'backup') {
        notes.push(`${previousProblem ? `the first picture ${previousProblem}, and then ` : ''}the backup image model failed${mainFailed ? ' too' : ''}: ${shortFailure(why)}`);
        return null;
      }
      // The main model FAILED (an HTTP error, a timeout, no picture). On the
      // first attempt of the ladder the backup model takes over, in this same
      // loop; it is not asked to follow an instruction or change a picture,
      // and it is never a third attempt.
      if (attempts === 1 && mode === 'ladder') {
        notes.push(`the main image model failed (${shortFailure(why)})`);
        if (remaining() < HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS) {
          notes.push('there was no time left in the image budget for the backup image model');
          return null;
        }
        mainFailed = true;
        engine = 'backup';
        continue;
      }
      notes.push(`${previousProblem ? `the first picture ${previousProblem}, and then ` : ''}the image model failed: ${shortFailure(why)}`);
      return null;
    }
    usdTotal += picture.usage.usd ?? 0;
    imageTokens += picture.usage.imageTokens;
    promptTokens += picture.usage.promptTokens;
    elapsedMs += picture.usage.elapsedMs;
    log(
      `[header-image] ${picture.usage.model} ${engine === 'backup' ? 'backup' : mode}${mode === 'ladder' ? ` rung=${rung}` : ''} attempt=${attempts} images=${images.length} imageTokens=${picture.usage.imageTokens} promptTokens=${picture.usage.promptTokens} ms=${picture.usage.elapsedMs} cap=${reservation.used}/${reservation.cap}`,
    );

    // THE GATES, the same whichever model drew: the title and the brand read-back, all reads in parallel.
    const pictureInput: PictureInput = { mimeType: picture.mimeType, base64: picture.base64 };
    const readInventories = (): Promise<(PictureInventory | null)[]> =>
      Promise.all(
        Array.from({ length: PICTURE_INVENTORY_READS }, async (): Promise<PictureInventory | null> => {
          try {
            return await withDeadline(deps.readInventory(pictureInput), Math.min(READ_TIMEOUT_MS, remaining()), 'the picture read');
          } catch (err) {
            log(`[header-image] picture read unavailable: ${errorText(err)}`);
            return null;
          }
        }),
      );
    // Started first and awaited second, so the title reads and the inventories run side by side.
    const titleReading = Promise.all(
      Array.from({ length: TITLE_GATE_READS }, async (): Promise<string | null> => {
        try {
          return await withDeadline(deps.readTitle(pictureInput), Math.min(READ_TIMEOUT_MS, remaining()), 'the title read');
        } catch (err) {
          log(`[header-image] title read unavailable: ${errorText(err)}`);
          return null;
        }
      }),
    );
    let inventories = await readInventories();
    const titleReads = await titleReading;
    const gate = titleGate(titleReads, input.title);
    if (gate.answered === 0) {
      // The reader is down: the title cannot be vouched for, and a second picture could not be read either.
      notes.push('the picture was drawn but could not be read back (the reading model did not answer), and no picture is used unread, so it was not used');
      logError(`[header-image] NO TITLE READ CAME BACK for "${input.title}": the picture was not used`);
      return null;
    }
    // A brand check that got NO answer is asked ONCE more (Ali, 2026-11-15),
    // never in a loop, and not for a picture the title gate has already refused.
    if (gate.passed && inventories.every((r) => r === null)) {
      log('[header-image] no picture read came back: asking once more');
      inventories = await readInventories();
    }
    const brandCheckMade = inventories.some((r) => r !== null);
    const brand = pictureBrandProblem(inventories, brandContext);
    let problem: string | null = null;
    if (!gate.passed) problem = `did not carry the title exactly${gate.misread ? ` (it read "${gate.misread}")` : ''}`;
    else if (brand) problem = `showed the name of a well known brand (${brand})`;
    log(`[header-image] gates attempt=${attempts} title=${gate.exact}/${gate.answered} exact brand=${brand ?? 'none'}${brandCheckMade ? '' : ' (brand check NOT made)'}`);
    if (problem) {
      if (attempts >= 2) {
        // Two pictures refused; or the main model failed and the backup model's one picture was refused.
        notes.push(
          previousProblem
            ? `both pictures were refused, so neither was used: the first ${previousProblem}; the second ${problem}`
            : `the backup model's picture ${problem}, so it was not used`,
        );
        return null;
      }
      previousProblem = problem;
      retry = { title: !gate.passed, brand: gate.passed ? brand : null };
      continue;
    }
    if (!brandCheckMade) {
      // The picture is KEPT; `usage.brandCheckMade` is what holds the post as a draft in publish mode.
      notes.push('the brand check of the picture could not be made (the reading model did not answer it, asked twice); look at the logos on it before publishing');
      logError(`[header-image] NO BRAND CHECK CAME BACK for "${input.title}", asked twice: the picture is kept and the post is not to publish itself`);
    }

    const usage: HeaderImageUsage = {
      model: picture.usage.model,
      imageTokens,
      promptTokens,
      elapsedMs,
      attempts,
      capUsed: reservation.used,
      cap: reservation.cap,
      usd: Math.round(usdTotal * 10000) / 10000,
      mode: engine === 'backup' ? 'fallback' : mode,
      ...(mode === 'ladder' ? { rung } : {}),
      titleReads: { answered: gate.answered, exact: gate.exact },
      photos: photoCounts,
      brandCheckMade,
    };
    const stored = await stampAndStore({
      input,
      deps,
      notes,
      remaining,
      log,
      logError,
      picture,
      attempt: attempts,
      usage,
      value: (assetRef, unmarkedRef) => {
        const image: SanityImageValue = { ...imageValueFor(assetRef, drawnHeaderAlt(input.title, input.topic)), titleOnImage: input.title.replace(/\s+/g, ' ').trim() };
        if (keptRung) image.ladderRung = keptRung;
        if (mode === 'edit') image.editCount = priorEdits + 1;
        image.unmarkedImage = { _type: 'image', asset: { _type: 'reference', _ref: unmarkedRef } };
        return image;
      },
    });
    if (!stored) return null;
    if (attempts > 1 && previousProblem) notes.push(`the first picture ${previousProblem} and was drawn again`);
    if (engine === 'backup') notes.push(`the backup image model drew this picture${mainFailed ? '; press Generate another header image to try the main model again' : ''}`);
    return stored;
  }
  return null;
}

interface StoreArgs {
  input: ResolveHeaderImageInput;
  deps: HeaderImageDeps;
  notes: string[];
  remaining: () => number;
  log: (line: string) => void;
  logError: (line: string) => void;
  picture: GeneratedPicture;
  attempt: number;
  usage: HeaderImageUsage;
  /** The value written onto the post, from the header asset and the unmarked copy's asset. */
  value: (assetRef: string, unmarkedRef: string) => SanityImageValue;
}

/**
 * The mark and the upload, the same for every picture whichever model drew
 * it. The mark never costs the picture: when it cannot be stamped (no time
 * left, a drawing fault) the picture is stored as the model drew it and the
 * note says so. Null when the picture could not be saved.
 */
async function stampAndStore(a: StoreArgs): Promise<HeaderImageOutcome | null> {
  const { input, deps, notes, remaining, log, logError, picture, attempt, usage } = a;
  const pictureInput: PictureInput = { mimeType: picture.mimeType, base64: picture.base64 };
  let stamped: StampedPicture | null = null;
  if (deps.stamp) {
    const room = remaining() - UPLOAD_RESERVE_MS;
    if (room < 1_000) {
      notes.push('there was no time left in the image budget to put the P! mark on the picture, so it is stored without it; press Generate another header image for a new one');
    } else {
      try {
        stamped = await withDeadline(deps.stamp(pictureInput), Math.min(STAMP_TIMEOUT_MS, room), 'stamping the P! mark');
      } catch (err) {
        logError(`[header-image] THE P! MARK COULD NOT BE STAMPED for "${input.topic}": ${errorText(err)}`);
        notes.push(`the P! mark could not be put on the picture (${shortFailure(errorText(err))}), so it is stored without it`);
      }
    }
  }
  try {
    let assetId: string;
    let unmarkedId: string;
    if (stamped) {
      [assetId, unmarkedId] = await Promise.all([
        withDeadline(deps.upload(stamped.bytes, headerImageFilename(input.slug, attempt, 'stamped'), stamped.mimeType), remaining(), 'saving the picture'),
        withDeadline(deps.upload(picture.bytes, headerImageFilename(input.slug, attempt, 'photo', picture.mimeType), picture.mimeType), remaining(), 'saving the copy without the mark'),
      ]);
      usage.mark = { corner: stamped.placement.corner, variant: stamped.placement.variant, ms: stamped.ms };
      log(`[header-image] mark ${stamped.placement.corner} ${stamped.placement.variant}${stamped.placement.halo ? ` outline=${stamped.placement.halo}` : ''} contrast=${stamped.placement.contrast} busyness=${stamped.placement.busyness} ms=${stamped.ms}`);
    } else {
      // No mark: the one stored picture is also the copy without the mark.
      assetId = await withDeadline(deps.upload(picture.bytes, headerImageFilename(input.slug, attempt, 'plain', picture.mimeType), picture.mimeType), remaining(), 'saving the picture');
      unmarkedId = assetId;
      usage.mark = null;
    }
    return { kind: 'asset', source: 'ai', image: a.value(assetId, unmarkedId), notes, usage };
  } catch (err) {
    notes.push(`the generated picture could not be saved: ${errorText(err)}`);
    log(`[header-image] upload failed: ${errorText(err)}`);
    return null;
  }
}

/** A fetched product photo with what the screen said about it. */
interface ScreenedPhoto {
  product: ReferenceProduct;
  image: PictureInput;
  /** A well known brand the photo carries that is not the product's own. */
  brand: string | null;
  /**
   * True when the photo is not sent as the post's subject: the reader said
   * it is another kind of product, or the product's name carries no topic
   * word and the reader did not say outright that it is the subject.
   */
  offSubject: boolean;
}

/**
 * The photos the image model is sent, with the counts for the record: no well
 * known brand, on the subject, the first HEADER_IMAGE_PHOTOS. WHEN NONE IS ON
 * THE SUBJECT the post's nearest real products are sent instead (Ali,
 * 2026-11-15): the photos with no well known brand, in the candidates' own
 * order, which is the products whose name shares a word with the subject
 * first and then strip order. `nearest` says that happened; a photo left out
 * for a brand is never brought back by it.
 */
function selectPhotos(photos: readonly ScreenedPhoto[]): {
  sent: ScreenedPhoto[];
  nearest: boolean;
  brands: string[];
  counts: NonNullable<HeaderImageUsage['photos']>;
} {
  const branded = photos.filter((p) => p.brand);
  const clean = photos.filter((p) => !p.brand);
  const onSubject = clean.filter((p) => !p.offSubject);
  const nearest = onSubject.length === 0 && clean.length > 0;
  const sent = (nearest ? clean : onSubject).slice(0, HEADER_IMAGE_PHOTOS);
  return {
    sent,
    nearest,
    brands: [...new Set(branded.map((p) => p.brand as string))],
    counts: { fetched: photos.length, brand: branded.length, offSubject: clean.filter((p) => p.offSubject).length, sent: sent.length, ...(nearest ? { nearest: sent.length } : {}) },
  };
}

/** Fetch the candidate photos and read each one (layer 1 of the brand screen and the subject check). Never throws. */
async function gatherPhotos(
  input: ResolveHeaderImageInput,
  deps: HeaderImageDeps,
  remaining: () => number,
  log: (line: string) => void,
): Promise<ScreenedPhoto[]> {
  const candidates = pickPhotoCandidates(input.products, input.topic);
  const fetched = await Promise.all(
    candidates.map(async ({ product: p, nameMatch }) => {
      try {
        return { p, nameMatch, img: await withDeadline(deps.fetchReference(p.imageUrl as string), Math.min(REFERENCE_FETCH_TIMEOUT_MS, remaining()), `the photo of ${p.sku}`) };
      } catch (err) {
        log(`[header-image] reference fetch failed for ${p.sku}: ${errorText(err)}`);
        return { p, nameMatch, img: null };
      }
    }),
  );
  const have = fetched.filter((f): f is { p: ReferenceProduct; nameMatch: boolean; img: PictureInput } => f.img !== null);
  return Promise.all(
    have.map(async ({ p, nameMatch, img }): Promise<ScreenedPhoto> => {
      let screen: PhotoScreen | null = null;
      try {
        screen = await withDeadline(deps.screenPhoto(img, { productName: p.name, title: input.title, topic: input.topic }), Math.min(PHOTO_SCREEN_TIMEOUT_MS, remaining()), `the read of ${p.sku}'s photo`);
      } catch (err) {
        log(`[header-image] photo screen unavailable for ${p.sku}: ${errorText(err)}`);
      }
      const verdict = photoScreenVerdict(screen, { name: p.name, brand: p.brand ?? null }, input.title);
      return { product: p, image: img, brand: verdict.brand, offSubject: nameMatch ? verdict.offSubject : !verdict.onSubject };
    }),
  );
}
