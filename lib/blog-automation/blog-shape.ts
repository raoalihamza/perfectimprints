/**
 * The SHAPE of a generated blog post (AUTO-203): which kind of title it gets,
 * what number a list title carries, and which body template goes with it.
 * PURE: no Sanity, no fs, no network, no next/*, so the generator, the Blog
 * Topics tab (for its dropdown wording) and vitest import the same rules.
 *
 * WHY. Patrick, 2026-10-08: "the titles are all extremely similar ... the
 * titles start with 9. Is there a way to vary this?" Six drafts in a row read
 * 9 Custom Wine Openers, 9 Promotional Footballs Ideas, 9 Promotional
 * Measuring Cups, 9 Promotional Ornaments, 9 Custom Sunscreen Giveaway Ideas,
 * 9 Custom Koozie Ideas. Two causes, both in generate-blog-post.ts: the list
 * prompt asked for a title "numbered list style" with "Exactly N idea
 * sections" where N was `listIdeaCount(1500)` = round(1500 / 170) = 9 for
 * every post at the panel's fixed 1,500-word target; and the panel's Draft
 * style defaulted to the list template, so every post WAS a list. At two
 * posts a day that is a blog index of near-identical headlines.
 *
 * TWO THINGS VARY, NEITHER AT RANDOM.
 *
 *   1. THE SHAPE FOLLOWS THE TOPIC. `chooseTitleShape` reads the words of the
 *      search the post is written for: a question ("what size are koozies")
 *      gets a question title; "how to ..." gets a how-to; "x vs y" or "x or
 *      y" gets a comparison; "ideas", "ways", "giveaways", "tips" get a list;
 *      "guide", "buying", "choose", "best", "bulk", "wholesale", "types",
 *      "sizes", "cheap" get a buyer's guide. A PLAIN PRODUCT topic ("custom
 *      koozies") suits a list AND a guide, and only there does a stable hash
 *      of the topic's own words pick one of the two, so the same topic
 *      always gets the same shape and the index alternates. It is never a
 *      dice roll and never a how-to on a topic that is not a how-to.
 *
 *   2. THE NUMBER FOLLOWS THE TOPIC TOO. `ideaCountFor` starts from the
 *      word-budget's count for the target length and moves it by a stable
 *      offset from the topic's words, inside 6 to 12, so a 1,500-word list
 *      post has 7 to 12 ideas and its title the same number. The title
 *      number and the section count are the SAME variable, and
 *      `repairListTitleNumber` sets the title's number to the sections the
 *      model actually wrote, so a "9 ways" title can never sit on an
 *      eight-item body.
 *
 * THE BODY MATCHES THE TITLE by construction: `templateForShape` maps a list
 * title to the list template (an idea section per number, a product strip
 * under each) and every other shape to the single template, whose section
 * guidance (`shapeSectionGuidance`) is written per shape: a how-to's
 * sections are its steps in order, a question's first section answers it in
 * its first sentence, a comparison's sections compare and the last one
 * chooses, a guide's are the buyer's considerations. `titleProblem` then
 * refuses a title that contradicts its shape (a guide starting with a
 * number, a how-to not starting with "How to", a list with no number), one
 * that drops the topic's own product words, or one Google would truncate.
 *
 * NO DUPLICATE TITLES. `isDuplicateTitle` compares a new title against every
 * existing post (661 published on 2026-10-08, plus drafts) on normalised
 * text, and `avoidTitlesFor` picks the existing titles that share a product
 * word with the topic so the prompt can name them. The generator refuses a
 * duplicate title or slug rather than storing a second post at the same
 * address.
 */

import { listIdeaCount } from '../ai/word-budget';
import { topicProductWords } from './header-image';

/** What kind of title the post gets. */
export type TitleShape = 'list' | 'guide' | 'question' | 'howto' | 'comparison';

/** The body structure the generator knows how to write (unchanged since P2-AI-002). */
export type BodyTemplate = 'list' | 'single';

