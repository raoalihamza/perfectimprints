/**
 * AUTO-220: the P! mark stamped on a header picture. None of the 35 measured
 * pictures carried it and the model cannot be relied on to draw it, so code
 * stamps it; these tests DRAW it and read the pixels back.
 *
 * THE MARK IS NEVER CLIPPED. AUTO-212 found the mark cut off on every header
 * (the viewBox '22 0 180 195' cut the left of the P). A clipped mark has ink
 * on the edge of its own box, or on the edge of the frame; both are tested
 * here in every corner, every colouring and on both picture sizes.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { createElement } from 'react';
import { decodePngToRgb, imageSize, renderStamp, stampMark } from './stamp-mark';
import { HEADER_MARK_HALO_PAD, HEADER_MARK_SVG, HEADER_MARK_VIEWBOX, headerMarkSvg, svgDataUri, type HeaderMarkHalo, type HeaderMarkVariant } from './header-mark';
import {
  MARK_ASPECT,
  MARK_BUSY,
  MARK_CORNERS,
  MARK_MARGIN_SHARE,
  MARK_WIDTH_SHARE,
  chooseMarkPlacement,
  contrastRatio,
  luminance,
  markDrawRect,
  markRect,
  markVariantFor,
  type Canvas,
  type MarkPlacement,
  type PixelGrid,
} from './mark-placement';

const OPENAI: Canvas = { width: 1536, height: 864 };
const GEMINI: Canvas = { width: 1376, height: 768 };
const VARIANTS: HeaderMarkVariant[] = ['colour', 'white', 'all-white', 'all-ink'];

/** The bounding box of every pixel that differs from the flat background, or null when nothing was drawn. */
function inkBox(g: PixelGrid, bg: [number, number, number]) {
  let x0 = g.width;
  let y0 = g.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < g.height; y += 1) {
    for (let x = 0; x < g.width; x += 1) {
      const i = (y * g.width + x) * 3;
      if (Math.abs(g.rgb[i] - bg[0]) + Math.abs(g.rgb[i + 1] - bg[1]) + Math.abs(g.rgb[i + 2] - bg[2]) > 0.12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

const GREY: [number, number, number] = [0.5, 0.5, 0.5];

async function drawOnGrey(canvas: Canvas, placement: MarkPlacement) {
  return decodePngToRgb(await renderStamp(null, canvas, placement, '#808080'));
}

describe('the mark itself (AUTO-212, kept)', () => {
  it('is built from its own three paths in a box that holds all of it, not the old crop that cut the P', () => {
    expect(HEADER_MARK_VIEWBOX).toBe('0 0 206 172');
    expect(HEADER_MARK_VIEWBOX).not.toBe('22 0 180 195');
    expect(HEADER_MARK_SVG).toContain('viewBox="0 0 206 172"');
    expect(HEADER_MARK_SVG.match(/<path /g)).toHaveLength(3);
    const [x, , w, h] = HEADER_MARK_VIEWBOX.split(/\s+/).map(Number);
    // The mark's ink starts at x 1.75 (measured); the box must start at or before it.
    expect(x).toBeLessThanOrEqual(1.75);
    expect(MARK_ASPECT).toBeCloseTo(w / h, 6);
  });

  it('drawn alone, no ink touches any edge of its box, in every colouring and with an outline', async () => {
    for (const variant of VARIANTS) {
      for (const halo of [null, 'light', 'dark'] as (HeaderMarkHalo | null)[]) {
        const pad = halo ? HEADER_MARK_HALO_PAD : 0;
        const w = (206 + pad * 2) * 2;
        const h = (172 + pad * 2) * 2;
        const el = createElement(
          'div',
          { style: { width: w, height: h, display: 'flex', backgroundColor: '#808080' } },
          createElement('img', { src: svgDataUri(headerMarkSvg(variant, halo)), width: w, height: h, alt: '' }),
        );
        const g = decodePngToRgb(Buffer.from(await new ImageResponse(el, { width: w, height: h }).arrayBuffer()));
        const box = inkBox(g, GREY);
        expect(box, `${variant} ${halo}`).not.toBeNull();
        if (!box) continue;
        expect(box.x0, `${variant} ${halo} left`).toBeGreaterThan(0);
        expect(box.y0, `${variant} ${halo} top`).toBeGreaterThan(0);
        expect(box.x1, `${variant} ${halo} right`).toBeLessThan(w - 1);
        expect(box.y1, `${variant} ${halo} bottom`).toBeLessThan(h - 1);
      }
    }
  }, 60_000);
});

describe('where the mark goes', () => {
  it('its box is a fixed share of the picture and a margin inside the frame, in every corner, on both picture sizes', () => {
    for (const canvas of [OPENAI, GEMINI]) {
      for (const corner of MARK_CORNERS) {
        const r = markRect(canvas, corner);
        expect(r.w).toBe(Math.round(canvas.width * MARK_WIDTH_SHARE));
        expect(r.h).toBe(Math.round(r.w / MARK_ASPECT));
        const margin = Math.round(canvas.width * MARK_MARGIN_SHARE);
        expect(Math.min(r.x, canvas.width - r.x - r.w)).toBe(margin);
        expect(Math.min(r.y, canvas.height - r.y - r.h)).toBe(margin);
      }
    }
    expect(markRect(OPENAI, 'bottom-right')).toEqual({ x: 1359, y: 707, w: 123, h: 103 });
    expect(markRect(GEMINI, 'bottom-right').w).toBe(110);
  });

  it('STAMPED ON THE PICTURE, THE MARK IS WHOLE: its ink stays inside its own box and well clear of the frame edge, in all four corners, with and without an outline', async () => {
    for (const canvas of [OPENAI, GEMINI]) {
      for (const corner of MARK_CORNERS) {
        for (const halo of [null, 'light'] as (HeaderMarkHalo | null)[]) {
          const placement: MarkPlacement = { corner, rect: markRect(canvas, corner), variant: 'colour', contrast: 0, busyness: 0, halo };
          const g = await drawOnGrey(canvas, placement);
          expect(g.width).toBe(canvas.width);
          expect(g.height).toBe(canvas.height);
          const box = inkBox(g, GREY);
          const what = `${canvas.width} ${corner} ${halo}`;
          expect(box, what).not.toBeNull();
          if (!box) continue;
          const d = markDrawRect(placement);
          // Inside the box it was drawn in (one pixel of antialiasing allowed)...
          expect(box.x0, what).toBeGreaterThanOrEqual(Math.floor(d.x) - 1);
          expect(box.y0, what).toBeGreaterThanOrEqual(Math.floor(d.y) - 1);
          expect(box.x1, what).toBeLessThanOrEqual(Math.ceil(d.x + d.w) + 1);
          expect(box.y1, what).toBeLessThanOrEqual(Math.ceil(d.y + d.h) + 1);
          // ...and nowhere near the edge of the frame: a mark whose ink reaches the edge is a clipped mark.
          const clear = Math.round(canvas.width * 0.025);
          expect(box.x0, what).toBeGreaterThanOrEqual(clear);
          expect(box.y0, what).toBeGreaterThanOrEqual(clear);
          expect(canvas.width - 1 - box.x1, what).toBeGreaterThanOrEqual(clear);
          expect(canvas.height - 1 - box.y1, what).toBeGreaterThanOrEqual(clear);
          // And it is the whole mark, not a sliver: nearly as wide and as tall as its box.
          expect(box.x1 - box.x0, what).toBeGreaterThan(placement.rect.w * 0.9);
          expect(box.y1 - box.y0, what).toBeGreaterThan(placement.rect.h * 0.9);
        }
      }
    }
  }, 120_000);
});

/** A grid that is flat `base` everywhere except a noisy patch over one rectangle of the canvas. */
function gridWith(canvas: Canvas, base: number, noisy: { x: number; y: number; w: number; h: number }[] = []): PixelGrid {
  const width = 172;
  const height = Math.round((172 * canvas.height) / canvas.width);
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x / width) * canvas.width;
      const py = (y / height) * canvas.height;
      const busy = noisy.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
      const v = busy ? ((x + y) % 2 === 0 ? 0.95 : 0.05) : base;
      const i = (y * width + x) * 3;
      rgb[i] = v;
      rgb[i + 1] = v;
      rgb[i + 2] = v;
    }
  }
  return { width, height, rgb };
}

