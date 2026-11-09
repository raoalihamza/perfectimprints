/**
 * AUTO-212: the "pale bars". Asked to keep part of the frame calm for the
 * title, the image model sometimes paints a flat pale strip there instead,
 * with a hard edge under it (5 of the 31 photographs stored from 2026-10-18 to
 * 2026-11-04). paintedBandIn finds one in the sampled grid, and the chain
 * refuses such a picture like a failed read and asks again with the band named.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAINTED_BAND_MIN_SHARE, paintedBandIn, type PixelGrid } from './title-layout';

/** title-shapes.ts seededRandom (mulberry32), copied: a fixed texture for the grids below. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flat(r: number, g: number, b: number, w = 172, h = 96): PixelGrid {
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i += 1) {
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return { width: w, height: h, rgb };
}

/** A photograph-like grid: light texture everywhere (no row or column is perfectly uniform). */
function textured(base = 0.86, w = 172, h = 96): PixelGrid {
  const g = flat(base, base, base, w, h);
  const rnd = seededRandom(7);
  for (let i = 0; i < g.rgb.length; i += 1) (g.rgb as Float32Array)[i] = Math.min(1, Math.max(0, base + (rnd() - 0.5) * 0.18));
  return g;
}

describe('a blank band painted into the photograph (the pale bars)', () => {
  it('a flat pale strip across the top with a hard edge is caught; its size is reported', () => {
    const g = textured(0.5);
    for (let y = 0; y < 22; y += 1) for (let x = 0; x < g.width; x += 1) for (let k = 0; k < 3; k += 1) (g.rgb as Float32Array)[(y * g.width + x) * 3 + k] = 0.93;
    expect(paintedBandIn(g)).toEqual({ edge: 'top', share: 0.23 });
  });
  it('a band down one side is caught too', () => {
    const g = textured(0.5);
    for (let y = 0; y < g.height; y += 1) for (let x = g.width - 30; x < g.width; x += 1) for (let k = 0; k < 3; k += 1) (g.rgb as Float32Array)[(y * g.width + x) * 3 + k] = 0.95;
    expect(paintedBandIn(g)?.edge).toBe('right');
  });
  it('a real light area (texture, or a soft gradient with no edge) is not a band; nor is a strip thinner than the minimum', () => {
    expect(paintedBandIn(textured(0.9))).toBeNull();
    const sky = flat(0.9, 0.9, 0.9);
    for (let y = 0; y < sky.height; y += 1) for (let x = 0; x < sky.width; x += 1) for (let k = 0; k < 3; k += 1) (sky.rgb as Float32Array)[(y * sky.width + x) * 3 + k] = 0.95 - (y / sky.height) * 0.4;
    expect(paintedBandIn(sky)).toBeNull();
    const thin = textured(0.5);
    const rows = Math.round(PAINTED_BAND_MIN_SHARE * thin.height) - 2;
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < thin.width; x += 1) for (let k = 0; k < 3; k += 1) (thin.rgb as Float32Array)[(y * thin.width + x) * 3 + k] = 0.93;
    expect(paintedBandIn(thin)).toBeNull();
    expect(paintedBandIn(null)).toBeNull();
  });
  it('the chain refuses a banded picture like a failed read and asks again, telling the model why', () => {
    const chain = readFileSync(join(__dirname, 'resolve-header-image.ts'), 'utf8');
    expect(chain).toContain('if (!problem && deps.paintedBand) {');
    expect(chain).toContain('a blank pale band painted across the');
    expect(chain.indexOf('deps.paintedBand(pictureInput)')).toBeLessThan(chain.indexOf('deps.composeTitle({'));
    expect(chain).toContain('paintedBandIn(await pixelGridOf(image, size))');
  });
});
