/**
 * AUTO-203: the shape of a generated post follows its topic, the number of a
 * list title follows its topic too, neither is random, the body template
 * matches the shape, and a title that contradicts its shape, drops the
 * topic, runs long or duplicates an existing post is refused.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  avoidTitlesFor,
  chooseTitleShape,
  ideaCountFor,
  isDuplicateSlug,
  isDuplicateTitle,
  LIST_IDEAS_MAX,
  LIST_IDEAS_MIN,
  normalizeTitle,
  repairListTitleNumber,
  repairQuestionTitle,
  shapeSectionGuidance,
  stableHash,
  templateChoiceOf,
  templateForShape,
  titleInstruction,
  titleProblem,
  topicSeed,
  TEMPLATE_CHOICES,
  TITLE_MAX_CHARS,
} from './blog-shape';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** Patrick's six drafts of 2026-10-08, the fault as reported. */
const PATRICKS_SIX = ['custom wine openers', 'promotional footballs', 'promotional measuring cups', 'promotional ornaments', 'custom sunscreen giveaways', 'custom koozies'];

describe('the shape follows the topic', () => {
  it('a question gets a question, a how-to a how-to, a comparison a comparison, "ideas" a list, "guide" and "bulk" a guide', () => {
    expect(chooseTitleShape('what size are koozies')).toBe('question');
    expect(chooseTitleShape('are custom pens worth it?')).toBe('question');
    expect(chooseTitleShape('how much do custom koozies cost')).toBe('question');
    expect(chooseTitleShape('how to choose custom water bottles for employees')).toBe('howto');
    expect(chooseTitleShape('neoprene vs foam koozies')).toBe('comparison');
    expect(chooseTitleShape('screen print or embroidery for polos')).toBe('comparison');
    expect(chooseTitleShape('custom koozie ideas')).toBe('list');
    expect(chooseTitleShape('trade show giveaways')).toBe('list');
    expect(chooseTitleShape('ways to use custom coolers')).toBe('list');
    expect(chooseTitleShape('promotional pens buying guide')).toBe('guide');
    expect(chooseTitleShape('bulk custom tote bags')).toBe('guide');
    expect(chooseTitleShape('best promotional calendars')).toBe('guide');
    expect(chooseTitleShape('cheap wholesale sunglasses')).toBe('guide');
  });

  it('a how-to wins over a question word inside it, and a question wins over a list word inside it', () => {
    expect(chooseTitleShape('how to pick giveaway ideas for a trade show')).toBe('howto');
    expect(chooseTitleShape('what are the best trade show giveaway ideas')).toBe('question');
  });

  it('a plain product topic is a list or a guide, decided by the topic itself, stably, never a how-to or a question', () => {
    const shapes = new Set<string>();
    for (const topic of PATRICKS_SIX) {
      const shape = chooseTitleShape(topic);
      expect(['list', 'guide'], topic).toContain(shape);
      expect(chooseTitleShape(topic)).toBe(shape);
      shapes.add(shape);
    }
    // The six that all came out "9 ..." no longer all come out one shape.
    expect(shapes.size).toBe(2);
    // Word order does not change the answer.
    expect(chooseTitleShape('koozies custom')).toBe(chooseTitleShape('custom koozies'));
  });

  it("the caller's choice: 'list' forces a list; 'single' forces a non-list shape, the topic's own or a guide; 'auto' follows the topic", () => {
    expect(chooseTitleShape('what size are koozies', 'list')).toBe('list');
    expect(chooseTitleShape('what size are koozies', 'single')).toBe('question');
    expect(chooseTitleShape('custom koozie ideas', 'single')).toBe('guide');
    expect(chooseTitleShape('custom koozie ideas', 'auto')).toBe('list');
    expect(templateChoiceOf('list')).toBe('list');
    expect(templateChoiceOf('single')).toBe('single');
    expect(templateChoiceOf('auto')).toBe('auto');
    expect(templateChoiceOf(undefined)).toBe('auto');
    expect(templateChoiceOf('nonsense')).toBe('auto');
    expect(TEMPLATE_CHOICES).toEqual(['auto', 'list', 'single']);
  });

  it('the body template matches the shape: a list is the list template, everything else the single template', () => {
    expect(templateForShape('list')).toBe('list');
    for (const shape of ['guide', 'question', 'howto', 'comparison'] as const) expect(templateForShape(shape)).toBe('single');
  });
});

