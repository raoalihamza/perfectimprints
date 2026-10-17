/**
 * AUTO-202: the header image chain driven for real with fakes for every
 * effect: the key, the cap, the reference photos, the image model, the
 * check, the upload and the clock. Every failure falls to the next source;
 * nothing throws; the cap is reserved before anything else is spent; the
 * budget is a deadline.
 *
 * AUTO-204: every picture is read IMAGE_CHECK_READS times and the worst
 * answer wins; the product's own markings pass whether or not the plan
 * predicted them; a brand name still refuses.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkAnsweredWithoutVerdict,
  defaultHeaderImageDeps,
  HEADER_IMAGE_BUDGET_MS,
  HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS,
  HEADER_IMAGE_RETRY_MIN_REMAINING_MS,
  noClientHeaderImageDeps,
  PlannerAnswerError,
  PLANNER_ATTEMPTS,
  resolveHeaderImage,
  shortFailure,
  withDeadline,
  type HeaderImageDeps,
  type ResolveHeaderImageInput,
} from './resolve-header-image';
import {
  DEFAULT_ARRANGEMENT,
  IMAGE_CHECK_READS,
  TILE_REGIONS,
  UNREADABLE_IMAGE_CHECK,
  type HeaderImageLibraryEntry,
  type ImageCheck,
  type ImageCheckContext,
  type ReferenceProduct,
} from './header-image';
import { GEMINI_IMAGE_FALLBACK_MODEL, GEMINI_IMAGE_MODEL } from '../ai/gemini';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';

const geiger = (n: number) => `https://imgsirv.geiger.com/master/10${n}/web/10${n}_1.jpg?format=webp&thumbnail=275&w=275&h=275`;
const products: ReferenceProduct[] = [
  { sku: '1', name: 'Canvas Tote', imageUrl: geiger(1) },
  { sku: '2', name: 'Zip Tote', imageUrl: geiger(2) },
];
const library: HeaderImageLibraryEntry[] = [{ rootSlug: 'tote-bags', assetRef: 'image-lib-1600x900-jpg', alt: 'Library totes' }];
const clean: ImageCheck = {
  texts: [],
  listed: true,
  logo: false,
  logoSeen: '',
  brandText: false,
  brandTextSeen: '',
  impossible: false,
  impossibleSeen: '',
  devices: [],
};
const branded: ImageCheck = { ...clean, logo: true, logoSeen: 'Apple' };
/** A picture whose only text is the product's own markings: a calendar grid. */
const productText: ImageCheck = { ...clean, texts: [{ text: 'JANUARY 1 2 3', where: 'the calendar magnet', onProduct: true, kind: 'marking' }] };
/** Ali's measuring cups: scale numbers on the product and small recipe text on a cookbook beside it. */
const measuringCups: ImageCheck = {
  ...clean,
  texts: [
    { text: '1 CUP 3/4 1/2 1/4', where: 'the measuring cups', onProduct: true, kind: 'marking' },
    { text: 'lines of recipe text', where: 'an open cookbook', onProduct: false, kind: 'page' },
  ],
};
/** A word on a sign: display text, refused. */
const saleSign: ImageCheck = { ...clean, texts: [{ text: 'SALE', where: 'a sign', onProduct: false, kind: 'display' }] };
/** The deliberate brand test: a company name and a phone number on the product. */
const brandedText: ImageCheck = {
  ...clean,
  texts: [{ text: 'ACME PLUMBING 555-0100', where: 'the magnet', onProduct: true, kind: 'brand' }],
  brandText: true,
  brandTextSeen: 'ACME PLUMBING 555-0100',
};
const onWood: ImageCheck = { ...clean, impossible: true, impossibleSeen: 'the magnets are stuck to a wooden desk' };
/** The reads one picture gets, as log entries. */
const READS = Array.from({ length: IMAGE_CHECK_READS }, () => 'check');
const plannedScene = {
  surface: 'the door of a stainless steel refrigerator',
  setting: 'an office break room',
  people: 'none',
  around: ['a coffee mug'],
  productText: 'a calendar grid with months and dates',
  arrangement: 'One calendar magnet flat against the door',
  photos: [1, 2],
  avoid: 'stuck to wood or lying flat',
};

interface FakeOptions {
  keyMissing?: boolean;
  capRefused?: boolean;
  reserveThrows?: boolean;
  generateFails?: Error;
  /** Thrown by the FIRST generate call only. */
  generateFailsOnce?: Error;
  /**
   * The check's answer PER PICTURE, in the order the pictures are generated.
   * One answer is given to every read of that picture; an array gives each
   * read its own (so two reads can disagree); null means "the check was
   * unavailable". A picture past the end of the list reads clean.
   */
  checks?: (ImageCheck | null | (ImageCheck | null)[])[];
  checkHangs?: boolean;
  uploadFails?: Error;
  referenceFails?: boolean;
  referenceThrows?: boolean;
  /** Milliseconds the clock advances per generate call. */
  generateMs?: number;
  /** AUTO-207: milliseconds the FIRST generate call takes (later ones take `generateMs`). */
  firstGenerateMs?: number;
  /**
   * AUTO-203: the planner's answer; 'fails' throws (no answer), null is
   * "unavailable", undefined is the planned magnet scene. AUTO-207:
   * 'malformed' answers unusably every time, 'malformedOnce' only the first
   * time, 'hangsOnce' hangs the first time and then answers.
   */
  plan?: 'fails' | 'hangs' | 'hangsOnce' | 'malformed' | 'malformedOnce' | null | { productText?: string; arrangement?: string };
}

