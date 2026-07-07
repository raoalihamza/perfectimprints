/**
 * Landing-page AI generation orchestration (P2-AI-005), extracted from
 * app/api/sanity/generate-landing/route.ts so the route AND the landing seed
 * script (scripts/seed/seed-landing-pages.ts) share ONE source of truth — no
 * duplicated prompt/enforcement logic. The route stays a thin HTTP wrapper.
 *
 * Orchestration: generate structured city+product-specific content (lib/ai/
 * deepseek + brand voice; the prompt REQUIRES every editor-listed landmark to
 * appear, and findMissingLandmarks ENFORCES it — a result that dropped one is
 * rejected with a typed error so callers can retry cleanly) → AUTO-PLACE
 * internal links into the body paragraphs (lib/ai/place-internal-links in
 * 'page' link-shape mode — the landing bodies reuse the page-builder
 * portableBody, whose link markDef is `{_type:'link', _key, href}` with NO
 * openInNewTab) → build the three body fields as page-legal Portable Text
 * (buildPageBody / buildPageSectionsBody — optionsIdeas carries its section
 * headings IN the body as h2 blocks) → match one related-products strip
 * (lib/ai/related-products, relevance-floored, skipped under 2 products).
 *
 * SERVER-ONLY import graph (DEEPSEEK_API_KEY, products.json disk reads, Sanity
 * link sources) — callers are the force-dynamic generate-landing route and
 * Node scripts. Never import from Studio bundle code, and never from any
 * statically-rendered page. Relative imports (not `@/`) so the module runs
 * under plain tsx like the rest of lib/ai/*.
 */

import { brandVoiceSystemBlock, BUYER_PERSONA } from './brand-voice';
import { generateJson } from './deepseek';
import { findMissingLandmarks } from './landing-landmarks';
import { matchRelatedProducts, resolveCategoryForKeywords } from './related-products';
import { suggestInternalLinks } from './internal-links';
import { placeInternalLinks } from './place-internal-links';
import { buildPageBody, buildPageSectionsBody, type PageTextBlock } from '../portable-text/build-page-body';
import type { BlogBodyInput, BlogRichText } from '../portable-text/build-blog-body';

/** Products in the related-products strip. */
const STRIP_LIMIT = 8;
/** A strip below this floor is skipped entirely (never padded). */
const STRIP_MIN_PRODUCTS = 2;
/** Internal links placed across the three bodies. */
const MAX_INTERNAL_LINKS = 5;
/** Lenient thin floor for the ~800-1300-word page ask (all three bodies). */
const MIN_BODY_WORDS = 500;

/**
 * A generation result that failed one of the landing-page hard limits
 * (incomplete structure, too few FAQs, thin body, missing landmark). The
 * message is user-facing retry copy; `status` is the suggested HTTP status —
 * the route returns it verbatim, the seed script logs it and moves on.
 */
export class LandingGenerationError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'LandingGenerationError';
    this.status = status;
  }
}

export interface LandingGenInput {
  title?: string;
  city: string;
  state: string;
  product: string;
  landmarks: string[];
  keywords: string[];
  /** The doc's existing slug, so page/landing link suggestions never point at itself. */
  currentSlug?: string;
}

export interface LandingGenFaq {
  question: string;
  answer: string;
}

export interface LandingGenSuggestedLink {
  label: string;
  href: string;
  reason: string;
}

/** Exactly the payload the generate-landing route returns to the Studio action. */
export interface LandingGenResult {
  heroHeading: string;
  heroSubheading: string;
  localIntro: PageTextBlock[];
  optionsIdeas: PageTextBlock[];
  whyUs: PageTextBlock[];
  faqs: LandingGenFaq[];
  relatedProducts: { sku: string }[];
  leadFormHeading: string;
  metaTitle: string;
  metaDescription: string;
  suggestedLinks: LandingGenSuggestedLink[];
}

interface GeneratedSection {
  heading: string;
  paragraphs: string[];
  listItems?: string[];
}

interface GeneratedLanding {
  heroHeading: string;
  heroSubheading: string;
  /** Local-context paragraphs — MUST name every provided landmark. */
  localIntro: string[];
  /** The main content: options + creative local usage ideas, sectioned. */
  optionsIdeas: GeneratedSection[];
  /** Trust-section paragraphs (rendered under a fixed "Why Perfect Imprints" H2). */
  whyUs: string[];
  faqs: { question: string; answer: string }[];
  /** The concrete promotional item this page centers on — drives product matching. */
  productType?: string;
  metaTitle: string;
  metaDescription: string;
}

