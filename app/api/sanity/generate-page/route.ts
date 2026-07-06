// DeepSeek generate-page route for the Sanity "Generate Page with AI" button
// (P2-AI-004). The page-builder consumer of the shared AI engine (P2-AI-001) —
// thin wrapper, nothing rebuilt:
//
// POST { title, brief?, keywords[], currentSlug? }
//   → { metaTitle, metaDescription, sections[], suggestedLinks[] }
//
// Orchestration: generate structured TEXT-ONLY page content (lib/ai/deepseek +
// brand voice) → AUTO-PLACE internal links into the body paragraphs
// (lib/ai/place-internal-links in 'page' link-shape mode — the page-builder
// portableBody uses the DEFAULT block-editor link annotation, whose markDef is
// `{_type:'link', _key, href}` with NO openInNewTab) → build each body as
// page-legal Portable Text (lib/portable-text/build-page-body) → match one
// related-products strip (lib/ai/related-products) → assemble REAL page
// section objects (heroBanner / richText / productStrip / statBanner /
// faqAccordion / ctaBlock) with unique _keys. Image-dependent sections
// (imageText, infographic, iconFeatures, cardGrid) are deliberately NOT
// generated — Patrick adds images himself (his choice). The Studio action
// APPENDS the sections to the draft for review. Never publishes.
//
// CTA hrefs default to /contact — a real route (the lead form lives there);
// nothing is invented. Patrick can repoint any button in Studio.
//
// DEEPSEEK_API_KEY stays server-side. This route reads products.json from
// disk, so it must NEVER be statically evaluated or moved to the Edge runtime —
// runtime/dynamic exports below mirror the generate-blog/-video routes exactly.

import { NextResponse } from 'next/server';
import { brandVoiceSystemBlock, BUYER_PERSONA } from '@/lib/ai/brand-voice';
import { generateJson, DeepSeekError } from '@/lib/ai/deepseek';
import { matchRelatedProducts, resolveCategoryForKeywords } from '@/lib/ai/related-products';
import { suggestInternalLinks } from '@/lib/ai/internal-links';
import { placeInternalLinks } from '@/lib/ai/place-internal-links';
import { buildPageBody } from '@/lib/portable-text/build-page-body';
import type { BlogBodyInput } from '@/lib/portable-text/build-blog-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Products in the related-products strip. */
const STRIP_LIMIT = 8;
/** A strip below this floor is skipped entirely (never padded). */
const STRIP_MIN_PRODUCTS = 2;
/** Internal links placed into the body. */
const MAX_INTERNAL_LINKS = 5;
/** Lenient thin floor for the 600-1000-word body ask. */
const MIN_BODY_WORDS = 450;
/** The verified quote/contact path — the lead form renders at /contact. */
const CTA_HREF = '/contact';

interface GenBody {
  title?: string;
  brief?: string;
  keywords?: string[];
  /** The doc's existing slug, so page-link suggestions never point at itself. */
  currentSlug?: string;
}

interface GeneratedBodySection {
  heading: string;
  paragraphs: string[];
  listItems?: string[];
}

interface GeneratedPage {
  heroHeading: string;
  heroSubheading: string;
  heroCtaLabel?: string;
  bodySections: GeneratedBodySection[];
  stat?: { statText?: string; subtext?: string };
  faqs: { question: string; answer: string }[];
  ctaHeading: string;
  ctaSubheading?: string;
  ctaButtonLabel?: string;
  /** The concrete promotional item this page centers on — drives product matching. */
  productType?: string;
  metaTitle: string;
  metaDescription: string;
}

