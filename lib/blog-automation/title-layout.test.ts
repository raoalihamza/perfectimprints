/**
 * AUTO-209 / AUTO-210: the title laid over the header picture. Pure rules,
 * driven directly: the title is measured with the font's own advances and
 * broken into lines before anything is drawn; the four looks rotate, and a
 * regenerate always gives a new one; the product is never covered; the
 * contrast under a gradient is measured; a title the font cannot draw
 * exactly is not drawn at all; the vocabulary is closed; the photograph is
 * never letterboxed (no opaque shape takes a third of the frame).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRAND_RED,
  CURVE_HEIGHT_SHARE,
  CURVE_WIDTH_SHARE,
  GRADIENT_ALPHA,
  GRADIENT_FALLBACK_COLOUR,
  GRADIENT_HOLD_MAX_SHARE,
  MAX_PRODUCT_COVER,
  PANEL_FILL,
  PANEL_WIDTH_SHARE,
  TITLE_LAYOUTS,
  TITLE_LOOKS,
  TITLE_MIN_CONTRAST,
  TITLE_WHITE,
  buildTitleLayoutPrompt,
  contrastRatio,
  fitTitle,
  geometryFor,
  gradientAlphaAt,
  gradientColourOf,
  gradientContrast,
  hexLuminance,
  layoutFor,
  layoutLook,
  layoutSide,
  lockupParts,
  lookOrderFor,
  measureLine,
  measureText,
  normalizeTitle,
  parseStoredTreatment,
  parseTitleLayoutAnswer,
  planTitle,
  previousLookOf,
  productCover,
  seedOf,
  storedTreatmentOf,
  titleIsDrawable,
  undrawableCharacters,
  type PixelGrid,
  type TitleLayoutAnswer,
  type TitleLookName,
} from './title-layout';
import { TITLE_FONT_ADVANCES } from './title-font-metrics';
import { headerImageRenderSize, titleOnImageDrift } from '../blog/header-image';

const canvas = { width: 1376, height: 768 };
const LONG = 'Are Custom Water Bottles Worth It for Employee Wellness Programs?';
const NUMBERED = '9 Custom Coffee Mugs That Keep a Brand on Every Desk';
const COLON = "Custom Tote Bags: A Buyer's Guide for Bulk Orders";

/** A flat picture of one colour, sampled. */
function flat(r: number, g: number, b: number, w = 172, h = 96): PixelGrid {
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i += 1) {
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return { width: w, height: h, rgb };
}

/** A picture whose left half is a saturated blue and whose right half is light wood. */
function blueAndWood(): PixelGrid {
  const g = flat(0.85, 0.72, 0.55);
  for (let y = 0; y < g.height; y += 1) {
    for (let x = 0; x < g.width / 2; x += 1) {
      const i = (y * g.width + x) * 3;
      (g.rgb as Float32Array)[i] = 0.1;
      (g.rgb as Float32Array)[i + 1] = 0.3;
      (g.rgb as Float32Array)[i + 2] = 0.8;
    }
  }
  return g;
}

const answerWith = (box: TitleLayoutAnswer['productBox'], calmSide: TitleLayoutAnswer['calmSide'] = null): TitleLayoutAnswer => ({ productBox: box, calmSide, reason: '' });