describe('the number follows the topic', () => {
  it('is stable per topic, inside the range, and not the same for every topic (the "9" fault)', () => {
    const counts = PATRICKS_SIX.map((t) => ideaCountFor(1500, t));
    for (const n of counts) {
      expect(n).toBeGreaterThanOrEqual(LIST_IDEAS_MIN);
      expect(n).toBeLessThanOrEqual(LIST_IDEAS_MAX);
    }
    expect(new Set(counts).size).toBeGreaterThanOrEqual(3);
    expect(ideaCountFor(1500, 'custom koozies')).toBe(ideaCountFor(1500, 'koozies custom'));
    expect(ideaCountFor(1500, 'custom koozies')).toBe(ideaCountFor(1500, 'Custom Koozies'));
  });

  it('moves with the word budget: a longer post has more ideas on average', () => {
    const avg = (target: number) => PATRICKS_SIX.reduce((s, t) => s + ideaCountFor(target, t), 0) / PATRICKS_SIX.length;
    expect(avg(1900)).toBeGreaterThan(avg(1300));
  });

  it('the hash and the seed are deterministic and order-free', () => {
    expect(stableHash('a')).toBe(stableHash('a'));
    expect(stableHash('a')).not.toBe(stableHash('b'));
    expect(topicSeed('custom koozies for events')).toBe(topicSeed('events koozies custom'));
    expect(topicSeed('custom koozies')).toBe('koozie');
  });
});

describe('the title instruction and the section guidance', () => {
  it('each shape asks for its own title form and the list names its number', () => {
    expect(titleInstruction('list', 7)).toContain('STARTS with the number 7');
    expect(titleInstruction('list', 7)).toContain('does not default to "7 ... Ideas"');
    expect(titleInstruction('guide', 5)).toContain('NOT a numbered list and NOT starting with a number');
    expect(titleInstruction('question', 5)).toContain('ENDS WITH ?');
    expect(titleInstruction('howto', 5)).toContain('STARTS WITH "How to"');
    expect(titleInstruction('comparison', 5)).toContain('naming both sides');
  });

  it('the single template is told how its sections go for each shape, and the list needs nothing', () => {
    expect(shapeSectionGuidance('guide', 5)).toContain("BUYER'S GUIDE");
    expect(shapeSectionGuidance('question', 5)).toContain('FIRST section answers it directly in its first sentence');
    expect(shapeSectionGuidance('howto', 5)).toContain('"Step N:" with N from 1 to 5');
    expect(shapeSectionGuidance('comparison', 5)).toContain('LAST section says which to choose');
    expect(shapeSectionGuidance('list', 9)).toBe('');
  });
});

describe('a title that fits, or is refused', () => {
  it("a list title's number is set to the sections actually written; a question gets its question mark", () => {
    expect(repairListTitleNumber('9 Custom Koozie Ideas for Events', 8)).toBe('8 Custom Koozie Ideas for Events');
    expect(repairListTitleNumber('Custom Koozie Ideas', 8)).toBe('Custom Koozie Ideas');
    expect(repairQuestionTitle('Which Custom Koozies Work Best for Outdoor Events')).toBe('Which Custom Koozies Work Best for Outdoor Events?');
    expect(repairQuestionTitle('Which Koozies Work Best?')).toBe('Which Koozies Work Best?');
    expect(repairQuestionTitle('Which Koozies Work Best.')).toBe('Which Koozies Work Best?');
  });

  it('refuses the shape contradictions, a dropped topic and a length Google would cut', () => {
    expect(titleProblem('8 Custom Koozie Ideas for Trade Shows', 'list', { ideaCount: 8, topic: 'custom koozies' })).toBeNull();
    expect(titleProblem('Custom Koozie Ideas for Trade Shows', 'list', { ideaCount: 8, topic: 'custom koozies' })).toBe('a list title must start with its number');
    expect(titleProblem('9 Custom Koozie Ideas for Trade Shows', 'list', { ideaCount: 8, topic: 'custom koozies' })).toBe('the title says 9 and the post has 8 ideas');
    expect(titleProblem('8 Great Giveaways for Trade Shows', 'list', { ideaCount: 8, topic: 'custom koozies' })).toBe("the title does not carry the topic's own words (koozie)");
    expect(titleProblem('Choosing Custom Koozies: What to Know Before You Order', 'guide', { topic: 'custom koozies' })).toBeNull();
    expect(titleProblem('7 Things to Know About Custom Koozies', 'guide', { topic: 'custom koozies' })).toBe("a buyer's guide title must not start with a number");
    expect(titleProblem('Which Custom Koozies Work Best for Outdoor Events?', 'question', { topic: 'custom koozies' })).toBeNull();
    expect(titleProblem('Which Custom Koozies Work Best', 'question', { topic: 'custom koozies' })).toBe('a question title must end with a question mark');
    expect(titleProblem('How to Order Custom Koozies for a Picnic', 'howto', { topic: 'custom koozies' })).toBeNull();
    expect(titleProblem('Ordering Custom Koozies for a Picnic', 'howto', { topic: 'custom koozies' })).toBe('a how-to title must start with "How to"');
    expect(titleProblem('Neoprene vs Foam Koozies: Which Is Right for Your Event?', 'comparison', { topic: 'neoprene vs foam koozies' })).toBeNull();
    expect(titleProblem('', 'guide', { topic: 'x' })).toBe('the title is empty');
    const long = `Custom Koozies ${'and more '.repeat(10)}`;
    expect(long.length).toBeGreaterThan(TITLE_MAX_CHARS);
    expect(titleProblem(long, 'guide', { topic: 'custom koozies' })).toContain('longer than Google shows');
  });

  it('plural and singular count as the same topic word', () => {
    expect(titleProblem('How to Choose a Custom Koozie for Your Event', 'howto', { topic: 'custom koozies' })).toBeNull();
  });
});

