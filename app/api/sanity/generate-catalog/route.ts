// DeepSeek generate-catalog route for the Sanity "Generate Catalog Page with
// AI" button (P2-CAT-004 — Milestone 3 prompt 4). The catalogPage consumer of
// the shared AI engine (P2-AI-001) — thin wrapper, nothing rebuilt:
//
// POST { title, catalogKey?, keywords[], brief?, currentSlug? }
//   → { heroHeading, heroSubheading, body (page-shape Portable Text),
//       metaTitle, metaDescription, relatedKeywords[], suggestedLinks[] }
//
// Orchestration mirrors generate-page/-landing: generate structured TEXT-ONLY
// landing copy (brand voice + DeepSeek), grounded — when `catalogKey` resolves
// in data/geiger/catalogs.json — with a sample of REAL product names from that
// catalog so the copy is about items actually inside it (thematic and
// benefits-led only; the prompt forbids inventing specs or prices) → AUTO-PLACE
// internal links into the body paragraphs ('page' link-shape — href-only
// markDefs, the portableBody annotation) → build ONE page-legal Portable Text
// body via buildPageSectionsBody (section H2s live IN the body, the landing
// model — catalogPage.body is a single portableBody field).
//
// HARD BOUNDARY (the productPage/landing rule): this generates ONLY editorial
// content — hero + body + meta + keywords + link suggestions. It NEVER touches
// `catalogKey`, the gated products (addedSkus / addedProducts / hiddenSkus),
// the browse/catalog link, or any commercial fact (prices, specs, quantities).
// Those are Patrick's / the yearly sync's. The Studio action patches only the
// editorial fields and never publishes.
//
// DEEPSEEK_API_KEY stays server-side. This route reads catalogs.json from
// disk, so it must NEVER be statically evaluated or moved to the Edge runtime —
// runtime/dynamic exports below mirror the generate-blog/-page/-landing routes.

import { NextResponse } from 'next/server';
import { verifyStudioNonce } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';
import { brandVoiceSystemBlock, BUYER_PERSONA } from '@/lib/ai/brand-voice';
import { generateJson, DeepSeekError } from '@/lib/ai/deepseek';
import { resolveCategoryForKeywords } from '@/lib/ai/related-products';
import { suggestInternalLinks } from '@/lib/ai/internal-links';
import { placeInternalLinks } from '@/lib/ai/place-internal-links';
import { buildPageSectionsBody } from '@/lib/portable-text/build-page-body';
import type { BlogBodyInput } from '@/lib/portable-text/build-blog-body';
import { getCatalogPreviewProducts } from '@/lib/catalogs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Internal links placed into the body. */
const MAX_INTERNAL_LINKS = 5;
/** Lenient thin floor for the 600-1000-word body ask (mirrors generate-page). */
const MIN_BODY_WORDS = 450;
/** Real product names from the synced catalog used to ground the copy. */
const GROUNDING_PRODUCTS = 12;

interface GenBody {
  title?: string;
  catalogKey?: string;
  keywords?: string[];
  brief?: string;
  /** The doc's existing slug — kept for parity with the other generators (self-links can't occur: no suggestion source emits /shop-by-theme/ URLs). */
  currentSlug?: string;
}

interface GeneratedBodySection {
  heading: string;
  paragraphs: string[];
  listItems?: string[];
}

interface GeneratedCatalog {
  heroHeading: string;
  heroSubheading: string;
  bodySections: GeneratedBodySection[];
  /** The concrete product theme, e.g. "eco friendly promotional products" — drives links. */
  productType?: string;
  relatedKeywords?: string[];
  metaTitle: string;
  metaDescription: string;
}

function buildSystemPrompt(): string {
  return `${brandVoiceSystemBlock()}

You are writing the SEO LANDING PAGE for one of Perfect Imprints' themed promotional-product CATALOGS (e.g. "USA Made", "Green Guide", "Holiday Guide"). The page's job: rank for the catalog's theme and convince a B2B buyer to request the full catalog (a "Get the Catalog" button repeats on the page — do NOT write the button, it exists). Cover: what kinds of products the catalog contains, who the theme suits (industries, occasions, programs), decoration/customization framing, and why requesting the catalog is worth it. Thematic and benefits-led ONLY — never invent specific product specs, prices, quantities, or availability.

Return a single JSON object, no prose, no code fences:
{
  "heroHeading": "the page's H1 — strong, keyword-aware (plural product keywords + the catalog theme)",
  "heroSubheading": "1-2 supporting sentences under the H1",
  "bodySections": [
    {
      "heading": "an H2 for this section",
      "paragraphs": ["2 to 4 paragraphs of AT LEAST 180 words total per section"],
      "listItems": ["optional — 3 to 6 short bullet points when a list genuinely helps"]
    }
  ],
  "productType": "2-4 words naming the catalog's concrete product theme, e.g. \\"eco friendly products\\" or \\"holiday gifts\\" — no generic words like custom or branded",
  "relatedKeywords": ["3 to 6 PLURAL search keywords for this theme, e.g. \\"made in usa promotional products\\""],
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + the theme keyword"
}

HARD LIMITS (count before returning, rewrite if any fail):
- bodySections: 4 to 6 sections, EACH with at least 180 words of paragraphs, totalling AT LEAST 700 words and at most about 1100 across all paragraphs — if any section is short, EXPAND it before returning
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- mention only product TYPES that plausibly belong to the theme; if example product names were provided, stay consistent with them — never invent specs or prices`;
}

