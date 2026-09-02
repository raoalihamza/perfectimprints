// DeepSeek generate-product route for the Sanity "Generate Product Details
// with AI" button on productPage docs (P2-CP-001 follow-up). Another thin
// consumer of the shared AI engine (P2-AI-001) — nothing rebuilt:
//
// POST { title, brand?, keywords[], material?, colors[], sizes[],
//        decorationMethods[], currentSlug? }
//   → { description (page-shape Portable Text), metaTitle, metaDescription,
//       relatedKeywords[], decorationMethods[], relatedCategorySlug?,
//       suggestedLinks[] }
//
// Orchestration: generate structured B2B product copy (lib/ai/deepseek + brand
// voice) → AUTO-PLACE internal links into the body paragraphs
// (lib/ai/place-internal-links, 'page' link-shape — productPage.description is
// the page-builder `portableBody`, whose link markDef is href-only) → build ONE
// portable-text body with the section H2s IN it (buildPageSectionsBody — the
// landing-page pattern, since description is a single rich-text field) →
// resolve the best root category for the product type (steers the Related
// carousel). The Studio action patches the draft for review. Never publishes.
//
// GENERATES ONLY editorial content: description, SEO meta, related keywords /
// category, decoration-method suggestions. It NEVER invents commercial facts —
// pricing tiers, sizes, colors, brand, min qty, production time are Patrick's
// inputs and are passed IN as context, not returned.
//
// DEEPSEEK_API_KEY stays server-side. Reads products.json from disk (category
// resolution), so it must never be statically evaluated — runtime/dynamic
// exports mirror the other generate routes exactly.

import { NextResponse } from 'next/server';
import { verifyStudioNonce } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';
import { brandVoiceSystemBlock, BUYER_PERSONA } from '@/lib/ai/brand-voice';
import { generateJson, DeepSeekError } from '@/lib/ai/deepseek';
import { resolveCategoryForKeywords } from '@/lib/ai/related-products';
import { suggestInternalLinks, suggestLinksForKind } from '@/lib/ai/internal-links';
import { placeInternalLinks } from '@/lib/ai/place-internal-links';
import { buildPageSectionsBody } from '@/lib/portable-text/build-page-body';
import type { BlogBodyInput } from '@/lib/portable-text/build-blog-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Internal links placed into the description (shorter than a page body). */
const MAX_INTERNAL_LINKS = 3;
/** Auto matches pre-filled into the Related Videos / Related Blogs strips. */
const MAX_RELATED_CONTENT = 4;
/** Description thin floor — below this the editor is asked to retry. */
const MIN_DESCRIPTION_WORDS = 150;
/** Cap on suggested decoration methods / related keywords. */
const MAX_TAGS = 6;

interface GenBody {
  title?: string;
  brand?: string;
  keywords?: string[];
  material?: string;
  colors?: string[];
  sizes?: string[];
  decorationMethods?: string[];
  currentSlug?: string;
}

interface GeneratedSection {
  heading?: string;
  paragraphs: string[];
  listItems?: string[];
}

interface GeneratedProduct {
  sections: GeneratedSection[];
  metaTitle: string;
  metaDescription: string;
  relatedKeywords: string[];
  decorationMethods: string[];
  /** The concrete promotional item, e.g. "travel tumblers" — drives category matching. */
  productType?: string;
}