function buildSystemPrompt(): string {
  return `${brandVoiceSystemBlock()}

You are writing a full marketing/content PAGE for the Perfect Imprints website from a page title (and optionally a short brief). Useful, concrete B2B copy: what Perfect Imprints offers on this topic, who it suits, decoration methods, use cases, quantity/lead-time framing. Never consumer-retail tone, never filler.

Return a single JSON object, no prose, no code fences:
{
  "heroHeading": "the page's H1 — strong, keyword-aware (plural product keywords)",
  "heroSubheading": "1-2 supporting sentences under the H1",
  "heroCtaLabel": "a short action label for the hero button, e.g. \\"Get a Free Quote\\"",
  "bodySections": [
    {
      "heading": "an H2 for this section",
      "paragraphs": ["2 to 4 paragraphs of AT LEAST 150 words total per section"],
      "listItems": ["optional — 3 to 6 short bullet points when a list genuinely helps"]
    }
  ],
  "stat": { "statText": "one compelling, honest, GENERIC stat framing (no fabricated precise statistics)", "subtext": "one supporting line" },
  "faqs": [{ "question": "...", "answer": "plain text, 40-90 words" }],
  "ctaHeading": "closing CTA heading",
  "ctaSubheading": "one supporting line",
  "ctaButtonLabel": "short button label",
  "productType": "2-4 words naming the CONCRETE promotional item this page centers on, e.g. \\"power banks\\" or \\"trade show giveaways\\" — no generic words like custom or branded",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + topic keyword"
}

HARD LIMITS (count before returning, rewrite if any fail):
- bodySections: 3 to 6 sections, totalling AT LEAST 600 words and at most about 1000 across all paragraphs
- faqs: 3 to 6 entries
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- stat must stay honest and generic — a plausible framing (e.g. experience, breadth of catalog, service promise), never an invented precise number`;
}

