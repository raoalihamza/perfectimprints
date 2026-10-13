/**
 * ONE blog generation (AUTO-201): a title and its inputs in, a finished
 * post out, with its product strips resolved and its internal links PLACED.
 * This is the body of app/api/sanity/generate-blog/route.ts (P2-AI-002,
 * tightened P2-AI-002b, FIX-900) moved out of the route so that it has two
 * callers and only two:
 *
 *   - the generate-blog route, behind the Studio nonce guard, for the two
 *     "Generate / Regenerate Blog with AI" document actions, which patch an
 *     EXISTING draft Patrick is editing (nothing is created there); and
 *   - createBlogDraftFromTopic (create-blog-draft.ts), the topic-to-saved-
 *     draft function the Blog Topics tab calls through the blog-topics route
 *     and the Stage 2 scheduler will call directly.
 *
 * Orchestration: choose the post's SHAPE from its topic (lib/blog-automation/
 * blog-shape: a list with a topic-derived number, a buyer's guide, a question
 * answered, a how-to or a comparison, AUTO-203) -> generate structured JSON
 * (lib/ai/deepseek + brand voice, with concrete per-section word budgets,
 * lib/ai/word-budget) -> refuse a title that contradicts its shape, drops
 * the topic's words, runs long, or duplicates an existing post -> match
 * related products per strip (lib/ai/related-products: per-idea category
 * resolution, relevance floor, cross-strip dedup) -> find internal links from
 * real published targets only (lib/ai/internal-links, unchanged by AUTO-201)
 * -> PLACE them into the body paragraphs under the 'topic' anchor policy
 * (lib/ai/place-internal-links) -> assemble the Portable Text body
 * (lib/portable-text/build-blog-body). Never publishes; never writes.
 *
 * SERVER ONLY: reads products.json from disk through the matcher, reads
 * Sanity through the link finder, and reads DEEPSEEK_API_KEY. Never import
 * from Studio bundle code. Relative imports, like the rest of
 * lib/blog-automation.
 */

import { siteWideHiddenSkus } from '../products/site-wide-hidden';
import { brandVoiceSystemBlock, BUYER_PERSONA } from '../ai/brand-voice';
import { generateJson } from '../ai/deepseek';
import {
  catalogTopUpFloor,
  matchRelatedProducts,
  productNounOf,
  resolveCategoryForKeywords,
} from '../ai/related-products';
import type { GeigerProduct } from '../product-types';
import { suggestInternalLinks, type InternalLinkSuggestion } from '../ai/internal-links';
import { placeInternalLinks, topicWordsOf, type PlacedLink } from '../ai/place-internal-links';
import {
  buildWordBudget,
  clampWordCount,
  singleSectionCount,
  THIN_FLOOR_RATIO,
  type WordBudget,
} from '../ai/word-budget';
import { buildBlogBody, type BlogBodyBlock, type BlogBodyInput, type BlogBodySectionInput } from '../portable-text/build-blog-body';
import { loadLinkDocsForKind } from '../ai/internal-links';
import { slugifyTitle } from '../blog/slugify-title';
import { withReadMemo } from '../ai/read-memo';
import { measureTopicDepth, type TopicDepth } from './topic-depth';
import {
  avoidTitlesFor,
  chooseTitleShape,
  clampIdeaCount,
  isDuplicateSlug,
  isDuplicateTitle,
  LIST_IDEAS_MIN,
  repairListTitleNumber,
  repairQuestionTitle,
  shapeSectionGuidance,
  sustainableListIdeas,
  templateChoiceOf,
  templateForShape,
  titleInstruction,
  titleProblem,
  TITLE_SHAPE_LABELS,
  triggeredShape,
  type BodyTemplate,
  type ExistingPost,
  type ShapeAvailability,
  type TemplateChoice,
  type TitleShape,
} from './blog-shape';

/** The body structure; 'auto' (AUTO-203) means "whatever the topic's shape needs". */
export type BlogTemplate = TemplateChoice;

