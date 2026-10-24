/**
 * Drawing the title onto a header picture (AUTO-209, the looks replaced by
 * AUTO-210), server side. Every decision (look, side, line breaks, size,
 * gradient colour and reach, logo) is made by the pure title-layout.ts; this
 * file only draws a plan and samples a picture, both through next/og's
 * ImageResponse (satori lays the elements out, resvg paints them), which
 * ships with Next 16: no new dependency.
 *
 * WHY next/og AND NOT sharp. sharp is only an optional dependency of Next,
 * not installed at the root of this project, and its text rendering goes
 * through the operating system's fonts, which a serverless function may not
 * have (a title of boxes). satori draws with the font we hand it (Inter
 * ExtraBold, inlined in title-font.ts) and resvg is WebAssembly, so the
 * output is the same on Ali's machine, in vitest and on Vercel.
 *
 * THE PHOTOGRAPH IS NEVER LETTERBOXED: it is drawn first, full bleed, and
 * everything else sits on top of it.
 *
 * The output is a PNG (resvg writes nothing else), stored as the header
 * asset; the site never serves those bytes directly: the hero and the cards
 * ask Sanity's image CDN for a sized WebP or AVIF, and a share asks for a
 * sized PNG, so the title travels with the picture wherever it is shared.
 *
 * Measured (AUTO-209, Ali's machine): the first render in a process is about
 * 2.5 s (the WebAssembly loads), every later one about 0.3 to 0.7 s; a
 * 1376 x 768 titled photograph is about 1.4 to 1.9 MB.
 */
import { inflateSync } from 'node:zlib';
import { ImageResponse } from 'next/og';
import { titleFontData } from './title-font';
import { TITLE_FONT_FAMILY, TITLE_FONT_WEIGHT } from './title-font-metrics';
import { svgDataUri, titleLogoAllWhite, titleLogoWhite, titleMark } from './title-logo';
import {
  BASE_CANVAS_WIDTH,
  planTitle,
  type Canvas,
  type PixelGrid,
  type TextBlock,
  type TitleLayoutAnswer,
  type TitleLayoutName,
  type TitleLookName,
  type TitlePlan,
  type TitleSide,
} from './title-layout';

export interface PictureBytes {
  mimeType: string;
  base64: string;
}

let fontCache: Buffer | null = null;
function font(): Buffer {
  if (!fontCache) fontCache = titleFontData();
  return fontCache;
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

/** The grid the gradients are measured on: 1376 x 768 sampled to 172 x 96, one cell per 8 x 8 pixels. */
export const PIXEL_GRID_WIDTH = 172;

/** The picture sampled as a coarse grid of colours, by drawing it small and reading the pixels back. */
export async function pixelGridOf(picture: PictureBytes, canvas: Canvas): Promise<PixelGrid> {
  const w = PIXEL_GRID_WIDTH;
  const h = Math.max(1, Math.round((PIXEL_GRID_WIDTH * canvas.height) / canvas.width));
  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: 'flex' }}>
        <img src={dataUri(picture)} width={w} height={h} alt="" />
      </div>
    ),
    { width: w, height: h },
  );
  return decodePngToRgb(Buffer.from(await res.arrayBuffer()));
}