function buildSystemPrompt(): string {
  return `${brandVoiceSystemBlock()}

You are writing a LOCAL LANDING PAGE for the Perfect Imprints website: one specific product/service marketed to business buyers in one specific city. The page must read as genuinely written FOR that city — its venues, events, seasons, industries, and the provided local landmarks — so that no two landing pages ever read as near-duplicates of each other. Concrete and specific, never filler.

Return a single JSON object, no prose, no code fences:
{
  "heroHeading": "the page's H1 — the product (plural keywords) + the city, e.g. \\"Custom Beach Towels in Destin, FL\\"",
  "heroSubheading": "1-2 supporting sentences under the H1",
  "localIntro": ["2 to 3 paragraphs of local context, 150-250 words total. This is where the landmarks go — weave EVERY provided landmark in naturally (events near it, businesses around it, crowds it draws). Copy each landmark name EXACTLY as provided."],
  "optionsIdeas": [
    {
      "heading": "an H2 for this section",
      "paragraphs": ["2 to 3 paragraphs of AT LEAST 120 words total per section"],
      "listItems": ["optional — 3 to 6 short bullet points when a list genuinely helps"]
    }
  ],
  "whyUs": ["2 to 3 trust-building paragraphs, 120-200 words total: bulk/wholesale B2B ordering, decoration methods, minimum order quantities, free art proofs, fast turnaround and rush options. Do NOT include a heading — one is added for you."],
  "faqs": [{ "question": "...", "answer": "plain text, 40-90 words — at least one answer should be city-specific" }],
  "productType": "2-4 words naming the CONCRETE promotional item this page centers on, e.g. \\"beach towels\\" or \\"screen printed t-shirts\\" — no generic words like custom or branded",
  "metaTitle": "<=60 chars, product + city",
  "metaDescription": "<=155 chars, soft CTA + product + city"
}

HARD LIMITS (count before returning, rewrite if any fail):
- EVERY provided landmark appears somewhere in localIntro (or optionsIdeas), spelled EXACTLY as provided — a missing landmark is a failed response
- optionsIdeas: 4 to 6 sections, totalling AT LEAST 500 words across all paragraphs. Cover (a) the OPTIONS for this product (styles, materials, decoration methods, quantity tiers) and (b) CREATIVE IDEAS for using it in this specific city — local events, tourist seasons, venues, industries, teams, festivals
- faqs: 3 to 6 entries
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- Every claim stays honest and generic about Perfect Imprints (service promises, catalog breadth) — never an invented statistic, address, or local partnership`;
}

function buildUserPrompt(input: {
  title: string;
  city: string;
  state: string;
  product: string;
  landmarks: string[];
  keywords: string[];
}): string {
  return `Write the landing page now.

Page title (internal label): ${input.title || `${input.product} ${input.city} ${input.state}`}
Product / topic: ${input.product}
City: ${input.city}
State: ${input.state}
Landmarks that MUST all be mentioned (copy each name exactly): ${input.landmarks.join('; ') || '(none provided)'}
Topic keywords (plural): ${input.keywords.join(', ') || '(derive from the product)'}
Buyer personas: ${BUYER_PERSONA}

Return the JSON object now.`;
}

/** Word-boundary truncation safety net (mirrors the generate-page route). */
function clampAtWordBoundary(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, max)).trim();
}

function countWords(texts: string[]): number {
  return texts.join(' ').split(/\s+/).filter(Boolean).length;
}

function cleanStrings(values: unknown): string[] {
  return (Array.isArray(values) ? values : []).map((v) => `${v ?? ''}`.trim()).filter(Boolean);
}

