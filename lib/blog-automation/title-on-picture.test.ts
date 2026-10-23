/**
 * AUTO-209: the post's title on the generated picture, driven through the
 * REAL header image chain with fakes for every effect. What must hold:
 *
 *   - the ORDER: every read and the close look see the picture WITHOUT the
 *     title (the check refuses display text and would refuse our own title);
 *     the title is drawn only on a picture that passed all of them, and the
 *     stored asset is the titled one, with the untitled copy kept beside it;
 *   - a picture the check refuses (a brand mark) is never titled and never
 *     stored; the forbidden list is untouched;
 *   - the title never costs the picture: an undrawable title, a drawing
 *     fault, no time left, a failed layout call or a failed untitled upload
 *     each still store a picture, with a note saying why;
 *   - the image model is never asked to draw the title, and the shipped deps
 *     always carry both new effects.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  defaultHeaderImageDeps,
  HEADER_IMAGE_BUDGET_MS,
  resolveHeaderImage,
  TITLE_LAYOUT_TIMEOUT_MS,
  type HeaderImageDeps,
  type ResolveHeaderImageInput,
} from './resolve-header-image';
import {
  buildHeaderImagePrompt,
  buildScenePlanPrompt,
  headerImageSummary,
  imageRoomRule,
  titleRoomSideFor,
  TITLE_ROOM_SIDES,
  type ImageCheck,
  type ReferenceProduct,
} from './header-image';
import { parseStoredTreatment, type TitleLayoutAnswer } from './title-layout';
import type { ComposedTitle } from './compose-title';

const clean: ImageCheck = { texts: [], listed: true, devices: [], logo: false, logoSeen: '', brandText: false, brandTextSeen: '', impossible: false, impossibleSeen: '' };
const branded: ImageCheck = { ...clean, logo: true, logoSeen: 'Apple on a laptop lid' };
const brandedText: ImageCheck = { ...clean, brandText: true, brandTextSeen: 'ACME PLUMBING 555-0100', texts: [{ text: 'ACME PLUMBING 555-0100', where: 'the magnet', onProduct: true, kind: 'brand' }] };
const products: ReferenceProduct[] = [{ sku: '1', name: 'Canvas Tote', imageUrl: 'https://imgsirv.geiger.com/master/101/web/101_1.jpg?format=webp&thumbnail=275&w=275&h=275' }];
const answer: TitleLayoutAnswer = { productBox: [300, 450, 950, 900], calmSide: 'left', reason: 'the left is an empty wall' };

interface Opts {
  checks?: ImageCheck[];
  tiles?: boolean[];
  compose?: 'ok' | 'null' | 'throws' | 'missing';
  layout?: 'ok' | 'null' | 'throws' | 'hangs' | 'missing';
  photoUploadFails?: boolean;
  generateMs?: number;
}

function harness(opts: Opts = {}) {
  const log: string[] = [];
  const errors: string[] = [];
  const checked: string[] = [];
  const composedFrom: string[] = [];
  const layoutSaw: string[] = [];
  const uploads: { bytes: string; filename: string; contentType: string }[] = [];
  const prompts: string[] = [];
  let now = 5_000_000;
  let picture = 0;
  const deps: HeaderImageDeps = {
    keyConfigured: () => true,
    reserve: async () => ({ ok: true, used: 1, cap: 20, day: '2026-10-18' }),
    fetchReference: async () => ({ mimeType: 'image/jpeg', base64: 'UkVG' }),
    plan: async () => null,
    generate: async ({ prompt }) => {
      picture += 1;
      prompts.push(prompt);
      now += opts.generateMs ?? 15_000;
      const b64 = Buffer.from(`untitled-picture-${picture}`).toString('base64');
      log.push(`generate:${picture}`);
      return { bytes: Buffer.from(`untitled-picture-${picture}`), mimeType: 'image/jpeg', base64: b64, usage: { imageTokens: 1120, promptTokens: 1900, elapsedMs: 15_000, model: 'gemini-3-pro-image' } };
    },
    check: async (image) => {
      checked.push(Buffer.from(image.base64, 'base64').toString());
      log.push('check');
      return opts.checks?.[picture - 1] ?? clean;
    },
    checkRegion: async (image, region) => {
      checked.push(`${Buffer.from(image.base64, 'base64').toString()}@${region}`);
      log.push('tile');
      return { region, logo: opts.tiles?.[picture - 1] === true && region === 'top-left', seen: 'a tag' };
    },
    ...(opts.layout === 'missing'
      ? {}
      : {
          chooseTitleLayout: async (image) => {
            layoutSaw.push(Buffer.from(image.base64, 'base64').toString());
            log.push('layout');
            if (opts.layout === 'throws') throw new Error('layout down');
            if (opts.layout === 'hangs') return new Promise(() => {});
            if (opts.layout === 'null') return null;
            return { answer, usage: { model: 'gemini-3.5-flash-lite', promptTokens: 1300, outputTokens: 60, elapsedMs: 2100 } };
          },
        }),
    ...(opts.compose === 'missing'
      ? {}
      : {
          composeTitle: async ({ picture: p, title, answer: a, previous, room }) => {
            composedFrom.push(Buffer.from(p.base64, 'base64').toString());
            log.push(`compose:${a ? `answer:${a.calmSide}` : 'none'}:${previous ?? 'first'}:${room ?? 'noroom'}`);
            if (opts.compose === 'throws') throw new Error('resvg failed to load');
            if (opts.compose === 'null') return null;
            const composed: ComposedTitle = {
              bytes: Buffer.from(`titled(${Buffer.from(p.base64, 'base64').toString()})`),
              mimeType: 'image/png',
              ms: 700,
              plan: {
                title,
                layout: previous === 'panel' ? 'gradient-left' : 'panel-left',
                look: previous === 'panel' ? 'gradient' : 'panel',
                side: 'left',
                canvas: { width: 1376, height: 768 },
                panel: { rect: { x: 0, y: 0, w: 440, h: 768 }, fill: '#23306B' },
                curve: null,
                badge: null,
                gradient: null,
                rule: null,
                text: { lines: [title], size: 60, lineHeight: 62, colour: '#FFFFFF', letterSpacing: -0.025, rect: { x: 64, y: 300, w: 300, h: 62 } },
                big: null,
                second: null,
                logo: null,
                contrast: 12.31,
                measured: true,
                previous: previous ?? null,
                reasons: [],
              },
            };
            return composed;
          },
        }),
    upload: async (bytes, filename, contentType) => {
      log.push(`upload:${filename}`);
      if (opts.photoUploadFails && filename.includes('-photo')) throw new Error('network');
      uploads.push({ bytes: bytes.toString(), filename, contentType });
      return `image-up${uploads.length}-1376x768-${contentType === 'image/png' ? 'png' : 'jpg'}`;
    },
    now: () => now,
  };
  const input: ResolveHeaderImageInput = {
    source: 'ai',
    title: "Custom Tote Bags: A Buyer's Guide for Bulk Orders",
    topic: 'custom tote bags',
    products,
    rootSlugs: ['tote-bags'],
    library: [],
    slug: 'custom-tote-bags-a-buyers-guide',
    log: (l) => log.push(`log ${l}`),
    logError: (l) => errors.push(l),
  };
  return { deps, input, log, errors, checked, composedFrom, layoutSaw, uploads, prompts };
}

describe('the order: checked untitled, titled after, stored titled (AUTO-209)', () => {
  it('every read and the close look see the UNTITLED picture; the title is drawn after all of them; the titled picture is what is stored', async () => {
    const h = harness();
    const out = await resolveHeaderImage(h.input, h.deps);
    expect(out.kind).toBe('asset');
    // Every check, full read and region, was on the untitled bytes.
    expect(h.checked.length).toBeGreaterThan(2);
    for (const c of h.checked) expect(c.startsWith('untitled-picture-1')).toBe(true);
    expect(h.checked.some((c) => c.includes('titled('))).toBe(false);
    // The drawing came after the last check and the last close look.
    const firstCompose = h.log.findIndex((l) => l.startsWith('compose:'));
    expect(firstCompose).toBeGreaterThan(h.log.lastIndexOf('check'));
    expect(firstCompose).toBeGreaterThan(h.log.lastIndexOf('tile'));
    expect(h.composedFrom).toEqual(['untitled-picture-1']);
    // Stored: the titled PNG as the header, the untitled original beside it.
    expect(h.uploads.map((u) => u.bytes).sort()).toEqual(['titled(untitled-picture-1)', 'untitled-picture-1']);
    if (out.kind !== 'asset') throw new Error('unreachable');
    const titled = h.uploads.find((u) => u.bytes.startsWith('titled('));
    expect(titled?.contentType).toBe('image/png');
    expect(titled?.filename).toBe('custom-tote-bags-a-buyers-guide-header.png');
    expect(h.uploads.find((u) => u.bytes === 'untitled-picture-1')?.filename).toBe('custom-tote-bags-a-buyers-guide-header-photo.jpg');
    expect(out.image.asset._ref).toBe(`image-up${h.uploads.indexOf(titled!) + 1}-1376x768-png`);
    expect(out.image.titleOnImage).toBe("Custom Tote Bags: A Buyer's Guide for Bulk Orders");
    expect(out.image.untitledImage?._ref).toMatch(/-jpg$/);
    expect(parseStoredTreatment(out.image.titleTreatment)?.layout).toBe('panel-left');
    expect(out.image.alt).toBe("Custom Tote Bags: A Buyer's Guide for Bulk Orders. The post's title over an illustrative photo of custom tote bags in a business setting");
    expect(out.usage?.title?.layout).toBe('panel-left');
    expect(headerImageSummary(out)).toContain("with the post's title put on it");
  });

  it('the layout call looks at the same untitled picture, and its answer, the room and the previous look reach the drawing', async () => {
    const h = harness();
    await resolveHeaderImage(h.input, h.deps);
    expect(h.layoutSaw).toEqual(['untitled-picture-1']);
    expect(h.log).toContain(`compose:answer:left:first:${titleRoomSideFor(h.input.slug)}`);
    // AUTO-210: a regenerate carries the post's current look, so the drawing starts from the next one.
    const again = harness();
    const out = await resolveHeaderImage({ ...again.input, previousTreatment: '{"layout":"panel-right","productBox":null}' }, again.deps);
    expect(again.log).toContain(`compose:answer:left:panel:${titleRoomSideFor(again.input.slug)}`);
    if (out.kind !== 'asset') throw new Error('expected an asset');
    expect(parseStoredTreatment(out.image.titleTreatment)?.layout).toBe('gradient-left');
    expect(out.usage?.title?.previous).toBe('panel');
    // An AUTO-209 treatment, or garbage, reads as a first picture.
    const old = harness();
    await resolveHeaderImage({ ...old.input, previousTreatment: '{"layout":"band-top","colour":"navy","productBox":null}' }, old.deps);
    expect(old.log.some((l) => l.startsWith('compose:answer:left:first:'))).toBe(true);
  });

  it('a picture the full reads refuse for a brand mark is never titled, never sent to the layout call, never stored; the next one is', async () => {
    const h = harness({ checks: [brandedText, clean] });
    const out = await resolveHeaderImage(h.input, h.deps);
    expect(out.kind).toBe('asset');
    expect(h.layoutSaw).toEqual(['untitled-picture-2']);
    expect(h.composedFrom).toEqual(['untitled-picture-2']);
    expect(h.uploads.some((u) => u.bytes.includes('picture-1'))).toBe(false);
    expect(out.notes.join(' ')).toContain('ACME PLUMBING 555-0100');
  });

  it('a picture the close look refuses (a small tag) is never titled; after two refusals nothing generated is stored, and the product photo fallback carries no title', async () => {
    const h = harness({ checks: [clean, branded], tiles: [true] });
    const out = await resolveHeaderImage(h.input, h.deps);
    // The chain's existing fallback: the post's first product photo, a hot link (Section 18: never composed, never uploaded).
    expect(out.kind).toBe('url');
    expect(h.composedFrom).toEqual([]);
    expect(h.uploads).toEqual([]);
  });

  it("the image model is asked to leave room and to draw no title there; the planner is told the same third", async () => {
    const h = harness();
    await resolveHeaderImage(h.input, h.deps);
    const side = titleRoomSideFor(h.input.slug);
    expect(h.prompts[0]).toContain(imageRoomRule(side));
    expect(h.prompts[0]).toContain('Draw no title, words or letters in that area');
    expect(buildScenePlanPrompt({ title: 'T', topic: 't', productNames: [], titleRoom: side }).user).toContain(`the ${side} third of the frame stays calm and empty`);
  });

  it('without the compose step (an older caller), nothing changes: no room request, the plain JPEG stored, no title fields', async () => {
    const h = harness({ compose: 'missing', layout: 'missing' });
    const out = await resolveHeaderImage(h.input, h.deps);
    if (out.kind !== 'asset') throw new Error('expected an asset');
    expect(h.prompts[0]).not.toContain('Leave room for the title');
    expect(h.uploads).toEqual([{ bytes: 'untitled-picture-1', filename: 'custom-tote-bags-a-buyers-guide-header.jpg', contentType: 'image/jpeg' }]);
    expect(out.image.titleOnImage).toBeUndefined();
    expect(out.image.untitledImage).toBeUndefined();
    expect(out.image.alt).toContain('blank and unbranded');
  });
});

describe('the title never costs the picture (AUTO-209)', () => {
  it('a title the font cannot draw stores the picture untitled, with the character named', async () => {
    const h = harness({ compose: 'null' });
    const out = await resolveHeaderImage({ ...h.input, title: 'Custom Tote Bags 中' }, h.deps);
    if (out.kind !== 'asset') throw new Error('expected an asset');
    expect(out.image.titleOnImage).toBeUndefined();
    expect(h.uploads.map((u) => u.bytes)).toEqual(['untitled-picture-1']);
    expect(out.notes.join(' ')).toContain('a character the title font cannot draw (中)');
    expect(out.notes.join(' ')).toContain('rather than with a wrong one');
  });

  it('a drawing fault stores the picture untitled, says so, and logs loudly', async () => {
    const h = harness({ compose: 'throws' });
    const out = await resolveHeaderImage(h.input, h.deps);
    if (out.kind !== 'asset') throw new Error('expected an asset');
    expect(out.image.titleOnImage).toBeUndefined();
    expect(out.notes.join(' ')).toContain('the title could not be put on the picture (resvg failed to load)');
    expect(h.errors.join(' ')).toContain('THE TITLE COULD NOT BE DRAWN');
  });

  it('with no time left for the drawing, the picture is stored untitled and the note says to try again', async () => {
    // One generation that eats nearly all of the budget.
    const h = harness({ generateMs: HEADER_IMAGE_BUDGET_MS - 4_000 });
    const out = await resolveHeaderImage(h.input, h.deps);
    if (out.kind !== 'asset') throw new Error('expected an asset');
    expect(h.composedFrom).toEqual([]);
    expect(out.image.titleOnImage).toBeUndefined();
    expect(out.notes.join(' ')).toContain('no time left in the image budget to put the title on the picture');
  });

  it('a failed or hung layout call still titles the picture: the drawing gets no answer and chooses in code', async () => {
    for (const layout of ['null', 'throws'] as const) {
      const h = harness({ layout });
      const out = await resolveHeaderImage(h.input, h.deps);
      if (out.kind !== 'asset') throw new Error('expected an asset');
      expect(h.log.some((l) => l.startsWith('compose:none:'))).toBe(true);
      expect(out.image.titleOnImage).toBeTruthy();
    }
  });

  it('a hung layout call is cut off at its own ceiling, inside the budget', async () => {
    expect(TITLE_LAYOUT_TIMEOUT_MS).toBeLessThanOrEqual(8_000);
    const h = harness({ layout: 'hangs' });
    const real = Date.now();
    const out = await resolveHeaderImage(h.input, h.deps);
    expect(out.kind).toBe('asset');
    expect(Date.now() - real).toBeLessThan(TITLE_LAYOUT_TIMEOUT_MS + 3_000);
    expect(h.log.some((l) => l.startsWith('compose:none:'))).toBe(true);
  }, 20_000);

  it('an untitled copy that fails to save still stores the titled picture, without the copy, with a note', async () => {
    const h = harness({ photoUploadFails: true });
    const out = await resolveHeaderImage(h.input, h.deps);
    if (out.kind !== 'asset') throw new Error('expected an asset');
    expect(out.image.titleOnImage).toBeTruthy();
    expect(out.image.untitledImage).toBeUndefined();
    expect(out.notes.join(' ')).toContain('a later change of title will need a new picture');
  });
});

describe('the shipped pieces (AUTO-209)', () => {
  const chain = readFileSync(join(__dirname, 'resolve-header-image.ts'), 'utf8');

  it('the real deps carry the layout call and the drawing', () => {
    const deps = defaultHeaderImageDeps({} as never);
    expect(typeof deps.chooseTitleLayout).toBe('function');
    expect(typeof deps.composeTitle).toBe('function');
  });

  it('in the chain source, the drawing comes after the reads, the close look and the layout answer, and before the upload', () => {
    const at = (s: string) => {
      const i = chain.indexOf(s);
      if (i < 0) throw new Error(`${s} not found`);
      return i;
    };
    const compose = at('deps.composeTitle({');
    expect(compose).toBeGreaterThan(at('worstImageCheckProblem(reads)'));
    expect(compose).toBeGreaterThan(at('problem = tilePassProblem(tiles)'));
    expect(compose).toBeGreaterThan(at('const layout = await layoutCall;'));
    expect(compose).toBeGreaterThan(at('if (problem) {\n      log(`[header-image] check refused attempt'));
    expect(compose).toBeLessThan(at("headerImageFilename(input.slug, attempts, 'titled')"));
  });

  it('the image prompt never asks the model to draw the title: the room rule says to leave it empty', () => {
    for (const side of TITLE_ROOM_SIDES) {
      const p = buildHeaderImagePrompt({ title: 'Custom Pens', topic: 'custom pens', productNames: [], titleRoom: side });
      expect(p).toContain('Draw no title, words or letters in that area');
      expect(p).not.toMatch(/\b(write|print|add|render|draw) the (post's )?title\b/i);
    }
  });

  it('the post page gives the hero its size and asks for a JPEG social image only for a PNG (titled) header', () => {
    const page = readFileSync(join(__dirname, '..', '..', 'app', 'blog', '[slug]', 'page.tsx'), 'utf8');
    expect(page).toContain('const heroSize = headerImageRenderSize(post, 1400);');
    expect(page).toContain('width={heroSize?.width}');
    expect(page).toContain('height={heroSize?.height}');
    expect(page).toContain("const pngHeader = /-png$/.test(post.headerImage?.asset?._ref ?? '');");
    expect(page).toContain("pngHeader ? b.width(1200).format('jpg') : b.width(1200)");
  });

  it('the room side rotates over the left and right thirds (AUTO-210: no look needs the top) and is stable per post', () => {
    const sides = new Set(Array.from({ length: 60 }, (_, i) => titleRoomSideFor(`post-${i}`)));
    expect([...sides].sort()).toEqual(['left', 'right']);
    expect(titleRoomSideFor('custom-tote-bags')).toBe(titleRoomSideFor('custom-tote-bags'));
  });
});
