// DeepSeek generate-video route for the Sanity "Generate Video Details with AI"
// button (P2-AI-003). The video-side consumer of the shared AI engine
// (P2-AI-001) — thin wrapper, nothing rebuilt:
//
// POST { title?, script, keywords[], embedUrl?, currentSlug? }
//   → { title, metaTitle, metaDescription, description, relatedProducts[], suggestedLinks[] }
//
// Orchestration: generate structured JSON from the pasted script (lib/ai/deepseek
// + brand voice) → build the description as richAnswer-LEGAL Portable Text
// (lib/portable-text/build-rich-answer-body: normal paragraphs only, link
// markDefs are `{_type:'link', href}` with NO openInNewTab — the richAnswer
// annotation has no such field and Studio would strip it) → AUTO-PLACE internal
// links into those paragraphs (lib/ai/place-internal-links in richAnswer
// link-shape mode) → match one related-products strip (lib/ai/related-products,
// keyword/productType driven — the video's Sanity `category` is a blogCategory
// editorial ref, NOT a product category, so it plays no part in matching). The
// Studio action patches the result into the DRAFT for Patrick to review. Never
// publishes.
//
// DEEPSEEK_API_KEY stays server-side. This route reads products.json from disk,
// so it must NEVER be statically evaluated or moved to the Edge runtime —
// runtime/dynamic exports below mirror the generate-blog route exactly.

import { NextResponse } from 'next/server';
import { brandVoiceSystemBlock, BUYER_PERSONA } from '@/lib/ai/brand-voice';
import { generateJson, DeepSeekError } from '@/lib/ai/deepseek';
import { matchRelatedProducts, resolveCategoryForKeywords } from '@/lib/ai/related-products';
import { suggestInternalLinks } from '@/lib/ai/internal-links';
import { placeInternalLinks } from '@/lib/ai/place-internal-links';
import { buildRichAnswerBody } from '@/lib/portable-text/build-rich-answer-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Products in the related-products strip. */
const STRIP_LIMIT = 8;
/** Internal links placed into the description. */
const MAX_INTERNAL_LINKS = 5;
/** Lenient thin floor for the 500-750-word description ask. */
const MIN_DESCRIPTION_WORDS = 400;
/** Pathological-paste guard; a normal 10-minute transcript is well under this. */
const MAX_SCRIPT_CHARS = 12_000;

interface GenBody {
  title?: string;
  script?: string;
  keywords?: string[];
  embedUrl?: string;
  /** The doc's existing slug, so blog-link suggestions never point at itself. */
  currentSlug?: string;
}

interface GeneratedVideo {
  title: string;
  metaTitle: string;
  metaDescription: string;
  /** 6-10 plain-text paragraphs totalling 500-750 words. */
  descriptionParagraphs: string[];
  /** The concrete promotional item featured — drives product matching. */
  productType?: string;
}

function buildSystemPrompt(): string {
  return `${brandVoiceSystemBlock()}

You are writing the PUBLISHING DETAILS for a Perfect Imprints video from its script or transcript. Do NOT just echo or summarize the raw script line by line — expand it into a useful long-form video description that covers, woven naturally: what the video covers, practical ways businesses can use the promotional items featured, the kinds of buyers and organizations they suit, and a soft tie-in to ordering custom or branded versions in bulk. Concrete and specific, never generic filler.

Return a single JSON object, no prose, no code fences:
{
  "title": "a strong, keyword-aware video title (plural product keywords)",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + topic keyword",
  "descriptionParagraphs": ["6 to 10 plain-text paragraphs totalling 500 to 750 words. Plain prose only: no headings, no lists, no markdown, no numbering."],
  "productType": "2-4 words naming the CONCRETE promotional item featured in the video, e.g. \\"power banks\\" or \\"stainless steel water bottles\\" — no generic words like custom or branded"
}

HARD LIMITS (count before returning, rewrite if any fail):
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- descriptionParagraphs total AT LEAST 500 words and at most about 750`;
}

function buildUserPrompt(
  title: string,
  keywords: string[],
  script: string,
  embedUrl?: string,
): string {
  return `Write the video details now.

Video title (working): ${title || '(derive from the script)'}
Topic keywords (plural): ${keywords.join(', ') || '(derive from the script)'}
${embedUrl ? `Video link: ${embedUrl}` : ''}
Buyer personas: ${BUYER_PERSONA}

VIDEO SCRIPT / TRANSCRIPT:
${script}

Return the JSON object now.`;
}

/** Word-boundary truncation safety net (mirrors the generate-blog route). */
function clampAtWordBoundary(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, max)).trim();
}

function countWords(paragraphs: string[]): number {
  return paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
}