const pad = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x - 60, y: r.y - 60, w: r.w + 120, h: r.h + 120 });

describe('the corner and the colours', () => {
  it('bottom right when the bottom corners are about the same; bottom left when the right one holds something', () => {
    expect(chooseMarkPlacement(OPENAI, gridWith(OPENAI, 0.9)).corner).toBe('bottom-right');
    expect(chooseMarkPlacement(OPENAI, gridWith(OPENAI, 0.9, [pad(markRect(OPENAI, 'bottom-right'))])).corner).toBe('bottom-left');
  });

  it('a top corner only when both bottom corners are busy and a top one is plain', () => {
    const bothBottom = [pad(markRect(OPENAI, 'bottom-right')), pad(markRect(OPENAI, 'bottom-left'))];
    expect(chooseMarkPlacement(OPENAI, gridWith(OPENAI, 0.9, bothBottom)).corner).toBe('top-right');
    const allFour = [...bothBottom, pad(markRect(OPENAI, 'top-right')), pad(markRect(OPENAI, 'top-left'))];
    expect(['bottom-right', 'bottom-left']).toContain(chooseMarkPlacement(OPENAI, gridWith(OPENAI, 0.9, allFour)).corner);
  });

  it('the brand\'s own colours on a light or a dark corner; one colour where the red would vanish', () => {
    expect(markVariantFor(luminance(1, 1, 1)).variant).toBe('colour');
    expect(markVariantFor(luminance(0, 0, 0)).variant).toBe('white');
    // A brand-red band: the red ! has no contrast against it.
    expect(markVariantFor(luminance(0xea / 255, 0x29 / 255, 0x29 / 255)).variant).toBe('all-white');
    for (const l of [0, 0.02, 0.08, 0.19, 0.4, 0.7, 1]) {
      const picked = markVariantFor(l);
      expect(picked.contrast, `luminance ${l}`).toBeGreaterThanOrEqual(2.2);
    }
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5);
  });

  it('a busy corner keeps the brand colours and gets an outline; a calm corner gets none', () => {
    const calm = chooseMarkPlacement(OPENAI, gridWith(OPENAI, 0.9));
    expect(calm.halo).toBeNull();
    expect(calm.busyness).toBeLessThan(MARK_BUSY);
    const all = MARK_CORNERS.map((c) => pad(markRect(OPENAI, c)));
    const busy = chooseMarkPlacement(OPENAI, gridWith(OPENAI, 0.9, all));
    expect(busy.busyness).toBeGreaterThan(MARK_BUSY);
    expect(busy.halo).toBe('light');
    expect(busy.variant).toBe('colour');
    // The outline grows the drawn box by its reach on every side; the mark stays where it was.
    const d = markDrawRect(busy);
    expect(d.w).toBeGreaterThan(busy.rect.w);
    expect(d.x + d.w / 2).toBeCloseTo(busy.rect.x + busy.rect.w / 2, 5);
  });

  it('a picture that could not be sampled is still stamped: bottom right, in colour, with the outline', () => {
    expect(chooseMarkPlacement(OPENAI, null)).toMatchObject({ corner: 'bottom-right', variant: 'colour', halo: 'light', busyness: -1 });
  });
});