describe('the title is measured and broken before it is drawn', () => {
  it('measures with the font advances: wider letters are wider, a space counts, and a line is narrower than its advances by the tracking', () => {
    expect(measureText('W', 100)).toBeGreaterThan(measureText('i', 100));
    expect(measureText('a b', 100)).toBeCloseTo(measureText('a', 100) + measureText(' ', 100) + measureText('b', 100), 6);
    expect(measureText('Custom Pens', 60)).toBeCloseTo((Array.from('Custom Pens').reduce((s, c) => s + TITLE_FONT_ADVANCES[c], 0) * 60) / 2048, 6);
    expect(measureLine('Custom Pens', 60)).toBeLessThan(measureText('Custom Pens', 60));
    expect(measureLine('W', 60)).toBe(measureText('W', 60));
  });

  it('fits a long title into a wide box on at most three lines, none wider than the box', () => {
    const f = fitTitle(LONG, { maxWidth: 1073, maxLines: 3, maxSize: 88, minSize: 52 });
    expect(f).not.toBeNull();
    expect(f!.lines.length).toBeLessThanOrEqual(3);
    expect(f!.lines.join(' ')).toBe(LONG);
    for (const line of f!.lines) expect(measureLine(line, f!.size)).toBeLessThanOrEqual(1073);
    expect(f!.size).toBeGreaterThanOrEqual(52);
  });

  it('never ends a line on a weak word when a better break exists, and never strands one word on a middle line of a wide box', () => {
    const g = geometryFor('gradient-left', COLON, canvas)!;
    expect(g.text.lines).toEqual(['Custom Tote Bags:', "A Buyer's Guide", 'for Bulk Orders']);
    const h = geometryFor('lower-third', '10 Promotional Measuring Cups That Belong in Every Breakroom', canvas)!;
    expect(h.text.lines).toEqual(['10 Promotional Measuring Cups', 'That Belong in Every Breakroom']);
  });

  it('a narrow column takes one word to a line without penalty, so the panel sets a long title larger, not smaller', () => {
    const p = geometryFor('panel-left', 'Are Custom Webcam Covers Worth It for Remote Teams?', canvas)!;
    expect(p.text.size).toBeGreaterThanOrEqual(56);
    expect(p.text.lines.length).toBeGreaterThanOrEqual(6);
    for (const line of p.text.lines) expect(measureLine(line, p.text.size)).toBeLessThanOrEqual(PANEL_WIDTH_SHARE * canvas.width - 104);
  });

  it('a one-word title fits every placement that applies on one line; the lockup does not apply to it', () => {
    for (const layout of TITLE_LAYOUTS) {
      const g = geometryFor(layout, 'Koozies', canvas);
      if (layoutLook(layout) === 'lockup') expect(g).toBeNull();
      else expect(g?.text.lines).toEqual(['Koozies']);
    }
  });

  it('a 75-character title fits every non-lockup look', () => {
    const t = 'Custom Classic Sunglasses: A Bulk Buyer’s Guide for Corporate Teams and Events';
    expect(t.length).toBeGreaterThanOrEqual(75);
    for (const layout of ['panel-left', 'panel-right', 'gradient-left', 'gradient-right', 'lower-third', 'lockup-left'] as const) {
      expect(geometryFor(layout, t, canvas), layout).not.toBeNull();
    }
  });

  it('the lockup sets a list number large beside the rest, or the part before a colon over the part after it, and nothing else', () => {
    expect(lockupParts(NUMBERED)).toEqual({ mode: 'number', big: '9', rest: 'Custom Coffee Mugs That Keep a Brand on Every Desk' });
    expect(lockupParts(COLON)).toEqual({ mode: 'colon', big: 'Custom Tote Bags', rest: "A Buyer's Guide for Bulk Orders" });
    expect(lockupParts(LONG)).toBeNull();
    expect(lockupParts('Pens:')).toBeNull();
    const n = geometryFor('lockup-left', NUMBERED, canvas)!;
    expect(n.big?.lines).toEqual(['9']);
    expect(n.big!.size).toBeGreaterThan(n.text.size * 2);
    expect(n.text.lines.join(' ')).toBe('Custom Coffee Mugs That Keep a Brand on Every Desk');
    expect(n.rule).not.toBeNull();
    const c = geometryFor('lockup-left', COLON, canvas)!;
    expect(c.big).toBeNull();
    expect(c.text.lines.join(' ')).toBe('Custom Tote Bags');
    expect(c.second?.lines.join(' ')).toBe("A Buyer's Guide for Bulk Orders");
    expect(c.text.size).toBeGreaterThan(c.second!.size);
  });
});