/** A strip renders only with at least this many relevant products (tunable). */
const MIN_STRIP_PRODUCTS = 2;
/** Products per idea strip (list) / per post strip (single). */
const LIST_STRIP_LIMIT = 4;
const SINGLE_STRIP_LIMIT = 7;
/** Relevance floor: shared significant tokens required for strip eligibility. */
const STRIP_MIN_SCORE = 1;
/**
 * The catalog top-up's own floor (FIX-900, 2026-10-04): a product from the
 * FULL catalog must share this many significant tokens with the idea's
 * phrase, lowered to the phrase's own token count by `catalogTopUpFloor`
 * (so "koozies" still matches on its one word). The category branch keeps
 * STRIP_MIN_SCORE. At 1 everywhere, "sunscreen sticks" put two hockey sticks
 * and a lint stick under a sunscreen idea, "rabbit-style corkscrews" put
 * infant bodysuits under a wine-opener idea (AUTO-200 4.3); one incidental
 * word across 8,000 product names is not relevance. Below MIN_STRIP_PRODUCTS
 * a strip is skipped, never padded: an empty row beats a wrong one.
 */
const STRIP_CATALOG_MIN_SCORE = 2;

/**
 * Internal links placed per post (AUTO-201): Patrick's number, "about six",
 * spelled here and nowhere else. It is a ceiling, never a quota: a target
 * with no clean anchor is skipped, and a post with fewer good targets gets
 * fewer links. Before AUTO-201 the route placed at most 5.
 */
export const INTERNAL_LINKS_PER_POST = 6;

/**
 * How many targets the finder is asked for, so the placer has a second
 * choice for every slot: a target whose words never appear in the text costs
 * nothing but its place in the suggestions list. Every one found is still
 * recorded on the draft (placed or not), which is Patrick's "add more by
 * hand" list.
 */
export const INTERNAL_LINK_CANDIDATES = INTERNAL_LINKS_PER_POST * 2;

/**
 * The DeepSeek deadline for one post (AUTO-201). Measured generations are
 * 50 to 70 s (AUTO-200) and the panel tells Patrick "1 to 2 min"; 150 s is
 * twice the slow end, so a slow night still answers, while a call that has
 * hung is ended well inside the routes' maxDuration (180 on generate-blog,
 * 240 on blog-topics) with time left to say so. A scheduler waiting on a
 * call that never ends is worse than one that fails and retries.
 */
export const BLOG_AI_TIMEOUT_MS = 150_000;

/**
 * A generation that came back but cannot be used: incomplete JSON, a thin
 * post, or a price in the text. `status` is the HTTP status the routes
 * answer with (502: try again). DeepSeek's own failures keep their
 * `DeepSeekError`.
 */
export class BlogGenerationError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'BlogGenerationError';
    this.status = status;
  }
}

export interface GenerateBlogPostInput {
  title: string;
  /** 'list' or 'single' force a body template; 'auto' (the panel's default since AUTO-203) lets the topic choose. */
  template: BlogTemplate;
  keywords: string[];
  categorySlug?: string;
  /** The doc's existing slug, so link suggestions don't point at itself. */
  currentSlug?: string;
  /** Approximate target length; clamped to 1300..1900, default 1500. */
  wordCount?: number;
  /**
   * The posts already on the site, for the duplicate-title check and the
   * "do not write these again" list (tests pass a list; default: the
   * published posts the link finder reads plus the current drafts).
   */
  existingPosts?: readonly ExistingPost[];
  /**
   * AUTO-205: the number of ideas a LIST post carries, when the caller wants
   * to set it (held inside LIST_IDEAS_MIN..LIST_IDEAS_MAX). Unset, the number
   * follows the topic and the catalogue's depth (`sustainableListIdeas`).
   * Ignored for every other shape. Forcing a guide already exists: that is
   * `template: 'single'`.
   */
  ideaCount?: number;
  /**
   * AUTO-205: the measured depth to use instead of measuring (tests, and the
   * measuring scripts, pass one). Default: measured through the matcher.
   */
  depth?: TopicDepth;
}

export interface GeneratedBlogPost {
  title: string;
  /** AUTO-203: the shape the title was written in, and the body template it was built with. */
  titleShape: TitleShape;
  template: BodyTemplate;
  /** The number a list title carries (= its idea sections); undefined for the other shapes. */
  ideaCount?: number;
  /** AUTO-205: what the catalogue had behind the topic when the shape was chosen. */
  depth: TopicDepth;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: BlogBodyBlock[];
  /** Everything the finder returned, each marked placed or not placed. */
  suggestedLinks: { label: string; href: string; reason: string }[];
  /** The links actually in the body, with their anchor text (AUTO-201). */
  placedLinks: PlacedLink[];
  /** Words in the generated text, as the thin floor counted them. */
  words: number;
}

interface GeneratedListSection {
  heading: string;
  paragraphs: string[];
  /** The concrete promotional item this idea is about: its product-match query. */
  productType?: string;
}