function hexToCss(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** The CSS of a plan's gradient, exactly what title-layout.ts's gradientAlphaAt describes. */
export function gradientCss(plan: TitlePlan): string {
  const g = plan.gradient;
  if (!g) return '';
  const extent = g.side === 'bottom' ? plan.canvas.height : plan.canvas.width;
  const dir = { left: 'to right', right: 'to left', bottom: 'to top', top: 'to bottom' }[g.side];
  const hold = Math.round((g.holdTo / extent) * 1000) / 10;
  const fade = Math.min(100, Math.round((g.fadeTo / extent) * 1000) / 10);
  return `linear-gradient(${dir}, ${hexToCss(g.colour, g.alpha)} 0%, ${hexToCss(g.colour, g.alpha)} ${hold}%, ${hexToCss(g.colour, 0)} ${fade}%)`;
}

/** The curve and the logo's badge as one SVG the size of the frame, drawn under the lettering. */
function shapesSvg(plan: TitlePlan): string {
  const { width: W, height: H } = plan.canvas;
  const parts: string[] = [];
  const c = plan.curve;
  if (c) {
    const cx = c.rect.w;
    const cy = c.rect.h;
    parts.push(c.side === 'left' ? `<path d="M0 0 L${cx} 0 A${cx} ${cy} 0 0 1 0 ${cy} Z" fill="${c.fill}"/>` : `<path d="M${W} 0 L${W - cx} 0 A${cx} ${cy} 0 0 0 ${W} ${cy} Z" fill="${c.fill}"/>`);
  }
  if (plan.badge) parts.push(`<circle cx="${plan.badge.cx}" cy="${plan.badge.cy}" r="${plan.badge.r}" fill="${plan.badge.fill}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

function textBlock(block: TextBlock, colour: string, letterSpacing: number, key: string) {
  return (
    <div key={key} style={{ position: 'absolute', left: block.rect.x, top: block.rect.y, width: block.rect.w, display: 'flex', flexDirection: 'column', alignItems: block.align === 'right' ? 'flex-end' : 'flex-start' }}>
      {block.lines.map((line, i) => {
        const spans = block.spans?.[i];
        const style = {
          display: 'flex',
          whiteSpace: 'pre' as const,
          fontFamily: TITLE_FONT_FAMILY,
          fontWeight: TITLE_FONT_WEIGHT,
          fontSize: block.size,
          lineHeight: `${block.lineHeight}px`,
          height: block.lineHeight,
          color: colour,
          letterSpacing: letterSpacing * block.size,
          ...(block.shadow ? { textShadow: block.shadow } : {}),
        };
        // The headline's two tones: each run its own box in a row, the space kept inside the first run (`pre`).
        return (
          <div key={i} style={style}>
            {spans
              ? spans.map((span, k) => (
                  <div key={k} style={{ display: 'flex', whiteSpace: 'pre', color: span.colour }}>
                    {span.text}
                  </div>
                ))
              : line}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Draw a plan over the picture and return the PNG bytes. The lines are drawn
 * exactly as the plan broke them, `whiteSpace: nowrap`, so the renderer can
 * never re-wrap the title. Order: the photograph, the gradient, the panel,
 * the curve and the logo's badge, the rule, the lettering, the logo.
 */
export async function renderTitlePlan(picture: PictureBytes | null, plan: TitlePlan): Promise<Buffer> {
  const { width, height } = plan.canvas;
  const t = plan.text;
  const logo = plan.logo;
  const logoSrc = logo ? svgDataUri(logo.kind === 'full' ? titleLogoWhite() : logo.kind === 'badge' ? titleLogoAllWhite() : titleMark(logo.white)) : '';
  const element = (
    <div style={{ width, height, display: 'flex', position: 'relative', backgroundColor: '#ffffff' }}>
      {picture && <img src={dataUri(picture)} width={width} height={height} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />}
      {plan.gradient && <div style={{ position: 'absolute', left: 0, top: 0, width, height, display: 'flex', backgroundImage: gradientCss(plan) }} />}
      {plan.panel && (
        <div style={{ position: 'absolute', left: plan.panel.rect.x, top: plan.panel.rect.y, width: plan.panel.rect.w, height: plan.panel.rect.h, display: 'flex', backgroundColor: plan.panel.fill }} />
      )}
      {(plan.curve || plan.badge) && <img src={svgDataUri(shapesSvg(plan))} width={width} height={height} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />}
      {plan.rule && <div style={{ position: 'absolute', left: plan.rule.rect.x, top: plan.rule.rect.y, width: plan.rule.rect.w, height: plan.rule.rect.h, display: 'flex', backgroundColor: plan.rule.fill }} />}
      {plan.big && textBlock(plan.big, t.colour, t.letterSpacing, 'big')}
      {textBlock(t, t.colour, t.letterSpacing, 'text')}
      {plan.second && textBlock(plan.second, t.colour, t.letterSpacing, 'second')}
      {logo && <img src={logoSrc} width={logo.rect.w} height={logo.rect.h} alt="" style={{ position: 'absolute', left: logo.rect.x, top: logo.rect.y }} />}
    </div>
  );
  const res = new ImageResponse(element, {
    width,
    height,
    fonts: [{ name: TITLE_FONT_FAMILY, data: font(), weight: TITLE_FONT_WEIGHT, style: 'normal' }],
  });
  return Buffer.from(await res.arrayBuffer());
}

export interface ComposedTitle {
  /** The titled picture: what is stored as the header asset. */
  bytes: Buffer;
  mimeType: 'image/png';
  plan: TitlePlan;
  /** The time the sampling, the plan and the drawing took together. */
  ms: number;
}

export interface ComposeTitledHeaderArgs {
  picture: PictureBytes;
  title: string;
  answer: TitleLayoutAnswer | null;
  seed: string;
  /** AUTO-210: the look the post's picture has now, so a regenerate gets the next one. */
  previous?: TitleLookName | null;
  /** AUTO-210: the third of the frame the picture was asked to keep calm; AUTO-211: the top, for the headline. */
  room?: TitleSide | 'top' | null;
  /** A redraw of the title on the kept copy: this exact layout. */
  forced?: TitleLayoutName | null;
}

/**
 * The whole compose step for one picture: read its size, sample it, plan the
 * title over it (title-layout.ts decides everything), draw. Null when the
 * title cannot be drawn exactly (an empty title, or a character the font
 * does not have): the caller then stores the picture without a title rather
 * than with a wrong one. Throws only when drawing itself fails.
 */
export async function composeTitledHeader(args: ComposeTitledHeaderArgs): Promise<ComposedTitle | null> {
  const t0 = Date.now();
  const bytes = Buffer.from(args.picture.base64, 'base64');
  const canvas = imageSize(bytes) ?? { width: BASE_CANVAS_WIDTH, height: Math.round((BASE_CANVAS_WIDTH * 9) / 16) };
  // A picture that cannot be sampled is still titled (planTitle then uses the gradient's own figure and the fallback colour).
  const grid = await pixelGridOf(args.picture, canvas).catch(() => null);
  const plan = planTitle({ title: args.title, canvas, grid, answer: args.answer, seed: args.seed, previous: args.previous ?? null, room: args.room ?? null, forced: args.forced ?? null });
  if (!plan) return null;
  const png = await renderTitlePlan(args.picture, plan);
  return { bytes: png, mimeType: 'image/png', plan, ms: Date.now() - t0 };
}
