/**
 * AUTO-220: the header image chain driven for real with fakes for every
 * effect: the keys, the two caps, the product photos and their screen, the
 * main image model, the title reads, the inventories, the backup model, the
 * stamp, the upload and the clock.
 *
 * What these pin: the ladder (rung by rung, in order), the photos sent (three,
 * none with a well known brand, none off the subject), the title gate (one
 * exact read of three), the brand read-back (asked once more when it got no
 * answer), ONE redraw and never two, the backup model only when the main one
 * FAILS and under the SAME prompt and gates, the cap before anything is
 * spent, Patrick's own instruction (both actions) under the same guards, and
 * that nothing throws.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkAnsweredWithoutVerdict,
  HEADER_IMAGE_BUDGET_MS,
  HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS,
  HEADER_IMAGE_GENERATE_TIMEOUT_MS,
  HEADER_IMAGE_RETRY_MIN_REMAINING_MS,
  noClientHeaderImageDeps,
  resolveHeaderImage,
  shortFailure,
  withDeadline,
  type HeaderImageDeps,
  type ResolveHeaderImageInput,
} from './resolve-header-image';
import { HEADER_IMAGE_PHOTOS, holdBeforePublishReason, type HeaderImageLibraryEntry, type ReferenceProduct } from './header-image';
import { INSTRUCTED_LINE_1, MAX_HEADER_EDITS_IN_A_ROW, NO_DEVICES_LINE, POSTER_LINE_1, SETTING_LINE, TITLE_GATE_READS } from './header-brief';
import { PICTURE_INVENTORY_READS, type PhotoScreen, type PictureInventory } from './brand-screen';
import { GEMINI_IMAGE_MODEL } from '../ai/gemini';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const geiger = (n: number) => `https://imgsirv.geiger.com/master/10${n}/web/10${n}_1.jpg?format=webp&thumbnail=275&w=275&h=275`;
const TITLE = 'Custom Tote Bags for Events: A Buyer’s Guide';
const products: ReferenceProduct[] = [
  { sku: '1', name: 'Canvas Tote', imageUrl: geiger(1) },
  { sku: '2', name: 'Zip Tote', imageUrl: geiger(2) },
  { sku: '3', name: 'Grocery Tote', imageUrl: geiger(3) },
  { sku: '4', name: 'Jumbo Tote', imageUrl: geiger(4) },
];
const library: HeaderImageLibraryEntry[] = [{ rootSlug: 'tote-bags', assetRef: 'image-lib-1600x900-jpg', alt: 'Library totes' }];
const onSubject: PhotoScreen = { imprints: ['Riverside Bank'], logos: [], kind: 'a tote bag', subject: true };
const inventoryOf = (...texts: string[]): PictureInventory => ({ texts: texts.map((text) => ({ text, where: 'product' as const })), logos: [] });

interface FakeOptions {
  readerMissing?: boolean;
  openAiMissing?: boolean;
  capRefused?: boolean;
  fallbackCapRefused?: boolean;
  reserveThrows?: boolean;
  /** Thrown by every draw / by the first draw only. */
  drawFails?: Error;
  drawFailsOnce?: Error;
  /** The title reads PER PICTURE, in the order the pictures are drawn; a picture past the end reads the title exactly. null is "unavailable". */
  titles?: (string | null)[][];
  /** The inventories PER PICTURE; a picture past the end has nothing but its own imprints. */
  inventories?: (PictureInventory | null)[][];
  /** The screen's answer per SKU; a SKU not listed is on the subject with an invented imprint. null is "the reader was unavailable". */
  screens?: Record<string, PhotoScreen | null>;
  photoFetchFails?: boolean;
  uploadFails?: Error;
  stamp?: 'fails' | 'none';
  /** Milliseconds the clock advances per draw (the first one, then the rest). */
  firstDrawMs?: number;
  drawMs?: number;
  /** The backup model. */
  fallbackFails?: Error;
}

function fakeDeps(opts: FakeOptions = {}) {
  const log: string[] = [];
  const prompts: string[] = [];
  const backupPrompts: string[] = [];
  const imageCounts: number[] = [];
  const uploads: { filename: string; contentType: string }[] = [];
  const errors: string[] = [];
  let now = 1_000_000;
  let pictures = 0;
  let draws = 0;
  let titleRead = 0;
  let inventoryRead = 0;
  let reservedOpenAi = 0;
  let reservedFallback = 0;
  const deps: HeaderImageDeps = {
    keyConfigured: () => !opts.readerMissing,
    openAiConfigured: () => !opts.openAiMissing,
    reserveOpenAi: async () => {
      if (opts.reserveThrows) throw new Error('counter down');
      log.push('reserveOpenAi');
      if (opts.capRefused) return { ok: false, reason: 'cap', used: 40, cap: 40, day: '2026-11-14', message: 'The daily limit of 40 header pictures has been reached, so no picture was made.' };
      reservedOpenAi += 1;
      return { ok: true, used: reservedOpenAi, cap: 40, day: '2026-11-14' };
    },
    reserve: async () => {
      log.push('reserveFallback');
      if (opts.fallbackCapRefused) return { ok: false, reason: 'cap', used: 20, cap: 20, day: '2026-11-14', message: 'The daily limit of 20 generated header images has been reached.' };
      reservedFallback += 1;
      return { ok: true, used: reservedFallback, cap: 20, day: '2026-11-14' };
    },
    fetchReference: async (url) => {
      const sku = /\/10(\d)\//.exec(url)?.[1] ?? '?';
      log.push(`fetch:${sku}`);
      if (opts.photoFetchFails) return null;
      return { mimeType: 'image/webp', base64: `photo${sku}` };
    },
    screenPhoto: async (photo) => {
      const sku = photo.base64.replace('photo', '');
      log.push(`screen:${sku}`);
      const screens = opts.screens ?? {};
      return sku in screens ? screens[sku] : onSubject;
    },
    draw: async ({ prompt, images }) => {
      draws += 1;
      log.push(`draw:${images.length}`);
      prompts.push(prompt);
      imageCounts.push(images.length);
      now += draws === 1 && opts.firstDrawMs !== undefined ? opts.firstDrawMs : opts.drawMs ?? 27_000;
      if (opts.drawFails) throw opts.drawFails;
      if (opts.drawFailsOnce && draws === 1) throw opts.drawFailsOnce;
      pictures += 1;
      titleRead = 0;
      inventoryRead = 0;
      return { bytes: Buffer.from(`picture${pictures}`), mimeType: 'image/jpeg', base64: `cGljdHVyZQ${pictures}`, usage: { imageTokens: 924, promptTokens: 3140, elapsedMs: 27_000, model: 'gpt-image-2.6-sunburst', usd: 0.0528 } };
    },
    readTitle: async () => {
      log.push('readTitle');
      const forPicture = opts.titles?.[pictures - 1];
      const answer = forPicture ? forPicture[titleRead] : TITLE;
      titleRead += 1;
      return answer === undefined ? TITLE : answer;
    },
    readInventory: async () => {
      log.push('readInventory');
      const forPicture = opts.inventories?.[pictures - 1];
      const answer = forPicture ? forPicture[inventoryRead] : inventoryOf('Riverside Bank');
      inventoryRead += 1;
      return answer === undefined ? inventoryOf('Riverside Bank') : answer;
    },
    generate: async ({ prompt, references, model }) => {
      log.push(`fallback:${model}:${references.length}`);
      backupPrompts.push(prompt);
      now += 20_000;
      if (opts.fallbackFails) throw opts.fallbackFails;
      // A backup picture is a picture like any other: the reads that follow are its own.
      pictures += 1;
      titleRead = 0;
      inventoryRead = 0;
      return { bytes: Buffer.from(`backup${pictures}`), mimeType: 'image/jpeg', base64: `YmFja3Vw${pictures}`, usage: { imageTokens: 1120, promptTokens: 1900, elapsedMs: 20_000, model, usd: 0.138 } };
    },
    upload: async (bytes, filename, contentType) => {
      if (opts.uploadFails) throw opts.uploadFails;
      uploads.push({ filename, contentType });
      log.push(`upload:${filename}`);
      return `image-${Buffer.from(bytes).toString('hex').slice(0, 12)}${uploads.length}-1536x864-${contentType === 'image/png' ? 'png' : 'jpg'}`;
    },
    now: () => now,
  };
  if (opts.stamp !== 'none') {
    deps.stamp = async (picture) => {
      log.push('stamp');
      if (opts.stamp === 'fails') throw new Error('resvg could not start. It will be reported');
      return {
        bytes: Buffer.from(`stamped:${picture.base64}`),
        mimeType: 'image/png',
        placement: { corner: 'bottom-right', rect: { x: 1359, y: 707, w: 123, h: 103 }, variant: 'colour', contrast: 12, busyness: 0.05, halo: null },
        canvas: { width: 1536, height: 864 },
        ms: 700,
      };
    };
  }
  return { deps, log, prompts, backupPrompts, imageCounts, uploads, errors, advance: (ms: number) => (now += ms), draws: () => draws };
}