describe('no duplicate titles', () => {
  const existing = [
    { title: '9 Custom Koozie Ideas for Trade Shows, Employee Gifts, and Client Appreciation', slug: '9-custom-koozie-ideas-for-trade-shows-employee-gifts-and-client-appreciation' },
    { title: '10 Ideas for Custom Beach Balls', slug: '10-ideas-for-custom-beach-balls' },
    { title: 'Buying Guide for Stadium Seat Cushions', slug: 'buying-guide-for-stadium-seat-cushions' },
  ];

  it('normalises case and punctuation, so a near-identical title is a duplicate and a different one is not', () => {
    expect(normalizeTitle("10 Ideas for Custom Beach-Balls!")).toBe('10 ideas for custom beach balls');
    expect(isDuplicateTitle('10 ideas for custom beach balls', existing)?.slug).toBe('10-ideas-for-custom-beach-balls');
    expect(isDuplicateTitle('11 Ideas for Custom Beach Balls', existing)).toBeNull();
    expect(isDuplicateTitle('', existing)).toBeNull();
    expect(isDuplicateSlug('buying-guide-for-stadium-seat-cushions', existing)?.title).toBe('Buying Guide for Stadium Seat Cushions');
    expect(isDuplicateSlug('other', existing)).toBeNull();
  });

  it('picks the existing titles on the same product for the prompt to avoid, capped', () => {
    expect(avoidTitlesFor('custom koozies', existing)).toEqual(['9 Custom Koozie Ideas for Trade Shows, Employee Gifts, and Client Appreciation']);
    expect(avoidTitlesFor('beach balls', existing)).toEqual(['10 Ideas for Custom Beach Balls']);
    expect(avoidTitlesFor('custom pens', existing)).toEqual([]);
    expect(avoidTitlesFor('custom', existing)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `Koozie post ${i}`, slug: `k-${i}` }));
    expect(avoidTitlesFor('custom koozies', many, 8)).toHaveLength(8);
  });
});

describe('against the real published titles', () => {
  it('none of the six AUTO-203 proof shapes can collide silently: the duplicate check reads the full published list', () => {
    // The structural half: the generator reads the published posts through the link finder and the drafts through the server client, and refuses both a same title and a same slug.
    const gen = read('lib/blog-automation/generate-blog-post.ts');
    expect(gen).toContain("loadLinkDocsForKind('blog')");
    expect(gen).toContain('_id in path("drafts.**")');
    expect(gen).toContain('isDuplicateTitle(finalTitle, existing)');
    expect(gen).toContain('isDuplicateSlug(slugifyTitle(finalTitle), existing)');
    expect(gen).toContain('repairListTitleNumber(finalTitle, sections.length)');
    expect(gen).toContain("if (shape === 'question') finalTitle = repairQuestionTitle(finalTitle);");
    expect(gen).toContain('titleProblem(finalTitle, shape,');
    // The shape is chosen once, from the topic, and the body template follows it.
    expect(gen).toContain('const shape = chooseTitleShape(topic, templateChoiceOf(input.template));');
    expect(gen).toContain('const template = templateForShape(shape);');
    // The number in the title IS the section count.
    expect(gen).toContain("const ideaCount = template === 'list' ? ideaCountFor(target, topic) : undefined;");
    expect(gen).toContain('const sectionCount = ideaCount ?? singleSectionCount(target);');
    // The old fixed "numbered list style" instruction is gone.
    expect(gen).not.toContain('numbered list style');
  });

  it('this module is pure: it imports only the word budget and the topic word rule', () => {
    const imports = read('lib/blog-automation/blog-shape.ts').match(/^import .*$/gm) ?? [];
    expect(imports).toEqual(["import { listIdeaCount } from '../ai/word-budget';", "import { topicProductWords } from './header-image';"]);
  });

  it('the tab defaults to the topic choosing, and the route and the creator accept it', () => {
    const tool = read('sanity/tools/blog-topics-tool.tsx');
    expect(tool).toContain("useState<Template>('auto')");
    expect(tool).toContain('<option value="auto"');
    expect(read('app/api/sanity/blog-topics/route.ts')).toContain('templateChoiceOf(body.template)');
    expect(read('app/api/sanity/generate-blog/route.ts')).toContain('templateChoiceOf(body.template)');
    // What is stored is the template the post was built with, never the request.
    expect(read('lib/blog-automation/create-blog-draft.ts')).toContain('template: generated.template,');
    const schema = read('sanity/schemas/documents/blog-post.ts');
    expect(schema).toContain("value: 'auto'");
    expect(schema).toContain("initialValue: 'auto'");
  });
});
