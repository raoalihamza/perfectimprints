// DeepSeek generate-blog route for the Sanity "Generate Blog with AI" button
// (P2-AI-002). The blog-side consumer of the shared AI engine (P2-AI-001):
//
// POST { title, template, keywords[], categorySlug?, currentSlug? } →
//   { title, metaTitle, metaDescription, excerpt, body, suggestedLinks[] }
//
// Orchestration: generate structured JSON (lib/ai/deepseek + brand voice) →
// match related products per strip (lib/ai/related-products, disk + Sanity) →
// suggest internal links (lib/ai/internal-links, real targets only) → assemble
// the Portable Text body (lib/portable-text/build-blog-body). The Studio action
// patches the result into the DRAFT for Patrick to review. Never publishes.
//
// DEEPSEEK_API_KEY stays server-side. This route reads products.json from disk,
// so it must NEVER be statically evaluated or moved to the Edge runtime —
// runtime/dynamic exports below mirror the generate-content route exactly.

import { NextResponse } from 'next/server';
import { brandVoiceSystemBlock, BUYER_PERSONA } from '@/lib/ai/brand-voice';
import { generateJson, DeepSeekError } from '@/lib/ai/deepseek';
import { matchRelatedProducts } from '@/lib/ai/related-products';
import { suggestInternalLinks } from '@/lib/ai/internal-links';
import {
  buildBlogBody,
  type BlogBodyInput,
  type BlogBodySectionInput,
} from '@/lib/portable-text/build-blog-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BlogTemplate = 'list' | 'single';

interface GenBody {
  title?: string;
  template?: string;
  keywords?: string[];
  categorySlug?: string;
  /** The doc's existing slug, so link suggestions don't point at itself. */
  currentSlug?: string;
}

interface GeneratedListSection {
  heading: string;
  paragraphs: string[];
  productKeywords?: string[];
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

const MIN_TOTAL_WORDS = 900; // target is 1,500-2,000; below this = thin, re-click

function buildSystemPrompt(template: BlogTemplate): string {
  const shared = `${brandVoiceSystemBlock()}

You are writing a LONG-FORM BLOG POST (1,500 to 2,000 words total) for the Perfect Imprints blog. The post must cover, woven naturally into the flow: practical ways businesses can use the promotional items for this topic, the kinds of businesses and organizations that can use them, creative giveaway ideas, and recommended product directions. Concrete and specific, never generic filler.

HARD LIMITS (count before returning, rewrite if any fail):
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- excerpt <= 300 chars (a 2-3 sentence teaser, plain text)
- total body length 1,500-2,000 words across intro + sections`;

  if (template === 'list') {
    return `${shared}

STRUCTURE — LIST-STYLE POST (e.g. "10 Trade Show Giveaway Ideas ..."):
Return a single JSON object, no prose, no code fences:
{
  "title": "refined post title, numbered list style, includes the plural topic keyword",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + topic keyword",
  "excerpt": "<=300 chars",
  "intro": ["2-3 opening paragraphs as separate strings, 120-200 words total"],
  "sections": [
    {
      "heading": "Idea N: short specific idea title (numbered)",
      "paragraphs": ["1-2 paragraphs, 100-160 words total, covering who this idea fits and how to brand it"],
      "productKeywords": ["2-4 plural product keywords that describe the products for THIS idea, e.g. \\"stainless steel water bottles\\""]
    }
  ]
}
Exactly 8 to 12 idea sections. Every section MUST include productKeywords.`;
  }

  return `${shared}

STRUCTURE — SINGLE-CATEGORY FOCUS POST (a deep dive on one product category):
Return a single JSON object, no prose, no code fences:
{
  "title": "refined post title, includes the plural topic keyword",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + topic keyword",
  "excerpt": "<=300 chars",
  "intro": ["2-3 opening paragraphs as separate strings, 120-200 words total"],
  "sections": [
    {
      "heading": "descriptive section heading",
      "paragraphs": ["2-4 paragraphs, 150-300 words total"],
      "listItems": ["optional: 3-7 short list entries when a list genuinely helps"],
      "listType": "bullet or number (only when listItems present)"
    }
  ],
  "productKeywords": ["3-5 plural product keywords describing the products to recommend"],
  "productStripHeading": "short heading for the recommended-products row"
}
Exactly 4 to 6 sections. Use listItems in at most 2 sections.`;
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

  try {
    // 1) Generate the structured post.
    const gen = await generateJson<Partial<GeneratedBlog>>({
      system: buildSystemPrompt(template),
      user: buildUserPrompt(title, promptKeywords, categorySlug),
      maxTokens: 6000, // sized for ~2,000 words of JSON
      temperature: 0.65,
    });

    if (!isStructurallyValid(gen, template)) {
      return NextResponse.json(
        { error: 'The AI returned an incomplete post. Click Generate again to retry.' },
        { status: 502 },
      );
    }
    const words = countWords(gen);
    if (words < MIN_TOTAL_WORDS) {
      return NextResponse.json(
        {
          error: `The AI returned a thin post (~${words} words). Click Generate again to retry.`,
        },
        { status: 502 },
      );
    }

    const sections = gen.sections.filter(
      (s) => s && typeof s.heading === 'string' && Array.isArray(s.paragraphs),
    );

    // 2) Related products → one strip per idea (list) or one overall strip (single).
    const bodySections: BlogBodySectionInput[] = [];
    if (template === 'list') {
      for (const s of sections) {
        const stripKeywords = (s.productKeywords ?? []).filter(Boolean);
        const products = await matchRelatedProducts({
          categorySlug,
          keywords: stripKeywords.length > 0 ? stripKeywords : [s.heading, ...promptKeywords],
          limit: 4,
        });
        bodySections.push({
          heading: s.heading,
          headingLevel: 'h2',
          paragraphs: s.paragraphs,
          products: products.length > 0 ? { skus: products.map((p) => p.sku) } : undefined,
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
        categorySlug,
        keywords: stripKeywords.length > 0 ? stripKeywords : promptKeywords,
        limit: 7,
      });
      if (products.length > 0) {
        bodySections.push({
          products: {
            heading: gen.productStripHeading?.trim() || 'Recommended Products',
            skus: products.map((p) => p.sku),
          },
        });
      }
    }

    // 3) Internal links — suggested for confirmation (aiSuggestedLinks), NOT
    //    auto-inserted into the body.
    const suggestedLinks = await suggestInternalLinks({
      keywords: promptKeywords,
      categorySlug,
      excludeSlug: (body.currentSlug || '').trim() || undefined,
      limit: 5,
    });

    // 4) Assemble the Portable Text body. To flip internal linking from
    //    suggest-for-confirmation to AUTO-INSERT later: pass link annotations
    //    into the section paragraphs here (BlogRichText spans with `link` are
    //    already supported by buildBlogBody) instead of only returning
    //    suggestedLinks. Single call site — this is the switch.
    const blogBody = buildBlogBody({
      intro: gen.intro,
      sections: bodySections,
    } satisfies BlogBodyInput);

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