function input(over: Partial<ResolveHeaderImageInput> = {}): ResolveHeaderImageInput {
  return { source: 'ai', title: TITLE, topic: 'custom tote bags', products, rootSlugs: ['tote-bags'], library: [], slug: 'custom-tote-bags-for-events', ...over };
}

describe('the first picture of a post (AUTO-220)', () => {
  it("is drawn from Patrick's two lines and nothing else, with three photos, and stored with the title, the rung and the copy without the mark", async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    if (out.kind !== 'asset') return;
    expect(out.source).toBe('ai');
    // The bare prompt: two lines, the title in quotes, nothing after them.
    expect(f.prompts).toEqual([`Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image`]);
    expect(f.imageCounts).toEqual([HEADER_IMAGE_PHOTOS]);
    expect(HEADER_IMAGE_PHOTOS).toBe(3);
    // What is written onto the post.
    expect(out.image.titleOnImage).toBe(TITLE);
    expect(out.image.ladderRung).toBe(1);
    expect(out.image.editCount).toBeUndefined();
    expect(out.image.alt).toBe(`${TITLE}. Blog header picture showing custom tote bags`);
    // Two assets: the stamped PNG is the header, the model's own bytes are kept beside it.
    expect(f.uploads).toEqual([
      { filename: 'custom-tote-bags-for-events-header.png', contentType: 'image/png' },
      { filename: 'custom-tote-bags-for-events-header-photo.jpg', contentType: 'image/jpeg' },
    ]);
    expect(out.image.unmarkedImage?.asset._ref).toBeTruthy();
    expect(out.image.unmarkedImage?.asset._ref).not.toBe(out.image.asset._ref);
    expect(out.usage).toMatchObject({ model: 'gpt-image-2.6-sunburst', attempts: 1, mode: 'ladder', rung: 1, usd: 0.0528, capUsed: 1, cap: 40, titleReads: { answered: 3, exact: 3 }, photos: { fetched: 4, brand: 0, offSubject: 0, sent: 3 }, mark: { corner: 'bottom-right', variant: 'colour' } });
    expect(out.notes).toEqual([]);
  });

  it('reserves the cap BEFORE a photo is fetched or read, and reads the picture before it is stamped or stored', async () => {
    const f = fakeDeps();
    await resolveHeaderImage(input(), f.deps);
    const at = (what: string) => f.log.findIndex((l) => l.startsWith(what));
    expect(at('reserveOpenAi')).toBe(0);
    expect(at('reserveOpenAi')).toBeLessThan(at('fetch:'));
    expect(at('fetch:')).toBeLessThan(at('screen:'));
    expect(at('screen:')).toBeLessThan(at('draw:'));
    expect(at('draw:')).toBeLessThan(at('readTitle'));
    expect(f.log.filter((l) => l === 'readTitle')).toHaveLength(TITLE_GATE_READS);
    expect(f.log.filter((l) => l === 'readInventory')).toHaveLength(PICTURE_INVENTORY_READS);
    expect(Math.max(f.log.lastIndexOf('readTitle'), f.log.lastIndexOf('readInventory'))).toBeLessThan(at('stamp'));
    expect(at('stamp')).toBeLessThan(at('upload:'));
    // The backup model and its cap are never touched on the main path.
    expect(f.log.some((l) => l.startsWith('fallback') || l === 'reserveFallback')).toBe(false);
  });
});

describe('the ladder: every Generate again takes the next treatment, in this order', () => {
  const block = (line1: string) => `\n\n${[line1, NO_DEVICES_LINE, SETTING_LINE].join('\n')}`;
  const bare = `Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image`;

  it('no picture yet: the bare prompt; then the reworded poster; then the instructed version; then round again', async () => {
    const drawn: { prompt: string; rung: unknown }[] = [];
    let previous: unknown;
    for (let i = 0; i < 5; i += 1) {
      const f = fakeDeps();
      const out = await resolveHeaderImage(input({ previousRung: previous }), f.deps);
      if (out.kind !== 'asset') throw new Error('no picture');
      drawn.push({ prompt: f.prompts[0], rung: out.image.ladderRung });
      previous = out.image.ladderRung;
    }
    expect(drawn.map((d) => d.rung)).toEqual([1, 2, 3, 1, 2]);
    expect(drawn[0].prompt).toBe(bare);
    expect(drawn[1].prompt).toBe(bare + block(POSTER_LINE_1));
    expect(drawn[2].prompt).toBe(bare + block(INSTRUCTED_LINE_1));
    expect(drawn[3].prompt).toBe(bare);
    expect(drawn[4].prompt).toBe(drawn[1].prompt);
  });

  it('a stored value that is not a rung (an older picture, garbage) is a first picture', async () => {
    for (const previous of [undefined, null, 0, 4, '2', { layout: 'headline' }, '{"layout":"panel"}']) {
      const f = fakeDeps();
      const out = await resolveHeaderImage(input({ previousRung: previous }), f.deps);
      expect(out.kind === 'asset' && out.image.ladderRung).toBe(1);
    }
  });

  it('there is no rule against invented claims on the bare picture: a caption is not a refusal', async () => {
    const f = fakeDeps({
      inventories: [[{ texts: [{ text: 'Bulk Discounts', where: 'other' }, { text: 'Cost Savings', where: 'other' }, { text: 'BLOG', where: 'other' }], logos: [] }, null]],
    });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.draws()).toBe(1);
    expect(f.prompts[0]).not.toMatch(/claim|caption|badge/i);
  });
});

