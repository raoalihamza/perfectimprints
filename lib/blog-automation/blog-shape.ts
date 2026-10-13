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
 *      gets a question title; "how to ..." gets a how-to; "x vs y", or "x or
 *      y" as a choice between two named things, gets a comparison (not any
 *      "or", FIX-920: the only two topics it caught in the pool were "cones
 *      with custom logo or print" and "bottle cozies 2025 or 2026");
 *      "ideas", "ways", "giveaways", "tips" get a list;
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

/**
 * The smallest and largest number a list title may carry. Patrick's own
 * published lists run from 3 to 25. The floor is 5 since AUTO-205 (it was 6):
 * the catalogue decides how many ideas a list can carry (`sustainableListIdeas`),
 * and the AUTO-205 measurement over the 1,014 list-shaped usable topics found
 * the floor is what decides whether a thin topic stays a list or becomes a
 * guide; 5 keeps the most lists while every idea still has products under it.
 */
export const LIST_IDEAS_MIN = 5;
export const LIST_IDEAS_MAX = 12;

/**
 * How many products one list idea is budgeted (AUTO-205). An idea strip shows
 * up to four products and is skipped under two; three per idea is the
 * diagnostic's measure, and it is what turns a topic's product depth into the
 * number of ideas its list can carry. Spelled once.
 */
export const PRODUCTS_PER_IDEA = 3;

/**
 * What the catalogue allows for a topic (AUTO-205), measured by the server
 * before the shape is chosen (lib/blog-automation/topic-depth.ts). Nothing
 * here reads the catalogue; the rules are pure over these two numbers.
 */
export interface ShapeAvailability {
  /** Products the topic can draw on: the larger of the matcher's supply and the resolved category's size. Undefined means unmeasured (every list count available). */
  depth?: number;
  /** The variant values (materials) the topic's category is sold in; a comparison needs two. Empty or undefined means no comparison can be grounded. */
  variants?: readonly string[];
  /** The root category the topic resolved to (FIX-920): the rotation offers a comparison only when the topic names that product and nothing narrower (`topicIsTheProduct`). */
  category?: string | null;
}

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
const COMPARISON = /\bvs\.?\b|\bversus\b|\bcompared?\b|\bcomparison\b|\bdifference\b|\bdifferences\b|\b(?:better|best) (?:than|choice between)\b/;
// "x or y" asks for a comparison only as a CHOICE BETWEEN TWO NAMED THINGS at
// the head of the topic ("screen print or embroidery for polos"). Until
// FIX-920 any "or" did, and the only two topics it caught in the pool were
// "cones with custom logo or print" (an "or" inside the "with ..." tail) and
// "best custom bottle cozies 2025 or 2026" (two years). A comparison the
// topic's own words ask for is written with no grounding check at all, so the
// trigger has to be right.
const CHOICE = /\b[a-z][a-z-]*\s+or\s+[a-z][a-z-]*\b/;
const TAIL = /\s+(?:with|for)\s+.*$/;
const LIST = /\bideas?\b|\bways\b|\buses\b|\bgiveaways?\b|\btips\b|\bexamples?\b|\btrends?\b|\bthemes?\b|\bsuggestions?\b|\binspiration\b|\bcreative\b/;
const GUIDE = /\bguide\b|\bbuy(?:ing|er|ers)?\b|\bchoos(?:e|ing)\b|\bselect(?:ing)?\b|\bbest\b|\btypes?\b|\bkinds?\b|\bwholesale\b|\bbulk\b|\bcheap(?:est)?\b|\baffordable\b|\bpric(?:e|es|ing)\b|\bcost\b|\bminimum\b|\bsizes?\b|\bmaterials?\b|\bquality\b|\bdurable\b|\bwhat to know\b|\bexplained\b/;

/**
 * The shape the topic's OWN WORDS ask for, or null for a plain product topic
 * ("custom koozies") that asks for nothing in particular. A how-to wins over a
 * question word inside it, a question over a list word, a comparison over
 * both list and guide words. Exported for the measuring scripts, which need
 * to tell a keyword-triggered guide from one the rotation picked.
 */
export function triggeredShape(topic: string): TitleShape | null {
  const t = topic.toLowerCase().replace(/\s+/g, ' ').trim();
  if (HOWTO.test(t)) return 'howto';
  if (QUESTION_START.test(t) || t.endsWith('?')) return 'question';
  if (COMPARISON.test(t) || CHOICE.test(t.replace(TAIL, ''))) return 'comparison';
  if (LIST.test(t)) return 'list';
  if (GUIDE.test(t)) return 'guide';
  return null;
}

/** How many list ideas a product depth can carry: PRODUCTS_PER_IDEA products each. */
export function ideasDepthCanCarry(depth: number): number {
  return Math.max(0, Math.floor(depth / PRODUCTS_PER_IDEA));
}

