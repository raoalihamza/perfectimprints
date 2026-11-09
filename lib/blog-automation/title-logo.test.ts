/**
 * AUTO-212: the P! mark on every generated header was cut off. Patrick: "It's
 * the right logo and the right size/placement, but it's being cut off... it's
 * doing this on every one of them." The cause was the crop the bare mark is
 * cut out of the full logo with (TITLE_MARK_VIEWBOX '22 0 180 195'): the
 * mark's ink starts at x 1.75, so the left of the P was outside the box on
 * every header that carried the mark, whatever its size or placement.
 *
 * These tests render the mark the way the header renderer draws it and fail
 * if any ink touches an edge of its box, which is what a clipped mark looks
 * like from the inside.
 */
import { describe, expect, it } from 'vitest';
import { ImageResponse } from 'next/og';
import { createElement } from 'react';
import { decodePngToRgb } from './compose-title';
import { TITLE_MARK_VIEWBOX, svgDataUri, titleMark } from './title-logo';
import { TITLE_MARK_ASPECT, TITLE_MARK_WIDTH, planTitle } from './title-layout';

async function renderMark(white: boolean, w: number, h: number) {
  const bg = white ? '#000000' : '#ffffff';
  const el = createElement(
    'div',
    { style: { width: w, height: h, display: 'flex', backgroundColor: bg } },
    createElement('img', { src: svgDataUri(titleMark(white)), width: w, height: h, alt: '' }),
  );
  const png = Buffer.from(await new ImageResponse(el, { width: w, height: h }).arrayBuffer());
  return decodePngToRgb(png);
}

/** How many pixels on the outermost ring differ from the background. */
function inkOnEdges(g: { width: number; height: number; rgb: ArrayLike<number> }, white: boolean): number {
  const bg = white ? 0 : 1;
  let n = 0;
  const at = (x: number, y: number) => {
    const i = (y * g.width + x) * 3;
    const lum = (g.rgb[i] + g.rgb[i + 1] + g.rgb[i + 2]) / 3;
    if (Math.abs(lum - bg) > 0.08) n += 1;
  };
  for (let x = 0; x < g.width; x += 1) {
    at(x, 0);
    at(x, g.height - 1);
  }
  for (let y = 0; y < g.height; y += 1) {
    at(0, y);
    at(g.width - 1, y);
  }
  return n;
}

describe('the bare P! mark (AUTO-212)', () => {
  it('holds the whole mark: no ink touches any edge of its box, in colour or white', async () => {
    for (const white of [false, true]) {
      const g = await renderMark(white, 412, 344);
      expect(inkOnEdges(g, white)).toBe(0);
    }
  }, 30_000);

  it('the layout aspect matches the crop, so the mark is never squeezed', () => {
    const [, , w, h] = TITLE_MARK_VIEWBOX.split(/\s+/).map(Number);
    expect(TITLE_MARK_ASPECT).toBeCloseTo(w / h, 6);
  });

  it('is not the old crop that cut the P', () => {
    expect(TITLE_MARK_VIEWBOX).not.toBe('22 0 180 195');
    const [x] = TITLE_MARK_VIEWBOX.split(/\s+/).map(Number);
    // The mark's ink starts at x 1.75 (measured); the box must start at or before it.
    expect(x).toBeLessThanOrEqual(1.75);
  });

  it('is drawn at the old scale: about 110 x 92 on the base canvas, inside the frame', () => {
    const plan = planTitle({ title: 'Custom Pens for Business: A Buyer’s Guide', canvas: { width: 1376, height: 768 }, answer: null, seed: 'pens' });
    expect(plan?.logo?.kind).toBe('mark');
    const r = plan!.logo!.rect;
    expect(r.w).toBe(TITLE_MARK_WIDTH);
    expect(r.h).toBe(Math.round(TITLE_MARK_WIDTH / TITLE_MARK_ASPECT));
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(768 - 40);
    expect(r.x + r.w).toBeLessThanOrEqual(1376 - 40);
  });
});