interface GeneratedSingleSection {
  heading: string;
  paragraphs: string[];
  listItems?: string[];
  listType?: 'bullet' | 'number';
}

interface GeneratedBlog {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  intro: string[];
  sections: (GeneratedListSection & GeneratedSingleSection)[];
  /** single template only */
  productKeywords?: string[];
  productStripHeading?: string;
}

interface ShapePlan {
  shape: TitleShape;
  template: BodyTemplate;
  ideaCount?: number;
  /** Existing titles on this topic the model must not reuse or paraphrase. */
  avoidTitles: string[];
  /** AUTO-205: the material variants a comparison may be built on. */
  variants: readonly string[];
}

/**
 * A SHORT list is a different post, not a long one with sections deleted
 * (AUTO-205 Part 2): with fewer ideas each one gets more of the word budget,
 * and the prompt says what to do with it.
 */
function shortListGuidance(ideaCount: number): string {
  if (ideaCount > LIST_IDEAS_MIN + 1) return '';
  return `\nThis list has only ${ideaCount} ideas, so it is a SHORT, DEEP list, not a long one cut down: each idea section is developed in full (who orders this item and why, two or three concrete ways to use or brand it, what to decide before ordering, a mistake to avoid), and the intro says why these ${ideaCount} are the ones worth a buyer's attention. Never pad an idea with a repeat of another, and never add an idea to reach a rounder number.`;
}

function buildSystemPrompt(plan: ShapePlan, budget: WordBudget): string {
  const template = plan.template;
  const shared = `${brandVoiceSystemBlock()}

You are writing a LONG-FORM BLOG POST (at least ${budget.target} words total) for the Perfect Imprints blog. The post must cover, woven naturally into the flow: practical ways businesses can use the promotional items for this topic, the kinds of businesses and organizations that can use them, creative giveaway ideas, and recommended product directions. Concrete and specific, never generic filler: reach the length with substance (more use cases, more buyer specifics, more concrete detail), never with padding or keyword stuffing.

WORD BUDGET (these are MINIMUMS: models that aim for "about" these numbers come in short, so treat each as a floor):
- intro: at least ${budget.intro} words
- each of the ${budget.sectionCount} sections: at least ${budget.perSection} words of paragraphs
- total: at least ${budget.target} words

HARD LIMITS (count before returning, rewrite if any fail):
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- excerpt <= 300 chars (a 2-3 sentence teaser, plain text)
- NO prices, dollar amounts, per-unit costs or budget figures anywhere in the text: every order is quoted, and a number printed in a post goes stale
- the title makes no claim the post does not support, and carries the topic's own product words${
    plan.avoidTitles.length > 0
      ? `\n\nTITLES ALREADY ON THIS SITE (do not reuse or closely paraphrase any of them; the new post needs its own angle and its own title):\n${plan.avoidTitles.map((t) => `- ${t}`).join('\n')}`
      : ''
  }`;

  if (template === 'list') {
    return `${shared}

STRUCTURE, LIST-STYLE POST (${budget.sectionCount} ideas, so the title's number is ${budget.sectionCount}):${shortListGuidance(budget.sectionCount)}
Return a single JSON object, no prose, no code fences:
{
  "title": "${titleInstruction('list', budget.sectionCount)}",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + topic keyword",
  "excerpt": "<=300 chars",
  "intro": ["2-3 opening paragraphs as separate strings, at least ${budget.intro} words total"],
  "sections": [
    {
      "heading": "Idea N: short specific idea title (numbered)",
      "paragraphs": ["paragraphs totalling at least ${budget.perSection} words, covering who this idea fits and how to brand it"],
      "productType": "2-4 words naming the CONCRETE promotional item this idea is about, e.g. \\"power banks\\" or \\"stainless steel water bottles\\", a DIFFERENT item per idea"
    }
  ]
}
Exactly ${budget.sectionCount} idea sections. Every section MUST include productType, and each idea must be a different product type.`;
  }

  return `${shared}

STRUCTURE, SINGLE-TOPIC POST written as ${TITLE_SHAPE_LABELS[plan.shape]}:
${shapeSectionGuidance(plan.shape, budget.sectionCount, plan.variants)}
Return a single JSON object, no prose, no code fences:
{
  "title": "${titleInstruction(plan.shape, budget.sectionCount, plan.variants)}",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + topic keyword",
  "excerpt": "<=300 chars",
  "intro": ["2-3 opening paragraphs as separate strings, at least ${budget.intro} words total"],
  "sections": [
    {
      "heading": "descriptive section heading",
      "paragraphs": ["paragraphs totalling at least ${budget.perSection} words"],
      "listItems": ["optional: 3-7 short list entries when a list genuinely helps"],
      "listType": "bullet or number (only when listItems present)"
    }
  ],
  "productKeywords": ["3-5 plural product keywords describing the products to recommend"],
  "productStripHeading": "short heading for the recommended-products row"
}
Exactly ${budget.sectionCount} sections. Use listItems in at most ${plan.shape === 'howto' ? budget.sectionCount : 2} sections.`;
}