describe('the whole stamp step', () => {
  async function flatPicture(canvas: Canvas, colour: string) {
    const el = createElement('div', { style: { width: canvas.width, height: canvas.height, display: 'flex', backgroundColor: colour } });
    const png = Buffer.from(await new ImageResponse(el, { width: canvas.width, height: canvas.height }).arrayBuffer());
    return { mimeType: 'image/png', base64: png.toString('base64') };
  }

  it('returns a PNG of exactly the picture\'s own size, with the mark on it and nothing else changed', async () => {
    const out = await stampMark(await flatPicture(OPENAI, '#f2f2f2'));
    expect(out.mimeType).toBe('image/png');
    expect(imageSize(out.bytes)).toEqual(OPENAI);
    expect(out.canvas).toEqual(OPENAI);
    expect(out.placement).toMatchObject({ corner: 'bottom-right', variant: 'colour', halo: null });
    const g = decodePngToRgb(out.bytes);
    const box = inkBox(g, [0xf2 / 255, 0xf2 / 255, 0xf2 / 255]);
    expect(box).not.toBeNull();
    // Everything outside the mark's box is the picture, untouched.
    const r = out.placement.rect;
    expect(box!.x0).toBeGreaterThanOrEqual(r.x - 1);
    expect(box!.y0).toBeGreaterThanOrEqual(r.y - 1);
    expect(box!.x1).toBeLessThanOrEqual(r.x + r.w + 1);
    expect(box!.y1).toBeLessThanOrEqual(r.y + r.h + 1);
  }, 60_000);

  it('on a dark picture the P is white; the fallback model\'s smaller picture is stamped the same way', async () => {
    const out = await stampMark(await flatPicture(GEMINI, '#101418'));
    expect(imageSize(out.bytes)).toEqual(GEMINI);
    expect(out.placement.variant).toBe('white');
    expect(out.placement.rect.w).toBe(110);
  }, 60_000);

  it('a file that is not a picture is refused rather than drawn on', async () => {
    await expect(stampMark({ mimeType: 'image/jpeg', base64: Buffer.from('not a picture at all').toString('base64') })).rejects.toThrow('its size could not be read');
  });

  it('reads the size of a PNG and a JPEG from their headers', () => {
    const png = Buffer.alloc(30);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(1536, 16);
    png.writeUInt32BE(864, 20);
    expect(imageSize(png)).toEqual({ width: 1536, height: 864 });
    // A minimal JPEG: SOI, then a baseline start-of-frame segment.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x60, 0x06, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
    expect(imageSize(jpeg)).toEqual({ width: 1536, height: 864 });
    expect(imageSize(Buffer.from('nope'))).toBeNull();
  });
});

