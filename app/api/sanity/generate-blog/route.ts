// DeepSeek generate-blog route for the Sanity "Generate Blog with AI" button
// (P2-AI-002, tightened in P2-AI-002b). The blog-side consumer of the shared
// AI engine (P2-AI-001):
//
// POST { title, template, keywords[], categorySlug?, currentSlug?, wordCount? }
//   → { title, metaTitle, metaDescription, excerpt, body, suggestedLinks[] }
//
// Orchestration: generate structured JSON (lib/ai/deepseek + brand voice, with
// concrete per-section word budgets — lib/ai/word-budget) → match related
// products per strip (lib/ai/related-products: per-idea category resolution,
// relevance floor, cross-strip dedup) → suggest internal links
// (lib/ai/internal-links, real targets only) → AUTO-PLACE the links into the
// body paragraphs (lib/ai/place-internal-links) → assemble the Portable Text
// body (lib/portable-text/build-blog-body). The Studio action patches the
// result into the DRAFT for Patrick to review. Never publishes.
//
// DEEPSEEK_API_KEY stays server-side. This route reads products.json from disk,
// so it must NEVER be statically evaluated or moved to the Edge runtime —
// runtime/dynamic exports below mirror the generate-content route exactly.

import { siteWideHiddenSkus } from '@/lib/products/site-wide-hidden';
import { NextResponse } from 'next/server';
import { brandVoiceSystemBlock, BUYER_PERSONA } from '@/lib/ai/brand-voice';
import { generateJson, DeepSeekError } from '@/lib/ai/deepseek';
import { matchRelatedProducts, resolveCategoryForKeywords } from '@/lib/ai/related-products';
import { suggestInternalLinks } from '@/lib/ai/internal-links';
import { placeInternalLinks } from '@/lib/ai/place-internal-links';
import {
  buildWordBudget,
  clampWordCount,
  listIdeaCount,
  singleSectionCount,
  THIN_FLOOR_RATIO,
  type WordBudget,
} from '@/lib/ai/word-budget';
import {
  buildBlogBody,
  type BlogBodyInput,
  type BlogBodySectionInput,
} from '@/lib/portable-text/build-blog-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BlogTemplate = 'list' | 'single';

/** A strip renders only with at least this many relevant products (tunable). */
const MIN_STRIP_PRODUCTS = 2;
/** Products per idea strip (list) / per post strip (single). */
const LIST_STRIP_LIMIT = 4;
const SINGLE_STRIP_LIMIT = 7;
/** Relevance floor: shared significant tokens required for strip eligibility. */
const STRIP_MIN_SCORE = 1;
/** Internal links placed per post. */
const MAX_INTERNAL_LINKS = 5;

interface GenBody {
  title?: string;
  template?: string;
  keywords?: string[];
  categorySlug?: string;
  /** The doc's existing slug, so link suggestions don't point at itself. */
  currentSlug?: string;
  /** Approximate target length; clamped to 1300..1900, default 1500. */
  wordCount?: number;
}