describe('the photograph is never letterboxed', () => {
  it('the only opaque shape, the panel, is under a third of the frame and runs the full height down one side', () => {
    expect(PANEL_WIDTH_SHARE).toBeLessThan(1 / 3);
    for (const side of ['left', 'right'] as const) {
      const g = geometryFor(layoutFor('panel', side), LONG, canvas)!;
      expect(g.panel).not.toBeNull();
      expect(g.panel!.w / canvas.width).toBeCloseTo(PANEL_WIDTH_SHARE, 2);
      expect(g.panel!.h).toBe(canvas.height);
      expect(g.panel!.x).toBe(side === 'left' ? 0 : canvas.width - g.panel!.w);
    }
  });

  it('the gradients hold past the title and dissolve to nothing well inside the frame', () => {
    for (const layout of ['gradient-left', 'gradient-right', 'lockup-left', 'lower-third'] as const) {
      const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), forced: layout })!;
      expect(plan.gradient).not.toBeNull();
      const g = plan.gradient!;
      expect(g.fadeTo).toBeGreaterThan(g.holdTo);
      const extent = g.side === 'bottom' ? canvas.height : canvas.width;
      expect(g.holdTo / extent).toBeLessThanOrEqual(GRADIENT_HOLD_MAX_SHARE + 0.01);
      // The whole title sits under the held part.
      const t = plan.text.rect;
      const far = g.side === 'left' ? t.x + t.w : g.side === 'right' ? canvas.width - t.x : canvas.height - t.y;
      expect(far).toBeLessThanOrEqual(g.holdTo);
      expect(g.fadeTo).toBeLessThanOrEqual(extent);
      // Nothing at the far end of the frame: the picture is never tinted edge to edge.
      expect(gradientAlphaAt(g, g.side === 'right' ? 0.005 * canvas.width : 0.995 * canvas.width, 0.005 * canvas.height, canvas)).toBe(0);
      expect(gradientAlphaAt(g, g.side === 'left' ? 10 : g.side === 'right' ? canvas.width - 10 : 10, canvas.height - 10, canvas)).toBe(GRADIENT_ALPHA === g.alpha ? g.alpha : g.alpha);
    }
  });

  it('no look other than the panel and the curve has any opaque shape, and the curve is a quarter of the frame at most, its lines inside it', () => {
    for (const layout of TITLE_LAYOUTS) {
      const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), forced: layout });
      if (!plan) continue;
      expect(plan.panel === null).toBe(layoutLook(layout) !== 'panel');
      expect(plan.curve === null).toBe(layoutLook(layout) !== 'curve');
    }
    const c = planTitle({ title: 'Are Custom Webcam Covers Worth It for Remote Teams?', canvas, grid: flat(0.5, 0.5, 0.5), forced: 'curve-left' })!;
    expect((Math.PI / 4) * CURVE_WIDTH_SHARE * CURVE_HEIGHT_SHARE).toBeLessThan(0.25);
    expect(c.curve!.rect.w / canvas.width).toBeCloseTo(CURVE_WIDTH_SHARE, 2);
    // Every line's right end sits inside the ellipse at that line's bottom.
    const cx = c.curve!.rect.w;
    const cy = c.curve!.rect.h;
    c.text.lines.forEach((line, i) => {
      const yb = c.text.rect.y + (i + 1) * c.text.lineHeight;
      expect(c.text.rect.x + measureLine(line, c.text.size)).toBeLessThan(cx * Math.sqrt(1 - (yb / cy) ** 2));
    });
    expect(c.logo).toMatchObject({ kind: 'badge', white: true });
    expect(c.badge).toMatchObject({ fill: BRAND_RED });
    expect(c.badge!.cx).toBeGreaterThan(canvas.width);
    const r = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), forced: 'curve-right' })!;
    expect(r.text.align).toBe('right');
    expect(r.badge!.cx).toBeLessThan(0);
    // The product under the badge's corner: the badge gives way to the bare mark.
    const covered = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), forced: 'curve-left', answer: answerWith([700, 800, 1000, 1000]) })!;
    expect(covered.badge).toBeNull();
  });
});

