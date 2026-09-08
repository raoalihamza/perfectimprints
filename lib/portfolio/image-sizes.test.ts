/**
 * PORT-110: the tile / lightbox sizing rules; PORT-150: the tile fits the
 * whole image instead of cropping it. Measured against the live Sanity CDN,
 * `fit=crop` (2026-09-02) and `fit=fill` (2026-09-08) both UPSCALE, while
 * `fit=max` never does, so every portfolio request is `fit=max` at natural
 * aspect and no candidate may name a width larger than the cropped asset
 * width. These tests pin that arithmetic, plus the PORT-150 additions: the
 * square box constant, the fitted-width fraction and the `sizes` scaling
 * that keeps a tall image from fetching a full-tile candidate.
 */
import { describe, expect, it } from 'vitest';

import {
  LIGHTBOX_SIZES,
  LIGHTBOX_WIDTHS,
  TILE_SIZES,
  TILE_WIDTHS,
  buildSrcSet,
  croppedImageBox,
  lightboxSizesFor,
  parseSanityImageRef,
  pickSrcWidth,
  widthsWithin,
  embeddedTileSizes,
  PORTFOLIO_EMBED_COLUMN_WIDTHS,
  TILE_BOX_ASPECT,
  fittedWidthFraction,
  scaleSizes,
} from './image-sizes';

describe('parseSanityImageRef', () => {
  it('reads width, height and extension from a real asset id', () => {
    expect(parseSanityImageRef('image-5042e823005bbf4ee67607d29fa561d06619c571-1500x1500-jpg')).toEqual({
      width: 1500,
      height: 1500,
      extension: 'jpg',
    });
    expect(parseSanityImageRef('image-e3465e11e99ffac8807545e4e7ddf3eea38aa4c1-1661x947-jpg')).toEqual({
      width: 1661,
      height: 947,
      extension: 'jpg',
    });
    expect(parseSanityImageRef('image-7949ee3e9f15f867d5a53cc3a01faf6ec7016f67-1200x1200-avif')?.extension).toBe(
      'avif',
    );
  });

  it.each([
    ['a file-shaped id', 'file-abc-pdf'],
    ['no dimensions', 'image-abc123-jpg'],
    ['zero width', 'image-abc123-0x100-jpg'],
    ['a trailing path', 'image-abc123-100x100-jpg/extra'],
    ['empty', ''],
  ])('returns null for %s', (_label, ref) => {
    expect(parseSanityImageRef(ref)).toBeNull();
  });

  it('returns null for a missing ref', () => {
    expect(parseSanityImageRef(null)).toBeNull();
    expect(parseSanityImageRef(undefined)).toBeNull();
  });
});

describe('croppedImageBox', () => {
  const box = { width: 1661, height: 947 };

  it('is the whole asset without a crop', () => {
    expect(croppedImageBox(box)).toEqual(box);
    expect(croppedImageBox(box, null)).toEqual(box);
    expect(croppedImageBox(box, {})).toEqual(box);
  });

  it('removes the cropped fractions from each edge', () => {
    expect(croppedImageBox(box, { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 })).toEqual({
      width: 1328,
      height: 757,
    });
    expect(croppedImageBox(box, { left: 0.5 })).toEqual({ width: 830, height: 947 });
  });

  it('never returns a box smaller than 1x1, whatever the crop says', () => {
    // 0.9 + 0.9 is capped at 0.99 of the width removed: 1661 * 0.01 = 16.61, floored.
    expect(croppedImageBox(box, { left: 0.9, right: 0.9 })).toEqual({ width: 16, height: 947 });
    expect(croppedImageBox({ width: 2, height: 2 }, { top: 0.99, bottom: 0.99, left: 0.99, right: 0.99 })).toEqual({
      width: 1,
      height: 1,
    });
    expect(croppedImageBox(box, { top: -1, left: Number.NaN })).toEqual(box);
  });
});