function isStructurallyValid(gen: Partial<GeneratedVideo>): gen is GeneratedVideo {
  if (!gen) return false;
  if (typeof gen.title !== 'string' || !gen.title.trim()) return false;
  if (typeof gen.metaTitle !== 'string' || typeof gen.metaDescription !== 'string') return false;
  if (!Array.isArray(gen.descriptionParagraphs)) return false;
  const paragraphs = gen.descriptionParagraphs.filter(
    (p) => typeof p === 'string' && p.trim().length > 0,
  );
  return paragraphs.length >= 3;
}

export async function POST(request: Request) {
  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const script = (body.script || '').trim().slice(0, MAX_SCRIPT_CHARS);
  if (!script) {
    return NextResponse.json(
      { error: 'Paste the video script or transcript first.' },
      { status: 400 },
    );
  }
  const title = (body.title || '').trim();
  const keywords = (body.keywords ?? []).map((k) => `${k}`.trim()).filter(Boolean);
  const embedUrl = (body.embedUrl || '').trim() || undefined;

  try {
    // 1) Generate the structured details from the script. max_tokens sized for
    //    ~750 words of JSON with clear headroom (~1.5 tokens/word + scaffolding
    //    ≈ 1.3k; 2500 keeps truncation — which surfaces as a JSON parse error —
    //    out of reach without the blog route's larger budget).
    const gen = await generateJson<Partial<GeneratedVideo>>({
      system: buildSystemPrompt(),
      user: buildUserPrompt(title, keywords, script, embedUrl),
      maxTokens: 2500,
      temperature: 0.65,
    });

    if (!isStructurallyValid(gen)) {
      return NextResponse.json(
        { error: 'The AI returned an incomplete result. Click Generate again to retry.' },
        { status: 502 },
      );
    }
    const paragraphs = gen.descriptionParagraphs
      .map((p) => `${p}`.trim())
      .filter((p) => p.length > 0);
    const words = countWords(paragraphs);
    if (words < MIN_DESCRIPTION_WORDS) {
      return NextResponse.json(
        {
          error: `The AI description came back thin (~${words} words against the 500 to 750 target). Click Generate again to retry.`,
        },
        { status: 502 },
      );
    }

    // Keywords that drive matching/links: the editor's topic keywords first,
    // falling back to the generated title so an empty tag list still matches.
    const promptKeywords = keywords.length > 0 ? keywords : [gen.title];

    // 2) Related products (one strip). The model's concrete productType
    //    ("power banks") resolves to its best generated root category, exactly
    //    like a list-post idea; keywords + productType tokens feed the
    //    relevance floor (default minScore) so a thin match is never padded.
    const productType = (gen.productType ?? '').trim();
    const stripKeywords = [...keywords, ...(productType ? [productType] : [])];
    const resolvedCategory = productType
      ? resolveCategoryForKeywords(productType)
      : resolveCategoryForKeywords(promptKeywords.join(' '));
    const products = await matchRelatedProducts({
      categorySlug: resolvedCategory ?? undefined,
      keywords: stripKeywords.length > 0 ? stripKeywords : promptKeywords,
      limit: STRIP_LIMIT,
    });

    // 3) Internal links from real targets only. `excludeSlug` covers the blog
    //    source; since the engine also suggests VIDEO links (P2-AI-005), filter
    //    this video's own href too so a regenerated published video never
    //    auto-links to itself (mirrors the generate-page/-landing self-filter).
    const currentSlug = (body.currentSlug || '').trim();
    const suggestions = (
      await suggestInternalLinks({
        keywords: promptKeywords,
        categorySlug: resolvedCategory ?? undefined,
        excludeSlug: currentSlug || undefined,
        limit: MAX_INTERNAL_LINKS,
      })
    ).filter((s) => !currentSlug || s.href !== `/videos/${currentSlug}`);

    // 4) AUTO-INSERT the links into the description paragraphs — in richAnswer
    //    link-shape mode, so the placed span links (and the markDefs built from
    //    them) carry href ONLY, never openInNewTab. Targets with no clean
    //    anchor are skipped; all suggestions are still returned annotated.
    const { body: linkedInput, placedHrefs } = placeInternalLinks(
      { intro: paragraphs, sections: [] },
      suggestions,
      MAX_INTERNAL_LINKS,
      { linkShape: 'richAnswer' },
    );
    const description = buildRichAnswerBody(linkedInput.intro ?? []);
    const suggestedLinks = suggestions.map((l) => ({
      ...l,
      reason: placedHrefs.includes(l.href)
        ? `${l.reason} (placed in the description)`
        : `${l.reason} (not placed: no clean anchor found)`,
    }));

    return NextResponse.json({
      title: gen.title.trim(),
      metaTitle: clampAtWordBoundary(gen.metaTitle, 60),
      metaDescription: clampAtWordBoundary(gen.metaDescription, 155),
      description,
      relatedProducts: products.map((p) => ({ sku: p.sku, name: p.name })),
      suggestedLinks,
    });
  } catch (err) {
    if (err instanceof DeepSeekError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI video generation failed.' },
      { status: 502 },
    );
  }
}