function buildSystemPrompt(): string {
  return `${brandVoiceSystemBlock()}

You are writing the PRODUCT DETAILS section for one specific product on the Perfect Imprints website (a custom product page with its own gallery, pricing table, and Get-a-Quote form — you write ONLY the descriptive copy). Concrete, useful B2B copy: what the product is, materials/build quality, decoration and branding options, who orders it and for what occasions, and quantity/lead-time framing. Never invent prices, sizes, colors, or specs — mention ONLY the attributes provided as context (if any), and stay generic where none are given.

Return a single JSON object, no prose, no code fences:
{
  "sections": [
    { "paragraphs": ["1-2 opening paragraphs — NO heading on this first section"] },
    { "heading": "an H2, e.g. \\"Features & Build Quality\\"", "paragraphs": ["..."], "listItems": ["optional 3-6 short bullets when a list genuinely helps"] },
    { "heading": "e.g. \\"Decoration & Branding Options\\"", "paragraphs": ["..."] },
    { "heading": "e.g. \\"Popular Uses\\"", "paragraphs": ["..."] }
  ],
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + plural product keyword",
  "relatedKeywords": ["3-6 PLURAL keyword phrases for finding similar products, e.g. \\"custom travel tumblers\\""],
  "decorationMethods": ["2-5 decoration methods that genuinely fit this product type, using standard industry names: Screen Print, Pad Print, Embroidery, Laser Engraving, Full-Color Heat Transfer, Debossing, Embossing, UV Print, Digital Print"],
  "productType": "2-4 words naming the CONCRETE item, e.g. \\"travel tumblers\\" — no generic words like custom or branded"
}

HARD LIMITS (count before returning, rewrite if any fail):
- sections: 3 to 5 total, first one heading-less, totalling AT LEAST 250 and at most about 450 words across all paragraphs
- metaTitle <= 60 chars; metaDescription <= 155 chars
- relatedKeywords and decorationMethods: plural keywords stay plural; suggest ONLY decoration methods plausible for this product type`;
}

function buildUserPrompt(body: GenBody, keywords: string[]): string {
  const facts: string[] = [];
  if (body.brand?.trim()) facts.push(`Brand: ${body.brand.trim()}`);
  if (body.material?.trim()) facts.push(`Material: ${body.material.trim()}`);
  if ((body.colors ?? []).length > 0) facts.push(`Available colors: ${body.colors!.join(', ')}`);
  if ((body.sizes ?? []).length > 0) facts.push(`Available sizes: ${body.sizes!.join(', ')}`);
  if ((body.decorationMethods ?? []).length > 0)
    facts.push(
      `Decoration methods Patrick already selected (write about THESE): ${body.decorationMethods!.join(', ')}`,
    );

  return `Write the product details now.

Product title: ${body.title}
${facts.length > 0 ? `Known product facts (use these, invent nothing else):\n${facts.join('\n')}` : 'No further specs provided — keep attribute claims generic.'}
Topic keywords (plural): ${keywords.join(', ') || '(derive from the title)'}
Buyer personas: ${BUYER_PERSONA}

Return the JSON object now.`;
}

/** Word-boundary truncation safety net (mirrors the other generate routes). */
function clampAtWordBoundary(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, max)).trim();
}