describe('drawable means exactly the title', () => {
  it('every character of every shipped title shape is drawable; a CJK character or an emoji is not', () => {
    expect(titleIsDrawable('Custom Tote Bags: A Buyer\u2019s Guide \u2014 Bulk Orders (2026)?')).toBe(true);
    expect(titleIsDrawable('Café Mugs & Co.')).toBe(true);
    expect(undrawableCharacters('Custom 中 Pens')).toEqual(['中']);
    expect(titleIsDrawable('Custom Pens \u{1F389}')).toBe(false);
    expect(titleIsDrawable('   ')).toBe(false);
  });

  it('planTitle returns null for an undrawable title, never a wrong one', () => {
    expect(planTitle({ title: 'Custom 中 Pens', canvas })).toBeNull();
    expect(planTitle({ title: '', canvas })).toBeNull();
  });

  it('normalizes only the spacing, never the words', () => {
    expect(normalizeTitle('  Custom   Pens ')).toBe('Custom Pens');
  });
});

describe('the text is white and holds its contrast', () => {
  it('the panel carries white text at well over the minimum', () => {
    expect(contrastRatio(hexLuminance(PANEL_FILL), 1)).toBeGreaterThan(10);
    const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.9, 0.9, 0.9), forced: 'panel-left' })!;
    expect(plan.text.colour).toBe(TITLE_WHITE);
    expect(plan.contrast).toBeGreaterThanOrEqual(TITLE_MIN_CONTRAST);
    expect(plan.rule?.fill).toBe(BRAND_RED);
  });

  it('under a gradient the contrast is MEASURED over the sampled picture, and holds on a white picture, a black one and a mid grey', () => {
    for (const g of [flat(1, 1, 1), flat(0, 0, 0), flat(0.5, 0.5, 0.5)]) {
      for (const layout of ['gradient-left', 'gradient-right', 'lower-third', 'lockup-left'] as const) {
        const plan = planTitle({ title: NUMBERED, canvas, grid: g, forced: layout })!;
        expect(plan.measured).toBe(true);
        expect(plan.contrast, layout).toBeGreaterThanOrEqual(TITLE_MIN_CONTRAST);
        expect(gradientContrast(g, plan.text.rect, canvas, plan.gradient!)).toBeGreaterThanOrEqual(TITLE_MIN_CONTRAST);
      }
    }
  });

  it('the gradient takes the picture\'s own colour, deepened; a grey picture gets the navy fallback; no grid gets the fallback and says the contrast was not measured', () => {
    const blue = gradientColourOf(blueAndWood());
    expect(blue.hue).not.toBeNull();
    expect(blue.hex).not.toBe(GRADIENT_FALLBACK_COLOUR);
    expect(hexLuminance(blue.hex)).toBeLessThan(0.03);
    expect(gradientColourOf(flat(0.5, 0.5, 0.5)).hex).toBe(GRADIENT_FALLBACK_COLOUR);
    expect(gradientColourOf(null).hex).toBe(GRADIENT_FALLBACK_COLOUR);
    const plan = planTitle({ title: NUMBERED, canvas, forced: 'gradient-left' })!;
    expect(plan.measured).toBe(false);
    expect(plan.gradient?.colour).toBe(GRADIENT_FALLBACK_COLOUR);
    expect(plan.contrast).toBeGreaterThanOrEqual(TITLE_MIN_CONTRAST);
    expect(plan.reasons.join(' ')).toContain('could not be sampled');
  });
});

