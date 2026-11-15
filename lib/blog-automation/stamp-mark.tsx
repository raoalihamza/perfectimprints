/**
 * Stamping the P! mark onto a header picture (AUTO-220), server side. The
 * corner and the colours are decided by the pure mark-placement.ts; this file
 * samples the picture and draws, both through next/og's ImageResponse (satori
 * lays the elements out, resvg paints them), which ships with Next: no new
 * dependency.
 *
 * THIS IS ALL THAT IS LEFT OF THE COMPOSE STACK. AUTO-209 to AUTO-212 drew the
 * post's title onto the picture in code (a layout vision call, an inlined
 * font, six looks, an untitled copy, a redraw button). The image model now
 * draws the title itself (resolve-header-image.ts), so every piece of that
 * was deleted, and the only thing code still puts on a picture is the mark.
 *
 * THE PICTURE IS NEVER RESIZED OR CROPPED: it is drawn first, full bleed, at
 * its own size, and the mark sits on top of it.
 *
 * WHY next/og AND NOT sharp. sharp is only an optional dependency of Next,
 * not installed at the root of this project; resvg is WebAssembly, so the
 * output is the same on Ali's machine, in vitest and on Vercel.
 *
 * The output is a PNG (resvg writes nothing else), stored as the header
 * asset. The site never serves those bytes directly: the hero and the cards
 * ask Sanity's image CDN for a sized WebP or AVIF, and a share asks for a
 * sized JPEG (app/blog/[slug]/page.tsx).
 *
 * Measured (AUTO-209, the same renderer): the first render in a process is
 * about 2.5 s (the WebAssembly loads), every later one about 0.3 to 0.7 s.
 *
 * NO JSX IN THIS FILE, on purpose: the elements are built with createElement.
 * A harness run under tsx from a repo whose tsconfig says `jsx: preserve`
 * compiled the JSX to React.createElement with no React in scope, and every
 * stamp failed with "React is not defined" (AUTO-220; the chain stored the
 * pictures without the mark and said so, as it should). Next compiles JSX
 * its own way and never had the fault, but a stamp that depends on how the
 * file happens to be compiled is one more way to lose the mark silently.
 */
import { inflateSync } from 'node:zlib';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { headerMarkSvg, svgDataUri } from './header-mark';
import { chooseMarkPlacement, markDrawRect, type Canvas, type MarkPlacement, type PixelGrid } from './mark-placement';

export interface PictureBytes {
  mimeType: string;
  base64: string;
}

function dataUri(p: PictureBytes): string {
  return `data:${p.mimeType};base64,${p.base64}`;
}

/** The width and height of a JPEG or PNG, read from its header; null for anything else. */
export function imageSize(bytes: Buffer): Canvas | null {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = bytes.readUInt16BE(i + 2);
      // Start-of-frame markers carry the size; DHT (C4), JPG (C8) and DAC (CC) are not frames.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * A PNG (8-bit RGB or RGBA, not interlaced, the only kind resvg writes)
 * decoded to sRGB channels 0..1, three a pixel. Throws on anything else.
 */
export function decodePngToRgb(png: Buffer): PixelGrid {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.subarray(off + 4, off + 8).toString('latin1');
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('PNG bit depth is not 8');
      colourType = data[9];
      if (data[12] !== 0) throw new Error('PNG is interlaced');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`PNG colour type ${colourType} is not RGB or RGBA`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Float32Array(width * height * 3);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const base = y * (stride + 1);
    const filter = raw[base];
    for (let x = 0; x < stride; x += 1) {
      const v = raw[base + 1 + x];
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let r: number;
      if (filter === 0) r = v;
      else if (filter === 1) r = v + a;
      else if (filter === 2) r = v + b;
      else if (filter === 3) r = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[x] = r & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      for (let k = 0; k < 3; k += 1) out[(y * width + x) * 3 + k] = cur[x * bpp + k] / 255;
    }
    cur.copy(prev);
  }
  return { width, height, rgb: out };
}

/** The grid the corners are measured on: one cell per 8 x 8 pixels of a 1376 wide picture, about 9 x 9 of a 1536 wide one. */
export const PIXEL_GRID_WIDTH = 172;

/** The picture sampled as a coarse grid of colours, by drawing it small and reading the pixels back. */
export async function pixelGridOf(picture: PictureBytes, canvas: Canvas): Promise<PixelGrid> {
  const w = PIXEL_GRID_WIDTH;
  const h = Math.max(1, Math.round((PIXEL_GRID_WIDTH * canvas.height) / canvas.width));
  const element = createElement('div', { style: { width: w, height: h, display: 'flex' } }, createElement('img', { src: dataUri(picture), width: w, height: h, alt: '' }));
  const res = new ImageResponse(element, { width: w, height: h });
  return decodePngToRgb(Buffer.from(await res.arrayBuffer()));
}

/** Draw the mark over the picture (or over a flat colour, for the tests) and return the PNG bytes. */
export async function renderStamp(picture: PictureBytes | null, canvas: Canvas, placement: MarkPlacement, background = '#ffffff'): Promise<Buffer> {
  const { width, height } = canvas;
  // With an outline the SVG is a little larger than the mark; the mark itself stays in its own box.
  const r = markDrawRect(placement);
  const element = createElement(
    'div',
    { style: { width, height, display: 'flex', position: 'relative', backgroundColor: background } },
    picture ? createElement('img', { key: 'picture', src: dataUri(picture), width, height, alt: '', style: { position: 'absolute', left: 0, top: 0 } }) : null,
    createElement('img', { key: 'mark', src: svgDataUri(headerMarkSvg(placement.variant, placement.halo)), width: r.w, height: r.h, alt: '', style: { position: 'absolute', left: r.x, top: r.y } }),
  );
  return Buffer.from(await new ImageResponse(element, { width, height }).arrayBuffer());
}

export interface StampedPicture {
  /** The picture with the mark on it: what is stored as the header asset. */
  bytes: Buffer;
  mimeType: 'image/png';
  placement: MarkPlacement;
  canvas: Canvas;
  /** The time the sampling and the drawing took together. */
  ms: number;
}

/**
 * The whole stamp step for one picture: read its size, sample it, choose the
 * corner and the colours (mark-placement.ts), draw. Throws when the picture's
 * size cannot be read or the drawing fails; the caller then stores the
 * picture without the mark and says so.
 */
export async function stampMark(picture: PictureBytes): Promise<StampedPicture> {
  const t0 = Date.now();
  const canvas = imageSize(Buffer.from(picture.base64, 'base64'));
  if (!canvas) throw new Error('the picture is not a JPEG or a PNG, so its size could not be read');
  // A picture that cannot be sampled is still stamped (bottom right, in the mark's own colours).
  const grid = await pixelGridOf(picture, canvas).catch(() => null);
  const placement = chooseMarkPlacement(canvas, grid);
  const png = await renderStamp(picture, canvas, placement);
  return { bytes: png, mimeType: 'image/png', placement, canvas, ms: Date.now() - t0 };
}