function buildUserPrompt(
  title: string,
  brief: string,
  keywords: string[],
  productNames: string[],
): string {
  return `Write the catalog landing page now.

Catalog title / theme: ${title}
${brief ? `Brief from the editor: ${brief}` : ''}
Topic keywords (plural): ${keywords.join(', ') || '(derive from the catalog theme)'}
${
  productNames.length > 0
    ? `Example products actually inside this catalog (ground the copy in these kinds of items — do not quote specs or prices):\n${productNames.map((n) => `- ${n}`).join('\n')}`
    : ''
}
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

function countWords(sections: GeneratedBodySection[]): number {
  return sections
    .flatMap((s) => s.paragraphs)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function isStructurallyValid(gen: Partial<GeneratedCatalog>): gen is GeneratedCatalog {
  if (!gen) return false;
  if (typeof gen.heroHeading !== 'string' || !gen.heroHeading.trim()) return false;
  if (typeof gen.metaTitle !== 'string' || typeof gen.metaDescription !== 'string') return false;
  if (!Array.isArray(gen.bodySections)) return false;
  const sections = gen.bodySections.filter(
    (s) =>
      s &&
      typeof s.heading === 'string' &&
      s.heading.trim() &&
      Array.isArray(s.paragraphs) &&
      s.paragraphs.some((p) => typeof p === 'string' && p.trim()),
  );
  return sections.length >= 3;
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
    return NextResponse.json({ error: 'Enter the catalog Title first.' }, { status: 400 });
  }
  const catalogKey = (body.catalogKey || '').trim();
  const brief = (body.brief || '').trim().slice(0, 1_000);
  const keywords = (body.keywords ?? []).map((k) => `${k}`.trim()).filter(Boolean);
  const currentSlug = (body.currentSlug || '').trim();

  // Grounding: a sample of REAL product names from the synced scrape (empty
  // for the two manual-only catalogs / an unknown key — the copy then stays
  // purely thematic). Names only; never specs or prices.
  const productNames = catalogKey
    ? getCatalogPreviewProducts(catalogKey, GROUNDING_PRODUCTS).map((p) => p.name)
    : [];

  try {
    // 1) Generate the structured landing copy. max_tokens sized like
    //    generate-page (~1000 body words + hero/meta with headroom).
    const gen = await generateJson<Partial<GeneratedCatalog>>({
      system: buildSystemPrompt(),
      user: buildUserPrompt(title, brief, keywords, productNames),
      maxTokens: 4000,
      temperature: 0.65,
    });

    if (!isStructurallyValid(gen)) {
      return NextResponse.json(
        { error: 'The AI returned an incomplete result. Click Generate again to retry.' },
        { status: 502 },
      );
    }
    const bodySections = gen.bodySections
      .map((s) => ({
        heading: `${s.heading ?? ''}`.trim(),
        paragraphs: (s.paragraphs ?? []).map((p) => `${p}`.trim()).filter(Boolean),
        listItems: (s.listItems ?? []).map((i) => `${i}`.trim()).filter(Boolean),
      }))
      .filter((s) => s.heading && s.paragraphs.length > 0);
    const words = countWords(bodySections);
    if (words < MIN_BODY_WORDS) {
      return NextResponse.json(
        {
          error: `The AI body came back thin (~${words} words against the 600 to 1000 target). Click Generate again to retry.`,
        },
        { status: 502 },
      );
    }

    const promptKeywords = keywords.length > 0 ? keywords : [title];

    // 2) Internal links from real targets only (blogs/pages/categories/videos/
    //    landing pages). No suggestion source emits /shop-by-theme/ URLs, so a
    //    self-link can't occur — the filter is kept for parity/safety.
    const productType = (gen.productType ?? '').trim();
    const resolvedCategory = productType
      ? resolveCategoryForKeywords(productType)
      : resolveCategoryForKeywords(promptKeywords.join(' '));
    const suggestions = (
      await suggestInternalLinks({
        keywords: promptKeywords,
        categorySlug: resolvedCategory ?? undefined,
        limit: MAX_INTERNAL_LINKS,
      })
    ).filter((s) => !currentSlug || s.href !== `/shop-by-theme/${currentSlug}`);

    // 3) AUTO-INSERT the links into the body paragraphs ('page' link-shape —
    //    href-only markDefs, matching the portableBody annotation), then build
    //    ONE body with the section H2s IN it (the landing model: catalogPage's
    //    `body` is a single portableBody field).
    const placementInput: BlogBodyInput = {
      intro: [],
      sections: bodySections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs })),
    };
    const { body: linkedInput, placedHrefs } = placeInternalLinks(
      placementInput,
      suggestions,
      MAX_INTERNAL_LINKS,
      { linkShape: 'page' },
    );
    const suggestedLinks = suggestions.map((l) => ({
      ...l,
      reason: placedHrefs.includes(l.href)
        ? `${l.reason} (placed in the body)`
        : `${l.reason} (not placed: no clean anchor found)`,
    }));

    const bodyBlocks = buildPageSectionsBody(
      linkedInput.sections.map((placedSection, i) => ({
        heading: bodySections[i].heading,
        paragraphs: placedSection.paragraphs ?? [],
        ...(bodySections[i].listItems.length > 0
          ? { list: { kind: 'bullet' as const, items: bodySections[i].listItems } }
          : {}),
      })),
    );

    const relatedKeywords = (gen.relatedKeywords ?? [])
      .map((k) => `${k}`.trim())
      .filter(Boolean)
      .slice(0, 6);

    return NextResponse.json({
      heroHeading: gen.heroHeading.trim(),
      heroSubheading: (gen.heroSubheading ?? '').trim(),
      body: bodyBlocks,
      metaTitle: clampAtWordBoundary(gen.metaTitle, 60),
      metaDescription: clampAtWordBoundary(gen.metaDescription, 155),
      relatedKeywords,
      suggestedLinks,
    });
  } catch (err) {
    if (err instanceof DeepSeekError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI catalog-page generation failed.' },
      { status: 502 },
    );
  }
}