describe('the rotation: four looks, and a regenerate always gives a new one', () => {
  it('is four looks over seven placements, and nothing else parses', () => {
    expect(TITLE_LOOKS).toEqual(['panel', 'gradient', 'lower-third', 'lockup', 'curve']);
    expect(TITLE_LAYOUTS).toHaveLength(9);
    expect(layoutLook('lower-third')).toBe('lower-third');
    expect(layoutSide('gradient-right')).toBe('right');
    expect(layoutSide('lower-third')).toBe('bottom');
    expect(layoutFor('lockup', 'right')).toBe('lockup-right');
    expect(parseStoredTreatment({ layout: 'band-top', colour: 'navy', productBox: null })).toBeNull();
    expect(parseStoredTreatment({ layout: 'corner-top-left' })).toBeNull();
  });

  it('the cycle starts where the seed says for a first picture and right after the current look for a regenerate', () => {
    expect(lookOrderFor(0, null)).toEqual(['panel', 'gradient', 'lower-third', 'lockup', 'curve']);
    expect(lookOrderFor(2, null)).toEqual(['lower-third', 'lockup', 'curve', 'panel', 'gradient']);
    expect(lookOrderFor(2, 'panel')).toEqual(['gradient', 'lower-third', 'lockup', 'curve', 'panel']);
    expect(lookOrderFor(99, 'curve')).toEqual(['panel', 'gradient', 'lower-third', 'lockup', 'curve']);
    for (const prev of TITLE_LOOKS) expect(lookOrderFor(7, prev)[0]).not.toBe(prev);
  });

  it('six regenerates of a numbered title walk all five looks and come back; a title with no number or colon walks four', () => {
    const walk = (title: string, n: number) => {
      const seen: TitleLookName[] = [];
      let previous: TitleLookName | null = null;
      for (let i = 0; i < n; i += 1) {
        const plan = planTitle({ title, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'post', previous, room: 'left' })!;
        seen.push(plan.look);
        previous = plan.look;
      }
      return seen;
    };
    const numbered = walk(NUMBERED, 6);
    expect(new Set(numbered.slice(0, 5)).size).toBe(5);
    expect(numbered[5]).toBe(numbered[0]);
    for (let i = 1; i < numbered.length; i += 1) expect(numbered[i]).not.toBe(numbered[i - 1]);
    const plain = walk(LONG, 5);
    expect(plain).not.toContain('lockup');
    expect(new Set(plain.slice(0, 4)).size).toBe(4);
  });

  it('the same post always gets the same first look, and different posts get different ones', () => {
    expect(seedOf('custom-tote-bags')).toBe(seedOf('custom-tote-bags'));
    const a = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x' })!;
    const b = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x' })!;
    expect(a.layout).toBe(b.layout);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) seen.add(planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: `post-${i}` })!.look);
    expect(seen.size).toBe(5);
  });

  it('the side follows the room the picture was asked to keep calm, unless the vision call says only the other side is calm', () => {
    const left = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', forced: null, previous: 'lower-third' })!;
    expect(left.layout).toBe('lockup-left');
    const right = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'right', previous: 'lower-third' })!;
    expect(right.layout).toBe('lockup-right');
    const flipped = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', previous: 'lower-third', answer: answerWith(null, 'right') })!;
    expect(flipped.layout).toBe('lockup-right');
    expect(flipped.reasons.join(' ')).toContain('right third is the calm one');
    const either = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', previous: 'lower-third', answer: answerWith(null, 'either') })!;
    expect(either.layout).toBe('lockup-left');
  });

  it('a forced layout (a redraw) is the only one tried', () => {
    const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', forced: 'panel-right' })!;
    expect(plan.layout).toBe('panel-right');
    expect(planTitle({ title: LONG, canvas, grid: flat(0.5, 0.5, 0.5), forced: 'lockup-left' })).toBeNull();
  });
});