interface GeneratedListSection {
  heading: string;
  paragraphs: string[];
  /** The concrete promotional item this idea is about — its product-match query. */
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

function buildSystemPrompt(template: BlogTemplate, budget: WordBudget): string {
  const shared = `${brandVoiceSystemBlock()}

You are writing a LONG-FORM BLOG POST (at least ${budget.target} words total) for the Perfect Imprints blog. The post must cover, woven naturally into the flow: practical ways businesses can use the promotional items for this topic, the kinds of businesses and organizations that can use them, creative giveaway ideas, and recommended product directions. Concrete and specific, never generic filler — reach the length with substance (more use cases, more buyer specifics, more concrete detail), never with padding or keyword stuffing.

WORD BUDGET (these are MINIMUMS — models that aim for "about" these numbers come in short, so treat each as a floor):
- intro: at least ${budget.intro} words
- each of the ${budget.sectionCount} sections: at least ${budget.perSection} words of paragraphs
- total: at least ${budget.target} words

HARD LIMITS (count before returning, rewrite if any fail):
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- excerpt <= 300 chars (a 2-3 sentence teaser, plain text)`;

  if (template === 'list') {
    return `${shared}

STRUCTURE — LIST-STYLE POST (e.g. "10 Trade Show Giveaway Ideas ..."):
Return a single JSON object, no prose, no code fences:
{
  "title": "refined post title, numbered list style, includes the plural topic keyword",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + topic keyword",
  "excerpt": "<=300 chars",
  "intro": ["2-3 opening paragraphs as separate strings, at least ${budget.intro} words total"],
  "sections": [
    {
      "heading": "Idea N: short specific idea title (numbered)",
      "paragraphs": ["paragraphs totalling at least ${budget.perSection} words, covering who this idea fits and how to brand it"],
      "productType": "2-4 words naming the CONCRETE promotional item this idea is about, e.g. \\"power banks\\" or \\"stainless steel water bottles\\" — a DIFFERENT item per idea"
    }
  ]
}
Exactly ${budget.sectionCount} idea sections. Every section MUST include productType, and each idea must be a different product type.`;
  }

  return `${shared}

STRUCTURE — SINGLE-CATEGORY FOCUS POST (a deep dive on one product category):
Return a single JSON object, no prose, no code fences:
{
  "title": "refined post title, includes the plural topic keyword",
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
Exactly ${budget.sectionCount} sections. Use listItems in at most 2 sections.`;
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

function countWords(gen: GeneratedBlog): number {
  const parts: string[] = [...(gen.intro ?? [])];
  for (const s of gen.sections ?? []) {
    parts.push(s.heading ?? '');
    parts.push(...(s.paragraphs ?? []));
    parts.push(...(s.listItems ?? []));
  }
  return parts.join(' ').split(/\s+/).filter(Boolean).length;
}

function isStructurallyValid(gen: Partial<GeneratedBlog>, template: BlogTemplate): gen is GeneratedBlog {
  if (!gen) return false;
  if (typeof gen.title !== 'string' || !gen.title.trim()) return false;
  if (typeof gen.metaTitle !== 'string' || typeof gen.metaDescription !== 'string') return false;
  if (typeof gen.excerpt !== 'string') return false;
  if (!Array.isArray(gen.intro) || !Array.isArray(gen.sections)) return false;
  const min = template === 'list' ? 6 : 3;
  const valid = gen.sections.filter(
    (s) => s && typeof s.heading === 'string' && Array.isArray(s.paragraphs) && s.paragraphs.length > 0,
  );
  return valid.length >= min;
}

export async function POST(request: Request) {
  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'A document title is required.' }, { status: 400 });
  }
  const template: BlogTemplate = body.template === 'single' ? 'single' : 'list';
  const keywords = (body.keywords ?? []).map((k) => `${k}`.trim()).filter(Boolean);
  const promptKeywords = keywords.length > 0 ? keywords : [title.toLowerCase()];
  const categorySlug = (body.categorySlug || '').trim() || undefined;
  const target = clampWordCount(body.wordCount);
  const sectionCount = template === 'list' ? listIdeaCount(target) : singleSectionCount(target);
  const budget = buildWordBudget(target, sectionCount);

  try {
    // 1) Generate the structured post against concrete word budgets.
    const gen = await generateJson<Partial<GeneratedBlog>>({
      system: buildSystemPrompt(template, budget),
      user: buildUserPrompt(title, promptKeywords, categorySlug),
      // Sized for the 1,900-word top of range with clear headroom (~1.5 tokens
      // per English word + JSON scaffolding ≈ 3.5-4k; 6500 keeps a truncated
      // response — which surfaces as a JSON parse error, not the thin floor —
      // out of reach without over-allocating like the old 2,400-word 8000.
      maxTokens: 6500,
      temperature: 0.65,
    });

    if (!isStructurallyValid(gen, template)) {
      return NextResponse.json(
        { error: 'The AI returned an incomplete post. Click Generate again to retry.' },
        { status: 502 },
      );
    }
    // Dynamic thin floor: 70% of the requested target (P2-AI-002c; was 75%,
    // which rejected acceptable ~1100-word posts against a 1700 ask). The
    // floor only accepts/rejects the already-generated post — generation
    // length is driven by the per-section budgets in the prompt.
    const minWords = Math.round(target * THIN_FLOOR_RATIO);
    const words = countWords(gen);
    if (words < minWords) {
      return NextResponse.json(
        {
          error: `The AI returned a thin post (~${words} words against a ${target}-word target). Click Generate again to retry.`,
        },
        { status: 502 },
      );
    }

    const sections = gen.sections.filter(
      (s) => s && typeof s.heading === 'string' && Array.isArray(s.paragraphs),
    );

    // 2) Related products. One `usedSkus` set for the WHOLE post: every strip
    //    excludes what earlier strips used, so no product repeats anywhere.
    const usedSkus = new Set<string>();
    const bodySections: BlogBodySectionInput[] = [];
    if (template === 'list') {
      for (const s of sections) {
        // Each idea matches its OWN product type: resolve the model's concrete
        // productType ("power banks") to its best root category and pull from
        // there; no category resolved → catalog keyword scoring on the phrase.
        const productType = (s.productType ?? '').trim();
        const stripKeywords = productType ? [productType] : [s.heading];
        const ideaCategory = productType ? resolveCategoryForKeywords(productType) : null;
        let products = await matchRelatedProducts({
          hiddenSkus: await siteWideHiddenSkus(),
          categorySlug: ideaCategory ?? undefined,
          keywords: stripKeywords,
          limit: LIST_STRIP_LIMIT,
          minScore: STRIP_MIN_SCORE,
          exclude: usedSkus,
        });
        // The shared primary category is a SOFT FALLBACK only (P2-AI-002b) —
        // consulted when the idea's own match comes up thin, never the default
        // source for every idea (that is what made every strip identical).
        if (products.length < MIN_STRIP_PRODUCTS && categorySlug && categorySlug !== ideaCategory) {
          const fallback = await matchRelatedProducts({
            hiddenSkus: await siteWideHiddenSkus(),
            categorySlug,
            keywords: stripKeywords,
            limit: LIST_STRIP_LIMIT,
            minScore: STRIP_MIN_SCORE,
            exclude: new Set([...usedSkus, ...products.map((p) => p.sku)]),
          });
          products = [...products, ...fallback].slice(0, LIST_STRIP_LIMIT);
        }
        // Below the floor a strip is SKIPPED (the idea's text still stands) —
        // never padded with irrelevant catalog bestsellers.
        const strip = products.length >= MIN_STRIP_PRODUCTS ? products : [];
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
      const products = await matchRelatedProducts({
        hiddenSkus: await siteWideHiddenSkus(),
        categorySlug, // primary category stays the primary source for single-focus posts
        keywords: stripKeywords.length > 0 ? stripKeywords : promptKeywords,
        limit: SINGLE_STRIP_LIMIT,
        minScore: STRIP_MIN_SCORE,
      });
      if (products.length >= MIN_STRIP_PRODUCTS) {
        bodySections.push({
          products: {
            heading: gen.productStripHeading?.trim() || 'Recommended Products',
            skus: products.map((p) => p.sku),
          },
        });
      }
    }

    // 3) Internal links from real targets only.
    const suggestions = await suggestInternalLinks({
      keywords: promptKeywords,
      categorySlug,
      excludeSlug: (body.currentSlug || '').trim() || undefined,
      limit: MAX_INTERNAL_LINKS,
    });

    // 4) AUTO-INSERT the internal links into the body paragraphs
    //    (P2-AI-002b — Patrick confirmed automatic hyperlinking; this replaces
    //    the previous suggest-only default). Targets with no clean anchor are
    //    skipped; ALL suggestions are still returned so the draft records what
    //    was found and which were placed.
    const { body: linkedInput, placedHrefs } = placeInternalLinks(
      { intro: gen.intro, sections: bodySections } satisfies BlogBodyInput,
      suggestions,
      MAX_INTERNAL_LINKS,
    );
    const blogBody = buildBlogBody(linkedInput);
    const suggestedLinks = suggestions.map((l) => ({
      ...l,
      reason: placedHrefs.includes(l.href)
        ? `${l.reason} (placed in the body)`
        : `${l.reason} (not placed: no clean anchor found)`,
    }));

    return NextResponse.json({
      title: gen.title.trim(),
      metaTitle: clampAtWordBoundary(gen.metaTitle, 60),
      metaDescription: clampAtWordBoundary(gen.metaDescription, 155),
      excerpt: clampAtWordBoundary(gen.excerpt, 300),
      body: blogBody,
      suggestedLinks,
    });
  } catch (err) {
    if (err instanceof DeepSeekError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI blog generation failed.' },
      { status: 502 },
    );
  }
}
