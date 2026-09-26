/**
 * Shared brand-voice / keyword / persona guidance for every Phase 2 AI content
 * feature (P2-AI-001). Single source of truth for the rules in CLAUDE.md §24 so
 * blogs, videos, pages, and landing pages all bake in the same voice — the
 * category route (app/api/sanity/generate-content) currently duplicates these
 * rules inline and can adopt this module later (left untouched to avoid churn).
 *
 * Pure module: no node:fs, no `sanity`, no `server-only` — safe to import from
 * API routes, build scripts, and unit tests alike. (Do NOT import into Studio
 * bundle code; prompts belong server-side.)
 */

/** The B2B buyer personas every piece of AI content is written for. */
export const BUYER_PERSONA =
  'marketing directors, HR directors, safety managers, and small-business owners';

/**
 * The plural keyword-derivative rule (matches the category route + the
 * build-time root_category.txt v2 prompt). `[topic]` is replaced by the
 * feature's plural target keyword at prompt-build time or left for the model.
 */
export const KEYWORD_DERIVATIVES_RULE =
  'Naturally weave in plural keyword variants where they fit, never stuffed: ' +
  'custom [topic], promotional [topic], branded [topic], personalized [topic], ' +
  'logo [topic] (or logo-printed), bulk [topic], wholesale [topic].';

/**
 * Generic promotional modifier words (P2-AI-002b). These appear in almost every
 * product name, category slug, and keyword phrase ("Custom Visor", "custom
 * power banks", …), so they carry ZERO signal for relevance matching — a visor
 * must never match "custom power banks" just because both say "custom". The
 * related-products matcher and category resolver STRIP these from BOTH sides
 * before computing token overlap. They stay in the generated copy (Section 24
 * requires them there); they are ignored only for the matching math.
 */
export const GENERIC_PROMO_WORDS = [
  'custom',
  'customized',
  'personalized',
  'logo',
  'printed',
  'branded',
  'promotional',
  'bulk',
  'wholesale',
] as const;

/**
 * Filler words that survive the length-3 token filter and carry no matching
 * signal ("the", "for", "ideas"). Until AUTO-110 this list was a private
 * constant inside lib/ai/related-products.ts and the AUTO-100 script kept a
 * hand copy of it in step; it is exported from here so the related-products
 * matcher, the blog topic guard (lib/blog-automation/topic-pool.ts) and the
 * AUTO-100 script all read ONE list.
 */
export const MATCH_FILLER_WORDS = [
  'the',
  'and',
  'for',
  'with',
  'your',
  'our',
  'from',
  'that',
  'this',
  'are',
  'can',
  'will',
  'how',
  'why',
  'what',
  'best',
  'top',
  'ideas',
  'idea',
] as const;

/**
 * Every word with no matching signal: the generic promo modifiers plus the
 * filler. This is THE shared non-significant list; the related-products
 * matcher strips it from both sides of every comparison, and the blog topic
 * guard strips it from a search query before the query reaches the
 * internal-links detector.
 */
export const NON_SIGNIFICANT_MATCH_WORDS: ReadonlySet<string> = new Set<string>([
  ...GENERIC_PROMO_WORDS,
  ...MATCH_FILLER_WORDS,
]);

/**
 * Near-generic on THIS site, measured by AUTO-100 (2026-09-24): "products",
 * "items", "gift", "business" and "company" carried 315 of the 1,672
 * two-token cannibalization matches on their own, because a large share of
 * Patrick's 658 blog TITLES contain one of them. So the blog topic guard
 * (AUTO-110) treats them as non-significant too, on top of the shared list
 * above. Singular and plural forms are both listed because the detector folds
 * plurals on the TITLE side only; the query side must be stripped of both.
 *
 * Deliberately NOT folded into NON_SIGNIFICANT_MATCH_WORDS, which the
 * related-products matcher and its category resolver use: "gift" is a real
 * product word in the catalog, and with it stripped, "executive gifts" resolves
 * to the executive-pens category (a one-token tie broken by slug length) and
 * "gift sets" to desk-sets. The words are near-generic among blog titles, not
 * among product names, so they are applied where that is true.
 */
export const NEAR_GENERIC_WORDS = [
  'product',
  'products',
  'item',
  'items',
  'gift',
  'gifts',
  'business',
  'businesses',
  'company',
  'companies',
] as const;

/** Banned filler phrases (matches the category route's system prompt). */
export const BANNED_PHRASES = [
  '"in today\'s world"',
  '"leverage"',
  '"synergy"',
  '"unlock"',
  '"elevate your brand"',
  '"look no further"',
  '"the perfect choice"',
  '"we\'ve got you covered"',
  '"tailored to your needs"',
  'openings with "When it comes to" or "Whether you\'re a..."',
  'em-dashes as filler',
];

/**
 * The shared system-prompt fragment every AI content feature composes into its
 * own system prompt (blog structure rules, video rules, etc. are added by the
 * caller). Keeps persona + plural-keyword rule + banned phrases + B2B framing
 * identical across features.
 */
export function brandVoiceSystemBlock(): string {
  return `You write content for Perfect Imprints, a B2B promotional products distributor in the United States. Everything you write is for bulk-order business buyers (${BUYER_PERSONA}) — never single-unit consumer retail.

Voice and tone:
- Professional but approachable, concrete and specific. Plain US English, no British spellings.
- Always plural product keywords ("custom water bottles", "branded tote bags"), never the singular.
- B2B framing: minimum order quantities, decoration methods (screen printing, embroidery, pad printing, laser engraving, full-color heat transfer), use cases (trade shows, employee appreciation, safety programs, company stores, client gifts, giveaways), and lead times.
- ${KEYWORD_DERIVATIVES_RULE}
- Do NOT put "Perfect Imprints" inside any heading.
- Do not use em-dashes.

Never use: ${BANNED_PHRASES.join(', ')}.`;
}