function buildUserPrompt(title: string, brief: string, keywords: string[]): string {
  return `Write the page now.

Page title: ${title}
${brief ? `Page brief: ${brief}` : ''}
Topic keywords (plural): ${keywords.join(', ') || '(derive from the title)'}
Buyer personas: ${BUYER_PERSONA}

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

function countWords(sections: GeneratedBodySection[]): number {
  return sections
    .flatMap((s) => s.paragraphs)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function titleCase(phrase: string): string {
  return phrase.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

let sectionKey = 0;
function nextKey(prefix: string): string {
  sectionKey += 1;
  return `${prefix}-${sectionKey.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function isStructurallyValid(gen: Partial<GeneratedPage>): gen is GeneratedPage {
  if (!gen) return false;
  if (typeof gen.heroHeading !== 'string' || !gen.heroHeading.trim()) return false;
  if (typeof gen.metaTitle !== 'string' || typeof gen.metaDescription !== 'string') return false;
  if (typeof gen.ctaHeading !== 'string' || !gen.ctaHeading.trim()) return false;
  if (!Array.isArray(gen.bodySections)) return false;
  const sections = gen.bodySections.filter(
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

export async function POST(request: Request) {
  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Enter a page Title first.' }, { status: 400 });
  }
  const brief = (body.brief || '').trim().slice(0, 1_000);
  const keywords = (body.keywords ?? []).map((k) => `${k}`.trim()).filter(Boolean);
  const currentSlug = (body.currentSlug || '').trim();

  try {
    // 1) Generate the structured page content. max_tokens sized for ~1000 body
    //    words + up to 6 FAQs + hero/CTA/meta (~1400 words ≈ 2.1k tokens) with
    //    clear headroom against truncation-as-JSON-parse-error.
    const gen = await generateJson<Partial<GeneratedPage>>({
      system: buildSystemPrompt(),
      user: buildUserPrompt(title, brief, keywords),
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

    // Keywords that drive matching/links: the editor's topic keywords first,
    // falling back to the title so an empty tag list still matches.
    const promptKeywords = keywords.length > 0 ? keywords : [title];

    // 2) Internal links from real targets only; never suggest the page itself.
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
    ).filter((s) => !currentSlug || s.href !== `/${currentSlug}`);

    // 3) AUTO-INSERT the links into the body paragraphs — in 'page' link-shape
    //    mode, so placed span links (and the markDefs buildPageBody makes from
    //    them) carry href ONLY, matching the default block-editor link
    //    annotation the page-builder portableBody uses. Headings and list
    //    items are never touched; unanchorable targets are skipped.
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

    // 4) Related products for the strip — relevance-floored, never padded.
    //    Skipped entirely below the 2-product floor.
    const stripKeywords = [...keywords, ...(productType ? [productType] : [])];
    const products = await matchRelatedProducts({
      categorySlug: resolvedCategory ?? undefined,
      keywords: stripKeywords.length > 0 ? stripKeywords : promptKeywords,
      limit: STRIP_LIMIT,
    });

    // 5) Assemble REAL page section objects, in order: hero → body richTexts →
    //    product strip → stat banner → FAQ accordion → closing CTA. Every
    //    field matches its schema exactly (Studio silently drops mismatches).
    const sections: Record<string, unknown>[] = [];

    sections.push({
      _type: 'heroBanner',
      _key: nextKey('hero'),
      heading: gen.heroHeading.trim(),
      subheading: (gen.heroSubheading ?? '').trim(),
      // No image is generated — text-on-top mode reads right without one, and
      // Patrick uploads the banner himself.
      overlayText: false,
      ...(gen.heroCtaLabel?.trim()
        ? { ctaLabel: gen.heroCtaLabel.trim(), ctaHref: CTA_HREF }
        : {}),
      hidden: false,
    });

    linkedInput.sections.forEach((placedSection, i) => {
      const source = bodySections[i];
      sections.push({
        _type: 'richText',
        _key: nextKey('rt'),
        heading: source.heading,
        body: buildPageBody({
          paragraphs: placedSection.paragraphs ?? [],
          ...(source.listItems.length > 0
            ? { list: { kind: 'bullet' as const, items: source.listItems } }
            : {}),
        }),
        hidden: false,
      });
    });

    if (products.length >= STRIP_MIN_PRODUCTS) {
      sections.push({
        _type: 'productStrip',
        _key: nextKey('strip'),
        heading: productType
          ? `Featured Custom ${titleCase(productType)}`
          : 'Featured Custom Promotional Products',
        products: products.map((p) => ({
          _type: 'blogProduct',
          _key: nextKey('sku'),
          sku: p.sku,
        })),
        hidden: false,
      });
    }

    if (gen.stat?.statText?.trim()) {
      sections.push({
        _type: 'statBanner',
        _key: nextKey('stat'),
        background: 'red',
        statText: gen.stat.statText.trim(),
        subtext: (gen.stat.subtext ?? '').trim(),
        hidden: false,
      });
    }

    const faqs = (gen.faqs ?? [])
      .map((f) => ({
        question: `${f?.question ?? ''}`.trim(),
        answer: `${f?.answer ?? ''}`.trim(),
      }))
      .filter((f) => f.question && f.answer);
    if (faqs.length > 0) {
      sections.push({
        _type: 'faqAccordion',
        _key: nextKey('faq'),
        heading: 'Frequently Asked Questions',
        items: faqs.map((f) => ({ _key: nextKey('qa'), ...f })),
        hidden: false,
      });
    }

    sections.push({
      _type: 'ctaBlock',
      _key: nextKey('cta'),
      heading: gen.ctaHeading.trim(),
      subheading: (gen.ctaSubheading ?? '').trim(),
      buttons: [
        {
          _key: nextKey('btn'),
          label: gen.ctaButtonLabel?.trim() || 'Get a Free Quote',
          href: CTA_HREF,
        },
      ],
      hidden: false,
    });

    return NextResponse.json({
      metaTitle: clampAtWordBoundary(gen.metaTitle, 60),
      metaDescription: clampAtWordBoundary(gen.metaDescription, 155),
      sections,
      suggestedLinks,
    });
  } catch (err) {
    if (err instanceof DeepSeekError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI page generation failed.' },
      { status: 502 },
    );
  }
}
