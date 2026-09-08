/**
 * AI photo details for a portfolio item (PORT-170): the prompt Gemini is
 * given and the rules its answer is checked against before anything reaches
 * the Studio.
 *
 * Pure and dependency-free on purpose (no fs, no Sanity, no React, no
 * `server-only`), like the vocabulary modules it imports. The route
 * (app/api/sanity/generate-portfolio) calls `buildPortfolioDetailsPrompt` to
 * ask and `parsePortfolioAiDetails` to check; the tests call both without a
 * network.
 *
 * Two rules that are load-bearing:
 *
 * 1. THE VOCABULARIES ARE IMPORTED, NEVER RESTATED. The prompt lists the
 *    allowed colours, decoration methods and industries by reading the three
 *    modules the schema and the gallery filters already read, and the parser
 *    checks the answer against the SAME modules. A value outside a list is
 *    DROPPED, not passed through: the field simply comes back without it (an
 *    industry outside the list comes back null). A rename in a vocabulary
 *    module therefore changes the prompt and the check in the same commit.
 *
 * 2. THE ANSWER CAN NEVER NAME A CUSTOMER. The photographs carry real customer
 *    logos, most of them readable, and Patrick has not asked his customers
 *    whether they mind being named. The prompt forbids it in plain words and
 *    `clientName` is not part of the answer at all: nothing this module
 *    returns can be patched into that field. What the prompt cannot do is
 *    prove a title contains no name, so the Studio guide tells Patrick to
 *    read what it wrote before publishing, which he was always going to do.
 */

import { PORTFOLIO_COLORS, normalizePortfolioColors, type PortfolioColor } from './colors';
import {
  PORTFOLIO_DECORATION_METHOD_VOCABULARY,
  normalizePortfolioDecorationMethods,
  type PortfolioDecorationMethod,
} from './decoration-methods';
import {
  PORTFOLIO_INDUSTRY_VOCABULARY,
  normalizePortfolioIndustry,
  type PortfolioIndustry,
} from './industries';

/** The schema's own limit on the image alt text (`Rule.max(160)`), enforced twice: in the prompt and here. */
export const PORTFOLIO_ALT_MAX_CHARS = 160;
/** The schema's own limit on the description (`Rule.max(400)`). */
export const PORTFOLIO_DESCRIPTION_MAX_CHARS = 400;
/** The schema sets no title limit; this keeps a runaway answer to one readable line. */
export const PORTFOLIO_TITLE_MAX_CHARS = 120;

/** What the route returns to the Studio: every field already validated. */
export interface PortfolioAiDetails {
  title: string;
  alt: string;
  /** May be empty: the model is told an empty description beats an invented one. */
  description: string;
  colors: PortfolioColor[];
  decorationMethods: PortfolioDecorationMethod[];
  industry: PortfolioIndustry | null;
}

export interface ParsedPortfolioAiDetails {
  details: PortfolioAiDetails;
  /** Values the model offered that are not in a vocabulary, for the log and the Studio note. */
  dropped: string[];
}

/** The words a buyer types, which the copy should carry where they are true. */
const BUYER_WORDS = 'custom, personalized, logo, printed, branded, embroidered, engraved';

/**
 * Filler the description must not lean on (PORT-171). Each of these can be
 * written without looking at the photograph, which is the test of padding:
 * a sentence that would read the same under any picture says nothing about
 * this one. Exported so the test can assert the prompt forbids every entry.
 */
export const DESCRIPTION_FILLER = [
  'perfect for',
  'ideal for',
  'professional look',
  'high-quality',
  'durable choice',
  'elevate',
  'showcase',
  'stand out',
] as const;

/**
 * What a buyer actually asks about a piece of decorated work (PORT-171): the
 * exact item, where each imprint sits, how it was applied, the decoration
 * colour against the item colour, and whether more than one view or
 * colourway is shown. The prompt asks for these by name; the parser cannot
 * check them, so the guide tells Patrick to read the result.
 */
const DETAIL_CHECKLIST = `- The EXACT item type: "snapback trucker cap" not "hat"; "crew neck tee" not "shirt"; "insulated stainless steel bottle" not "bottle"; "foam can cooler"; "acrylic ornament"; "woven patch".
- WHERE each decoration sits: front panel, left chest, full back, left sleeve, one side, both sides, around the base.
- HOW it was applied, as it appears: embroidered thread, screen-printed ink, full-color print, laser engraving, etching, a sewn-on patch, a die-cut shape.
- The decoration COLOUR against the item colour: "gold print on navy", "dark gray thread on khaki", "silver engraving on matte black".
- Whether MORE THAN ONE view or colourway is shown: "front and back views", "shown in two colourways", "three garments in different colours".`;

