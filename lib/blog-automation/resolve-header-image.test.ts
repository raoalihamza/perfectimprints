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
  HEADER_IMAGE_BUDGET_MS,
  HEADER_IMAGE_RETRY_MIN_REMAINING_MS,
  noClientHeaderImageDeps,
  resolveHeaderImage,
  withDeadline,
  type HeaderImageDeps,
  type ResolveHeaderImageInput,
} from './resolve-header-image';
import { IMAGE_CHECK_READS, UNREADABLE_IMAGE_CHECK, type HeaderImageLibraryEntry, type ImageCheck, type ImageCheckContext, type ReferenceProduct } from './header-image';

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
  /** AUTO-203: the planner's answer; 'fails' throws, null is "unavailable", undefined is the planned magnet scene. */
  plan?: 'fails' | 'hangs' | null | { productText?: string };
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
  const deps: HeaderImageDeps = {
    keyConfigured: () => !opts.keyMissing,
    plan: async () => {
      log.push('plan');
      if (opts.plan === 'fails') throw new Error('planner down');
      if (opts.plan === 'hangs') return new Promise(() => {});
      if (opts.plan === null) return null;
      const scene = { ...plannedScene, ...(opts.plan ?? {}) };
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
    generate: async ({ prompt, references }) => {
      log.push(`generate:${references.length}`);
      prompts.push(prompt);
      now += opts.generateMs ?? 10_000;
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
  return { deps, log, prompts, uploads, contexts };
}

const base: ResolveHeaderImageInput = {
  source: 'ai',
  title: '9 Smart Ways Businesses Use Custom Tote Bags',
  topic: 'custom tote bags',
  products,
  rootSlugs: ['tote-bags'],
  library,
  slug: 'custom-tote-bags-ideas',
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

  it('a failed generation, an empty library and no product photo end in nothing, with every reason', async () => {
    const f = fakeDeps({ generateFails: new Error('Image request failed (503).') });
    const out = await resolveHeaderImage({ ...base, library: [], products: [{ sku: 'x', name: 'No photo', imageUrl: null }] }, f.deps);
    expect(out).toEqual({
      kind: 'none',
      notes: ['the image model failed: Image request failed (503).', 'the header image library is empty', 'the post has no product photo to fall back on'],
    });
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
    const f = fakeDeps({ checks: [branded], generateMs: HEADER_IMAGE_BUDGET_MS - HEADER_IMAGE_RETRY_MIN_REMAINING_MS + 1 });
    const out = await resolveHeaderImage({ ...base, library: [] }, f.deps);
    expect(f.log.filter((l) => l.startsWith('generate'))).toHaveLength(1);
    expect(out).toMatchObject({ kind: 'url', source: 'product' });
    expect(out.notes).toEqual(['the first picture showed a logo or brand mark (Apple), and there was no time left in the image budget for a second attempt', 'the header image library is empty']);
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
    expect(await deps.plan({ title: 't', topic: 't', productNames: [] })).toBeNull();
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

  it('a planner that fails or is unavailable is a note, the picture is drawn with no words asked for, and the check is told no plan text', async () => {
    for (const plan of ['fails', null] as const) {
      const f = fakeDeps({ plan });
      const out = await resolveHeaderImage(base, f.deps);
      expect(out.kind).toBe('asset');
      expect(f.prompts[0]).toMatch(/^- No words anywhere/m);
      expect(f.prompts[0]).toContain('arranged in a clean, realistic setting');
      expect(f.contexts.map((c) => c.productText)).toEqual(READS.map(() => null));
      expect(out.notes).toEqual(['the scene planner was unavailable, so the picture was composed without a planned setting']);
    }
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

  it('a planner that hangs is cut off by the budget and treated as unavailable', async () => {
    const f = fakeDeps({ plan: 'hangs' });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(out.notes[0]).toContain('the scene planner was unavailable');
  }, 20_000);

  it('a brand name on the product is caught by the check and the retry names it; the plan is not made twice', async () => {
    const f = fakeDeps({ checks: [brandedText, productText] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log.filter((l) => l === 'plan')).toHaveLength(1);
    expect(f.log.filter((l) => l === 'generate:2')).toHaveLength(2);
    expect(f.prompts[1]).toContain('rejected because it contained a brand, company name or contact detail in text ("ACME PLUMBING 555-0100")');
    expect(out.notes).toEqual(['the first picture showed a brand, company name or contact detail in text ("ACME PLUMBING 555-0100") and was replaced']);
  });

  it('an answer with no picture in it is tried once more, costing a second slot; a second empty answer falls through with both said', async () => {
    const noImage = new Error('The image model returned no image (NO_IMAGE).');
    const f = fakeDeps({ generateFailsOnce: noImage });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', 'reserve', 'generate:2', ...READS, 'upload']);
    expect(out.notes).toEqual(['the image model returned no picture on its first try and was asked again']);
    const g = fakeDeps({ generateFails: noImage });
    const twice = await resolveHeaderImage(base, g.deps);
    expect(twice).toMatchObject({ kind: 'asset', source: 'library' });
    expect(twice.notes[0]).toBe('the image model returned no image twice: the image model failed: The image model returned no image (NO_IMAGE).');
    expect(g.log.filter((l) => l === 'reserve')).toHaveLength(2);
    // Any other failure is not retried.
    const h = fakeDeps({ generateFails: new Error('Image request failed (500).') });
    await resolveHeaderImage(base, h.deps);
    expect(h.log.filter((l) => l === 'reserve')).toHaveLength(1);
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