function buildUserPrompt(title: string, keywords: string[], categorySlug?: string): string {
  return `Write the blog post now.

Post title / topic: ${title}
Topic keywords (plural): ${keywords.join(', ') || '(derive from the title)'}
${categorySlug ? `Primary product category: /cat/${categorySlug}` : ''}
Buyer personas: ${BUYER_PERSONA}

Return the JSON object now.`;
}

/** Word-boundary truncation safety net (mirrors the pipeline's post_process_lengths). */
function clampAtWordBoundary(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, max)).trim();
}

function textParts(gen: GeneratedBlog): string[] {
  const parts: string[] = [...(gen.intro ?? [])];
  for (const s of gen.sections ?? []) {
    parts.push(s.heading ?? '');
    parts.push(...(s.paragraphs ?? []));
    parts.push(...(s.listItems ?? []));
  }
  return parts;
}

function countWords(gen: GeneratedBlog): number {
  return textParts(gen).join(' ').split(/\s+/).filter(Boolean).length;
}

/**
 * A price in prose (AUTO-201's standing rule for the body): a dollar sign
 * on a figure, a figure followed by dollars / USD / cents, or "per unit" and
 * "each" money phrasing. Pure and exported for the test; a hit rejects the
 * post rather than editing it, because a sentence built around a number
 * reads wrong with the number cut out.
 */
export function containsPrice(text: string): boolean {
  return (
    /\$\s?\d/.test(text) ||
    /\b\d[\d,]*(?:\.\d+)?\s?(?:dollars?|usd|cents?)\b/i.test(text) ||
    /\b\d[\d,]*(?:\.\d+)?\s?(?:per unit|per piece|a piece|apiece|each)\b/i.test(text)
  );
}

function isStructurallyValid(gen: Partial<GeneratedBlog>, template: BodyTemplate): gen is GeneratedBlog {
  if (!gen) return false;
  if (typeof gen.title !== 'string' || !gen.title.trim()) return false;
  if (typeof gen.metaTitle !== 'string' || typeof gen.metaDescription !== 'string') return false;
  if (typeof gen.excerpt !== 'string') return false;
  if (!Array.isArray(gen.intro) || !Array.isArray(gen.sections)) return false;
  // A list is complete at LIST_IDEAS_MIN sections (AUTO-205: the floor is one
  // constant, here and in the shape rules); a single-topic post at 3.
  const min = template === 'list' ? LIST_IDEAS_MIN : 3;
  const valid = gen.sections.filter(
    (s) => s && typeof s.heading === 'string' && Array.isArray(s.paragraphs) && s.paragraphs.length > 0,
  );
  return valid.length >= min;
}

/**
 * The link finder's targets for this post, minus anything that could be the
 * post itself. The finder already drops the current slug from the blog
 * source; this is the belt for every kind, and for the day a slug coincides.
 */
function dropSelf(suggestions: InternalLinkSuggestion[], currentSlug?: string): InternalLinkSuggestion[] {
  if (!currentSlug) return suggestions;
  const self = `/blog/${currentSlug}`;
  return suggestions.filter((s) => s.href !== self);
}

/**
 * The posts already on the site (AUTO-203): the published ones the link
 * finder reads (tag-cached, never drafts) plus the current drafts (a live
 * read through the server client, best effort, so a draft made this morning
 * is not written twice with the same title). A failed drafts read loses only
 * the drafts; the published list is what the duplicate rule is for.
 */