/** The system instruction. Pure text; the vocabularies are read from their modules. */
export function buildPortfolioDetailsPrompt(): { system: string; user: string } {
  const colors = PORTFOLIO_COLORS.join(', ');
  const decoration = PORTFOLIO_DECORATION_METHOD_VOCABULARY.options
    .map((o) => `${o.value} (${o.title})`)
    .join(', ');
  const industries = PORTFOLIO_INDUSTRY_VOCABULARY.options
    .map((o) => `${o.value} (${o.title})`)
    .join(', ');
  const filler = DESCRIPTION_FILLER.map((f) => `"${f}"`).join(', ');

  const system = `You write the gallery entry for ONE photograph of finished, decorated promotional merchandise made by Perfect Imprints, a company that sells custom branded products in bulk to businesses and organizations (schools, fire departments, churches, restaurants, companies, teams, charities). The audience is a marketing director, HR manager, safety manager or business owner looking at this portfolio to decide "could they make mine": they want to know exactly what the item is, where the decoration sits and how it was applied.

ABSOLUTE RULES
- NEVER name the customer. The logo or wording in the photo may show a real company, school, department, team, church, event or person. Do not repeat it, spell it, abbreviate it or hint at it. Say what KIND of organization it is: "a fire department", "a seafood restaurant", "a local business", "a high school", "a volunteer first aid squad". If you cannot tell, say "a customer".
- Never state a quantity, a price, a date, a year, a location or a person's name, even if one is printed on the item.
- Never invent details you cannot see. Describe only what is visible. An empty description is better than a wrong one.
- Return ONLY a JSON object. No prose before or after it, no code fences.

WHAT TO LOOK FOR (this is what makes the entry worth reading)
${DETAIL_CHECKLIST}

WORDING
- Use plural, buyer-facing wording where it is true: ${BUYER_WORDS}. Say "custom embroidered caps", not "a cap".
- Business and organization framing (uniforms, crews, staff, events, giveaways, fundraisers), never consumer retail.
- Say what you SEE, not what you assume. If you cannot tell whether a mark is stitched or printed, describe it as "a logo" and leave decorationMethods empty rather than guess.

NO PADDING
- Every sentence in "description" must state something visible in THIS photograph (an imprint location, a technique, a colour, a view) or one concrete use for this kind of customer. A sentence that could sit under any product photo is padding: leave it out. One true sentence beats two empty ones.
- Do not use: ${filler}. Do not repeat the title in the description.

FIELDS
- "title": reads as a job, 5 to 12 words: decoration method + the exact item type + the kind of customer, e.g. "Embroidered snapback trucker caps for a fire department" or "Laser engraved insulated bottles for restaurant staff".
- "alt": image alt text for screen readers and Google, ONE sentence, at most ${PORTFOLIO_ALT_MAX_CHARS} characters INCLUDING SPACES: the exact item, its colour, the decoration technique and colour, and where the decoration sits; if several views or colourways are shown, say so. Count the characters before answering.
- "description": one to three sentences, at most ${PORTFOLIO_DESCRIPTION_MAX_CHARS} characters, in this order: (1) what was made and where each imprint sits; (2) the technique and the decoration colour against the item colour, and the views or colourways shown if more than one; (3) optionally, what a customer like this uses it for. Empty string when the photo shows nothing beyond what the title says.
- "colors": every colour that appears in the WORK ITSELF, the item and its decoration (not the background or table), chosen ONLY from: ${colors}. Empty array if none apply.
- "decorationMethods": how the work was decorated, chosen ONLY from these values (label in brackets): ${decoration}. Empty array if you cannot tell.
- "industry": the kind of customer, ONE value chosen ONLY from these values (label in brackets): ${industries}. Use null if you cannot tell.

Return exactly:
{"title": "...", "alt": "...", "description": "...", "colors": [], "decorationMethods": [], "industry": null}`;

  const user =
    'Write the gallery entry for this photograph now. Name the exact item type, where the decoration sits, how it was applied and its colour against the item, and whether more than one view or colourway is shown. Remember: never name the customer, only values from the lists, alt text at most 160 characters, no padding. Return the JSON object only.';

  return { system, user };
}

/** Trim, collapse internal whitespace, and cut at a word boundary under `max`. */
export function clampText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const t = value.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, max)).replace(/[\s,;:]+$/, '').trim();
}

/** Lower-case strings only; anything else is not a candidate value. */
function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value.trim().toLowerCase()];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim().toLowerCase());
}

/**
 * Check the model's answer against the schema's own rules. Never throws: a
 * missing or wrong-typed field becomes empty, an over-long text is cut at a
 * word boundary, and a value outside a vocabulary is dropped and reported.
 * The model is asked for lowercase vocabulary values but a "Black" or a
 * "Fire and EMS" title is forgiven by lower-casing before the check; a
 * label-only answer such as "screen printed" (no dash) is NOT mapped and is
 * dropped, because guessing a value is the thing this check exists to stop.
 */
export function parsePortfolioAiDetails(raw: unknown): ParsedPortfolioAiDetails {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dropped: string[] = [];

  const colorCandidates = stringList(obj.colors);
  const colors = normalizePortfolioColors(colorCandidates);
  for (const c of colorCandidates) if (!colors.includes(c as PortfolioColor)) dropped.push(`color: ${c}`);

  const methodCandidates = stringList(obj.decorationMethods);
  const decorationMethods = normalizePortfolioDecorationMethods(methodCandidates);
  for (const m of methodCandidates) {
    if (!decorationMethods.includes(m as PortfolioDecorationMethod)) dropped.push(`decoration: ${m}`);
  }

  const industryCandidate = obj.industry;
  const industryString =
    typeof industryCandidate === 'string' ? industryCandidate.trim().toLowerCase() : '';
  const industry = normalizePortfolioIndustry(industryString);
  if (industryString && industry === null) dropped.push(`industry: ${industryString}`);

  return {
    details: {
      title: clampText(obj.title, PORTFOLIO_TITLE_MAX_CHARS),
      alt: clampText(obj.alt, PORTFOLIO_ALT_MAX_CHARS),
      description: clampText(obj.description, PORTFOLIO_DESCRIPTION_MAX_CHARS),
      colors,
      decorationMethods,
      industry,
    },
    dropped,
  };
}

/** True when the answer carries the two things an item cannot publish without. */
export function hasUsableDetails(details: PortfolioAiDetails): boolean {
  return details.title.length > 0 && details.alt.length > 0;
}