/** What a caller may ask for: a body template, or "chosen from the topic" (the panel's default since AUTO-203). */
export type TemplateChoice = BodyTemplate | 'auto';

export const TEMPLATE_CHOICES: readonly TemplateChoice[] = ['auto', 'list', 'single'];

/** The stored / posted value read back; anything unknown is 'auto' (what the tab defaults to). */
export function templateChoiceOf(value: unknown): TemplateChoice {
  return value === 'list' || value === 'single' ? value : 'auto';
}

/** Wording for the Draft style dropdown and the guide. */
export const TEMPLATE_CHOICE_LABELS: Record<TemplateChoice, string> = {
  auto: 'Chosen from the topic (a list, a guide, a question answered, a how-to or a comparison)',
  list: 'List post ("7 ideas", "10 ways") with products under each idea',
  single: 'Single-topic post (guide, question, how-to or comparison) with one product row',
};

export const TITLE_SHAPE_LABELS: Record<TitleShape, string> = {
  list: 'a numbered list',
  guide: "a buyer's guide",
  question: 'a question answered',
  howto: 'a how-to',
  comparison: 'a comparison',
};

/** The body template a title shape is written with. */
export function templateForShape(shape: TitleShape): BodyTemplate {
  return shape === 'list' ? 'list' : 'single';
}

/** The smallest and largest number a list title may carry. Patrick's own published lists run from 3 to 25; 6 to 12 keeps a 1,300 to 1,900-word post's ideas substantial. */
export const LIST_IDEAS_MIN = 6;
export const LIST_IDEAS_MAX = 12;

/** Google shows about 60 characters of a title; above this the generator asks for another. Patrick's own titles run longer, so this is a ceiling, not his style. */
export const TITLE_MAX_CHARS = 75;
/** What the prompt asks for. */
export const TITLE_TARGET_CHARS = 65;

/** FNV-1a over the string with a final avalanche (fmix32), as an unsigned 32-bit integer: stable across runs and machines, and its low bits are as mixed as its high bits (plain FNV-1a's low bits clumped the idea counts onto two values). */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** The topic reduced to the words that name it, sorted, so "koozies custom" and "custom koozies" seed the same way. */
export function topicSeed(topic: string): string {
  const words = topicProductWords(topic);
  return (words.length > 0 ? words : topic.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)).sort().join(' ');
}

const QUESTION_START = /^(what|why|which|when|where|who|whom|whose|can|could|should|would|does|do|did|is|are|was|were|will|how (?:much|many|long|big|often|do|does|can|should|is|are))\b/;
const HOWTO = /^how to\b|\bhow (?:do|can|should) (?:i|you|we)\b/;
const COMPARISON = /\bvs\.?\b|\bversus\b|\bcompared?\b|\bcomparison\b|\bdifference\b|\bdifferences\b|\b(?:better|best) (?:than|choice between)\b|\bor\b/;
const LIST = /\bideas?\b|\bways\b|\buses\b|\bgiveaways?\b|\btips\b|\bexamples?\b|\btrends?\b|\bthemes?\b|\bsuggestions?\b|\binspiration\b|\bcreative\b/;
const GUIDE = /\bguide\b|\bbuy(?:ing|er|ers)?\b|\bchoos(?:e|ing)\b|\bselect(?:ing)?\b|\bbest\b|\btypes?\b|\bkinds?\b|\bwholesale\b|\bbulk\b|\bcheap(?:est)?\b|\baffordable\b|\bpric(?:e|es|ing)\b|\bcost\b|\bminimum\b|\bsizes?\b|\bmaterials?\b|\bquality\b|\bdurable\b|\bwhat to know\b|\bexplained\b/;

/**
 * The title shape for a topic. `choice` is what the caller asked for: 'list'
 * forces a list; 'single' forces a non-list shape (the topic's own, or a
 * guide when the topic reads as a list); 'auto' follows the topic entirely.
 */
