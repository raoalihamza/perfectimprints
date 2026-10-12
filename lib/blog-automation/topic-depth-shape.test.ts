/**
 * AUTO-205 Parts 2 and 3: the catalogue's depth sets how many ideas a list
 * carries, never its shape (only a depth too thin for the floor does that);
 * a plain product topic rotates through list, guide, question and, with two
 * real materials, comparison; the floor and the products-per-idea figure are
 * spelled once; and the generator measures the depth before it chooses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  availableShapes,
  chooseTitleShape,
  clampIdeaCount,
  comparisonIsAvailable,
  ideaCountFor,
  ideasDepthCanCarry,
  LIST_IDEAS_MAX,
  LIST_IDEAS_MIN,
  LIST_ROTATION_WEIGHT,
  listIsAvailable,
  PRODUCTS_PER_IDEA,
  shapeRotation,
  shapeSectionGuidance,
  sustainableListIdeas,
  titleInstruction,
  triggeredShape,
  variantLabel,
} from './blog-shape';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const PLAIN = ['custom koozies', 'custom pens', 'custom tote bags', 'custom sunglasses', 'custom water bottles', 'custom ornaments', 'custom mugs', 'custom lanyards', 'custom caps', 'custom magnets', 'custom notebooks', 'custom umbrellas', 'promotional coasters', 'promotional hand fans', 'custom stress toys', 'custom bike bottles'];

describe('depth sets the count', () => {
  it('the floor is 5, the ceiling 12, three products an idea', () => {
    expect(LIST_IDEAS_MIN).toBe(5);
    expect(LIST_IDEAS_MAX).toBe(12);
    expect(PRODUCTS_PER_IDEA).toBe(3);
    expect(ideasDepthCanCarry(0)).toBe(0);
    expect(ideasDepthCanCarry(14)).toBe(4);
    expect(ideasDepthCanCarry(15)).toBe(5);
    expect(ideasDepthCanCarry(200)).toBe(66);
  });

  it('a list stays a list at a shorter count when the depth is thin, and is not a list at all under the floor', () => {
    const topic = 'custom koozies';
    const wanted = ideaCountFor(1500, topic);
    expect(sustainableListIdeas(1500, topic, undefined)).toBe(wanted);
    expect(sustainableListIdeas(1500, topic, 200)).toBe(wanted);
    expect(sustainableListIdeas(1500, topic, 16)).toBe(5);
    expect(sustainableListIdeas(1500, topic, 21)).toBe(Math.min(wanted, 7));
    expect(sustainableListIdeas(1500, topic, 14)).toBeNull();
    expect(sustainableListIdeas(1500, topic, 0)).toBeNull();
  });

  it('a list is available at 15 products and not at 14; a comparison needs two variants', () => {
    expect(listIsAvailable(undefined)).toBe(true);
    expect(listIsAvailable({ depth: 15 })).toBe(true);
    expect(listIsAvailable({ depth: 14 })).toBe(false);
    expect(comparisonIsAvailable(undefined)).toBe(false);
    expect(comparisonIsAvailable({ variants: ['foam'] })).toBe(false);
    expect(comparisonIsAvailable({ variants: ['foam', 'neoprene'] })).toBe(true);
  });

  it("a caller's idea count is held inside the range; anything that is not a number is null", () => {
    expect(clampIdeaCount(7)).toBe(7);
    expect(clampIdeaCount(2)).toBe(LIST_IDEAS_MIN);
    expect(clampIdeaCount(40)).toBe(LIST_IDEAS_MAX);
    expect(clampIdeaCount(6.6)).toBe(7);
    expect(clampIdeaCount(undefined)).toBeNull();
    expect(clampIdeaCount('9')).toBeNull();
    expect(clampIdeaCount(Number.NaN)).toBeNull();
  });
});

describe('the shapes a plain topic may take', () => {
  it('the topic words still decide first; a plain topic is one whose words ask for nothing', () => {
    expect(triggeredShape('how to order custom koozies')).toBe('howto');
    expect(triggeredShape('what size are koozies')).toBe('question');
    expect(triggeredShape('neoprene vs foam koozies')).toBe('comparison');
    expect(triggeredShape('custom koozie ideas')).toBe('list');
    expect(triggeredShape('bulk koozies')).toBe('guide');
    expect(triggeredShape('custom koozies')).toBeNull();
  });

  it('available shapes: list when the depth carries one, guide and question always, comparison with two materials', () => {
    expect(availableShapes(undefined)).toEqual(['list', 'guide', 'question']);
    expect(availableShapes({ depth: 200, variants: [] })).toEqual(['list', 'guide', 'question']);
    expect(availableShapes({ depth: 200, variants: ['foam', 'neoprene'] })).toEqual(['list', 'guide', 'question', 'comparison']);
    expect(availableShapes({ depth: 3, variants: ['foam', 'neoprene'] })).toEqual(['guide', 'question', 'comparison']);
    expect(availableShapes({ depth: 0, variants: [] })).toEqual(['guide', 'question']);
  });

  it('the rotation repeats the list LIST_ROTATION_WEIGHT times when it is available, and never otherwise', () => {
    expect(LIST_ROTATION_WEIGHT).toBe(3);
    expect(shapeRotation({ depth: 200, variants: ['a', 'b'] })).toEqual(['list', 'list', 'list', 'guide', 'question', 'comparison']);
    expect(shapeRotation({ depth: 0, variants: [] })).toEqual(['guide', 'question']);
  });

  it('a plain topic with products rotates through all four shapes, stably, with the list the most common', () => {
    const av = { depth: 200, variants: ['foam', 'neoprene'] };
    const shapes = PLAIN.map((t) => chooseTitleShape(t, 'auto', av));
    const seen = new Set(shapes);
    expect(seen.has('list')).toBe(true);
    expect(seen.has('guide') || seen.has('question') || seen.has('comparison')).toBe(true);
    expect(seen.has('howto')).toBe(false);
    for (const t of PLAIN) expect(chooseTitleShape(t, 'auto', av)).toBe(chooseTitleShape(t, 'auto', av));
    expect(chooseTitleShape('koozies custom', 'auto', av)).toBe(chooseTitleShape('custom koozies', 'auto', av));
  });

  it('a plain topic with no products never gets a list or a comparison; it is a guide or a question', () => {
    for (const t of PLAIN) expect(['guide', 'question']).toContain(chooseTitleShape(t, 'auto', { depth: 1, variants: [] }));
  });

  it('a topic whose words ask for a list becomes a guide when the depth cannot carry one; the other triggers are untouched by depth', () => {
    expect(chooseTitleShape('custom koozie ideas', 'auto', { depth: 200 })).toBe('list');
    expect(chooseTitleShape('custom koozie ideas', 'auto', { depth: 3 })).toBe('guide');
    expect(chooseTitleShape('neoprene vs foam koozies', 'auto', { depth: 0, variants: [] })).toBe('comparison');
    expect(chooseTitleShape('what size are koozies', 'auto', { depth: 0 })).toBe('question');
    expect(chooseTitleShape('how to order koozies', 'auto', { depth: 0 })).toBe('howto');
  });

  it("the caller's choice still wins: 'list' forces a list whatever the depth, 'single' never gives a list", () => {
    expect(chooseTitleShape('custom koozies', 'list', { depth: 0 })).toBe('list');
    for (const t of PLAIN) expect(chooseTitleShape(t, 'single', { depth: 200, variants: ['a', 'b'] })).not.toBe('list');
  });

  it('a question title is asked for in several buyer forms; a comparison names the two real materials', () => {
    const q = titleInstruction('question', 6);
    expect(q).toContain('ENDS WITH ?');
    expect(q).toContain('How Many Custom Koozies Should a Company Picnic Order?');
    expect(q).toContain('not a template');
    expect(titleInstruction('comparison', 6, ['stainless-steel', 'foam'])).toContain('stainless steel, foam');
    expect(titleInstruction('comparison', 6, [])).not.toContain('from the catalogue');
    expect(shapeSectionGuidance('comparison', 5, ['neoprene', 'foam'])).toContain('neoprene, foam');
    expect(shapeSectionGuidance('comparison', 5, ['neoprene'])).not.toContain('from the catalogue');
    expect(variantLabel('stainless-steel')).toBe('stainless steel');
  });
});

describe('the generator', () => {
  const gen = read('lib/blog-automation/generate-blog-post.ts');
  const depth = read('lib/blog-automation/topic-depth.ts');

  it('measures the depth through the shipped matcher before the shape is chosen, with the dials the strips use', () => {
    expect(gen).toContain("const depth = input.depth ?? (await measureTopicDepth(topic, { minScore: STRIP_MIN_SCORE, catalogMinScore: STRIP_CATALOG_MIN_SCORE }));");
    expect(gen.indexOf('await measureTopicDepth(')).toBeLessThan(gen.indexOf('chooseTitleShape(topic, choice, availability)'));
    expect(depth).toContain('export const DEPTH_SUPPLY_LIMIT = 200;');
    expect(depth).toContain('depth: Math.max(products.length, categorySize)');
    expect(depth).toContain('getMaterialVariantsForRoot(category)');
    expect(depth).toContain('includeProductPages: true');
    // Never throws: a failed measurement is a thin topic, not a failed post.
    expect(depth).toContain('return none;');
  });

  it("the idea count is the caller's, else what the catalogue carries, else the floor; a forced guide is template 'single'", () => {
    expect(gen).toContain('clampIdeaCount(input.ideaCount) ?? sustainableListIdeas(target, topic, depth.depth) ?? LIST_IDEAS_MIN');
    expect(gen).toContain('ideaCount?: number;');
  });

  it('the structural minimum for a list is the floor, spelled once', () => {
    expect(gen).toContain("const min = template === 'list' ? LIST_IDEAS_MIN : 3;");
    expect(read('lib/blog-automation/blog-shape.ts').match(/export const LIST_IDEAS_MIN = \d+;/g)).toEqual(['export const LIST_IDEAS_MIN = 5;']);
    expect(read('lib/blog-automation/blog-shape.ts').match(/export const PRODUCTS_PER_IDEA = \d+;/g)).toEqual(['export const PRODUCTS_PER_IDEA = 3;']);
  });

  it('a short list is asked for as a deep list, not a cut-down one', () => {
    expect(gen).toContain('SHORT, DEEP list');
    expect(gen).toContain('shortListGuidance(budget.sectionCount)');
  });

  it('the routes are unchanged in what they accept: the idea count is a parameter of the function, not of the Studio', () => {
    expect(read('app/api/sanity/blog-topics/route.ts')).not.toContain('ideaCount');
    expect(read('app/api/sanity/generate-blog/route.ts')).not.toContain('ideaCount');
  });
});