function isStructurallyValid(gen: Partial<GeneratedLanding>): gen is GeneratedLanding {
  if (!gen) return false;
  if (typeof gen.heroHeading !== 'string' || !gen.heroHeading.trim()) return false;
  if (typeof gen.metaTitle !== 'string' || typeof gen.metaDescription !== 'string') return false;
  if (!Array.isArray(gen.localIntro) || !gen.localIntro.some((p) => `${p ?? ''}`.trim()))
    return false;
  if (!Array.isArray(gen.whyUs) || !gen.whyUs.some((p) => `${p ?? ''}`.trim())) return false;
  if (!Array.isArray(gen.optionsIdeas)) return false;
  const sections = gen.optionsIdeas.filter(
    (s) =>
      s &&
      typeof s.heading === 'string' &&
      s.heading.trim() &&
      Array.isArray(s.paragraphs) &&
      s.paragraphs.some((p) => typeof p === 'string' && p.trim()),
  );
  if (sections.length < 3) return false;
  if (!Array.isArray(gen.faqs)) return false;
  return true;
}

/**
 * Runs the full landing-page generation for one city+product input and returns
 * the exact payload the generate-landing route serves. Throws
 * `LandingGenerationError` on any failed hard limit (retryable) and
 * `DeepSeekError` (from lib/ai/deepseek) on API/key problems — callers map
 * these to HTTP responses or per-page log lines.
 */