describe('widthsWithin: the no-upscale clamp', () => {
  it('keeps every candidate that fits and drops the rest', () => {
    expect(widthsWithin(TILE_WIDTHS, 1500)).toEqual([320, 480, 640, 800, 960]);
    expect(widthsWithin(TILE_WIDTHS, 947)).toEqual([320, 480, 640, 800]);
    expect(widthsWithin(TILE_WIDTHS, 757)).toEqual([320, 480, 640]);
    expect(widthsWithin(LIGHTBOX_WIDTHS, 1328)).toEqual([800, 1200]);
  });

  it('serves an asset smaller than every candidate at its own size', () => {
    expect(widthsWithin(TILE_WIDTHS, 300)).toEqual([300]);
    expect(widthsWithin(LIGHTBOX_WIDTHS, 390)).toEqual([390]);
    expect(widthsWithin(TILE_WIDTHS, 0.4)).toEqual([1]);
  });

  it('keeps every candidate when the size is unknown (caller must then use fit=max)', () => {
    expect(widthsWithin(TILE_WIDTHS, null)).toEqual([...TILE_WIDTHS]);
    expect(widthsWithin(TILE_WIDTHS, Number.NaN)).toEqual([...TILE_WIDTHS]);
  });

  it('never names a width above the ceiling', () => {
    for (const max of [1, 100, 319, 320, 321, 640, 959, 960, 961, 5000]) {
      for (const w of widthsWithin(TILE_WIDTHS, max)) expect(w).toBeLessThanOrEqual(max);
    }
  });
});

describe('pickSrcWidth and buildSrcSet', () => {
  it('picks the largest width not above the preference, else the smallest', () => {
    expect(pickSrcWidth([320, 480, 640, 800, 960], 640)).toBe(640);
    expect(pickSrcWidth([320, 480, 800, 960], 640)).toBe(480);
    expect(pickSrcWidth([800, 960], 640)).toBe(800);
    expect(pickSrcWidth([960, 320], 500)).toBe(320);
  });

  it('writes a standard width-descriptor srcset', () => {
    expect(buildSrcSet([{ url: 'a', width: 320 }, { url: 'b', width: 640 }])).toBe('a 320w, b 640w');
    expect(buildSrcSet([])).toBe('');
  });
});

describe('the constants', () => {
  it('cap the tile at 960 and the lightbox at 1600, ascending', () => {
    expect(TILE_WIDTHS).toEqual([320, 480, 640, 800, 960]);
    expect(LIGHTBOX_WIDTHS).toEqual([800, 1200, 1600]);
  });

  it('describe the grid columns (2 / 3 / 4), the sidebar range, and a full-width lightbox fallback', () => {
    expect(TILE_SIZES).toBe(
      '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) calc((100vw - 388px) / 3), 300px',
    );
    expect(LIGHTBOX_SIZES).toBe('100vw');
  });
});