function fakeDeps(opts: FakeOptions = {}) {
  const log: string[] = [];
  const prompts: string[] = [];
  const uploads: { filename: string; contentType: string }[] = [];
  let now = 1_000_000;
  let pictures = 0;
  let readsOfPicture = 0;
  let reserved = 0;
  const contexts: ImageCheckContext[] = [];
  const models: string[] = [];
  const planInputs: { names: number; photos: number }[] = [];
  const errors: string[] = [];
  let plans = 0;
  const deps: HeaderImageDeps = {
    keyConfigured: () => !opts.keyMissing,
    plan: async ({ productNames, references }) => {
      log.push('plan');
      plans += 1;
      planInputs.push({ names: productNames.length, photos: references.length });
      if (opts.plan === 'fails') throw new Error('planner down');
      if (opts.plan === 'hangs' || (opts.plan === 'hangsOnce' && plans === 1)) return new Promise(() => {});
      if (opts.plan === 'malformed' || (opts.plan === 'malformedOnce' && plans === 1)) throw new PlannerAnswerError('Gemini returned malformed JSON.');
      if (opts.plan === null) return null;
      const overrides = typeof opts.plan === 'object' && opts.plan ? opts.plan : {};
      const scene = { ...plannedScene, ...overrides };
      return { scene, usage: { model: 'gemini-3.5-flash-lite', promptTokens: 190, outputTokens: 154, elapsedMs: 2069 } };
    },
    reserve: async () => {
      if (opts.reserveThrows) throw new Error('counter down');
      reserved += 1;
      log.push('reserve');
      if (opts.capRefused) return { ok: false, reason: 'cap', used: 20, cap: 20, day: '2026-10-05', message: 'The daily limit of 20 generated header images has been reached.' };
      return { ok: true, used: reserved, cap: 20, day: '2026-10-05' };
    },
    fetchReference: async (url) => {
      log.push(`fetch:${url.includes('/101/') ? 'tote' : 'zip'}`);
      if (opts.referenceThrows) throw new Error('boom');
      if (opts.referenceFails) return null;
      return { mimeType: 'image/webp', base64: 'QUJD' };
    },
    generate: async ({ prompt, references, model }) => {
      log.push(`generate:${references.length}`);
      prompts.push(prompt);
      models.push(model);
      now += models.length === 1 && opts.firstGenerateMs !== undefined ? opts.firstGenerateMs : opts.generateMs ?? 10_000;
      if (opts.generateFails) throw opts.generateFails;
      if (opts.generateFailsOnce && log.filter((l) => l.startsWith('generate:')).length === 1) throw opts.generateFailsOnce;
      pictures += 1;
      readsOfPicture = 0;
      return { bytes: Buffer.from('jpegbytes'), mimeType: 'image/jpeg', base64: 'anBlZ2J5dGVz', usage: { imageTokens: 1120, promptTokens: 1900, elapsedMs: 9700, model: 'gemini-3.1-flash-image' } };
    },
    check: async (_image, context) => {
      log.push('check');
      contexts.push(context);
      if (opts.checkHangs) return new Promise(() => {});
      const read = readsOfPicture;
      readsOfPicture += 1;
      const forPicture = opts.checks && pictures - 1 < opts.checks.length ? opts.checks[pictures - 1] : clean;
      return Array.isArray(forPicture) ? (read < forPicture.length ? forPicture[read] : clean) : forPicture;
    },
    upload: async (_bytes, filename, contentType) => {
      log.push('upload');
      if (opts.uploadFails) throw opts.uploadFails;
      uploads.push({ filename, contentType });
      return `image-generated-${uploads.length}-1376x768-jpg`;
    },
    now: () => now,
  };
  return { deps, log, prompts, uploads, contexts, models, planInputs, errors };
}

/** Planner failures are said loudly; the tests capture the error lines instead of printing them. */
const loud: string[] = [];
const base: ResolveHeaderImageInput = {
  source: 'ai',
  title: '9 Smart Ways Businesses Use Custom Tote Bags',
  topic: 'custom tote bags',
  products,
  rootSlugs: ['tote-bags'],
  library,
  slug: 'custom-tote-bags-ideas',
  logError: (line) => loud.push(line),
};