describe('the product is not covered', () => {
  it('a look whose footprint covers the product is refused and the next in the cycle is tried', () => {
    // The product fills the left third: the left panel is refused, the lower third (next in the cycle) takes over.
    const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', previous: 'lockup', answer: answerWith([0, 0, 1000, 330]) })!;
    expect(plan.layout).not.toBe('panel-left');
    expect(plan.reasons.join(' ')).toMatch(/panel-left: it would cover \d+% of the product/);
  });

  it('a gradient may darken part of the product but its lettering may not cover it; a product more than half under the tint refuses the look', () => {
    // The product sits in the middle third: the left gradient's held part reaches it a little, the title does not.
    const mid = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', forced: 'gradient-left', answer: answerWith([200, 400, 800, 700]) })!;
    expect(mid.layout).toBe('gradient-left');
    // The product fills the left half: the title would sit on it, so the gradient is refused.
    const onIt = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', previous: 'panel', answer: answerWith([0, 0, 1000, 500]) })!;
    expect(onIt.layout).not.toBe('gradient-left');
    expect(onIt.reasons.join(' ')).toMatch(/gradient-left: the title would cover \d+% of the product/);
    // The product sits low and wide: the lower third's title clears it but its tint would darken most of it.
    const low = planTitle({ title: 'Custom Pens', canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', previous: 'gradient', answer: answerWith([600, 300, 1000, 900]) })!;
    expect(low.layout).not.toBe('lower-third');
    expect(low.reasons.join(' ')).toMatch(/lower-third: its gradient would darken \d+% of the product/);
  });

  it('a product in the far corner, clear of everything, is simply accepted on the first look', () => {
    const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), seed: 'x', room: 'left', previous: 'curve', answer: answerWith([100, 700, 500, 950]) })!;
    expect(plan.layout).toBe('panel-left');
    expect(plan.reasons.filter((r) => !r.includes('next look was tried first'))).toEqual([]);
  });

  it('when every look covers the product (a product filling the frame), the one covering least is used and the title still goes on', () => {
    const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), answer: answerWith([0, 0, 1000, 1000]) });
    expect(plan).not.toBeNull();
    expect(plan!.reasons.join(' ')).toContain('every look covers part of the product');
  });

  it('productCover is the share of the product under the rectangle', () => {
    expect(productCover({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 })).toBeCloseTo(0.25, 6);
    expect(productCover({ x: 0, y: 0, w: 100, h: 100 }, null)).toBe(0);
    expect(MAX_PRODUCT_COVER).toBeLessThan(0.2);
  });
});

describe('the logo: no box, in the panel or in a free corner', () => {
  it('the panel carries the full logo, white, at its foot; the side looks carry the bare mark in the opposite bottom corner; the lower third a white mark', () => {
    const panel = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), forced: 'panel-left' })!;
    expect(panel.logo).toMatchObject({ kind: 'full', white: true });
    expect(panel.logo!.rect.x).toBe(panel.text.rect.x);
    const left = planTitle({ title: NUMBERED, canvas, grid: flat(0.9, 0.9, 0.9), forced: 'gradient-left' })!;
    expect(left.logo).toMatchObject({ kind: 'mark', white: false });
    expect(left.logo!.rect.x).toBeGreaterThan(canvas.width / 2);
    const dark = planTitle({ title: NUMBERED, canvas, grid: flat(0.1, 0.1, 0.1), forced: 'gradient-right' })!;
    expect(dark.logo).toMatchObject({ kind: 'mark', white: true });
    expect(dark.logo!.rect.x).toBeLessThan(canvas.width / 2);
    const lower = planTitle({ title: NUMBERED, canvas, grid: flat(0.9, 0.9, 0.9), forced: 'lower-third' })!;
    expect(lower.logo).toMatchObject({ kind: 'mark', white: true });
  });

  it('the mark is dropped when the product sits in its corner, and never drawn when asked not to', () => {
    const covered = planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), forced: 'gradient-left', answer: answerWith([700, 800, 1000, 1000]) })!;
    expect(covered.logo).toBeNull();
    expect(planTitle({ title: NUMBERED, canvas, grid: flat(0.5, 0.5, 0.5), forced: 'panel-left', logo: false })!.logo).toBeNull();
  });
});

