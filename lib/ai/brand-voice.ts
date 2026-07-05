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