describe('the AI step', () => {
  it('reserves the cap BEFORE anything else, fetches the reference photos, checks the picture, uploads it, and returns the asset', async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage(base, f.deps);
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', ...READS, 'upload']);
    expect(out).toMatchObject({ kind: 'asset', source: 'ai', notes: [] });
    if (out.kind !== 'asset') throw new Error('expected an asset');
    expect(out.image).toEqual({
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-generated-1-1376x768-jpg' },
      alt: 'Custom tote bags shown blank and unbranded in a business setting (illustrative image)',
    });
    expect(out.usage).toMatchObject({ imageTokens: 1120, attempts: 1, capUsed: 1, cap: 20 });
    expect(f.uploads).toEqual([{ filename: 'custom-tote-bags-ideas-header.jpg', contentType: 'image/jpeg' }]);
    expect(f.prompts[0]).toContain('Canvas Tote; Zip Tote');
  });

  it('with no Gemini key, no slot is spent and nothing is fetched; the library takes over with a note', async () => {
    const f = fakeDeps({ keyMissing: true });
    const out = await resolveHeaderImage(base, f.deps);
    expect(f.log).toEqual([]);
    expect(out).toMatchObject({ kind: 'asset', source: 'library' });
    expect(out.notes).toEqual(['the AI image service is not set up (GOOGLE_GEMINI_API_KEY is missing on the server), so no image was generated']);
  });

  it('a picture with a logo is retried once with the problem named, the references fetched once, and the retry costs a second slot', async () => {
    const f = fakeDeps({ checks: [branded, clean] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', ...READS, 'reserve', 'generate:2', ...READS, 'upload']);
    expect(f.prompts[1]).toContain('rejected because it contained a logo or brand mark (Apple)');
    expect(out.kind).toBe('asset');
    expect(out.notes).toEqual(['the first picture showed a logo or brand mark (Apple) and was replaced']);
    if (out.kind === 'asset') expect(out.usage?.attempts).toBe(2);
    expect(f.uploads[0].filename).toBe('custom-tote-bags-ideas-header-2.jpg');
  });

  it('two flagged pictures fall to the library, with both reasons', async () => {
    // A word on a sign is display text, refused whatever the plan said.
    const f = fakeDeps({ plan: { productText: '' }, checks: [branded, saleSign] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'library' });
    // One sentence, the two reasons side by side, no bracket inside a bracket (AUTO-204).
    expect(out.notes).toEqual([
      'both generated pictures were refused, so neither was used: the first showed a logo or brand mark (Apple); the second showed words on a sign, a label, a cover or a screen ("SALE" on a sign)',
    ]);
    expect(f.uploads).toEqual([]);
  });

  it('a refused cap generates nothing and fetches nothing, and falls to the next source with the refusal as the note', async () => {
    const f = fakeDeps({ capRefused: true });
    const out = await resolveHeaderImage({ ...base, library: [] }, f.deps);
    expect(f.log).toEqual(['reserve']);
    expect(out).toMatchObject({ kind: 'url', source: 'product', url: geiger(1), alt: 'Canvas Tote' });
    expect(out.notes).toEqual(['The daily limit of 20 generated header images has been reached.', 'the header image library is empty']);
  });

  it('a counter that throws is a note, not a crash', async () => {
    const f = fakeDeps({ reserveThrows: true });
    const out = await resolveHeaderImage({ ...base, library: [], products: [] }, f.deps);
    expect(out.kind).toBe('none');
    expect(out.notes[0]).toContain('the daily-limit counter could not be reached (counter down)');
  });

  it('a failed generation on both models, an empty library and no product photo end in nothing, with every reason', async () => {
    const f = fakeDeps({ generateFails: new Error('Image request failed (503).') });
    const out = await resolveHeaderImage({ ...base, library: [], products: [{ sku: 'x', name: 'No photo', imageUrl: null }] }, f.deps);
    expect(out).toEqual({
      kind: 'none',
      notes: [
        'the image model failed (Image request failed (503).), and then the backup image model failed: Image request failed (503).',
        'the header image library is empty',
        'the post has no product photo to fall back on',
      ],
    });
    // AUTO-207: the main model first, then the backup, each with its own slot.
    expect(f.models).toEqual([GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL]);
    expect(f.log.filter((l) => l === 'reserve')).toHaveLength(2);
  });

  it('a failed upload falls to the library', async () => {
    const f = fakeDeps({ uploadFails: new Error('Insufficient permissions') });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'library' });
    expect(out.notes).toEqual(['the generated picture could not be saved: Insufficient permissions']);
  });

  it('an unavailable check accepts the picture and says so', async () => {
    const f = fakeDeps({ checks: [null] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'ai' });
    expect(out.notes).toEqual(['the text-and-logo check was unavailable, so the picture was accepted unchecked; look at it before publishing']);
  });

  it('a check that hangs is cut off by the budget and counts as unavailable', async () => {
    // The generation eats the budget down to 50 ms, so the check's deadline is 50 ms of real time.
    const f = fakeDeps({ checkHangs: true, generateMs: HEADER_IMAGE_BUDGET_MS - 50 });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'ai' });
    expect(out.notes[0]).toContain('the text-and-logo check was unavailable');
  });

  it('reference photos that cannot be fetched are left out of the prompt; the picture is still made', async () => {
    const f = fakeDeps({ referenceFails: true });
    const out = await resolveHeaderImage(base, f.deps);
    expect(f.log).toContain('generate:0');
    expect(f.prompts[0]).toContain('Show the kind of item the title names');
    expect(out.kind).toBe('asset');
    const g = fakeDeps({ referenceThrows: true });
    expect((await resolveHeaderImage(base, g.deps)).kind).toBe('asset');
  });

  it('strip products that share no word with the topic are not sent as references; the prompt describes the item instead, with a note', async () => {
    const f = fakeDeps();
    const clips: ReferenceProduct[] = [
      { sku: '505494', name: 'Ad Clip', imageUrl: geiger(5494) },
      { sku: '505516', name: 'Oval Clip', imageUrl: geiger(5516) },
    ];
    const out = await resolveHeaderImage({ ...base, topic: 'custom pedometers', products: clips }, f.deps);
    expect(f.log.filter((l) => l.startsWith('fetch'))).toEqual([]);
    expect(f.log).toContain('generate:0');
    expect(f.prompts[0]).toContain('Show the kind of item the title names');
    expect(out.kind).toBe('asset');
    expect(out.notes).toEqual(["none of the post's product photos matched the topic, so the picture was drawn from the title alone"]);
  });

  it('no write client skips the AI with a note and takes the library', async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage({ ...base, clientMissing: true }, f.deps);
    expect(f.log).toEqual([]);
    expect(out).toMatchObject({ kind: 'asset', source: 'library' });
    expect(out.notes).toEqual(['the server has no Sanity write access, so no image could be generated']);
  });

  it('the retry is skipped when the budget is nearly spent, and the first problem is still named', async () => {
    const f = fakeDeps({ checks: [branded], generateMs: HEADER_IMAGE_BUDGET_MS - HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS + 1 });
    const out = await resolveHeaderImage({ ...base, library: [] }, f.deps);
    expect(f.log.filter((l) => l.startsWith('generate'))).toHaveLength(1);
    expect(out).toMatchObject({ kind: 'url', source: 'product' });
    expect(out.notes).toEqual(['the first picture showed a logo or brand mark (Apple), and there was no time left in the image budget for a second attempt', 'the header image library is empty']);
  });

  it('AUTO-207: a refused picture is drawn again by the main model when there is time for it, and by the backup when there is only time for that', async () => {
    const plenty = fakeDeps({ checks: [branded, clean] });
    expect((await resolveHeaderImage(base, plenty.deps)).kind).toBe('asset');
    expect(plenty.models).toEqual([GEMINI_IMAGE_MODEL, GEMINI_IMAGE_MODEL]);
    // Remaining after the first picture lands between the backup's minimum and the main model's.
    const tight = fakeDeps({ checks: [branded, clean], firstGenerateMs: HEADER_IMAGE_BUDGET_MS - HEADER_IMAGE_RETRY_MIN_REMAINING_MS + 1, generateMs: 1_000 });
    const out = await resolveHeaderImage(base, tight.deps);
    expect(out.kind).toBe('asset');
    expect(tight.models).toEqual([GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL]);
    expect(out.notes).toEqual(['the first picture showed a logo or brand mark (Apple) and was replaced']);
  });

  it("AUTO-207: a model failure reaches the notes as its first sentence only, never Google's raw error body (the live forced 404)", async () => {
    const raw = 'Image request failed (404). Check that the Generative Language API is enabled and billing is set up on the Google project the key belongs to. {\n  "error": {\n    "code": 404,';
    expect(shortFailure(raw)).toBe('Image request failed (404).');
    expect(shortFailure('x'.repeat(200))).toHaveLength(120);
    const f = fakeDeps({ generateFailsOnce: new Error(raw) });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.notes).toEqual(['the image model failed (Image request failed (404).), so the backup model drew this picture']);
  });

  it('AUTO-207: a failure of the main model is handed to the backup model once, which draws the picture; the draft never waits on it', async () => {
    const f = fakeDeps({ generateFailsOnce: new Error('Image request failed (503). The model is overloaded.') });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'ai' });
    expect(f.models).toEqual([GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL]);
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', 'reserve', 'generate:2', ...READS, 'upload']);
    // The plan is made once and reused by the backup.
    expect(f.log.filter((l) => l === 'plan')).toHaveLength(1);
    expect(out.notes).toEqual(['the image model failed (Image request failed (503).), so the backup model drew this picture']);
    // No time for the backup: the failure is said and the chain moves on.
    const g = fakeDeps({ generateFailsOnce: new Error('timeout'), generateMs: HEADER_IMAGE_BUDGET_MS - HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS + 1 });
    const fell = await resolveHeaderImage({ ...base, library: [] }, g.deps);
    expect(fell).toMatchObject({ kind: 'url', source: 'product' });
    expect(fell.notes[0]).toBe('the image model failed (timeout), and there was no time left in the image budget for the backup model');
  });

  it("AUTO-207: the backup's picture refused by the check is said as such, and the chain moves on", async () => {
    const f = fakeDeps({ generateFailsOnce: new Error('Image request failed (500).'), checks: [branded] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'library' });
    expect(out.notes[0]).toBe("the image model failed (Image request failed (500).), and the backup model's picture showed a logo or brand mark (Apple), so it was not used");
  });
});