/** True when a measured depth can carry a list of at least LIST_IDEAS_MIN ideas; an unmeasured depth can. */
export function listIsAvailable(availability?: ShapeAvailability): boolean {
  return availability?.depth === undefined || ideasDepthCanCarry(availability.depth) >= LIST_IDEAS_MIN;
}

/** A category slug or a variant value as words, for comparing with a topic's: "usb-flash-drives" gives ["usb", "flash", "drive"]. */
function wordsOfSlug(value: string): string[] {
  return topicProductWords(value.replace(/[-_/]+/g, ' '));
}

/**
 * True when the topic is about THE PRODUCT and nothing narrower (FIX-920):
 * it carries a word of the category it resolved to, and every one of its
 * product words is either the category's or one of the category's materials.
 * "promotional scarves" against `scarves` is; "custom plastic pens" against
 * `pens` is (plastic is a material pens are sold in, so the comparison can
 * be plastic against another); "custom yeti coolers", "promotional pens
 * plymouth logo printing", "custom fleece pullovers" and "custom silicone
 * coasters" are not: each names a brand, a place or a kind that a comparison
 * of two catalogue materials would talk past.
 *
 * Why it exists. AUTO-205 hashed every plain topic whose category offered two
 * materials into the comparison slot. Measured over the pool on 2026-10-13:
 * 139 topics took the shape, 55 of them on materials that were not products
 * of the category at all (fixed in `getMaterialVariantsForRoot` and
 * `productsNamedForRoot`), and of the 84 left only 14 were about the product
 * in general; the other 70 carried a brand (yeti, rtic, cotopaxi, callaway,
 * nike, ogio), a place (plymouth, baywood, jacksonville, "near me"), a shape
 * or style (bone shaped, stemless, sling, retro) or a material the category
 * does not list. Such a topic is a guide, a question or a list about that
 * narrower thing; a comparison is written about the product.
 */
export function topicIsTheProduct(topic: string, category: string | null | undefined, variants: readonly string[] = []): boolean {
  if (!category) return false;
  const words = topicProductWords(topic);
  if (words.length === 0) return false;
  const product = new Set(wordsOfSlug(category));
  const materials = new Set(variants.flatMap(wordsOfSlug));
  return words.some((w) => product.has(w)) && words.every((w) => product.has(w) || materials.has(w));
}

/**
 * Whether a comparison COULD be grounded for a topic (FIX-920): two real
 * variants to compare and, when the topic is given, a topic that is about
 * the product itself (`topicIsTheProduct`). Without a topic only the variants
 * are checked. This is the precondition, not the switch: see
 * COMPARISON_IN_ROTATION.
 */
export function comparisonCanBeGrounded(availability?: ShapeAvailability, topic?: string): boolean {
  const variants = availability?.variants ?? [];
  if (variants.length < 2) return false;
  return topic === undefined || topicIsTheProduct(topic, availability?.category, variants);
}

/**
 * OFF since FIX-920 (2026-10-13): the rotation does not pick a comparison.
 * A comparison the topic's own words ask for ("neoprene vs foam koozies") is
 * still written; there the searcher named the two sides.
 *
 * Why. AUTO-205 shipped the shape without generating one. FIX-920 tightened
 * its grounding (139 topics down to the 14 where two materials are products
 * of the category and the topic is the product), then generated the first of
 * the 14 in the queue, "promotional scarves", whose category holds three knit
 * scarves and three polyester ones. The post, "Knit vs Polyester Promotional
 * Scarves: Which Fits Your Giveaway?", is fluent and built as asked, and its
 * polyester half describes a thin, smooth, full-colour printed scarf that
 * "will not keep a crew member warm", above a product row of Fleece Scarves
 * and Fleece Mitten Scarves: the catalogue's three polyester scarves are
 * fleece. The model was given two WORDS the catalogue files products under
 * and imagined what they meant. A material value does not say what kind of
 * product it is, and the values mix fibres with constructions and repeat
 * themselves (knit against polyester, mesh against polyester, steel against
 * stainless steel), so on the best-grounded topic in the pool the comparison
 * was half invented.
 *
 * Before this is turned on again: each side must reach the prompt as the
 * NAMES of its own products, not as a word; the post's product row must show
 * both sides (the keyword matcher showed one); and the two sides must be the
 * same kind of thing. Then generate several and read them. The cost of
 * leaving it off is 14 topics of 2,121.
 */
export const COMPARISON_IN_ROTATION = false;

/** A comparison the ROTATION may pick: the switch above, and the grounding. A comparison the topic's own words ask for ("x vs y") needs neither. */
export function comparisonIsAvailable(availability?: ShapeAvailability, topic?: string): boolean {
  return COMPARISON_IN_ROTATION && comparisonCanBeGrounded(availability, topic);
}