export function chooseTitleShape(topic: string, choice: TemplateChoice = 'auto'): TitleShape {
  if (choice === 'list') return 'list';
  const t = topic.toLowerCase().replace(/\s+/g, ' ').trim();
  let shape: TitleShape | null = null;
  if (HOWTO.test(t)) shape = 'howto';
  else if (QUESTION_START.test(t) || t.endsWith('?')) shape = 'question';
  else if (COMPARISON.test(t)) shape = 'comparison';
  else if (LIST.test(t)) shape = 'list';
  else if (GUIDE.test(t)) shape = 'guide';
  if (shape === null) {
    // A plain product topic suits a list and a guide equally; the topic's own
    // words decide, stably, so the index alternates and the same topic always
    // gets the same answer.
    shape = stableHash(`shape:${topicSeed(t)}`) % 2 === 0 ? 'list' : 'guide';
  }
  if (choice === 'single' && shape === 'list') return 'guide';
  return shape;
}

/**
 * How many ideas a list post for this topic gets: the word budget's count
 * for the target, moved by a stable offset of -2 to +3 from the topic's
 * words, inside LIST_IDEAS_MIN..LIST_IDEAS_MAX. At the panel's 1,500 words
 * the base is 9 and the result 7 to 12.
 */
export function ideaCountFor(target: number, topic: string): number {
  const base = listIdeaCount(target);
  const offset = (stableHash(`count:${topicSeed(topic)}`) % 6) - 2;
  return Math.min(LIST_IDEAS_MAX, Math.max(LIST_IDEAS_MIN, base + offset));
}

/** The "title" line of the generator's JSON contract, per shape. */
export function titleInstruction(shape: TitleShape, ideaCount: number): string {
  const len = `at most ${TITLE_TARGET_CHARS} characters`;
  switch (shape) {
    case 'list':
      return `a numbered list title that STARTS with the number ${ideaCount} (exactly the number of idea sections), carries the plural topic keyword, and does not default to "${ideaCount} ... Ideas": choose the form that fits, such as "${ideaCount} Ways to ...", "${ideaCount} ... Every HR Director Should Consider", "${ideaCount} ... That Work for ..."; ${len}`;
    case 'guide':
      return `a buyer's guide title, NOT a numbered list and NOT starting with a number, carrying the plural topic keyword, in the style of "Choosing Custom Koozies: What to Know Before You Order" or "Custom Koozies for Company Events: A Buyer's Guide"; ${len}`;
    case 'question':
      return `the question the post answers, written as a question that ENDS WITH ?, carrying the topic keyword, in the style of "Which Custom Koozies Work Best for Outdoor Events?"; ${len}`;
    case 'howto':
      return `a title that STARTS WITH "How to", carrying the plural topic keyword, in the style of "How to Order Custom Koozies for a Company Picnic"; ${len}`;
    case 'comparison':
      return `a comparison title naming both sides, NOT starting with a number, in the style of "Neoprene vs Foam Koozies: Which Is Right for Your Event?"; at most ${TITLE_TARGET_CHARS + 5} characters`;
  }
}

/** How the single template's sections are to be written, per non-list shape. */
export function shapeSectionGuidance(shape: TitleShape, sectionCount: number): string {
  switch (shape) {
    case 'guide':
      return `This is a BUYER'S GUIDE. The ${sectionCount} sections are the buyer's considerations in a sensible order (what the product is for and who orders it, what to look for, materials and quality, decoration options, quantities and lead times, mistakes to avoid), each with a descriptive heading. Not a numbered list of ideas.`;
    case 'question':
      return `This post ANSWERS THE QUESTION in the title. The FIRST section answers it directly in its first sentence, then explains; the remaining ${sectionCount - 1} sections give the detail a buyer needs to act on the answer. Headings are descriptive, not numbered.`;
    case 'howto':
      return `This is a HOW-TO. The ${sectionCount} sections are the steps in the order a buyer takes them, each heading starting "Step N:" with N from 1 to ${sectionCount}, each explaining what to do and what to decide at that step. Use listItems where a step has a checklist.`;
    case 'comparison':
      return `This is a COMPARISON. The first section names the options being compared; the middle sections compare them point by point (use, durability, decoration, quantity, lead time); the LAST section says which to choose for which buyer. Headings are descriptive, not numbered.`;
    case 'list':
      return '';
  }
}