async function readExistingPosts(currentSlug?: string): Promise<ExistingPost[]> {
  const published = (await loadLinkDocsForKind('blog')).map((d) => ({ title: d.title, slug: d.slug }));
  let drafts: ExistingPost[] = [];
  try {
    const { serverSanityClient } = await import('../sanity/studio-nonce-auth');
    const client = serverSanityClient();
    if (client) {
      drafts =
        (await client.fetch<ExistingPost[] | null>(
          `*[_type == "blogPost" && _id in path("drafts.**") && defined(title)]{ title, "slug": slug.current }`,
          {},
          { cache: 'no-store' },
        )) ?? [];
    }
  } catch {
    drafts = [];
  }
  return [...published, ...drafts].filter((p) => !currentSlug || p.slug !== currentSlug);
}

/**
 * One list idea's product strip: the products to show under the idea, or an
 * empty list when fewer than MIN_STRIP_PRODUCTS are relevant (a skipped strip,
 * never a padded one). Exported so the FIX-911 measuring harness replays
 * stored posts through this exact code instead of a copy of it; the caller
 * adds what it uses to `usedSkus`.
 *
 * Each idea matches its OWN product type: the model's concrete productType
 * ("power banks", "collapsible can coolers") is resolved to its root category
 * (lib/ai/category-resolver: slug, then product names, FIX-911) and the strip
 * is drawn from there; with no category it is drawn from the catalogue, at
 * the FIX-900 floor. Whatever is scanned rather than drawn from a category
 * must carry the idea's product noun (`scanMustCarry`, FIX-911).
 *
 * Patrick's own published Product Pages are scanned too (AUTO-204,
 * `includeProductPages`), at the catalogue floor and under the noun rule, so
 * "mini foam footballs" is offered his own football pages ahead of any
 * Geiger product from the catalogue. FIX-911 measured it on the 107 stored
 * strips (no verdict changes, one product added) and left the decision to
 * Ali, who said yes.
 */
export async function matchIdeaStrip(input: {
  /** The model's productType; empty when it gave none. */
  productType: string;
  heading: string;
  /** The post's primary category (Patrick's pick), the soft fallback. */
  categorySlug?: string;
  usedSkus: ReadonlySet<string>;
}): Promise<GeigerProduct[]> {
  const { categorySlug, usedSkus } = input;
  const productType = input.productType.trim();
  const stripKeywords = productType ? [productType] : [input.heading];
  const ideaCategory = productType ? await resolveCategoryForKeywords(productType) : null;
  const catalogMinScore = catalogTopUpFloor(stripKeywords, STRIP_CATALOG_MIN_SCORE);
  const scanMustCarry = productType ? productNounOf(productType) : null;
  let products = await matchRelatedProducts({
    hiddenSkus: await siteWideHiddenSkus(),
    categorySlug: ideaCategory ?? undefined,
    keywords: stripKeywords,
    limit: LIST_STRIP_LIMIT,
    minScore: STRIP_MIN_SCORE,
    catalogMinScore,
    scanMustCarry,
    includeProductPages: true,
    exclude: new Set(usedSkus),
  });
  // The shared primary category is a SOFT FALLBACK only (P2-AI-002b):
  // consulted when the idea's own match comes up thin, never the default
  // source for every idea (that is what made every strip identical).
  if (products.length < MIN_STRIP_PRODUCTS && categorySlug && categorySlug !== ideaCategory) {
    const fallback = await matchRelatedProducts({
      hiddenSkus: await siteWideHiddenSkus(),
      categorySlug,
      keywords: stripKeywords,
      limit: LIST_STRIP_LIMIT,
      minScore: STRIP_MIN_SCORE,
      catalogMinScore,
      scanMustCarry,
      includeProductPages: true,
      exclude: new Set([...usedSkus, ...products.map((p) => p.sku)]),
    });
    products = [...products, ...fallback].slice(0, LIST_STRIP_LIMIT);
  }
  // Below the floor a strip is SKIPPED (the idea's text still stands);
  // never padded with irrelevant catalog bestsellers.
  return products.length >= MIN_STRIP_PRODUCTS ? products : [];
}

/** Products taken from each keyword on the first pass of a keyword row. */
const KEYWORD_ROW_PER_KEYWORD = 2;

/**
 * The product row of a single-topic post whose topic has NO category
 * (FIX-920): each of the model's product keywords is matched ON ITS OWN, the
 * way a list idea is (`matchIdeaStrip`: its own category, the catalogue floor,
 * the product noun), and the row takes two from each keyword in the order the
 * model gave them, then the rest, up to `limit`. Exported for the measuring
 * harness.
 *
 * Why. With no category the row used to be ONE match over all the keywords
 * pooled, and the highest score went to whatever product happened to carry
 * words of several of them. The first question post the scheduler would
 * write, "imprinted promotional products", asked for water bottles, tote
 * bags, notebooks and tumblers and was given a row of seven products, five of
 * them wine bottle tote bags ("6-Bottle Cooler Tote Bag" carries bottle, tote
 * and bag). 775 of the 2,121 usable topics resolve to no category. A post
 * WITH a category keeps the pooled match inside that category, where it was
 * measured and is right.
 */