describe('PORT-150: the tile box and the fitted image', () => {
  it('the box is square, and the constant says so', () => {
    expect(TILE_BOX_ASPECT).toBe(1);
  });

  it('a square or wide image spans the full tile width', () => {
    expect(fittedWidthFraction({ width: 1200, height: 1200 })).toBe(1);
    expect(fittedWidthFraction({ width: 1098, height: 688 })).toBe(1);
    expect(fittedWidthFraction({ width: 1661, height: 947 })).toBe(1);
  });

  it('a tall image spans only its aspect share of the width, to three decimals', () => {
    // The three PORT-140 bottle photographs.
    expect(fittedWidthFraction({ width: 726, height: 2252 })).toBe(0.322);
    expect(fittedWidthFraction({ width: 558, height: 1654 })).toBe(0.337);
    expect(fittedWidthFraction({ width: 850, height: 2154 })).toBe(0.395);
    expect(fittedWidthFraction({ width: 390, height: 750 })).toBe(0.52);
  });

  it('honours a different box aspect and treats an unusable box as full width', () => {
    expect(fittedWidthFraction({ width: 726, height: 2252 }, 0.8)).toBe(0.403);
    expect(fittedWidthFraction({ width: 1200, height: 1200 }, 0.8)).toBe(1);
    expect(fittedWidthFraction({ width: 0, height: 100 })).toBe(1);
    expect(fittedWidthFraction({ width: 100, height: Number.NaN })).toBe(1);
    expect(fittedWidthFraction({ width: 1, height: 100000 })).toBe(0.001);
  });

  it('scaleSizes leaves a full-width image alone', () => {
    expect(scaleSizes(TILE_SIZES, 1)).toBe(TILE_SIZES);
    expect(scaleSizes(TILE_SIZES, 1.4)).toBe(TILE_SIZES);
    expect(scaleSizes(TILE_SIZES, 0)).toBe(TILE_SIZES);
    expect(scaleSizes(TILE_SIZES, Number.NaN)).toBe(TILE_SIZES);
  });

  it('scaleSizes multiplies every clause length and keeps its media condition, including min() and calc() clauses', () => {
    expect(scaleSizes(TILE_SIZES, 0.322)).toBe(
      '(max-width: 767px) calc(50vw * 0.322), (max-width: 1023px) calc(33vw * 0.322), ' +
        '(max-width: 1279px) calc(calc((100vw - 388px) / 3) * 0.322), calc(300px * 0.322)',
    );
    expect(scaleSizes(embeddedTileSizes('section'), 0.5)).toBe(
      '(max-width: 767px) calc(50vw * 0.5), (max-width: 1023px) calc(33vw * 0.5), ' +
        '(max-width: 1279px) calc(min(33vw, 330px) * 0.5), calc(min(25vw, 244px) * 0.5)',
    );
    expect(scaleSizes('100vw', 0.25)).toBe('calc(100vw * 0.25)');
  });

  it('scaleSizes never changes the number of clauses or their order', () => {
    for (const sizes of [TILE_SIZES, embeddedTileSizes('blog'), embeddedTileSizes('product'), LIGHTBOX_SIZES]) {
      const before = sizes.split(/, (?=\(|calc|min|\d)/).length;
      const after = scaleSizes(sizes, 0.4).split(/, (?=\(|calc|min|\d)/).length;
      expect(after).toBe(before);
    }
  });
});

describe('lightboxSizesFor', () => {
  it('bounds the displayed width by both the row and the 70vh height cap, from the aspect', () => {
    expect(lightboxSizesFor({ width: 1661, height: 947 })).toBe('min(calc(100vw - 168px), calc(70vh * 1.754))');
    expect(lightboxSizesFor({ width: 947, height: 1661 })).toBe('min(calc(100vw - 168px), calc(70vh * 0.57))');
    expect(lightboxSizesFor({ width: 1500, height: 1500 })).toBe('min(calc(100vw - 168px), calc(70vh * 1))');
  });

  it('falls back to the full viewport for an unusable box', () => {
    expect(lightboxSizesFor({ width: 0, height: 100 })).toBe(LIGHTBOX_SIZES);
    expect(lightboxSizesFor({ width: 100, height: Number.NaN })).toBe(LIGHTBOX_SIZES);
  });
});

describe('embeddedTileSizes (PORT-120)', () => {
  it('keeps the viewport clauses under 1024px and caps the wider ones by the host column', () => {
    // section column 1024: (1024 - 32) / 3 = 330, (1024 - 48) / 4 = 244
    expect(embeddedTileSizes('section')).toBe(
      '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) min(33vw, 330px), min(25vw, 244px)',
    );
    // video column 896: 288 / 212
    expect(embeddedTileSizes('video')).toContain('min(33vw, 288px), min(25vw, 212px)');
    // product column 1472: 480 / 356
    expect(embeddedTileSizes('product')).toContain('min(33vw, 480px), min(25vw, 356px)');
    // blog column 1064: 344 / 254
    expect(embeddedTileSizes('blog')).toContain('min(33vw, 344px), min(25vw, 254px)');
  });

  it('never names a tile wider than the page grid tile, so TILE_WIDTHS still covers every host', () => {
    for (const host of Object.keys(PORTFOLIO_EMBED_COLUMN_WIDTHS) as (keyof typeof PORTFOLIO_EMBED_COLUMN_WIDTHS)[]) {
      const px = [...embeddedTileSizes(host).matchAll(/min\(\d+vw, (\d+)px\)/g)].map((m) => Number(m[1]));
      expect(px.length).toBe(2);
      // 2x of the widest embedded tile (480 on the product page) is 960, the largest candidate.
      for (const w of px) expect(w * 2).toBeLessThanOrEqual(Math.max(...TILE_WIDTHS));
    }
  });

  it('differs from the page sizes only in the two wide clauses', () => {
    const page = TILE_SIZES.split(', ');
    const embedded = embeddedTileSizes('section').split(', ');
    expect(embedded.slice(0, 2)).toEqual(page.slice(0, 2));
    expect(embedded.slice(2)).not.toEqual(page.slice(2));
  });
});