describe('the product photos', () => {
  it('a photo whose sample imprint is a well known brand is not sent, and the note names it', async () => {
    const f = fakeDeps({ screens: { '2': { imprints: ['DELTA'], logos: [], kind: 'a tote bag', subject: true } } });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.imageCounts).toEqual([3]);
    expect(out.kind === 'asset' && out.usage?.photos).toEqual({ fetched: 4, brand: 1, offSubject: 0, sent: 3 });
    expect(out.notes).toEqual(['one product photo was left out of the picture because its sample logo is a well known brand (Delta)']);
  });

  it("a product's own maker is not a brand hit: a Stanley bottle that says STANLEY is sent", async () => {
    const stanley: ReferenceProduct[] = [{ sku: '1', name: '20 oz Stanley Activate Tote', imageUrl: geiger(1), brand: 'STANLEY' }];
    const f = fakeDeps({ screens: { '1': { imprints: ['STANLEY', 'SHOCK'], logos: ['Stanley'], kind: 'a tote', subject: true } } });
    const out = await resolveHeaderImage(input({ products: stanley }), f.deps);
    expect(f.imageCounts).toEqual([1]);
    expect(out.notes).toEqual([]);
  });

  it('a product that only shares a word with the subject is not sent (the shaker bottles post)', async () => {
    const shakers: ReferenceProduct[] = [
      { sku: '1', name: 'Gourmet Spice and Rub Bottle Shaker', imageUrl: geiger(1) },
      { sku: '2', name: '20 oz Activate Shaker Bottle', imageUrl: geiger(2) },
      { sku: '3', name: 'Connoisseur Shaker & 2 Brisbane Martini', imageUrl: geiger(3) },
      { sku: '4', name: '28 oz Perfect Shaker Bottle', imageUrl: geiger(4) },
    ];
    const f = fakeDeps({
      screens: {
        '1': { imprints: ['Spring Hill Golf Course'], logos: [], kind: 'a spice shaker', subject: false },
        '3': { imprints: ['mio'], logos: [], kind: 'a cocktail shaker and two martini glasses', subject: false },
      },
    });
    const out = await resolveHeaderImage(input({ title: 'Custom Shaker Bottles for Gyms', topic: 'custom shaker bottles', products: shakers }), fakeDepsWithTitle(f, 'Custom Shaker Bottles for Gyms'));
    expect(f.imageCounts).toEqual([2]);
    expect(out.kind === 'asset' && out.usage?.photos).toEqual({ fetched: 4, brand: 0, offSubject: 2, sent: 2 });
  });

  it('a product whose NAME carries no topic word is sent only when the reader says it IS the subject', async () => {
    const mixed: ReferenceProduct[] = [
      { sku: '1', name: 'Convention Carryall', imageUrl: geiger(1) },
      { sku: '2', name: 'Belt Clip', imageUrl: geiger(2) },
      { sku: '3', name: 'Market Shopper', imageUrl: geiger(3) },
    ];
    // 1: the reader confirms; 2: the reader says no; 3: the reader was unavailable, which is not a yes.
    const f = fakeDeps({ screens: { '1': onSubject, '2': { imprints: [], logos: [], kind: 'a belt clip', subject: false }, '3': null } });
    const out = await resolveHeaderImage(input({ products: mixed }), f.deps);
    expect(f.imageCounts).toEqual([1]);
    expect(out.kind === 'asset' && out.usage?.photos).toEqual({ fetched: 3, brand: 0, offSubject: 2, sent: 1 });
  });

  it('a name match is still sent when the reader was unavailable (layer 1 fails open; the finished picture is read in any case)', async () => {
    const f = fakeDeps({ screens: { '1': null, '2': null, '3': null, '4': null } });
    await resolveHeaderImage(input(), f.deps);
    expect(f.imageCounts).toEqual([3]);
  });

  it("with no photo of the subject itself the post's NEAREST real products are sent, never none (the fidget spinners post; Ali, 2026-11-15)", async () => {
    const spinners: ReferenceProduct[] = [
      { sku: '1', name: 'Stretchy Worm', imageUrl: geiger(1) },
      { sku: '2', name: 'Fidget Cube', imageUrl: geiger(2) },
      { sku: '3', name: 'Push Pop Bubble', imageUrl: geiger(3) },
      { sku: '4', name: 'Fidget Pen', imageUrl: geiger(4) },
    ];
    const off = (kind: string): PhotoScreen => ({ imprints: ['Lakeside Dental'], logos: [], kind, subject: false });
    const f = fakeDeps({ screens: { '1': off('a toy worm'), '2': off('a fidget cube'), '3': off('a bubble toy'), '4': off('a pen') } });
    const title = 'Custom Fidget Spinners for Schools';
    const out = await resolveHeaderImage(input({ title, topic: 'custom fidget spinners', products: spinners }), fakeDepsWithTitle(f, title));
    expect(out.kind).toBe('asset');
    // Three real catalogue photos go to the model, and the prompt speaks of them.
    expect(f.imageCounts).toEqual([HEADER_IMAGE_PHOTOS]);
    expect(f.prompts[0]).toBe(`Create a blog header image, "${title}"\n\nUse the attached product photos in the image`);
    // The products whose NAME shares a word with the subject come first (the two fidget ones), then strip order.
    expect(out.kind === 'asset' && out.usage?.photos).toEqual({ fetched: 4, brand: 0, offSubject: 4, sent: 3, nearest: 3 });
    expect(out.notes).toEqual([
      "none of the post's product photos showed the post's subject itself, so its nearest products were used instead (Fidget Cube, Fidget Pen, Stretchy Worm): look at the picture before publishing",
    ]);
  });

  it('the nearest products never include a photo left out for a well known brand', async () => {
    const mixed: ReferenceProduct[] = [
      { sku: '1', name: 'Fidget Cube', imageUrl: geiger(1) },
      { sku: '2', name: 'Fidget Pen', imageUrl: geiger(2) },
    ];
    const f = fakeDeps({
      screens: { '1': { imprints: ['DELTA'], logos: [], kind: 'a fidget cube', subject: false }, '2': { imprints: [], logos: [], kind: 'a pen', subject: false } },
    });
    const title = 'Custom Fidget Spinners for Schools';
    const out = await resolveHeaderImage(input({ title, topic: 'custom fidget spinners', products: mixed }), fakeDepsWithTitle(f, title));
    expect(f.imageCounts).toEqual([1]);
    expect(out.kind === 'asset' && out.usage?.photos).toEqual({ fetched: 2, brand: 1, offSubject: 1, sent: 1, nearest: 1 });
    expect(out.notes[0]).toBe('one product photo was left out of the picture because its sample logo is a well known brand (Delta)');
    expect(out.notes[1]).toContain('its nearest products were used instead (Fidget Pen)');
  });

  it('a photo of the subject is never joined by a nearest one: the rule only applies when there is none', async () => {
    const mixed: ReferenceProduct[] = [
      { sku: '1', name: 'Canvas Tote', imageUrl: geiger(1) },
      { sku: '2', name: 'Tote Clip', imageUrl: geiger(2) },
    ];
    const f = fakeDeps({ screens: { '2': { imprints: [], logos: [], kind: 'a clip', subject: false } } });
    const out = await resolveHeaderImage(input({ products: mixed }), f.deps);
    expect(f.imageCounts).toEqual([1]);
    expect(out.kind === 'asset' && out.usage?.photos).toEqual({ fetched: 2, brand: 0, offSubject: 1, sent: 1 });
    expect(out.notes).toEqual([]);
  });

  it('with no photo at all the picture is drawn from the title alone, the prompt does not speak of attached photos, and the note says so', async () => {
    const f = fakeDeps({ photoFetchFails: true });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.imageCounts).toEqual([0]);
    expect(f.prompts[0]).toBe(`Create a blog header image, "${TITLE}"`);
    expect(out.notes).toEqual([
      "the post has no product photo to send, so the picture was drawn from the title alone: the products on it are the image model's own, not items from the catalogue, so look at it before publishing",
    ]);
    const none = fakeDeps();
    const bare = await resolveHeaderImage(input({ products: [] }), none.deps);
    expect(none.imageCounts).toEqual([0]);
    expect(bare.notes[0]).toContain('the post has no product photo to send');
    const g = fakeDeps({ screens: { '1': { imprints: ['Sprint'], logos: [], kind: 'a tote', subject: true } } });
    const only = await resolveHeaderImage(input({ products: products.slice(0, 1) }), g.deps);
    expect(g.imageCounts).toEqual([0]);
    expect(only.notes).toEqual([
      'one product photo was left out of the picture because its sample logo is a well known brand (Sprint)',
      "that left no product photo to send, so the picture was drawn from the title alone: the products on it are the image model's own, not items from the catalogue, so look at it before publishing",
    ]);
  });

  // Ali, 2026-11-15: a title-alone picture holds the post as a draft in publish mode, the way an unanswered brand check does.
  it('a title-alone picture is one that must not publish itself; a picture drawn from real photos, the nearest ones included, may', async () => {
    const reason = "its header picture was drawn from the title alone, with no product photo sent, so the products on it are the image model's own and not items from the catalogue";
    const noFetch = await resolveHeaderImage(input(), fakeDeps({ photoFetchFails: true }).deps);
    expect(noFetch.kind === 'asset' && noFetch.usage?.photos).toEqual({ fetched: 0, brand: 0, offSubject: 0, sent: 0 });
    expect(holdBeforePublishReason(noFetch)).toBe(reason);
    expect(holdBeforePublishReason(await resolveHeaderImage(input({ products: [] }), fakeDeps().deps))).toBe(reason);
    const allBrand = fakeDeps({ screens: { '1': { imprints: ['Sprint'], logos: [], kind: 'a tote', subject: true } } });
    expect(holdBeforePublishReason(await resolveHeaderImage(input({ products: products.slice(0, 1) }), allBrand.deps))).toBe(reason);

    const real = await resolveHeaderImage(input(), fakeDeps().deps);
    expect(real.kind === 'asset' && real.usage?.photos?.sent).toBe(3);
    expect(holdBeforePublishReason(real)).toBeNull();
    const offSubject = { imprints: [], logos: [], kind: 'a fidget toy', subject: false };
    const nearest = await resolveHeaderImage(input(), fakeDeps({ screens: { '1': offSubject, '2': offSubject, '3': offSubject, '4': offSubject } }).deps);
    expect(nearest.kind === 'asset' && nearest.usage?.photos?.nearest).toBe(3);
    expect(holdBeforePublishReason(nearest)).toBeNull();
  });
});