/**
 * The shapes a PLAIN product topic may take (AUTO-205 Part 3), in a fixed
 * order so the rotation below is stable: a list when the catalogue can carry
 * one, a guide always, a question always (a question post answers a question
 * and needs no products), a comparison when the category is sold in two or
 * more real materials. Before AUTO-205 this was list or guide only, which the
 * diagnostic measured turning into 82% guides once thin lists were refused
 * (its brief said 86%). Since FIX-920 the comparison is switched off in the
 * rotation (COMPARISON_IN_ROTATION), so a plain topic is a list, a guide or a
 * question; `topic` is passed so the grounding rule can read it when the
 * switch is turned on again.
 */
export function availableShapes(availability?: ShapeAvailability, topic?: string): TitleShape[] {
  const shapes: TitleShape[] = [];
  if (listIsAvailable(availability)) shapes.push('list');
  shapes.push('guide', 'question');
  if (comparisonIsAvailable(availability, topic)) shapes.push('comparison');
  return shapes;
}

/**
 * How many slots a list takes in the rotation when the catalogue can carry
 * one. A list is the shape Patrick's blog is built on and the one the strips
 * were built for, so where products exist it stays the most common shape
 * without being the only one. Measured over the 2,121 usable topics on
 * 2026-10-12 (whole pool / topics with two or more products behind them):
 * weight 1 gives guide 42% question 35% list 13% comparison 10% (list 20%
 * with products); weight 2 gives list 19% (28%); weight 3 gives guide 38.5%
 * question 31% list 24% comparison 7% on the whole pool and LIST 35% guide
 * 30% question 26% comparison 9% where products exist. Three. (FIX-920 then
 * took the comparison away from the topics it could not honestly be written
 * for, and then switched it off in the rotation; the weight did not move, and
 * the figures after it are in CLAUDE.md.)
 */
export const LIST_ROTATION_WEIGHT = 3;

/** The rotation a plain topic is hashed into: `availableShapes` with the list repeated LIST_ROTATION_WEIGHT times when it is available. */
export function shapeRotation(availability?: ShapeAvailability, topic?: string): TitleShape[] {
  const out: TitleShape[] = [];
  for (const shape of availableShapes(availability, topic)) {
    if (shape === 'list') for (let i = 0; i < LIST_ROTATION_WEIGHT; i += 1) out.push('list');
    else out.push(shape);
  }
  return out;
}

/**
 * The title shape for a topic. `choice` is what the caller asked for: 'list'
 * forces a list; 'single' forces a non-list shape (the topic's own, or a
 * guide when the topic reads as a list); 'auto' follows the topic, and for a
 * plain product topic rotates through `availableShapes` by a stable hash of
 * the topic's own words, so the same topic always gets the same answer and
 * the blog index alternates. A topic whose words ask for a list but whose
 * catalogue cannot carry one (`availability.depth`) becomes a guide: only a
 * genuine lack of products changes a shape, never a dice roll.
 */
export function chooseTitleShape(topic: string, choice: TemplateChoice = 'auto', availability?: ShapeAvailability): TitleShape {
  if (choice === 'list') return 'list';
  const t = topic.toLowerCase().replace(/\s+/g, ' ').trim();
  let shape: TitleShape | null = triggeredShape(t);
  if (shape === 'list' && !listIsAvailable(availability)) shape = 'guide';
  if (shape === null) {
    const options = shapeRotation(availability, t);
    shape = options[stableHash(`shape:${topicSeed(t)}`) % options.length];
  }
  if (choice === 'single' && shape === 'list') return 'guide';
  return shape;
}

/**
 * How many ideas a list post for this topic WANTS: the word budget's count
 * for the target, moved by a stable offset of -2 to +3 from the topic's
 * words, inside LIST_IDEAS_MIN..LIST_IDEAS_MAX. At the panel's 1,500 words
 * the base is 9 and the result 7 to 12 (6 to 12 with the lower floor).
 */
export function ideaCountFor(target: number, topic: string): number {
  const base = listIdeaCount(target);
  const offset = (stableHash(`count:${topicSeed(topic)}`) % 6) - 2;
  return Math.min(LIST_IDEAS_MAX, Math.max(LIST_IDEAS_MIN, base + offset));
}

/**
 * How many ideas the list for this topic GETS (AUTO-205): what it wants,
 * capped by what the catalogue can carry at PRODUCTS_PER_IDEA products an
 * idea, or null when the depth cannot sustain even LIST_IDEAS_MIN (the topic
 * is then not written as a list at all). An unmeasured depth caps nothing. A
 * list of five is still a list; depth sets the COUNT, not the shape.
 */