/** Lower-case letters and digits with single spaces, so punctuation and case never hide a duplicate. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’'"“”]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ExistingPost {
  title: string;
  slug: string;
}

/** True when the title, normalised, is already the title of an existing post. */
export function isDuplicateTitle(title: string, existing: readonly ExistingPost[]): ExistingPost | null {
  const n = normalizeTitle(title);
  if (!n) return null;
  return existing.find((p) => normalizeTitle(p.title ?? '') === n) ?? null;
}

/** True when the slug is already an existing post's address. */
export function isDuplicateSlug(slug: string, existing: readonly ExistingPost[]): ExistingPost | null {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  return existing.find((p) => (p.slug ?? '').trim().toLowerCase() === s) ?? null;
}

/** Existing titles that share a product word with the topic, newest first as given, capped, so the prompt can name what not to write again. */
export function avoidTitlesFor(topic: string, existing: readonly ExistingPost[], max = 8): string[] {
  const words = topicProductWords(topic);
  if (words.length === 0) return [];
  const out: string[] = [];
  for (const p of existing) {
    const t = (p.title ?? '').trim();
    if (!t) continue;
    const titleWords = new Set(topicProductWords(t));
    if (words.some((w) => titleWords.has(w))) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

const LEADING_NUMBER = /^(\d{1,3})\b/;

/** A list title's leading number replaced with the number of sections actually written; a title with no leading number is returned unchanged. */
export function repairListTitleNumber(title: string, sections: number): string {
  const t = title.trim();
  return LEADING_NUMBER.test(t) ? t.replace(LEADING_NUMBER, String(sections)) : t;
}

/** A question title given its question mark when the model forgot it. */
export function repairQuestionTitle(title: string): string {
  const t = title.trim().replace(/[.!]+$/, '');
  return t.endsWith('?') ? t : `${t}?`;
}

/**
 * Why a title cannot be used for its shape, or null when it can. Checked
 * AFTER the repairs above, so only what cannot be fixed deterministically is
 * refused: the topic's words missing, a length Google would cut, a shape
 * the title contradicts.
 */
export function titleProblem(title: string, shape: TitleShape, opts: { ideaCount?: number; topic: string }): string | null {
  const t = title.trim();
  if (!t) return 'the title is empty';
  if (t.length > TITLE_MAX_CHARS) return `the title is ${t.length} characters, longer than Google shows`;
  const words = topicProductWords(opts.topic);
  if (words.length > 0) {
    const titleWords = new Set(topicProductWords(t));
    if (!words.some((w) => titleWords.has(w))) return `the title does not carry the topic's own words (${words.join(', ')})`;
  }
  switch (shape) {
    case 'list': {
      const m = t.match(LEADING_NUMBER);
      if (!m) return 'a list title must start with its number';
      if (opts.ideaCount !== undefined && Number(m[1]) !== opts.ideaCount) return `the title says ${m[1]} and the post has ${opts.ideaCount} ideas`;
      return null;
    }
    case 'question':
      return t.endsWith('?') ? null : 'a question title must end with a question mark';
    case 'howto':
      return /^how to\b/i.test(t) ? null : 'a how-to title must start with "How to"';
    case 'guide':
    case 'comparison':
      return LEADING_NUMBER.test(t) ? `${TITLE_SHAPE_LABELS[shape]} title must not start with a number` : null;
  }
}