describe('AUTO-207: device-mounted products are not drawn', () => {
  it('a post in a device-mounted category skips the AI entirely (no slot, no fetch, no call) and takes the library picture', async () => {
    const f = fakeDeps();
    const webcamLibrary: HeaderImageLibraryEntry[] = [{ rootSlug: 'webcam-covers', assetRef: 'image-own-1600x900-jpg', alt: "Patrick's webcam covers" }];
    const out = await resolveHeaderImage({ ...base, topic: 'custom webcam covers', rootSlugs: ['webcam-covers'], library: webcamLibrary }, f.deps);
    expect(f.log).toEqual([]);
    expect(out).toMatchObject({ kind: 'asset', source: 'library' });
    expect(out.notes[0]).toContain('products in the "webcam-covers" category only make sense on a phone or a laptop');
  });

  it('with no library picture yet it falls to the product photo, and says what would end the stand-in', async () => {
    const f = fakeDeps();
    const covers: ReferenceProduct[] = [{ sku: 'w1', name: 'Security Webcam Cover', imageUrl: geiger(77) }];
    const out = await resolveHeaderImage({ ...base, topic: 'custom webcam covers', products: covers, rootSlugs: ['webcam-covers'], library: [] }, f.deps);
    expect(f.log).toEqual([]);
    expect(out).toMatchObject({ kind: 'url', source: 'product', alt: 'Security Webcam Cover' });
    expect(out.notes).toEqual([
      'products in the "webcam-covers" category only make sense on a phone or a laptop, which a header picture may not show, so the AI does not draw one; a picture for this category in the header image library (Global Settings) is used instead when there is one',
      'the header image library is empty',
    ]);
  });

  it('a device-adjacent category (phone stands, power banks, laptop sleeves) is still drawn', async () => {
    for (const root of ['phone-tablet-stands', 'power-banks-chargers', 'laptop-cases']) {
      const f = fakeDeps();
      expect(await resolveHeaderImage({ ...base, rootSlugs: [root] }, f.deps)).toMatchObject({ kind: 'asset', source: 'ai' });
    }
  });
});