describe('structure', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('the placement rules are pure; only the stamp touches the renderer', () => {
    expect(read('lib/blog-automation/mark-placement.ts').match(/^import .*$/gm)).toEqual(["import { HEADER_MARK_HALO_PAD, type HeaderMarkHalo, type HeaderMarkVariant } from './header-mark';"]);
    expect(read('lib/blog-automation/header-mark.ts').match(/^import .*$/gm) ?? []).toEqual([]);
    expect(read('lib/blog-automation/stamp-mark.tsx')).toContain("import { ImageResponse } from 'next/og';");
  });

  it('the generated mark module is what the generator writes (the logo is inlined, never read from public/ at request time)', () => {
    const gen = read('scripts/blog-automation/generate-header-mark.mjs');
    expect(gen).toContain("join(root, 'lib', 'blog-automation', 'header-mark.ts')");
    expect(read('lib/blog-automation/stamp-mark.tsx')).not.toMatch(/readFileSync|public\//);
  });

  it('the stamp draws NO text: no font, no title, only the picture and the mark', () => {
    const stamp = read('lib/blog-automation/stamp-mark.tsx');
    expect(stamp).not.toMatch(/fonts:|fontFamily|fontSize|title-font/);
    // Three images in all: the picture sampled small, the picture full size, and the mark.
    expect(stamp.match(/createElement\('img'/g)).toHaveLength(3);
    expect(stamp.match(/createElement\('(?!img'|div')/g)).toBeNull();
  });

  it('there is no JSX in the stamp: it must not depend on how the file happens to be compiled', () => {
    const stamp = read('lib/blog-automation/stamp-mark.tsx');
    expect(stamp).toContain("import { createElement } from 'react';");
    expect(stamp).not.toMatch(/<(div|img)[\s>]/);
  });
});