export async function generateLandingContent(input: LandingGenInput): Promise<LandingGenResult> {
  const title = (input.title || '').trim();
  const city = input.city.trim();
  const state = input.state.trim();
  const product = input.product.trim();
  const landmarks = cleanStrings(input.landmarks);
  const keywords = cleanStrings(input.keywords);
  const currentSlug = (input.currentSlug || '').trim();

  // 1) Generate the structured landing content. max_tokens sized for ~1300
  //    body words + up to 6 FAQs + hero/meta (~1800 words ≈ 2.7k tokens) with
  //    clear headroom against truncation-as-JSON-parse-error.
  const gen = await generateJson<Partial<GeneratedLanding>>({
    system: buildSystemPrompt(),
    user: buildUserPrompt({ title, city, state, product, landmarks, keywords }),
    maxTokens: 5000,
    temperature: 0.65,
  });

  if (!isStructurallyValid(gen)) {
    throw new LandingGenerationError(
      'The AI returned an incomplete result. Click Generate again to retry.',
    );
  }

  const localIntro = cleanStrings(gen.localIntro);
  const whyUs = cleanStrings(gen.whyUs);
  // Null-safe over the RAW array — the validator only counts the valid
  // entries, so junk elements (null, wrong types) can still be present here.
  const optionsIdeas = gen.optionsIdeas
    .map((s) => ({
      heading: `${s?.heading ?? ''}`.trim(),
      paragraphs: cleanStrings(s?.paragraphs),
      listItems: cleanStrings(s?.listItems),
    }))
    .filter((s) => s.heading && s.paragraphs.length > 0);

  // The prompt hard-requires 3-6 FAQs; enforce it like the other hard limits
  // (thin body, missing landmarks) instead of quietly accepting a degraded
  // result — the Studio action would otherwise SET an empty faqs array over a
  // list Patrick may have curated.
  const faqs = (gen.faqs ?? [])
    .map((f) => ({
      question: `${f?.question ?? ''}`.trim(),
      answer: `${f?.answer ?? ''}`.trim(),
    }))
    .filter((f) => f.question && f.answer);
  if (faqs.length < 3) {
    throw new LandingGenerationError(
      `The AI returned too few usable FAQs (${faqs.length} against the 3 to 6 target). Click Generate again to retry.`,
    );
  }

  const allParagraphs = [...localIntro, ...optionsIdeas.flatMap((s) => s.paragraphs), ...whyUs];
  const words = countWords(allParagraphs);
  if (words < MIN_BODY_WORDS) {
    throw new LandingGenerationError(
      `The AI body came back thin (~${words} words against the ~800 to 1300 target). Click Generate again to retry.`,
    );
  }

  // ENFORCE Patrick's hard requirement: every listed landmark must appear in
  // the copy (localIntro is the intended home; optionsIdeas also counts). A
  // result that dropped one is rejected so it can never quietly publish.
  // Blocks are passed as SEPARATE segments so a multi-word landmark can't
  // false-match across two adjacent blocks' boundary.
  const missing = findMissingLandmarks(landmarks, [
    ...localIntro,
    ...optionsIdeas.flatMap((s) => [s.heading, ...s.paragraphs, ...s.listItems]),
  ]);
  if (missing.length > 0) {
    throw new LandingGenerationError(
      `The AI left out required landmark${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Click Generate again to retry.`,
    );
  }

  // Keywords that drive matching/links: the editor's topic keywords plus the
  // product itself (so an empty tag list still matches). Template-coerced —
  // productType is not shape-validated, so a non-string must not throw.
  const productType = `${gen.productType ?? ''}`.trim();
  const matchKeywords = [...keywords, product, ...(productType ? [productType] : [])];
  const resolvedCategory =
    resolveCategoryForKeywords(productType || product) ??
    resolveCategoryForKeywords(matchKeywords.join(' '));

  // 2) Internal links from real targets only — including videos and OTHER
  //    landing pages; never suggest this page itself (page + landing hrefs are
  //    both /<slug>, so one filter covers both kinds).
  const suggestions = (
    await suggestInternalLinks({
      keywords: matchKeywords,
      categorySlug: resolvedCategory ?? undefined,
      limit: MAX_INTERNAL_LINKS,
    })
  ).filter((s) => !currentSlug || s.href !== `/${currentSlug}`);

  // 3) AUTO-INSERT the links across all three bodies in ONE placement pass
  //    (so the cap + href dedup span the whole page). Compose localIntro as
  //    the intro, the optionsIdeas sections, and whyUs as a final section —
  //    then split the placed result back apart on the same boundaries.
  const placementInput: BlogBodyInput = {
    intro: localIntro,
    sections: [
      ...optionsIdeas.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs })),
      { heading: 'Why Perfect Imprints', paragraphs: whyUs },
    ],
  };
  const { body: linkedInput, placedHrefs } = placeInternalLinks(
    placementInput,
    suggestions,
    MAX_INTERNAL_LINKS,
    { linkShape: 'page' },
  );
  const suggestedLinks = suggestions.map((l) => ({
    label: l.label,
    href: l.href,
    reason: placedHrefs.includes(l.href)
      ? `${l.reason} (placed in the body)`
      : `${l.reason} (not placed: no clean anchor found)`,
  }));

  const placedIntro: BlogRichText[] = linkedInput.intro ?? [];
  const placedOptionSections = linkedInput.sections.slice(0, optionsIdeas.length);
  const placedWhyUs: BlogRichText[] =
    linkedInput.sections[optionsIdeas.length]?.paragraphs ?? whyUs;

  // 4) Build the three body fields as page-legal Portable Text (href-only
  //    link markDefs). optionsIdeas keeps its H2 headings IN the body.
  const localIntroBody = buildPageBody({ paragraphs: placedIntro });
  const optionsIdeasBody = buildPageSectionsBody(
    placedOptionSections.map((placed, i) => ({
      heading: optionsIdeas[i].heading,
      paragraphs: placed.paragraphs ?? [],
      ...(optionsIdeas[i].listItems.length > 0
        ? { list: { kind: 'bullet' as const, items: optionsIdeas[i].listItems } }
        : {}),
    })),
  );
  const whyUsBody = buildPageBody({ paragraphs: placedWhyUs });

  // 5) Related products for the strip — relevance-floored, never padded.
  //    Skipped entirely below the 2-product floor. `includeCustom: false`
  //    because the strip stores SKU-ONLY blogProduct entries resolved against
  //    products.json at render time — a synthetic `custom-<id>` SKU can never
  //    resolve there, so it would count toward the floor yet render nothing.
  const products = await matchRelatedProducts({
    categorySlug: resolvedCategory ?? undefined,
    keywords: matchKeywords,
    limit: STRIP_LIMIT,
    includeCustom: false,
  });
  const relatedProducts =
    products.length >= STRIP_MIN_PRODUCTS ? products.map((p) => ({ sku: p.sku })) : [];

  return {
    heroHeading: gen.heroHeading.trim(),
    heroSubheading: `${gen.heroSubheading ?? ''}`.trim(),
    localIntro: localIntroBody,
    optionsIdeas: optionsIdeasBody,
    whyUs: whyUsBody,
    faqs,
    relatedProducts,
    // Deterministic pre-fill for the editable quote-form heading (part 2) —
    // the template's automatic default pattern; the action sets it ONLY when
    // the field is empty, so Patrick's wording is never overwritten.
    leadFormHeading: `Request a Quote in ${city}, ${state}`,
    metaTitle: clampAtWordBoundary(gen.metaTitle, 60),
    metaDescription: clampAtWordBoundary(gen.metaDescription, 155),
    suggestedLinks,
  };
}
