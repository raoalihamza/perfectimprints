/**
 * FIX-920 Part 1: the comparison shape, read for the first time.
 *
 * AUTO-205 shipped the comparison shape without ever generating one. Measured
 * over the 2,121 usable topics on 2026-10-13, 139 took the shape by rotation:
 * 55 of them on "materials" that were not products of the category at all
 * (toothpicks was offered stainless steel and plastic from 40 flasks and shot
 * cups), and 70 more on a topic narrower than the product (a brand, a place,
 * a shape, another material), which a comparison of two catalogue materials
 * talks past. Fourteen were left. The first of them was generated, read, and
 * found half invented, so the rotation no longer picks the shape at all; the
 * grounding rules are kept, and tested here, as what it would need before it
 * is turned on again.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCategoryContent, getMaterialVariantsForRoot } from '../categories';
import {
  availableShapes,
  chooseTitleShape,
  COMPARISON_IN_ROTATION,
  comparisonCanBeGrounded,
  comparisonIsAvailable,
  LIST_ROTATION_WEIGHT,
  shapeRotation,
  topicIsTheProduct,
  triggeredShape,
} from './blog-shape';
import { productsNamedForRoot } from '../ai/category-resolver';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('topicIsTheProduct: the topic names the product and nothing narrower', () => {
  it('a topic that is the category, with or without the promo words every search carries', () => {
    expect(topicIsTheProduct('promotional scarves', 'scarves', ['knit', 'polyester'])).toBe(true);
    expect(topicIsTheProduct('corporate scarves', 'scarves', ['knit', 'polyester'])).toBe(true);
    expect(topicIsTheProduct('custom printed folding chairs', 'folding-chairs', ['mesh', 'polyester'])).toBe(true);
    expect(topicIsTheProduct('branded cups', 'stadium-cups', ['poly-propylene', 'steel'])).toBe(true);
    expect(topicIsTheProduct('promotional bottle', 'water-bottles', ['steel', 'aluminum'])).toBe(true);
  });

  it('a topic that names one of the materials the category is sold in is still the product', () => {
    expect(topicIsTheProduct('custom plastic pens', 'pens', ['plastic', 'metal'])).toBe(true);
    expect(topicIsTheProduct('promotional bamboo usb flash drives', 'usb-flash-drives', ['bamboo', 'wood'])).toBe(true);
    expect(topicIsTheProduct('stainless koozies', 'koozies', ['foam', 'stainless-steel'])).toBe(true);
  });

  it('a brand, a place, a shape or a material the category does not list makes the topic narrower', () => {
    const pens = ['plastic', 'metal', 'aluminum'];
    expect(topicIsTheProduct('custom yeti coolers', 'coolers', ['polyester', 'nylon'])).toBe(false);
    expect(topicIsTheProduct('promotional pens plymouth logo printing', 'pens', pens)).toBe(false);
    expect(topicIsTheProduct('custom imprinted bone shaped pens', 'pens', pens)).toBe(false);
    expect(topicIsTheProduct('custom fleece pullovers for outdoor team', 'pullovers', ['cotton', 'cotton-poly'])).toBe(false);
    expect(topicIsTheProduct('custom silicone coasters', 'coasters', ['cork', 'wood', 'bamboo'])).toBe(false);
    expect(topicIsTheProduct('custom leather briefcase', 'briefcases', ['polyester', 'plastic'])).toBe(false);
    expect(topicIsTheProduct('shirt printing near me', 'shirts', ['cotton', 'polyester'])).toBe(false);
    expect(topicIsTheProduct('gifts for hvac workers', 'food-gifts', ['cardboard', 'ceramic'])).toBe(false);
  });

  it('no category, or a topic with no product word, is never the product', () => {
    expect(topicIsTheProduct('promotional scarves', null, ['knit', 'polyester'])).toBe(false);
    expect(topicIsTheProduct('promotional scarves', undefined, ['knit', 'polyester'])).toBe(false);
    expect(topicIsTheProduct('imprinted promotional products', 'pens', ['plastic', 'metal'])).toBe(false);
    // A topic about one product never fits another product's category.
    expect(topicIsTheProduct('promotional scarves', 'pens', ['plastic', 'metal'])).toBe(false);
  });
});

describe('the grounding a comparison would need (the precondition, kept tested while the shape is off)', () => {
  const scarves = { depth: 6, variants: ['knit', 'polyester'], category: 'scarves' };
  const pens = { depth: 383, variants: ['plastic', 'metal', 'aluminum'], category: 'pens' };

  it('with the topic given, two materials are not enough: the topic must be the product', () => {
    expect(comparisonCanBeGrounded(scarves, 'promotional scarves')).toBe(true);
    expect(comparisonCanBeGrounded(pens, 'custom plastic pens')).toBe(true);
    expect(comparisonCanBeGrounded(pens, 'promotional pens plymouth logo printing')).toBe(false);
    expect(comparisonCanBeGrounded(pens, 'custom imprinted bone shaped pens')).toBe(false);
    expect(comparisonCanBeGrounded({ ...scarves, variants: ['knit'] }, 'promotional scarves')).toBe(false);
    expect(comparisonCanBeGrounded({ depth: 6, variants: ['knit', 'polyester'] }, 'promotional scarves')).toBe(false);
    // Without a topic only the materials are checked.
    expect(comparisonCanBeGrounded(pens)).toBe(true);
  });
});

describe('the rotation does not pick a comparison (COMPARISON_IN_ROTATION, off since FIX-920)', () => {
  // The best-grounded comparison topics in the pool: two real materials in the
  // category's own products, and a topic that is the product. The first of
  // them was generated, and its polyester half described a product the
  // category does not sell (three fleece scarves, written up as thin printed
  // ones). So even these are a guide, a question or a list today.
  const grounded: [string, string, string[], number][] = [
    ['promotional scarves', 'scarves', ['knit', 'polyester'], 6],
    ['corporate scarves', 'scarves', ['knit', 'polyester'], 6],
    ['custom plastic pens', 'pens', ['plastic', 'metal'], 383],
    ['custom printed folding chairs', 'folding-chairs', ['mesh', 'polyester'], 21],
    ['promotional wine tumbler', 'wine-tumblers', ['stainless-steel', 'steel', 'plastic'], 30],
    ['branded cups', 'stadium-cups', ['poly-propylene', 'steel'], 89],
    ['promotional bottle', 'water-bottles', ['steel', 'stainless-steel', 'aluminum'], 200],
    ['customized large carabiners', 'carabiners', ['aluminum', 'steel'], 9],
  ];

  it('the switch is off, spelled once', () => {
    expect(COMPARISON_IN_ROTATION).toBe(false);
    expect(read('lib/blog-automation/blog-shape.ts').match(/export const COMPARISON_IN_ROTATION = \w+;/g)).toEqual(['export const COMPARISON_IN_ROTATION = false;']);
  });

  it('no plain topic is written as a comparison, however well it could be grounded', () => {
    for (const [topic, category, variants, depth] of grounded) {
      const availability = { depth, variants, category };
      expect(comparisonCanBeGrounded(availability, topic), topic).toBe(true);
      expect(comparisonIsAvailable(availability, topic), topic).toBe(false);
      expect(availableShapes(availability, topic)).not.toContain('comparison');
      expect(shapeRotation(availability, topic)).not.toContain('comparison');
      const shape = chooseTitleShape(topic, 'auto', availability);
      expect(['list', 'guide', 'question'], topic).toContain(shape);
      // And it is the shape the topic gets with no materials at all: the materials no longer move the hash.
      expect(chooseTitleShape(topic, 'auto', { depth, variants: [], category })).toBe(shape);
    }
  });

  it('the list weight and the other shapes are what AUTO-205 shipped', () => {
    expect(LIST_ROTATION_WEIGHT).toBe(3);
    expect(shapeRotation({ depth: 383, variants: ['plastic', 'metal'], category: 'pens' }, 'custom plastic pens')).toEqual(['list', 'list', 'list', 'guide', 'question']);
    expect(shapeRotation({ depth: 6, variants: ['knit', 'polyester'], category: 'scarves' }, 'promotional scarves')).toEqual(['guide', 'question']);
    expect(shapeRotation({ depth: 0, variants: [] })).toEqual(['guide', 'question']);
  });

  it('a comparison the topic itself asks for is still written, and is not handed the catalogue materials to compare instead', () => {
    expect(chooseTitleShape('neoprene vs foam koozies', 'auto', { depth: 76, variants: ['foam', 'neoprene', 'polyester'], category: 'koozies' })).toBe('comparison');
    const gen = read('lib/blog-automation/generate-blog-post.ts');
    expect(gen).toContain("const variants = shape === 'comparison' && triggeredShape(topic) === 'comparison' ? [] : depth.variants;");
  });
});

describe('"x or y" is a comparison only as a choice between two named things', () => {
  it('the two topics the bare "or" caught in the pool are no longer comparisons', () => {
    expect(triggeredShape('cones with custom logo or print')).not.toBe('comparison');
    expect(triggeredShape('best custom bottle cozies 2025 or 2026')).toBe('guide');
  });
  it('a real choice still is, and so is everything the other words asked for', () => {
    expect(triggeredShape('screen print or embroidery for polos')).toBe('comparison');
    expect(triggeredShape('neoprene or foam koozies')).toBe('comparison');
    expect(triggeredShape('neoprene vs foam koozies')).toBe('comparison');
    expect(triggeredShape('difference between koozies and can coolers')).toBe('comparison');
    // A comparison the topic asks for needs no materials and no category.
    expect(chooseTitleShape('neoprene vs foam koozies', 'auto', { depth: 0, variants: [] })).toBe('comparison');
  });
});

describe('productsNamedForRoot: the products of a root that are the product', () => {
  const p = (sku: string, name: string, brand = '') => ({ sku, name, brand });

  it('keeps the products whose name or brand carries a word of the slug, plural folded', () => {
    const koozies = [p('1', 'Collapsible Can Cooler', 'KOOZIE'), p('2', 'Foam Can Cooler'), p('3', 'Koozie Tumbler')];
    expect(productsNamedForRoot('koozies', koozies).map((x) => x.sku)).toEqual(['1', '3']);
    expect(productsNamedForRoot('usb-flash-drives', [p('1', '1GB Bamboo Flash Drive'), p('2', 'Wood Pen')]).map((x) => x.sku)).toEqual(['1']);
  });

  it('"scarves" is carried by "Scarf" and "knives" by "Knife"', () => {
    expect(productsNamedForRoot('scarves', [p('1', 'Knit Scarf'), p('2', 'Fleece Scarves'), p('3', 'Knit Beanie')]).map((x) => x.sku)).toEqual(['1', '2']);
    expect(productsNamedForRoot('pocket-utility-knives', [p('1', 'Rosewood Knife'), p('2', 'Tape Measure')]).map((x) => x.sku)).toEqual(['1']);
  });

  it('a root that shows none of what it is named for has no such products (rulers: 198 office products, no ruler)', () => {
    const office = [p('1', 'Letter Opener'), p('2', 'Polypro Filefolio'), p('3', 'Heart Jar Opener'), p('4', 'Sticky Book')];
    expect(productsNamedForRoot('rulers', office)).toEqual([]);
    expect(productsNamedForRoot('toothpicks', [p('1', 'Stanley Easy Fill Wide Mouth Flask'), p('2', 'Mood Shot Glass')])).toEqual([]);
  });
});

describe('getMaterialVariantsForRoot: a material counts only for products the root itself shows', () => {
  // Data-independent: a root and one of its material facet pages are found in
  // whichever pull this repo carries (the May one locally and on staging, the
  // September one in production), and the rule is asserted on them.
  const DIR = join(ROOT, 'data', 'categories');
  const facetFile = readdirSync(DIR).find((f) => {
    const m = /^([a-z0-9-]+)__material__([a-z0-9-]+)\.json$/.exec(f);
    if (!m) return false;
    const skus = getCategoryContent(f.slice(0, -5))?.productSkus ?? [];
    return new Set(skus).size >= 3;
  })!;
  const [root, value] = facetFile.slice(0, -5).split('__material__');
  const facetSkus = [...new Set(getCategoryContent(facetFile.slice(0, -5))!.productSkus)];

  it('a material whose products the root does not show is not a material of the root', () => {
    expect(getMaterialVariantsForRoot(root, 2, [])).toEqual([]);
    expect(getMaterialVariantsForRoot(root, 2, ['not-a-sku-1', 'not-a-sku-2', 'not-a-sku-3'])).toEqual([]);
  });

  it('it is counted by the products the root shows, needs two of them, and may not be all of them', () => {
    const shown = [facetSkus[0], facetSkus[1], 'another-product-of-the-root'];
    expect(getMaterialVariantsForRoot(root, 2, shown).find((v) => v.value === value)).toEqual({ value, count: 2 });
    // One product is not a kind the root is sold in.
    expect(getMaterialVariantsForRoot(root, 2, [facetSkus[0], 'another-product-of-the-root']).find((v) => v.value === value)).toBeUndefined();
    // Every product the root shows is not a variant of it.
    expect(getMaterialVariantsForRoot(root, 2, [facetSkus[0], facetSkus[1]]).find((v) => v.value === value)).toBeUndefined();
  });

  it('with no list given it is the root baked list, never the facet page own grid', () => {
    const baked = new Set(getCategoryContent(root)?.productSkus ?? []);
    for (const v of getMaterialVariantsForRoot(root)) {
      const page = new Set(getCategoryContent(`${root}__material__${v.value}`)!.productSkus);
      expect(v.count).toBe([...page].filter((s) => baked.has(s)).length);
      expect(v.count).toBeGreaterThanOrEqual(2);
      expect(v.count).toBeLessThan(baked.size);
    }
  });
});

describe('the generator', () => {
  it('measures the materials over the products the root shows that are named for it, and tells the shape rules the category', () => {
    const depth = read('lib/blog-automation/topic-depth.ts');
    expect(depth).toContain('getMaterialVariantsForRoot(category, 2, productsNamedForRoot(category, shown).map((p) => p.sku))');
    // The depth itself is still the whole category (AUTO-205): a root named differently from its products is often the right shelf.
    expect(depth).toContain('categorySize = shown.length;');
    const gen = read('lib/blog-automation/generate-blog-post.ts');
    expect(gen).toContain('const availability: ShapeAvailability = { depth: depth.depth, variants: depth.variants, category: depth.category };');
    expect(read('lib/blog-automation/blog-shape.ts')).toContain('const options = shapeRotation(availability, t);');
  });
});