export function sustainableListIdeas(target: number, topic: string, depth?: number): number | null {
  const wanted = ideaCountFor(target, topic);
  if (depth === undefined) return wanted;
  const carry = ideasDepthCanCarry(depth);
  if (carry < LIST_IDEAS_MIN) return null;
  return Math.min(wanted, carry);
}

/** A caller's own idea count (the `ideaCount` parameter of generateBlogPost), held inside the range; null for anything that is not a whole number. */
export function clampIdeaCount(value: unknown): number | null {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return null;
  return Math.min(LIST_IDEAS_MAX, Math.max(LIST_IDEAS_MIN, n));
}

/** "stainless-steel" as "stainless steel", for a prompt. */
export function variantLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, ' ');
}

/** The variants a comparison may be built on, as a prompt clause; empty when none were measured. */
function variantsClause(variants?: readonly string[]): string {
  const labels = (variants ?? []).map(variantLabel).filter(Boolean);
  return labels.length >= 2 ? ` The kinds this product is actually sold in, from the catalogue: ${labels.join(', ')}. Compare TWO of them (the two a buyer most often weighs), named in the title.` : '';
}

/**
 * The "title" line of the generator's JSON contract, per shape. A question
 * title is asked to be the question a BUYER asks, in one of several forms, so
 * a run of question posts does not all open "Which ... Work Best" (AUTO-205);
 * a comparison names the two variants it compares, from the measured list
 * when there is one.
 */
export function titleInstruction(shape: TitleShape, ideaCount: number, variants?: readonly string[]): string {
  const len = `at most ${TITLE_TARGET_CHARS} characters`;
  switch (shape) {
    case 'list':
      return `a numbered list title that STARTS with the number ${ideaCount} (exactly the number of idea sections), carries the plural topic keyword, and does not default to "${ideaCount} ... Ideas": choose the form that fits, such as "${ideaCount} Ways to ...", "${ideaCount} ... Every HR Director Should Consider", "${ideaCount} ... That Work for ..."; ${len}`;
    case 'guide':
      return `a buyer's guide title, NOT a numbered list and NOT starting with a number, carrying the plural topic keyword, in the style of "Choosing Custom Koozies: What to Know Before You Order" or "Custom Koozies for Company Events: A Buyer's Guide"; ${len}`;
    case 'question':
      return `the one question a buyer of this product actually asks, written as a question that ENDS WITH ? and carries the topic keyword; choose the question that matters most for this product, not a template, for example "Which Custom Koozies Work Best for Outdoor Events?", "How Many Custom Koozies Should a Company Picnic Order?", "Are Custom Koozies Still Worth It for Trade Shows?", "What Makes Custom Koozies a Good Employee Gift?", "Do Custom Koozies Need a Full-Color Imprint?"; ${len}`;
    case 'howto':
      return `a title that STARTS WITH "How to", carrying the plural topic keyword, in the style of "How to Order Custom Koozies for a Company Picnic"; ${len}`;
    case 'comparison':
      return `a comparison title naming both sides, NOT starting with a number, in the style of "Neoprene vs Foam Koozies: Which Is Right for Your Event?"${variantsClause(variants)}; at most ${TITLE_TARGET_CHARS + 5} characters`;
  }
}

/**
 * How the single template's sections are to be written, per non-list shape;
 * a comparison is told which variants the catalogue offers (AUTO-205), so the
 * two sides are real kinds the site sells rather than invented ones.
 */
export function shapeSectionGuidance(shape: TitleShape, sectionCount: number, variants?: readonly string[]): string {
  switch (shape) {
    case 'guide':
      return `This is a BUYER'S GUIDE. The ${sectionCount} sections are the buyer's considerations in a sensible order (what the product is for and who orders it, what to look for, materials and quality, decoration options, quantities and lead times, mistakes to avoid), each with a descriptive heading. Not a numbered list of ideas.`;
    case 'question':
      return `This post ANSWERS THE QUESTION in the title. The FIRST section answers it directly in its first sentence, then explains; the remaining ${sectionCount - 1} sections give the detail a buyer needs to act on the answer (who it applies to, what changes the answer, how to order accordingly). Headings are descriptive, not numbered. The answer is a buyer's answer, grounded in how the product is ordered and used, never a sales pitch.`;
    case 'howto':
      return `This is a HOW-TO. The ${sectionCount} sections are the steps in the order a buyer takes them, each heading starting "Step N:" with N from 1 to ${sectionCount}, each explaining what to do and what to decide at that step. Use listItems where a step has a checklist.`;
    case 'comparison':
      return `This is a COMPARISON of two kinds of the same product.${variantsClause(variants)} The first section names the two options being compared and who tends to order each; the middle sections compare them point by point (use, durability, decoration, quantity, lead time); the LAST section says which to choose for which buyer. Headings are descriptive, not numbered.`;
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
