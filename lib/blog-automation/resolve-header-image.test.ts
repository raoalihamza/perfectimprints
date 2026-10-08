/**
 * AUTO-202: the header image chain driven for real with fakes for every
 * effect: the key, the cap, the reference photos, the image model, the
 * check, the upload and the clock. Every failure falls to the next source;
 * nothing throws; the cap is reserved before anything else is spent; the
 * budget is a deadline.
 */
import { describe, expect, it } from 'vitest';
import {
  HEADER_IMAGE_BUDGET_MS,
  HEADER_IMAGE_RETRY_MIN_REMAINING_MS,
  noClientHeaderImageDeps,
  resolveHeaderImage,
  withDeadline,
  type HeaderImageDeps,
  type ResolveHeaderImageInput,
} from './resolve-header-image';
import type { HeaderImageLibraryEntry, ImageCheck, ReferenceProduct } from './header-image';

const geiger = (n: number) => `https://imgsirv.geiger.com/master/10${n}/web/10${n}_1.jpg?format=webp&thumbnail=275&w=275&h=275`;
const products: ReferenceProduct[] = [
  { sku: '1', name: 'Canvas Tote', imageUrl: geiger(1) },
  { sku: '2', name: 'Zip Tote', imageUrl: geiger(2) },
];
const library: HeaderImageLibraryEntry[] = [{ rootSlug: 'tote-bags', assetRef: 'image-lib-1600x900-jpg', alt: 'Library totes' }];
const clean: ImageCheck = {
  readableText: false,
  textSeen: '',
  logo: false,
  logoSeen: '',
  brandText: false,
  brandTextSeen: '',
  textOffProduct: false,
  textOffProductSeen: '',
  impossible: false,
  impossibleSeen: '',
};
const branded: ImageCheck = { ...clean, logo: true, logoSeen: 'Apple' };
/** A picture whose only text is the calendar the plan allowed. */
const productText: ImageCheck = { ...clean, readableText: true, textSeen: 'JANUARY 1 2 3' };
/** The deliberate brand test: a company name and a phone number on the product. */
const brandedText: ImageCheck = { ...clean, readableText: true, textSeen: 'ACME PLUMBING 555-0100', brandText: true, brandTextSeen: 'ACME PLUMBING 555-0100' };
const onWood: ImageCheck = { ...clean, impossible: true, impossibleSeen: 'the magnets are stuck to a wooden desk' };
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
  checks?: (ImageCheck | null)[];
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
  let checks = 0;
  let reserved = 0;
  const checkArgs: (string | null)[] = [];
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
      return { bytes: Buffer.from('jpegbytes'), mimeType: 'image/jpeg', base64: 'anBlZ2J5dGVz', usage: { imageTokens: 1120, promptTokens: 1900, elapsedMs: 9700, model: 'gemini-3.1-flash-image' } };
    },
    check: async (_image, allowedProductText) => {
      log.push('check');
      checkArgs.push(allowedProductText);
      if (opts.checkHangs) return new Promise(() => {});
      // An entry of null in `checks` means "the check was unavailable".
      const answer = opts.checks && checks < opts.checks.length ? opts.checks[checks] : clean;
      checks += 1;
      return answer;
    },
    upload: async (_bytes, filename, contentType) => {
      log.push('upload');
      if (opts.uploadFails) throw opts.uploadFails;
      uploads.push({ filename, contentType });
      return `image-generated-${uploads.length}-1376x768-jpg`;
    },
    now: () => now,
  };
  return { deps, log, prompts, uploads, checkArgs };
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
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', 'check', 'upload']);
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
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', 'check', 'reserve', 'generate:2', 'check', 'upload']);
    expect(f.prompts[1]).toContain('rejected because it contained a logo or brand mark (Apple)');
    expect(out.kind).toBe('asset');
    expect(out.notes).toEqual(['the first picture showed a logo or brand mark (Apple) and was replaced']);
    if (out.kind === 'asset') expect(out.usage?.attempts).toBe(2);
    expect(f.uploads[0].filename).toBe('custom-tote-bags-ideas-header-2.jpg');
  });

  it('two flagged pictures fall to the library, with both reasons', async () => {
    // A plan whose product carries no text keeps the blanket rule, so "SALE" is refused.
    const f = fakeDeps({ plan: { productText: '' }, checks: [branded, { ...clean, readableText: true, textSeen: 'SALE' }] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out).toMatchObject({ kind: 'asset', source: 'library' });
    expect(out.notes).toEqual(['both generated pictures were refused (the first showed a logo or brand mark (Apple), the second readable text ("SALE")), so neither was used']);
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
    expect(await deps.check({ mimeType: 'image/jpeg', base64: '' }, null)).toBeNull();
    expect(await deps.plan({ title: 't', topic: 't', productNames: [] })).toBeNull();
  });
});

describe('the scene planner in the chain (AUTO-203)', () => {
  it('plans once after the cap and the photos, builds the prompt from the plan, tells the check what text was allowed, and records the plan on the outcome', async () => {
    const f = fakeDeps({ checks: [productText] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', 'check', 'upload']);
    expect(f.prompts[0]).toContain('where such a product really lives: the door of a stainless steel refrigerator, in an office break room.');
    expect(f.prompts[0]).toContain('The ONLY text allowed in the image is what belongs on this product by its nature: a calendar grid with months and dates.');
    expect(f.prompts[0]).toContain('Physically wrong, and not to be shown: stuck to wood or lying flat.');
    expect(f.checkArgs).toEqual(['a calendar grid with months and dates']);
    // Readable text that is the product's own passes.
    expect(out.kind === 'asset' && out.usage?.scene).toEqual(plannedScene);
    expect(out.kind === 'asset' && out.usage?.planner).toEqual({ model: 'gemini-3.5-flash-lite', promptTokens: 190, outputTokens: 154, elapsedMs: 2069 });
    expect(out.notes).toEqual([]);
  });

  it('a planner that fails or is unavailable is a note, and the picture is drawn under the blanket no-text rule', async () => {
    for (const plan of ['fails', null] as const) {
      const f = fakeDeps({ plan });
      const out = await resolveHeaderImage(base, f.deps);
      expect(out.kind).toBe('asset');
      expect(f.prompts[0]).toMatch(/^- No text anywhere/m);
      expect(f.prompts[0]).toContain('arranged in a clean, realistic setting');
      expect(f.checkArgs).toEqual([null]);
      expect(out.notes).toEqual(['the scene planner was unavailable, so the picture was composed without a planned setting and with no text allowed']);
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
    expect(f.log).toEqual(['reserve', 'fetch:tote', 'fetch:zip', 'plan', 'generate:2', 'reserve', 'generate:2', 'check', 'upload']);
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

  it('under a plan whose product carries no text, readable text is still refused', async () => {
    const f = fakeDeps({ plan: { productText: '' }, checks: [productText, clean] });
    const out = await resolveHeaderImage(base, f.deps);
    expect(out.kind).toBe('asset');
    expect(f.checkArgs).toEqual([null, null]);
    expect(f.prompts[1]).toContain('rejected because it contained readable text ("JANUARY 1 2 3")');
  });
});