describe('the title gate: one exact read of three', () => {
  it('passes on ONE exact read, whatever the other two said', async () => {
    const f = fakeDeps({ titles: [['Reasons to Use Tote Bags', TITLE, 'A Buyer’s Guide']] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.draws()).toBe(1);
    expect(out.kind === 'asset' && out.usage?.titleReads).toEqual({ answered: 3, exact: 1 });
  });

  it('a title that never reads exactly is drawn ONCE more, with the exact title asked for, and the second picture is used', async () => {
    const wrong = 'Custom Tote Bags for Event: A Buyer’s Guide';
    const f = fakeDeps({ titles: [[wrong, wrong, wrong]] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.draws()).toBe(2);
    expect(f.prompts[1]).toContain(f.prompts[0]);
    expect(f.prompts[1]).toContain(`The title on the picture must read exactly, letter for letter: "${TITLE}"`);
    expect(f.log.filter((l) => l === 'reserveOpenAi')).toHaveLength(2);
    expect(out.notes).toEqual([`the first picture did not carry the title exactly (it read "${wrong}") and was drawn again`]);
    expect(out.kind === 'asset' && out.usage).toMatchObject({ attempts: 2, usd: 0.1056 });
    // The second picture's files are numbered.
    expect(f.uploads.map((u) => u.filename)).toEqual(['custom-tote-bags-for-events-header-2.png', 'custom-tote-bags-for-events-header-2-photo.jpg']);
  });

  it('NEVER a third picture: two refusals fall to the next source', async () => {
    const wrong = 'Custom Tote Bags';
    const f = fakeDeps({ titles: [[wrong, wrong, wrong], [wrong, wrong, wrong], [TITLE, TITLE, TITLE]] });
    const out = await resolveHeaderImage(input({ library }), f.deps);
    expect(f.draws()).toBe(2);
    expect(out.kind === 'asset' && out.source).toBe('library');
    expect(out.notes[0]).toBe(`both pictures were refused, so neither was used: the first did not carry the title exactly (it read "${wrong}"); the second did not carry the title exactly (it read "${wrong}")`);
    expect(f.uploads).toEqual([]);
  });

  it('with NO read back the picture is not used, is not drawn again, and it is said loudly', async () => {
    const loud: string[] = [];
    const f = fakeDeps({ titles: [[null, null, null]] });
    const out = await resolveHeaderImage(input({ logError: (l) => loud.push(l) }), f.deps);
    expect(out.kind).toBe('url');
    expect(f.draws()).toBe(1);
    expect(out.notes[0]).toContain('could not be read back');
    expect(loud.join(' ')).toContain('NO TITLE READ CAME BACK');
    expect(f.uploads).toEqual([]);
  });

  it('an answer with nothing usable in it counts as a read that did not match', async () => {
    const f = fakeDeps({ titles: [['', '', '']] });
    await resolveHeaderImage(input(), f.deps);
    expect(f.draws()).toBe(2);
  });
});

describe('the brand read-back', () => {
  it('a well known brand on the finished picture is ONE redraw that names it, even when no photo carried it', async () => {
    // The pens case: the photo said DURAFLOW and the picture says DUNLOP.
    const f = fakeDeps({ inventories: [[inventoryOf('Riverside Bank', 'DUNLOP'), inventoryOf('Riverside Bank')]] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.draws()).toBe(2);
    expect(f.prompts[1]).toContain('The previous picture showed "Dunlop". That name must not appear anywhere in the picture');
    expect(f.prompts[1]).not.toContain('must read exactly, letter for letter');
    expect(out.notes).toEqual(['the first picture showed the name of a well known brand (Dunlop) and was drawn again']);
  });

  it('a brand on both pictures: neither is used', async () => {
    const hit = [inventoryOf('Duluth Trading'), null];
    const f = fakeDeps({ inventories: [hit, hit] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.draws()).toBe(2);
    expect(out.kind).toBe('url');
    expect(out.notes[0]).toContain('the first showed the name of a well known brand (Duluth Trading); the second showed the name of a well known brand (Duluth Trading)');
  });

  it('a logo the reader recognised with no words is a hit too', async () => {
    const f = fakeDeps({ inventories: [[{ texts: [], logos: ['Apple logo on a laptop lid'] }, null]] });
    await resolveHeaderImage(input(), f.deps);
    expect(f.draws()).toBe(2);
    expect(f.prompts[1]).toContain('"Apple"');
  });

  it('the post\'s own products\' makers and the title\'s own words are not hits', async () => {
    const koozie: ReferenceProduct[] = [{ sku: '1', name: 'Koozie Tote Cooler', imageUrl: geiger(1), brand: 'KOOZIE' }];
    const f = fakeDeps({ inventories: [[inventoryOf('KOOZIE', 'Yeti'), null]] });
    const out = await resolveHeaderImage(input({ title: 'Yeti Style Tote Coolers', products: koozie, topic: 'tote coolers' }), fakeDepsWithTitle(f, 'Yeti Style Tote Coolers'));
    expect(out.kind).toBe('asset');
    expect(f.draws()).toBe(1);
  });

  it('a check that answered is never asked twice', async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.log.filter((l) => l === 'readInventory')).toHaveLength(PICTURE_INVENTORY_READS);
    expect(out.kind === 'asset' && out.usage?.brandCheckMade).toBe(true);
    expect(holdBeforePublishReason(out)).toBeNull();
  });

  it('a brand check that got NO answer is asked ONCE more, and an answer the second time is a check made (Ali, 2026-11-15)', async () => {
    const f = fakeDeps({ inventories: [[null, null, inventoryOf('Riverside Bank'), null]] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log.filter((l) => l === 'readInventory')).toHaveLength(PICTURE_INVENTORY_READS * 2);
    expect(f.draws()).toBe(1);
    expect(out.notes).toEqual([]);
    expect(out.kind === 'asset' && out.usage?.brandCheckMade).toBe(true);
    expect(holdBeforePublishReason(out)).toBeNull();
  });

  it('the second ask still judges: a well known brand it finds is the one redraw', async () => {
    const f = fakeDeps({ inventories: [[null, null, inventoryOf('Sprint'), null]] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.draws()).toBe(2);
    expect(f.prompts[1]).toContain('The previous picture showed "Sprint"');
    expect(out.kind).toBe('asset');
  });

  it('no answer TWICE: the picture is kept, never asked a third time, and the post is to be held as a draft, not published', async () => {
    const f = fakeDeps({ inventories: [[null, null, null, null]] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.draws()).toBe(1);
    expect(f.log.filter((l) => l === 'readInventory')).toHaveLength(PICTURE_INVENTORY_READS * 2);
    expect(out.notes).toEqual(['the brand check of the picture could not be made (the reading model did not answer it, asked twice); look at the logos on it before publishing']);
    expect(out.kind === 'asset' && out.usage?.brandCheckMade).toBe(false);
    expect(holdBeforePublishReason(out)).toBe('the brand check of its header picture could not be made (the reading model did not answer, asked twice), so the logos on the picture are unchecked');
  });

  it('a picture already refused for its title is not asked for its brands a second time', async () => {
    const f = fakeDeps({ titles: [['x', 'x', 'x']], inventories: [[null, null]] });
    await resolveHeaderImage(input(), f.deps);
    // Picture 1: two inventories and no retry (it is being redrawn for the title). Picture 2: two that answer.
    expect(f.log.filter((l) => l === 'readInventory')).toHaveLength(PICTURE_INVENTORY_READS * 2);
    expect(f.draws()).toBe(2);
  });

  it('the title is judged first: a picture with a wrong title AND a brand is redrawn for the title', async () => {
    const f = fakeDeps({ titles: [['x', 'x', 'x']], inventories: [[inventoryOf('Sprint'), null]] });
    await resolveHeaderImage(input(), f.deps);
    expect(f.prompts[1]).toContain('must read exactly, letter for letter');
    expect(f.prompts[1]).not.toContain('Sprint');
  });
});

/** The same deps with every title read answering another title (for a case with its own title). */
function fakeDepsWithTitle(f: ReturnType<typeof fakeDeps>, title: string): HeaderImageDeps {
  return { ...f.deps, readTitle: async () => title };
}

describe('the cap', () => {
  it('a refused slot spends nothing: no photo, no picture, no fallback model; the refusal is the note', async () => {
    const f = fakeDeps({ capRefused: true });
    const out = await resolveHeaderImage(input({ library }), f.deps);
    expect(f.log).toEqual(['reserveOpenAi']);
    expect(out.kind === 'asset' && out.source).toBe('library');
    expect(out.notes).toEqual(['The daily limit of 40 header pictures has been reached, so no picture was made.']);
  });

  it('a counter that cannot be reached draws nothing', async () => {
    const f = fakeDeps({ reserveThrows: true });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.draws()).toBe(0);
    expect(out.notes[0]).toBe('the daily-limit counter could not be reached (counter down), so no image was generated');
  });

  it('a redraw takes a second slot: the cap counts attempts', async () => {
    const f = fakeDeps({ titles: [['x', 'x', 'x']] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind === 'asset' && out.usage?.capUsed).toBe(2);
  });
});

describe('the backup model draws the SAME kind of picture when the main one FAILS (Ali, 2026-11-15)', () => {
  const bare = `Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image`;

  it("an OpenAI failure on the first attempt: the backup model is sent Patrick's two lines and the same three photos, and its picture carries the title", async () => {
    const f = fakeDeps({ drawFails: new Error('Image request failed (500). upstream said: internal error at ...') });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    if (out.kind !== 'asset') return;
    expect(f.draws()).toBe(1);
    expect(f.log.filter((l) => l.startsWith('fallback:'))).toEqual([`fallback:${GEMINI_IMAGE_MODEL}:${HEADER_IMAGE_PHOTOS}`]);
    // The prompt measured on this model (CHECK-openai-image-api, the follow-up): the two lines and nothing else.
    expect(f.backupPrompts).toEqual([bare]);
    // The same gates as any picture: the title is read back and so are the brands.
    expect(f.log.filter((l) => l === 'readTitle')).toHaveLength(TITLE_GATE_READS);
    expect(f.log.filter((l) => l === 'readInventory')).toHaveLength(PICTURE_INVENTORY_READS);
    expect(f.log.indexOf(`fallback:${GEMINI_IMAGE_MODEL}:${HEADER_IMAGE_PHOTOS}`)).toBeLessThan(f.log.indexOf('readTitle'));
    // What is written onto the post is what the main model's picture gets.
    expect(out.image.titleOnImage).toBe(TITLE);
    expect(out.image.alt).toBe(`${TITLE}. Blog header picture showing custom tote bags`);
    expect(out.image.ladderRung).toBe(1);
    expect(out.image.unmarkedImage?.asset._ref).toBeTruthy();
    expect(out.usage).toMatchObject({ mode: 'fallback', model: GEMINI_IMAGE_MODEL, attempts: 2, rung: 1, usd: 0.138, capUsed: 1, cap: 20, titleReads: { answered: 3, exact: 3 }, photos: { fetched: 4, brand: 0, offSubject: 0, sent: 3 }, brandCheckMade: true });
    expect(f.log).toContain('stamp');
    expect(out.notes).toEqual([
      'the main image model failed (Image request failed (500).)',
      'the backup image model drew this picture; press Generate another header image to try the main model again',
    ]);
    // The photos were fetched once, for the main model, and reused.
    expect(f.log.filter((l) => l.startsWith('fetch:'))).toHaveLength(4);
  });

  it('the backup model is sent the two lines whatever rung the ladder is on, and the ladder still moves', async () => {
    const f = fakeDeps({ drawFails: new Error('Image request failed (500).') });
    const out = await resolveHeaderImage(input({ previousRung: 1 }), f.deps);
    expect(f.backupPrompts).toEqual([bare]);
    expect(out.kind === 'asset' && out.image.ladderRung).toBe(2);
  });

  it('a photo left out for a well known brand is not sent to the backup model either', async () => {
    const f = fakeDeps({
      drawFails: new Error('Image request failed (500).'),
      screens: { '2': { imprints: ['DELTA'], logos: [], kind: 'a tote bag', subject: true }, '3': { imprints: ['Sprint'], logos: [], kind: 'a tote bag', subject: true } },
    });
    await resolveHeaderImage(input(), f.deps);
    expect(f.log.filter((l) => l.startsWith('fallback:'))).toEqual([`fallback:${GEMINI_IMAGE_MODEL}:2`]);
  });

  it('its title is gated like any other: a title that does not read exactly after an OpenAI failure is not used, and nothing more is drawn', async () => {
    const wrong = 'Custom Tote Bags for Events';
    const f = fakeDeps({ drawFails: new Error('Image request failed (500).'), titles: [[wrong, wrong, wrong]] });
    const out = await resolveHeaderImage(input({ library }), f.deps);
    expect(f.log.filter((l) => l.startsWith('fallback:'))).toHaveLength(1);
    expect(f.draws()).toBe(1);
    expect(out.kind === 'asset' && out.source).toBe('library');
    expect(out.notes).toEqual([
      'the main image model failed (Image request failed (500).)',
      `the backup model's picture did not carry the title exactly (it read "${wrong}"), so it was not used`,
    ]);
    expect(f.uploads).toEqual([]);
  });

  it('its brands are read back like any other: a well known brand on it and it is not used', async () => {
    const f = fakeDeps({ drawFails: new Error('Image request failed (500).'), inventories: [[inventoryOf('Sprint'), null]] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('url');
    expect(out.notes[1]).toBe("the backup model's picture showed the name of a well known brand (Sprint), so it was not used");
  });

  it('with NO read back its picture is not used either', async () => {
    const loud: string[] = [];
    const f = fakeDeps({ drawFails: new Error('Image request failed (500).'), titles: [[null, null, null]] });
    const out = await resolveHeaderImage(input({ logError: (l) => loud.push(l) }), f.deps);
    expect(out.kind).toBe('url');
    expect(out.notes[1]).toContain('could not be read back');
    expect(loud.join(' ')).toContain('NO TITLE READ CAME BACK');
  });

  it('no OpenAI key: the backup model draws straight away on its own cap, and a wrong title is ONE redraw on it', async () => {
    const f = fakeDeps({ openAiMissing: true, titles: [['x', 'x', 'x']] });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.draws()).toBe(0);
    expect(f.log[0]).toBe('reserveFallback');
    expect(f.log).not.toContain('reserveOpenAi');
    expect(f.log.filter((l) => l === 'reserveFallback')).toHaveLength(2);
    expect(f.backupPrompts).toHaveLength(2);
    expect(f.backupPrompts[0]).toBe(bare);
    expect(f.backupPrompts[1]).toContain(`The title on the picture must read exactly, letter for letter: "${TITLE}"`);
    expect(out.kind === 'asset' && out.usage).toMatchObject({ mode: 'fallback', attempts: 2, usd: 0.276, capUsed: 2, cap: 20 });
    expect(out.notes).toEqual([
      'the main image service is not set up (OPENAI_API_KEY is missing on the server)',
      'the first picture did not carry the title exactly (it read "x") and was drawn again',
      'the backup image model drew this picture',
    ]);
  });

  it('no OpenAI key: two refused pictures and neither is used; never a third', async () => {
    const f = fakeDeps({ openAiMissing: true, titles: [['x', 'x', 'x'], ['x', 'x', 'x'], [TITLE, TITLE, TITLE]] });
    const out = await resolveHeaderImage(input({ library }), f.deps);
    expect(f.backupPrompts).toHaveLength(2);
    expect(out.kind === 'asset' && out.source).toBe('library');
    expect(out.notes[1]).toContain('both pictures were refused, so neither was used');
  });

  it('the backup model is never a third attempt: a refused first picture and then a failure draws nothing more', async () => {
    const f = fakeDeps({ titles: [['x', 'x', 'x']], drawFails: undefined });
    let n = 0;
    const deps: HeaderImageDeps = {
      ...f.deps,
      draw: async (args) => {
        n += 1;
        if (n === 2) throw new Error('Image request failed (503).');
        return f.deps.draw(args);
      },
    };
    const out = await resolveHeaderImage(input(), deps);
    expect(n).toBe(2);
    expect(f.log.some((l) => l.startsWith('fallback:'))).toBe(false);
    expect(out.notes[0]).toBe('the first picture did not carry the title exactly (it read "x"), and then the image model failed: Image request failed (503).');
  });

  it('a refused picture never goes to the backup model, and a cap refusal never does', async () => {
    const f = fakeDeps({ titles: [['x', 'x', 'x'], ['x', 'x', 'x']] });
    await resolveHeaderImage(input(), f.deps);
    expect(f.log.some((l) => l.startsWith('fallback:'))).toBe(false);
    const capped = fakeDeps({ capRefused: true });
    await resolveHeaderImage(input(), capped.deps);
    expect(capped.log.some((l) => l.startsWith('fallback:') || l === 'reserveFallback')).toBe(false);
  });

  it("the backup model's own cap refusing is a note, and nothing is fetched, read or drawn", async () => {
    const capped = fakeDeps({ openAiMissing: true, fallbackCapRefused: true });
    const none = await resolveHeaderImage(input(), capped.deps);
    expect(capped.log).toEqual(['reserveFallback']);
    expect(none.notes).toContain('The daily limit of 20 generated header images has been reached.');
  });

  it('both models failing is two notes and the next source', async () => {
    const f = fakeDeps({ drawFails: new Error('Image request failed (500).'), fallbackFails: new Error('Image request failed (503). overloaded') });
    const out = await resolveHeaderImage(input({ library }), f.deps);
    expect(out.kind === 'asset' && out.source).toBe('library');
    expect(out.notes).toEqual(['the main image model failed (Image request failed (500).)', 'the backup image model failed too: Image request failed (503).']);
    const noKey = fakeDeps({ openAiMissing: true, fallbackFails: new Error('Image request failed (503).') });
    const other = await resolveHeaderImage(input(), noKey.deps);
    expect(other.notes[1]).toBe('the backup image model failed: Image request failed (503).');
    expect(noKey.backupPrompts).toHaveLength(1);
  });
});

describe('the keys', () => {
  it('no reader key: nothing is drawn and no slot is spent, because no picture is used unread', async () => {
    const f = fakeDeps({ readerMissing: true });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.log).toEqual([]);
    expect(out.notes[0]).toBe('the picture checker is not set up (GOOGLE_GEMINI_API_KEY is missing on the server), and no picture is used unread, so none was generated');
  });

  it('no write client: nothing is drawn', async () => {
    const out = await resolveHeaderImage(input({ clientMissing: true }), noClientHeaderImageDeps());
    expect(out.kind).toBe('url');
    expect(out.notes[0]).toBe('the server has no Sanity write access, so no image could be generated');
  });
});

describe('the budget is a deadline, and one redraw is all it holds', () => {
  it('the constants: 100 s, a picture inside it, and a redraw needs most of half of it', () => {
    expect(HEADER_IMAGE_BUDGET_MS).toBe(100_000);
    expect(HEADER_IMAGE_GENERATE_TIMEOUT_MS).toBeLessThan(HEADER_IMAGE_BUDGET_MS / 2);
    // Two redraws cannot fit: the first picture and two more minimum-remaining windows exceed the budget.
    expect(HEADER_IMAGE_RETRY_MIN_REMAINING_MS * 2 + 27_000).toBeGreaterThan(HEADER_IMAGE_BUDGET_MS);
    expect(HEADER_IMAGE_FALLBACK_MIN_REMAINING_MS).toBeLessThan(HEADER_IMAGE_BUDGET_MS / 2);
  });

  it('a slow first picture leaves no time for a redraw: the note says so and nothing more is spent', async () => {
    const f = fakeDeps({ titles: [['x', 'x', 'x']], firstDrawMs: 60_000 });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.draws()).toBe(1);
    expect(f.log.filter((l) => l === 'reserveOpenAi')).toHaveLength(1);
    expect(out.notes[0]).toBe('the first picture did not carry the title exactly (it read "x"), and there was no time left in the image budget to draw it again');
  });

  it('a slow failure leaves no time for the fallback model', async () => {
    const f = fakeDeps({ drawFails: new Error('The image model did not answer within 45 seconds.'), firstDrawMs: 70_000 });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(f.log.some((l) => l.startsWith('fallback:'))).toBe(false);
    expect(out.notes).toContain('there was no time left in the image budget for the backup image model');
  });

  it('withDeadline gives up when the time is gone and passes a value or an error through when it is not', async () => {
    await expect(withDeadline(new Promise(() => {}), 20, 'the thing')).rejects.toThrow('the thing gave up after 0 s (the image budget)');
    await expect(withDeadline(Promise.resolve(1), 0, 'the thing')).rejects.toThrow('the thing skipped: the image budget is spent');
    await expect(withDeadline(Promise.resolve(7), 1_000, 'x')).resolves.toBe(7);
    await expect(withDeadline(Promise.reject(new Error('no')), 1_000, 'x')).rejects.toThrow('no');
  });
});

describe('the P! mark and the upload', () => {
  it('a stamp that fails never costs the picture: it is stored as drawn, the note says so, and it is said loudly', async () => {
    const loud: string[] = [];
    const f = fakeDeps({ stamp: 'fails' });
    const out = await resolveHeaderImage(input({ logError: (l) => loud.push(l) }), f.deps);
    expect(out.kind).toBe('asset');
    if (out.kind !== 'asset') return;
    expect(f.uploads).toEqual([{ filename: 'custom-tote-bags-for-events-header.jpg', contentType: 'image/jpeg' }]);
    // One asset: it is its own copy without the mark.
    expect(out.image.unmarkedImage?.asset._ref).toBe(out.image.asset._ref);
    expect(out.usage?.mark).toBeNull();
    expect(out.notes).toEqual(['the P! mark could not be put on the picture (resvg could not start.), so it is stored without it']);
    expect(loud.join(' ')).toContain('THE P! MARK COULD NOT BE STAMPED');
  });

  it('with no time left the mark is skipped rather than the picture lost', async () => {
    const f = fakeDeps({ firstDrawMs: 97_000 });
    const out = await resolveHeaderImage(input(), f.deps);
    expect(out.kind).toBe('asset');
    expect(f.log).not.toContain('stamp');
    expect(out.notes[0]).toContain('no time left in the image budget to put the P! mark on the picture');
  });

  it('a picture that cannot be saved is a note and the next source', async () => {
    const f = fakeDeps({ uploadFails: new Error('Insufficient permissions') });
    const out = await resolveHeaderImage(input({ library }), f.deps);
    expect(out.kind === 'asset' && out.source).toBe('library');
    expect(out.notes[0]).toBe('the generated picture could not be saved: Insufficient permissions');
  });
});

describe("Patrick's own instruction (AUTO-220)", () => {
  const WORDS = 'Show the bags on a trade show table with a blue band across the top';

  it('"make a new one": his words take the place of the ladder\'s block, with the same photos, and the ladder does not move', async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage(input({ mode: 'instruction', instruction: `  ${WORDS}  `, previousRung: 2 }), f.deps);
    expect(out.kind).toBe('asset');
    if (out.kind !== 'asset') return;
    expect(f.prompts).toEqual([`Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image\n\n${WORDS}`]);
    expect(f.imageCounts).toEqual([3]);
    expect(out.image.ladderRung).toBe(2);
    expect(out.image.titleOnImage).toBe(TITLE);
    expect(out.usage?.mode).toBe('instruction');
    expect(f.log).toContain('stamp');
  });

  it('"change this picture": the current picture is the ONE image sent, no photo is fetched, and the change is counted', async () => {
    const f = fakeDeps();
    const base = { mimeType: 'image/jpeg', base64: 'Y3VycmVudA' };
    const out = await resolveHeaderImage(input({ mode: 'edit', instruction: 'Make the background a beach at sunset', editBase: base, editCount: 1, previousRung: 3 }), f.deps);
    expect(out.kind).toBe('asset');
    if (out.kind !== 'asset') return;
    expect(f.imageCounts).toEqual([1]);
    expect(f.log.some((l) => l.startsWith('fetch:') || l.startsWith('screen:'))).toBe(false);
    expect(f.prompts[0]).toBe(
      `Change the attached blog header image as follows: Make the background a beach at sunset\n\nKeep everything else in the picture as it is. The title on the picture must read exactly: "${TITLE}"`,
    );
    expect(out.image.editCount).toBe(2);
    expect(out.image.ladderRung).toBe(3);
    expect(out.usage?.mode).toBe('edit');
  });

  it('his instruction does not switch the guards off: the title gate, the brand read-back, the cap and the mark all run', async () => {
    for (const mode of ['instruction', 'edit'] as const) {
      const f = fakeDeps({ titles: [['wrong', 'wrong', 'wrong']], inventories: [[null, null], [inventoryOf('Sprint'), null]] });
      const out = await resolveHeaderImage(input({ mode, instruction: 'no title please', editBase: { mimeType: 'image/jpeg', base64: 'eA' } }), f.deps);
      // First picture: the title gate refuses it. Second: the brand read-back refuses it. Nothing is used.
      expect(f.draws()).toBe(2);
      expect(f.log.filter((l) => l === 'reserveOpenAi')).toHaveLength(2);
      expect(out.kind).toBe('none');
      expect(f.uploads).toEqual([]);
    }
    const ok = fakeDeps();
    await resolveHeaderImage(input({ mode: 'instruction', instruction: 'x' }), ok.deps);
    expect(ok.log).toContain('stamp');
    const capped = fakeDeps({ capRefused: true });
    const refused = await resolveHeaderImage(input({ mode: 'edit', instruction: 'x', editBase: { mimeType: 'image/jpeg', base64: 'eA' } }), capped.deps);
    expect(refused.kind).toBe('none');
    expect(capped.draws()).toBe(0);
  });

  it('it is an AI picture or nothing: no fallback model, no library picture, no product photo', async () => {
    for (const mode of ['instruction', 'edit'] as const) {
      const f = fakeDeps({ drawFails: new Error('Image request failed (500).') });
      const out = await resolveHeaderImage(input({ mode, instruction: 'x', editBase: { mimeType: 'image/jpeg', base64: 'eA' }, library }), f.deps);
      expect(out.kind).toBe('none');
      expect(f.log.some((l) => l.startsWith('fallback:'))).toBe(false);
      expect(out.notes).toEqual(['the image model failed: Image request failed (500).']);
    }
    const noKey = fakeDeps({ openAiMissing: true });
    const out = await resolveHeaderImage(input({ mode: 'instruction', instruction: 'x' }), noKey.deps);
    expect(out.kind).toBe('none');
    expect(noKey.log).toEqual([]);
  });

  it(`a picture changed ${MAX_HEADER_EDITS_IN_A_ROW} times in a row is not changed again, and nothing is spent`, async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage(input({ mode: 'edit', instruction: 'x', editBase: { mimeType: 'image/jpeg', base64: 'eA' }, editCount: MAX_HEADER_EDITS_IN_A_ROW }), f.deps);
    expect(out.kind).toBe('none');
    expect(f.log).toEqual([]);
    expect(out.notes[0]).toContain(`has already been changed ${MAX_HEADER_EDITS_IN_A_ROW} times in a row`);
  });

  it('no instruction, or no picture to change: nothing is spent', async () => {
    const a = fakeDeps();
    expect((await resolveHeaderImage(input({ mode: 'instruction', instruction: '   ' }), a.deps)).kind).toBe('none');
    expect(a.log).toEqual([]);
    const b = fakeDeps();
    const out = await resolveHeaderImage(input({ mode: 'edit', instruction: 'x', editBase: null }), b.deps);
    expect(out.notes).toEqual(['there is no generated picture on this post to change']);
    expect(b.log).toEqual([]);
  });
});

describe('the chain around the AI step', () => {
  it('a device-mounted category is not drawn by the ladder, but IS drawn when Patrick says what he wants', async () => {
    const f = fakeDeps();
    const out = await resolveHeaderImage(input({ rootSlugs: ['phone-wallets'] }), f.deps);
    expect(f.log).toEqual([]);
    expect(out.kind).toBe('url');
    const g = fakeDeps();
    const mine = await resolveHeaderImage(input({ rootSlugs: ['phone-wallets'], mode: 'instruction', instruction: 'on a desk' }), g.deps);
    expect(mine.kind).toBe('asset');
  });

  it('the library and the product photo still follow, in that order, and the chain starts where the source says', async () => {
    const f = fakeDeps({ capRefused: true });
    expect((await resolveHeaderImage(input({ library }), f.deps)).kind).toBe('asset');
    const g = fakeDeps();
    const lib = await resolveHeaderImage(input({ source: 'library', library }), g.deps);
    expect(g.log).toEqual([]);
    expect(lib.kind === 'asset' && lib.source).toBe('library');
    const h = fakeDeps();
    const product = await resolveHeaderImage(input({ source: 'product' }), h.deps);
    expect(product).toMatchObject({ kind: 'url', source: 'product', url: geiger(1) });
  });

  it('never throws: an effect that throws where it should not is a note', async () => {
    const f = fakeDeps();
    const deps: HeaderImageDeps = {
      ...f.deps,
      openAiConfigured: () => {
        throw new Error('exploded');
      },
    };
    const out = await resolveHeaderImage(input(), deps);
    expect(out.notes[0]).toBe('the image step failed: exploded');
  });
});

describe('small helpers', () => {
  it('a model failure is shown as its first sentence, never a raw body', () => {
    expect(shortFailure('Image request failed (404). {"error":{"message":"long body"}}')).toBe('Image request failed (404).');
    expect(shortFailure('x'.repeat(200))).toHaveLength(120);
  });

  it('an answer without a verdict is told from a call that never answered, by lib/ai/gemini.ts own wordings', () => {
    const gemini = read('lib/ai/gemini.ts');
    for (const wording of ['not JSON', 'malformed JSON', 'Empty response', 'declined this']) {
      expect(gemini, wording).toContain(wording);
      expect(checkAnsweredWithoutVerdict(`Gemini said: ${wording} here`)).toBe(true);
    }
    expect(checkAnsweredWithoutVerdict('Gemini request failed (503).')).toBe(false);
  });
});

describe('structure: the real effects', () => {
  const chain = read('lib/blog-automation/resolve-header-image.ts');

  it('every upload carries the marker that tells a generated picture from one Patrick uploaded', () => {
    expect(chain).toContain('source: { name: BLOG_HEADER_ASSET_SOURCE, id: filename }');
    expect(chain.match(/client\.assets\.upload\(/g)).toHaveLength(1);
    expect(BLOG_HEADER_ASSET_SOURCE).toBe('perfect-imprints-blog-header');
  });

  it('the main model is called through the one OpenAI client, and the chain reads no key itself', () => {
    expect(chain).toContain("import { generateOpenAiImage, openAiImageConfigured } from '../ai/openai-image';");
    expect(chain).not.toContain('process.env.OPENAI_API_KEY');
  });

  it('the loop can run twice and no more', () => {
    expect(chain).toContain('while (attempts < 2) {');
    expect(chain.match(/while \(/g)).toHaveLength(1);
  });

  it('the old titleless backup picture is gone from the chain: no planner, no blank-product prompt, no AUTO-204 check, no close look', () => {
    for (const gone of ['deps.plan(', 'deps.check(', 'deps.checkRegion', 'buildHeaderImagePrompt', 'buildScenePlanPrompt', 'worstImageCheckProblem', 'tilePassProblem', 'PlannerAnswerError']) {
      expect(chain, gone).not.toContain(gone);
    }
    // One drawing loop serves both models, so a backup picture cannot skip a gate.
    expect(chain.match(/deps\.generate\(/g)).toHaveLength(1);
    expect(chain.match(/titleGate\(/g)).toHaveLength(1);
    expect(chain.match(/pictureBrandProblem\(/g)).toHaveLength(1);
  });
});