function cleanTags(values: unknown, max = MAX_TAGS): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const t = `${v ?? ''}`.trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export async function POST(request: Request) {
  // FIX-850: first-party Studio session only (the Site Refresh / Bulk Upload
  // nonce scheme). Rejects before any body parsing or DeepSeek call.
  const auth = await verifyStudioNonce(request, {
    authDocId: GENERATE_AUTH_DOC_ID,
    headerName: GENERATE_NONCE_HEADER,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized.' }, { status: auth.status });
  }
  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Enter a product Title first.' }, { status: 400 });
  }
  const keywords = (body.keywords ?? []).map((k) => `${k}`.trim()).filter(Boolean);

  try {
    const gen = await generateJson<Partial<GeneratedProduct>>({
      system: buildSystemPrompt(),
      user: buildUserPrompt(body, keywords),
      maxTokens: 3000,
      temperature: 0.65,
    });

    const sections = (Array.isArray(gen?.sections) ? gen.sections : [])
      .map((s) => ({
        heading: `${s?.heading ?? ''}`.trim(),
        paragraphs: (s?.paragraphs ?? []).map((p) => `${p}`.trim()).filter(Boolean),
        listItems: (s?.listItems ?? []).map((i) => `${i}`.trim()).filter(Boolean),
      }))
      .filter((s) => s.paragraphs.length > 0 || s.listItems.length > 0);
    if (
      sections.length === 0 ||
      typeof gen?.metaTitle !== 'string' ||
      typeof gen?.metaDescription !== 'string'
    ) {
      return NextResponse.json(
        { error: 'The AI returned an incomplete result. Click Generate again to retry.' },
        { status: 502 },
      );
    }

    const words = sections
      .flatMap((s) => [...s.paragraphs, ...s.listItems])
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;
    if (words < MIN_DESCRIPTION_WORDS) {
      return NextResponse.json(
        {
          error: `The AI description came back thin (~${words} words against the 250 to 450 target). Click Generate again to retry.`,
        },
        { status: 502 },
      );
    }

    // Related keywords / category — the editor's tags win as matching input;
    // the AI's suggestions fill the Related fieldset only when Patrick left it
    // blank (the action patches only-if-empty).
    const relatedKeywords = cleanTags(gen.relatedKeywords);
    const decorationMethods = cleanTags(gen.decorationMethods, 5);
    const productType = `${gen.productType ?? ''}`.trim();
    const matchingPhrase =
      productType || (keywords.length > 0 ? keywords.join(' ') : title);
    const relatedCategorySlug = resolveCategoryForKeywords(matchingPhrase);

    // Internal links from real targets only. suggestInternalLinks has no
    // productPage source, so a self-link is impossible; currentSlug is kept as
    // a belt-and-suspenders filter anyway.
    const promptKeywords = keywords.length > 0 ? keywords : [title];
    const matchingKeywords = [...promptKeywords, ...(productType ? [productType] : [])];
    const currentSlug = (body.currentSlug || '').trim();
    const [suggestionsRaw, videoMatches, blogMatches] = await Promise.all([
      suggestInternalLinks({
        keywords: matchingKeywords,
        categorySlug: relatedCategorySlug ?? undefined,
        limit: MAX_INTERNAL_LINKS,
      }),
      // Auto matches for the Related Videos / Related Blogs strips — the action
      // patches them as references ONLY when Patrick left the fields empty.
      suggestLinksForKind('video', matchingKeywords, MAX_RELATED_CONTENT),
      suggestLinksForKind('blog', matchingKeywords, MAX_RELATED_CONTENT),
    ]);
    const suggestions = suggestionsRaw.filter(
      (s) => !currentSlug || s.href !== `/products/${currentSlug}`,
    );

    // AUTO-PLACE the links into the body paragraphs ('page' shape: href-only
    // markDefs, matching the portableBody link annotation), then build ONE
    // portable-text description with the section H2s in the body — the
    // landing-page pattern, since `description` is a single rich-text field.
    const placementInput: BlogBodyInput = {
      intro: [],
      sections: sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs })),
    };
    const { body: linkedInput, placedHrefs } = placeInternalLinks(
      placementInput,
      suggestions,
      MAX_INTERNAL_LINKS,
      { linkShape: 'page' },
    );
    const description = buildPageSectionsBody(
      linkedInput.sections.map((placed, i) => ({
        heading: sections[i].heading || undefined,
        paragraphs: placed.paragraphs ?? [],
        ...(sections[i].listItems.length > 0
          ? { list: { kind: 'bullet' as const, items: sections[i].listItems } }
          : {}),
      })),
    );
    const suggestedLinks = suggestions.map((l) => ({
      ...l,
      reason: placedHrefs.includes(l.href)
        ? `${l.reason} (placed in the description)`
        : `${l.reason} (not placed: no clean anchor found)`,
    }));

    return NextResponse.json({
      description,
      metaTitle: clampAtWordBoundary(gen.metaTitle, 60),
      metaDescription: clampAtWordBoundary(gen.metaDescription, 155),
      relatedKeywords,
      decorationMethods,
      relatedCategorySlug: relatedCategorySlug ?? undefined,
      suggestedLinks,
      // Sanity _ids for the strips' only-if-empty reference pre-fill.
      relatedVideoIds: videoMatches.map((m) => m.docId).filter(Boolean),
      relatedBlogIds: blogMatches.map((m) => m.docId).filter(Boolean),
    });
  } catch (err) {
    if (err instanceof DeepSeekError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI product generation failed.' },
      { status: 502 },
    );
  }
}