export async function matchKeywordRow(keywords: readonly string[], limit: number = SINGLE_STRIP_LIMIT): Promise<GeigerProduct[]> {
  const used = new Set<string>();
  const perKeyword: GeigerProduct[][] = [];
  for (const keyword of keywords) {
    const strip = await matchIdeaStrip({ productType: keyword, heading: keyword, usedSkus: used });
    for (const p of strip) used.add(p.sku);
    perKeyword.push(strip);
  }
  const row: GeigerProduct[] = [];
  for (const [from, to] of [[0, KEYWORD_ROW_PER_KEYWORD], [KEYWORD_ROW_PER_KEYWORD, LIST_STRIP_LIMIT]]) {
    for (const strip of perKeyword) {
      for (const p of strip.slice(from, to)) if (row.length < limit) row.push(p);
    }
  }
  return row;
}

/**
 * Generate one post. Throws `DeepSeekError` (the call failed or timed out)
 * or `BlogGenerationError` (the answer cannot be used). Never writes.
 *
 * The whole generation runs inside ONE read memo (AUTO-205 Part 1,
 * lib/ai/read-memo.ts): the control sets, the custom products, the product
 * pages, the hidden list and each category's reads are made once per
 * generation however many ideas ask for them. Measured on FIX-911's 107
 * ideas replayed post by post with live Sanity reads: 742 requests before,
 * one per distinct read after (52 across the run), every verdict identical.
 */
export async function generateBlogPost(input: GenerateBlogPostInput): Promise<GeneratedBlogPost> {
  return withReadMemo(() => generateBlogPostInScope(input));
}