describe('the other starting points', () => {
  it("source 'library' never touches the key, the cap or the model", async () => {
    const f = fakeDeps({ keyMissing: true });
    const out = await resolveHeaderImage({ ...base, source: 'library' }, f.deps);
    expect(f.log).toEqual([]);
    expect(out).toEqual({ kind: 'asset', source: 'library', image: { _type: 'image', asset: { _type: 'reference', _ref: 'image-lib-1600x900-jpg' }, alt: 'Library totes' }, notes: [] });
  });

  it("source 'library' with nothing for the category falls to the product photo", async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage({ ...base, source: 'library', rootSlugs: ['pens'] }, f.deps);
    expect(out).toMatchObject({ kind: 'url', source: 'product', url: geiger(1) });
    expect(out.notes).toEqual(['the header image library has no picture for this category']);
  });

  it("source 'product' is the hot link alone, and nothing when there is no photo", async () => {
    const f = fakeDeps();
    expect(await resolveHeaderImage({ ...base, source: 'product' }, f.deps)).toEqual({ kind: 'url', source: 'product', url: geiger(1), alt: 'Canvas Tote', notes: [] });
    expect(await resolveHeaderImage({ ...base, source: 'product', products: [] }, f.deps)).toEqual({ kind: 'none', notes: ['the post has no product photo to fall back on'] });
    expect(f.log).toEqual([]);
  });

  it('the product fallback obeys the topic rule too: an off-topic strip product never becomes the header', async () => {
    const f = fakeDeps();
    const clips: ReferenceProduct[] = [{ sku: '505494', name: 'Ad Clip', imageUrl: geiger(5494) }];
    const out = await resolveHeaderImage({ ...base, source: 'product', topic: 'custom pedometers', products: clips }, f.deps);
    expect(out).toEqual({ kind: 'none', notes: ["none of the post's product photos matched the topic, so none was used as the header"] });
  });

  it('works with the library entirely empty, which is the state at launch', async () => {
    const f = fakeDeps();
    expect((await resolveHeaderImage({ ...base, library: [] }, f.deps)).kind).toBe('asset');
    expect((await resolveHeaderImage({ ...base, source: 'library', library: [] }, f.deps))).toMatchObject({ kind: 'url' });
  });
});

describe('the pieces', () => {
  it('withDeadline gives up when the time is gone, and passes a timely answer through', async () => {
    await expect(withDeadline(new Promise(() => {}), 20, 'the thing')).rejects.toThrow('the thing gave up after 0 s (the image budget)');
    await expect(withDeadline(Promise.resolve(7), 1_000, 'x')).resolves.toBe(7);
    await expect(withDeadline(Promise.resolve(7), 0, 'x')).rejects.toThrow('x skipped: the image budget is spent');
  });

  it('the no-client deps reserve nothing and configure no key', async () => {
    const deps = noClientHeaderImageDeps();
    expect(deps.keyConfigured()).toBe(false);
    expect((await deps.reserve(new Date())).ok).toBe(false);
    expect(await deps.fetchReference('https://imgsirv.geiger.com/a.jpg')).toBeNull();
    expect(await deps.check({ mimeType: 'image/jpeg', base64: '' }, {})).toBeNull();
    expect(await deps.plan({ title: 't', topic: 't', productNames: [], references: [] })).toBeNull();
  });

  it('AUTO-207: every picture the real deps upload carries the marker that lets a replaced one be removed later', async () => {
    const calls: { kind: string; opts: Record<string, unknown> }[] = [];
    const client = { assets: { upload: async (kind: string, _bytes: Buffer, opts: Record<string, unknown>) => (calls.push({ kind, opts }), { _id: 'image-abc-1376x768-jpg' }) } };
    const deps = defaultHeaderImageDeps(client as never);
    expect(await deps.upload(Buffer.from('x'), 'custom-tools-header.jpg', 'image/jpeg')).toBe('image-abc-1376x768-jpg');
    expect(calls).toEqual([
      { kind: 'image', opts: { filename: 'custom-tools-header.jpg', contentType: 'image/jpeg', source: { name: BLOG_HEADER_ASSET_SOURCE, id: 'custom-tools-header.jpg' } } },
    ]);
  });

  it('AUTO-207: the real planner reads the photos through a response schema, and an unreadable answer is a PlannerAnswerError, not "unavailable"', () => {
    const src = readFileSync(join(__dirname, 'resolve-header-image.ts'), 'utf8');
    expect(src).toContain('responseSchema: PLANNER_RESPONSE_SCHEMA');
    expect(src).toContain('generateJsonFromImages<unknown>({ ...common, images: references })');
    expect(src).toContain('if (checkAnsweredWithoutVerdict(err.message)) throw new PlannerAnswerError(err.message);');
    expect(src).toContain("throw new PlannerAnswerError('the plan named no surface and no setting')");
  });
});