describe('the vision call and the stored treatment', () => {
  it('the answer is the product box and the calm side; anything outside the vocabulary is dropped', () => {
    const parsed = parseTitleLayoutAnswer({ productBox: [100, 100, 900, 900], calmSide: 'left', reason: ' ok ' });
    expect(parsed).toEqual({ productBox: [100, 100, 900, 900], calmSide: 'left', reason: 'ok' });
    expect(parseTitleLayoutAnswer({ productBox: [5, 5, 1, 1], calmSide: 'top' })).toEqual({ productBox: null, calmSide: null, reason: '' });
    expect(parseTitleLayoutAnswer(null)).toEqual({ productBox: null, calmSide: null, reason: '' });
  });

  it('the prompt names the title only to size it, never asks for it to be written, never asks for a look, and asks about the calm third', () => {
    const { user, system } = buildTitleLayoutPrompt('Custom Pens', 'left');
    expect(user).toContain('"Custom Pens" (11 characters)');
    expect(user).toContain('The title will be laid over the photograph by code');
    expect(user).toContain('left third calm');
    expect(user).toContain('calmSide');
    expect(user).not.toMatch(/\b(write|draw|render) the title\b/i);
    expect(user).not.toMatch(/band|corner|colours?:/);
    expect(system).toContain('graphic designer');
  });

  it('a stored treatment round-trips, reproduces the look exactly, and names the look a regenerate moves on from', () => {
    const answer = answerWith([500, 0, 1000, 500]);
    const plan = planTitle({ title: NUMBERED, canvas, grid: flat(0.9, 0.9, 0.9), seed: 'x', forced: 'lockup-right', answer })!;
    const stored = JSON.stringify(storedTreatmentOf(plan, answer));
    expect(parseStoredTreatment(stored)).toEqual({ layout: 'lockup-right', productBox: [500, 0, 1000, 500] });
    expect(previousLookOf(stored)).toBe('lockup');
    const again = planTitle({ title: NUMBERED, canvas, grid: flat(0.9, 0.9, 0.9), seed: 'x', forced: parseStoredTreatment(stored)!.layout, answer })!;
    expect(again.text).toEqual(plan.text);
    expect(parseStoredTreatment('not json')).toBeNull();
    expect(previousLookOf(null)).toBeNull();
    expect(previousLookOf('{"layout":"band-top","colour":"navy","productBox":null}')).toBeNull();
  });
});

describe('the Studio and the page (AUTO-209)', () => {
  it('the drift warning fires only when the title moved, ignoring case, spacing and quote shapes', () => {
    expect(titleOnImageDrift("Custom Tote Bags: A Buyer's Guide", 'Custom Tote Bags: A Buyer’s Guide')).toBeNull();
    expect(titleOnImageDrift('Custom  Pens', 'custom pens')).toBeNull();
    expect(titleOnImageDrift(undefined, 'Custom Pens')).toBeNull();
    expect(titleOnImageDrift('Custom Pens', 'Custom Koozies')).toContain('Redraw title on header image');
  });

  it('the hero size comes from the asset id, scaled, with the crop frame taken off; square for a hot link; null for nothing', () => {
    const post = { headerImage: { asset: { _ref: 'image-abc-1376x768-png' } } };
    expect(headerImageRenderSize(post, 1400)).toEqual({ width: 1400, height: 781 });
    const cropped = { headerImage: { asset: { _ref: 'image-abc-1000x1000-jpg' }, crop: { top: 0.25, bottom: 0.25, left: 0, right: 0 } } };
    expect(headerImageRenderSize(cropped, 1400)).toEqual({ width: 1400, height: 700 });
    expect(headerImageRenderSize({ externalHeaderImage: { url: 'https://imgsirv.geiger.com/x.jpg?w=275' } }, 1400)).toEqual({ width: 1400, height: 1400 });
    expect(headerImageRenderSize({}, 1400)).toBeNull();
  });

  it('the font metrics, the font bytes and the logo come from their generators and agree on the weight', () => {
    const metrics = readFileSync(join(__dirname, 'title-font-metrics.ts'), 'utf8');
    const font = readFileSync(join(__dirname, 'title-font.ts'), 'utf8');
    expect(metrics).toContain('TITLE_FONT_WEIGHT = 800');
    expect(font).toContain('weight 800');
    expect(readFileSync(join(__dirname, 'title-font.OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE');
    const logo = readFileSync(join(__dirname, 'title-logo.ts'), 'utf8');
    expect(logo).toContain('GENERATED FILE');
    expect(logo).toContain('#231f20');
    expect(logo).toContain('#ea2929');
    // The inlined logo IS public/logo.svg, comments and line breaks aside.
    const svg = readFileSync(join(__dirname, '..', '..', 'public', 'logo.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\r?\n\s*/g, '');
    expect(logo).toContain(JSON.stringify(svg));
  });
});