async function generateBlogPostInScope(input: GenerateBlogPostInput): Promise<GeneratedBlogPost> {
  const title = input.title.trim();
  if (!title) throw new BlogGenerationError('A document title is required.', 400);
  const keywords = (input.keywords ?? []).map((k) => `${k}`.trim()).filter(Boolean);
  const promptKeywords = keywords.length > 0 ? keywords : [title.toLowerCase()];
  const categorySlug = (input.categorySlug || '').trim() || undefined;
  const currentSlug = (input.currentSlug || '').trim() || undefined;
  const target = clampWordCount(input.wordCount);

  // 0) The depth (AUTO-205): how many products the catalogue has behind the
  //    topic, and which variants it is sold in, measured through the shipped
  //    matcher BEFORE the shape is chosen. Depth sets how many ideas a list
  //    carries; only a depth too thin for LIST_IDEAS_MIN ideas changes the
  //    shape (to a guide), never a dice roll.
  const topic = promptKeywords.join(' ');
  const depth = input.depth ?? (await measureTopicDepth(topic, { minScore: STRIP_MIN_SCORE, catalogMinScore: STRIP_CATALOG_MIN_SCORE }));
  const availability: ShapeAvailability = { depth: depth.depth, variants: depth.variants, category: depth.category };

  // 0b) The shape, from the topic (AUTO-203) and what the catalogue allows
  //    (AUTO-205). The topic is the keywords the post is written for (the
  //    panel sends the search; the Studio action sends Patrick's keywords),
  //    else the title. 'list' / 'single' from the caller force the body
  //    template; 'auto' follows the topic. A plain product topic rotates
  //    through list, guide, question and (with two real materials) comparison.
  const choice = templateChoiceOf(input.template);
  const shape = chooseTitleShape(topic, choice, availability);
  const template = templateForShape(shape);
  // A forced list on a thin topic still runs, at the floor: forced is forced.
  const ideaCount =
    template === 'list'
      ? clampIdeaCount(input.ideaCount) ?? sustainableListIdeas(target, topic, depth.depth) ?? LIST_IDEAS_MIN
      : undefined;
  const sectionCount = ideaCount ?? singleSectionCount(target);
  const budget = buildWordBudget(target, sectionCount);
  const existing = input.existingPosts ?? (await readExistingPosts(currentSlug));
  // A comparison the topic itself asks for ("neoprene vs foam koozies") compares
  // the two things the topic names; the catalogue's materials are offered only
  // to a comparison the rotation picked (FIX-920; that is switched off today).
  const variants = shape === 'comparison' && triggeredShape(topic) === 'comparison' ? [] : depth.variants;
  const plan: ShapePlan = { shape, template, ideaCount, avoidTitles: avoidTitlesFor(topic, existing), variants };

  // 1) Generate the structured post against concrete word budgets.
  const gen = await generateJson<Partial<GeneratedBlog>>({
    system: buildSystemPrompt(plan, budget),
    user: buildUserPrompt(title, promptKeywords, categorySlug),
    // Sized for the 1,900-word top of range with clear headroom (~1.5 tokens
    // per English word + JSON scaffolding ≈ 3.5-4k; 6500 keeps a truncated
    // response (which surfaces as a JSON parse error, not the thin floor)
    // out of reach without over-allocating like the old 2,400-word 8000.
    maxTokens: 6500,
    temperature: 0.65,
    timeoutMs: BLOG_AI_TIMEOUT_MS,
  });

  if (!isStructurallyValid(gen, template)) {
    throw new BlogGenerationError('The AI returned an incomplete post. Click Generate again to retry.');
  }
  // Dynamic thin floor: 70% of the requested target (P2-AI-002c; was 75%,
  // which rejected acceptable ~1100-word posts against a 1700 ask). The
  // floor only accepts/rejects the already-generated post; generation
  // length is driven by the per-section budgets in the prompt.
  const minWords = Math.round(target * THIN_FLOOR_RATIO);
  const words = countWords(gen);
  if (words < minWords) {
    throw new BlogGenerationError(
      `The AI returned a thin post (~${words} words against a ${target}-word target). Click Generate again to retry.`,
    );
  }
  const priced = textParts(gen).find(containsPrice);
  if (priced) {
    throw new BlogGenerationError(
      'The AI wrote a price into the post, which this site never does (every order is quoted). Click Generate again to retry.',
    );
  }

  const sections = gen.sections.filter((s) => s && typeof s.heading === 'string' && Array.isArray(s.paragraphs));

  // 1b) The title must match its shape, carry the topic, fit, and be new
  //     (AUTO-203). Two things are repaired rather than refused, because the
  //     fix is deterministic: a list title's number is set to the sections
  //     actually written (the number and the body are one fact), and a
  //     question title gets its question mark. Everything else is a 502 and
  //     a retry, like a thin post.
  let finalTitle = gen.title.trim();
  if (template === 'list') finalTitle = repairListTitleNumber(finalTitle, sections.length);
  if (shape === 'question') finalTitle = repairQuestionTitle(finalTitle);
  const titleFault = titleProblem(finalTitle, shape, { ideaCount: template === 'list' ? sections.length : undefined, topic });
  if (titleFault) {
    throw new BlogGenerationError(`The AI wrote a title that does not fit the post (${titleFault}: "${finalTitle}"). Click Generate again to retry.`);
  }
  const sameTitle = isDuplicateTitle(finalTitle, existing);
  if (sameTitle) {
    throw new BlogGenerationError(`The AI reused the title of an existing post ("${sameTitle.title}", /blog/${sameTitle.slug}). Click Generate again to retry.`);
  }
  const sameSlug = isDuplicateSlug(slugifyTitle(finalTitle), existing);
  if (sameSlug) {
    throw new BlogGenerationError(`The AI's title would give this post the address of an existing one (/blog/${sameSlug.slug}). Click Generate again to retry.`);
  }

  // 2) Related products. One `usedSkus` set for the WHOLE post: every strip
  //    excludes what earlier strips used, so no product repeats anywhere.
  const usedSkus = new Set<string>();
  const bodySections: BlogBodySectionInput[] = [];
  if (template === 'list') {
    for (const s of sections) {
      const strip = await matchIdeaStrip({
        productType: s.productType ?? '',
        heading: s.heading,
        categorySlug,
        usedSkus,
      });
      for (const p of strip) usedSkus.add(p.sku);
      bodySections.push({
        heading: s.heading,
        headingLevel: 'h2',
        paragraphs: s.paragraphs,
        products: strip.length > 0 ? { skus: strip.map((p) => p.sku) } : undefined,
      });
    }
  } else {
    for (const s of sections) {
      bodySections.push({
        heading: s.heading,
        headingLevel: 'h2',
        paragraphs: s.paragraphs,
        list:
          Array.isArray(s.listItems) && s.listItems.length > 0
            ? {
                kind: s.listType === 'number' ? 'number' : 'bullet',
                items: s.listItems,
              }
            : undefined,
      });
    }
    const stripKeywords = (gen.productKeywords ?? []).filter(Boolean);
    const singleKeywords = stripKeywords.length > 0 ? stripKeywords : promptKeywords;
    // The primary category stays the primary source for single-focus posts;
    // with none given (the topic path), the category the depth measurement
    // resolved for the topic (AUTO-205: a sunglasses guide drew no product
    // row from the catalogue floor while 51 sunglasses sat in its category).
    // With NO category at all the keywords are matched one by one (FIX-920,
    // `matchKeywordRow`): pooled, they returned wine totes for a post that
    // asked for water bottles, tote bags and notebooks.
    const stripCategory = categorySlug ?? depth.category ?? undefined;
    const products = stripCategory
      ? await matchRelatedProducts({
          hiddenSkus: await siteWideHiddenSkus(),
          categorySlug: stripCategory,
          keywords: singleKeywords,
          limit: SINGLE_STRIP_LIMIT,
          minScore: STRIP_MIN_SCORE,
          catalogMinScore: catalogTopUpFloor(singleKeywords, STRIP_CATALOG_MIN_SCORE),
        })
      : await matchKeywordRow(singleKeywords);
    if (products.length >= MIN_STRIP_PRODUCTS) {
      bodySections.push({
        products: {
          heading: gen.productStripHeading?.trim() || 'Recommended Products',
          skus: products.map((p) => p.sku),
        },
      });
    }
  }

  // 3) Internal links from real published targets only, mixed across kinds
  //    by the finder (categories, blogs, pages, videos, landing pages).
  //    Twice the number to place, so a target with no clean anchor leaves
  //    room for the next. The finder boosts the post's own category page
  //    when it is told which one that is; the Studio action passes Patrick's
  //    pick, the topic path passes none, so it is resolved from the keywords
  //    here (AUTO-201: on the proof run the tote bags post otherwise linked
  //    /cat/lunch-bags-boxes-totes before /cat/tote-bags, an alphabetical
  //    tie). This slug is for the LINK finder only: the strips keep
  //    `categorySlug` exactly as before.
  const linkCategorySlug = categorySlug ?? (await resolveCategoryForKeywords(promptKeywords.join(' '))) ?? undefined;
  const found = dropSelf(
    await suggestInternalLinks({
      keywords: promptKeywords,
      categorySlug: linkCategorySlug,
      excludeSlug: currentSlug,
      limit: INTERNAL_LINK_CANDIDATES,
    }),
    currentSlug,
  );
  // A target matched on nothing but generic words ("custom", "for",
  // "business") was not found for this topic; it is neither placed nor
  // recorded. On the proof run 8 of the 12 suggestions for the stadium seat
  // cushions post were beach-towel landing pages and an earbuds video
  // matched on "custom" alone.
  const suggestions = found.filter((s) => topicWordsOf(s).length > 0);

  // 4) PLACE the links into the body paragraphs (P2-AI-002b: Patrick
  //    confirmed automatic hyperlinking; AUTO-201: the 'topic' anchor policy,
  //    same tab, at most INTERNAL_LINKS_PER_POST). Targets with no clean
  //    anchor are skipped; ALL suggestions are still returned so the draft
  //    records what was found and which were placed.
  const { body: linkedInput, placedHrefs, placed } = placeInternalLinks(
    { intro: gen.intro, sections: bodySections } satisfies BlogBodyInput,
    suggestions,
    INTERNAL_LINKS_PER_POST,
    { linkShape: 'blog', anchorPolicy: 'topic', topicWords: promptKeywords },
  );
  const blogBody = buildBlogBody(linkedInput);
  const suggestedLinks = suggestions.map((l) => ({
    label: l.label,
    href: l.href,
    reason: placedHrefs.includes(l.href)
      ? `${l.reason} (placed in the body)`
      : `${l.reason} (not placed: no clean anchor found)`,
  }));

  return {
    title: finalTitle,
    titleShape: shape,
    template,
    ideaCount: template === 'list' ? sections.length : undefined,
    depth,
    metaTitle: clampAtWordBoundary(gen.metaTitle, 60),
    metaDescription: clampAtWordBoundary(gen.metaDescription, 155),
    excerpt: clampAtWordBoundary(gen.excerpt, 300),
    body: blogBody,
    suggestedLinks,
    placedLinks: placed,
    words,
  };
}