describe('the scene planner in the chain (AUTO-203)', () => {
  it('plans once after the cap and the photos, builds the prompt from the plan, tells the check what the picture is about, and records the plan on the outcome', async () => {
    const f = fakeDeps({ checks: [productText] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', ...READS, 'upload']);
    expect(f.prompts[0]).toContain('where such a product really lives: the door of a stainless steel refrigerator, in an office break room.');
    expect(f.prompts[0]).toContain("The ONLY text allowed in the image is this product's own functional markings, the kind in the reference photos: a calendar grid with months and dates.");
    expect(f.prompts[0]).toContain('Physically wrong, and not to be shown: stuck to wood or lying flat.');
    // The topic, the reference products and the plan's text as a guide, the same for every read.
    const context = { topic: 'custom tote bags', productNames: ['Canvas Tote', 'Zip Tote'], productText: 'a calendar grid with months and dates' };
    expect(f.contexts).toEqual(READS.map(() => context));
    // Readable text that is the product's own passes.
    expect(out.kind === 'asset' && out.usage?.scene).toEqual(plannedScene);
    expect(out.kind === 'asset' && out.usage?.planner).toEqual({ model: 'gemini-3.5-flash-lite', promptTokens: 190, outputTokens: 154, elapsedMs: 2069 });
    expect(out.notes).toEqual([]);
  });

  it('a planner that fails or is unavailable is asked ONCE more, then said LOUDLY; the picture is drawn from the standard composition, and the check is told no plan text', async () => {
    for (const plan of ['fails', null] as const) {
      loud.length = 0;
      const f = fakeDeps({ plan });
      const out = await resolveHeaderImage(base, f.deps);
      expect(out.kind).toBe('asset');
      expect(f.log.filter((l) => l === 'plan')).toHaveLength(PLANNER_ATTEMPTS);
      expect(f.prompts[0]).toMatch(/^- No words anywhere/m);
      expect(f.prompts[0]).toContain('arranged in a clean, realistic setting');
      expect(f.contexts.map((c) => c.productText)).toEqual(READS.map(() => null));
      expect(out.notes).toEqual([
        `the scene planner was unavailable (2 tries: ${plan === 'fails' ? 'planner down' : 'no answer'}), so the picture was drawn from the standard composition (one to three items in a plain setting, no signs or screens); look at it before publishing`,
      ]);
      expect(loud).toHaveLength(2);
      expect(loud[0]).toContain('SCENE PLANNER UNAVAILABLE (try 1 of 2) for "custom tote bags"');
    }
  });

  it('AUTO-207: a malformed plan is LOUD, never silent: retried once and used when the retry is good; twice malformed is said in the note and the error log', async () => {
    loud.length = 0;
    const once = fakeDeps({ plan: 'malformedOnce' });
    const good = await resolveHeaderImage(base, once.deps);
    expect(once.log.filter((l) => l === 'plan')).toHaveLength(2);
    expect(good.notes).toEqual([]);
    expect(good.kind === 'asset' && good.usage?.scene?.arrangement).toBe('One calendar magnet flat against the door');
    expect(loud).toEqual(['[header-image] SCENE PLANNER ANSWERED WITH NO USABLE PLAN (try 1 of 2) for "custom tote bags": Gemini returned malformed JSON.']);
    loud.length = 0;
    const twice = fakeDeps({ plan: 'malformed' });
    const out = await resolveHeaderImage(base, twice.deps);
    expect(out.kind).toBe('asset');
    expect(out.notes).toEqual([
      'the scene planner answered with a plan that could not be read (2 tries: Gemini returned malformed JSON.), so the picture was drawn from the standard composition (one to three items in a plain setting, no signs or screens); look at it before publishing',
    ]);
    expect(loud).toHaveLength(2);
    // Never carried on as though a plan existed: no planned surface, no plan text, no scene recorded.
    expect(twice.prompts[0]).not.toContain('where such a product really lives');
    expect(out.kind === 'asset' && out.usage?.scene).toBeNull();
  });

  it('AUTO-207: without a plan the picture is asked for under the same count rule and the same no-signs rule, and the check reads it exactly as it reads a planned one', async () => {
    const planless = fakeDeps({ plan: 'malformed' });
    await resolveHeaderImage(base, planless.deps);
    // The planned picture of the same product: photo 1, no product text.
    const plannedNoText = fakeDeps({ plan: { productText: '', photos: [1] } as never });
    await resolveHeaderImage(base, plannedNoText.deps);
    // The count and state rule: the plan's arrangement, or the default.
    expect(planless.prompts[0]).toContain(`- Show exactly this and no more: ${DEFAULT_ARRANGEMENT}`);
    expect(plannedNoText.prompts[0]).toContain('- Show exactly this and no more: One calendar magnet flat against the door.');
    // No signage invited; the trade show suggestion that drew AUTO-206's TRADE banner is gone.
    expect(planless.prompts[0]).toContain('No signs, banners, booths, posters or screens anywhere in the scene.');
    expect(planless.prompts[0]).not.toMatch(/trade show/i);
    for (const p of [planless.prompts[0], plannedNoText.prompts[0]]) expect(p).toContain('No other writing anywhere');
    // The check's input is IDENTICAL with no plan and with a plan whose product carries no text.
    expect(planless.contexts).toEqual(plannedNoText.contexts);
  });

  it('AUTO-207: the planner is given the reference photos it plans from', async () => {
    const f = fakeDeps();
    await resolveHeaderImage(base, f.deps);
    expect(f.planInputs).toEqual([{ names: 2, photos: 2 }]);
  });

  it('AUTO-207, the overshoot: the image model is sent ONLY the photo(s) the plan names; the planner still saw them all', async () => {
    const f = fakeDeps({ plan: { arrangement: 'One zip tote, standing', photos: [2] } as never });
    await resolveHeaderImage(base, f.deps);
    expect(f.planInputs).toEqual([{ names: 2, photos: 2 }]);
    expect(f.log).toContain('generate:1');
    expect(f.prompts[0]).toContain('The attached photo is the actual products the post recommends (Zip Tote)');
    expect(f.contexts[0].productNames).toEqual(['Zip Tote']);
    // A plan that names no photo that exists sends every photo, as before.
    const g = fakeDeps({ plan: { photos: [9] } as never });
    await resolveHeaderImage(base, g.deps);
    expect(g.log).toContain('generate:2');
  });

  it('AUTO-207: with no plan the first photo alone is sent, under the default count rule', async () => {
    const f = fakeDeps({ plan: 'malformed' });
    await resolveHeaderImage(base, f.deps);
    expect(f.log).toContain('generate:1');
    expect(f.prompts[0]).toContain('(Canvas Tote)');
    expect(f.prompts[0]).toContain(DEFAULT_ARRANGEMENT);
  });

  it("with NO plan at all, the product's own markings still pass (AUTO-204): the verdict no longer depends on what the planner predicted", async () => {
    for (const plan of ['fails', null, { productText: '' }] as const) {
      const f = fakeDeps({ plan, checks: [measuringCups] });
      const out = await resolveHeaderImage(base, f.deps);
      expect(out).toMatchObject({ kind: 'asset', source: 'ai' });
      expect(f.log.filter((l) => l.startsWith('generate'))).toHaveLength(1);
      expect(f.uploads).toHaveLength(1);
    }
  });

  it('a planner that hangs is cut off by its deadline, and the retry plans the picture', async () => {
    loud.length = 0;
    const f = fakeDeps({ plan: 'hangsOnce' });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(out.notes).toEqual([]);
    expect(loud[0]).toContain('SCENE PLANNER UNAVAILABLE (try 1 of 2)');
    expect(loud[0]).toContain('gave up after 15 s');
  }, 25_000);

  it('a brand name on the product is caught by the check and the retry names it; the plan is not made twice', async () => {
    const f = fakeDeps({ checks: [brandedText, productText] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log.filter((l) => l === 'plan')).toHaveLength(1);
    expect(f.log.filter((l) => l === 'generate:2')).toHaveLength(2);
    expect(f.prompts[1]).toContain('rejected because it contained a brand, company name or contact detail in text ("ACME PLUMBING 555-0100")');
    expect(out.notes).toEqual(['the first picture showed a brand, company name or contact detail in text ("ACME PLUMBING 555-0100") and was replaced']);
  });

  it('an answer with no picture in it is handed to the backup model, costing a second slot; a second empty answer falls through with both said', async () => {
    const noImage = new Error('The image model returned no image (NO_IMAGE).');
    const f = fakeDeps({ generateFailsOnce: noImage });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', 'reserve', 'generate:2', ...READS, 'upload']);
    expect(f.models).toEqual([GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL]);
    expect(out.notes).toEqual(['the image model failed (The image model returned no image (NO_IMAGE).), so the backup model drew this picture']);
    const g = fakeDeps({ generateFails: noImage });
    const twice = await resolveHeaderImage(base, g.deps);
    expect(twice).toMatchObject({ kind: 'asset', source: 'library' });
    expect(twice.notes[0]).toBe(
      'the image model failed (The image model returned no image (NO_IMAGE).), and then the backup image model failed: The image model returned no image (NO_IMAGE).',
    );
    expect(g.log.filter((l) => l === 'reserve')).toHaveLength(2);
    // AUTO-207: any other failure of the main model is handed to the backup too (it used to end the AI step).
    const h = fakeDeps({ generateFails: new Error('Image request failed (500).') });
    await resolveHeaderImage(base, h.deps);
    expect(h.log.filter((l) => l === 'reserve')).toHaveLength(2);
    expect(h.models).toEqual([GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL]);
  });

  it('a product somewhere it could not be (the magnet on wood) is refused and retried with the problem named', async () => {
    const f = fakeDeps({ checks: [onWood, clean] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.prompts[1]).toContain('rejected because it contained the product somewhere it could not be (the magnets are stuck to a wooden desk)');
    expect(f.prompts[1]).toContain('the product only where it could really be');
  });

  it('a word printed on the product as decoration is still refused, plan or no plan, and the retry names it', async () => {
    const imprint: ImageCheck = { ...clean, texts: [{ text: 'TEAM', where: 'the tote', onProduct: true, kind: 'display' }] };
    for (const plan of [{ productText: '' }, undefined] as const) {
      const f = fakeDeps({ plan, checks: [imprint, clean] });
      const out = await resolveHeaderImage(base, f.deps);
      expect(out.kind).toBe('asset');
      expect(f.prompts[1]).toContain('rejected because it contained words printed on the product that are not its own markings ("TEAM" on the tote)');
      expect(f.prompts[1]).toContain("no writing except the product's own functional markings");
    }
  });
});

describe('the reads of one picture (AUTO-204)', () => {
  it("Ali's measuring cups: scale numbers on the product and recipe text on a cookbook pass on the first picture, with nothing refused and nothing noted", async () => {
    const f = fakeDeps({ checks: [measuringCups] });
    const cups: ReferenceProduct[] = [
      { sku: '506415 91A', name: "Cook's Choice One-Cup Measuring Cup", imageUrl: geiger(1) },
      { sku: '510810', name: "Cook's Choice Two-Cup Measuring Cup", imageUrl: geiger(2) },
    ];
    const out = await resolveHeaderImage({ ...base, topic: 'promotional measuring cups', products: cups, library: [] }, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'ai', notes: [] });
    // The check was told which objects are the product, so numbers on any of them are on the product.
    expect(f.contexts[0]).toMatchObject({ topic: 'promotional measuring cups', productNames: ["Cook's Choice One-Cup Measuring Cup", "Cook's Choice Two-Cup Measuring Cup"] });
    expect(f.log.filter((l) => l === 'reserve')).toHaveLength(1);
    if (out.kind === 'asset') expect(out.usage?.attempts).toBe(1);
  });

  it('every picture is read IMAGE_CHECK_READS times, with the same context, and a problem seen by ANY read refuses it', async () => {
    expect(IMAGE_CHECK_READS).toBeGreaterThanOrEqual(2);
    // The wall clock run: the first read saw nothing, the second saw the Apple logo.
    const f = fakeDeps({ checks: [[clean, branded], clean] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(f.log.filter((l) => l === 'check')).toHaveLength(2 * IMAGE_CHECK_READS);
    expect(f.log.filter((l) => l.startsWith('generate'))).toHaveLength(2);
    expect(f.prompts[1]).toContain('rejected because it contained a logo or brand mark (Apple)');
    expect(out.notes).toEqual(['the first picture showed a logo or brand mark (Apple) and was replaced']);
    // The other order refuses just the same.
    const g = fakeDeps({ checks: [[branded, clean], clean] });
    await resolveHeaderImage(base, g.deps);
    expect(g.log.filter((l) => l.startsWith('generate'))).toHaveLength(2);
  });

  it('one read unavailable and the other passing is a checked picture: accepted, with no "unchecked" note', async () => {
    const f = fakeDeps({ checks: [[null, clean]] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'ai', notes: [] });
    // One read unavailable and the other refusing still refuses.
    const g = fakeDeps({ checks: [[null, branded], clean] });
    await resolveHeaderImage(base, g.deps);
    expect(g.log.filter((l) => l.startsWith('generate'))).toHaveLength(2);
  });

  it('an answer that could not be read REFUSES the picture: it is never passed unread', async () => {
    const f = fakeDeps({ checks: [UNREADABLE_IMAGE_CHECK, clean] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log.filter((l) => l.startsWith('generate'))).toHaveLength(2);
    expect(f.prompts[1]).toContain('rejected because it contained text the check could not account for');
    expect(out.notes).toEqual(['the first picture showed text the check could not account for and was replaced']);
  });

  it('a read that ANSWERED without a verdict refuses; only a call that never answered is "unavailable"', () => {
    const gemini = readFileSync(join(__dirname, '..', 'ai', 'gemini.ts'), 'utf8');
    // The wrapper's own four wordings for "it answered, with nothing usable", each still spelled there.
    for (const message of ['Gemini returned something that is not JSON.', 'Gemini returned malformed JSON.', 'Empty response from Gemini.', 'Gemini declined this image (SAFETY).']) {
      expect(checkAnsweredWithoutVerdict(message), message).toBe(true);
    }
    for (const spelled of ["'Gemini returned something that is not JSON.'", "'Gemini returned malformed JSON.'", "'Empty response from Gemini.'", '`Gemini declined this ${']) {
      expect(gemini, spelled).toContain(spelled);
    }
    // Never answered: the picture is not judged by this read, and the chain says so only if no read answered.
    for (const message of ['Gemini request failed (503).', 'Gemini did not answer within 40 seconds.', 'Gemini request failed: network error.', 'GOOGLE_GEMINI_API_KEY is not configured on the server.']) {
      expect(checkAnsweredWithoutVerdict(message), message).toBe(false);
    }
    // And the real deps use it: an unreadable answer becomes the refusing check, never null.
    const chain = readFileSync(join(__dirname, 'resolve-header-image.ts'), 'utf8');
    expect(chain).toContain('return checkAnsweredWithoutVerdict(err.message) ? UNREADABLE_IMAGE_CHECK : null;');
  });

  it('a brand name is refused even when every read lists it as a marking and only the phone number gives it away', async () => {
    const hidden: ImageCheck = { ...clean, texts: [{ text: 'ACME PLUMBING 555-0100 JANUARY', where: 'the magnet', onProduct: true, kind: 'marking' }] };
    const f = fakeDeps({ checks: [hidden, hidden] });
    const out = await resolveHeaderImage({ ...base, library: [], products: [] }, f.deps);
    expect(out.kind).toBe('none');
    expect(f.uploads).toEqual([]);
    expect(out.notes[0]).toContain('both generated pictures were refused, so neither was used: the first showed a brand, company name or contact detail in text');
  });
});

describe('AUTO-205: the device rule and the tile pass in the chain', () => {
  const laptop: ImageCheck = { ...clean, devices: [{ what: 'laptop', where: 'on the desk' }] };

  it('a device seen by a read refuses the picture and the retry names it; the second picture without one is kept', async () => {
    const f = fakeDeps({ checks: [laptop, clean] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log.filter((l) => l.startsWith('generate:'))).toHaveLength(2);
    expect(f.prompts[1]).toContain('a laptop in the scene (on the desk)');
    expect(f.prompts[1]).toContain('no laptop, monitor, tablet or phone anywhere');
    expect(out.notes).toContain('the first picture showed a laptop in the scene (on the desk) and was replaced');
  });

  it('two pictures with a device fall to the library, both reasons said', async () => {
    const f = fakeDeps({ checks: [laptop, laptop] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect((out as { source: string }).source).toBe('library');
    expect(out.notes.join(' ')).toContain('both generated pictures were refused');
  });

  it('the tile pass runs only on a picture the reads passed, once per region in parallel, and a logo in any region refuses with the retry naming it', async () => {
    const f = fakeDeps({ checks: [clean, clean] });
    const regions: string[][] = [];
    let picture = 0;
    const deps: HeaderImageDeps = {
      ...f.deps,
      generate: async (args) => {
        picture += 1;
        regions.push([]);
        return f.deps.generate(args);
      },
      checkRegion: async (_image, region) => {
        regions[picture - 1].push(region);
        return picture === 1 && region === 'bottom-middle' ? { region, logo: true, seen: 'a small brand tag on the can cooler' } : { region, logo: false, seen: '' };
      },
    };
    const out = await resolveHeaderImage(base, deps);
    expect(out.kind).toBe('asset');
    expect(regions).toHaveLength(2);
    expect(regions[0].sort()).toEqual([...TILE_REGIONS].sort());
    expect(f.prompts[1]).toContain('a small logo or brand tag the close look found (a small brand tag on the can cooler, bottom-middle)');
    expect(out.notes[0]).toContain('and was replaced');
  });

  it('the tile pass is skipped when a read already refused (no close look at a picture that is gone), and when the deps have no region check', async () => {
    let regionCalls = 0;
    const f = fakeDeps({ checks: [laptop, clean] });
    const deps: HeaderImageDeps = { ...f.deps, checkRegion: async (_i, region) => { regionCalls += 1; return { region, logo: false, seen: '' }; } };
    await resolveHeaderImage(base, deps);
    // Only the second picture, the one the reads passed, got the six close looks.
    expect(regionCalls).toBe(TILE_REGIONS.length);
    const g = fakeDeps({ checks: [clean] });
    expect(g.deps.checkRegion).toBeUndefined();
    const out = await resolveHeaderImage(base, g.deps);
    expect(out.kind).toBe('asset');
  });

  it('a region read that fails is left out, never a refusal on its own', async () => {
    const f = fakeDeps({ checks: [clean] });
    const deps: HeaderImageDeps = { ...f.deps, checkRegion: async (_i, region) => (region === 'top-left' ? null : { region, logo: false, seen: '' }) };
    const out = await resolveHeaderImage(base, deps);
    expect(out.kind).toBe('asset');
    expect(out.notes).toEqual([]);
  });

  it('the real deps provide the region check, on the same model and key handling as the check', () => {
    const src = readFileSync(join(__dirname, 'resolve-header-image.ts'), 'utf8');
    expect(src).toContain('checkRegion: async (image, region) => {');
    expect(src).toContain('buildTileCheckPrompt(region)');
    expect(src).toContain('maxOutputTokens: 256, temperature: 0');
  });
});
