// DeepSeek generate-content route for the Sanity AI button (M5-505).
//
// POST { title, targetKeyword } → { h1, metaTitle, metaDescription, introHtml,
// buyingGuideHtml, buyingGuideH2, faqs[] }. Mirrors the build-time pipeline's
// root_category.txt (v2 buying-guide) prompt: plural keyword forms + the
// custom/promotional/branded/personalized/logo/bulk/wholesale derivatives, the
// buyer personas, and no "Perfect Imprints" inside the H1/H2.
//
// DEEPSEEK_API_KEY stays server-side. The Studio action patches the result into
// the customCategory's introHtml / bodySections / faqs for Patrick to review.

import { NextResponse } from 'next/server';
import { verifyStudioNonce } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

const BUYER_PERSONA = 'marketing directors, HR directors, safety managers, and small-business owners';

interface GenBody {
  title?: string;
  targetKeyword?: string;
}

interface GeneratedContent {
  h1: string;
  metaTitle: string;
  metaDescription: string;
  introHtml: string;
  buyingGuideHtml: string;
  buyingGuideH2: string;
  faqs: { q: string; a: string }[];
  heroAltText: string;
}

function buildSystemPrompt(): string {
  return `You write SEO landing-page copy for Perfect Imprints, a B2B promotional products distributor in the United States. Produce concise, useful copy for bulk-order buyers (${BUYER_PERSONA}).

This page has TWO content sections:
1. A short hero intro ABOVE the product grid (170-250 words).
2. A longer buyer-research buying guide BELOW the product grid (430-600 words), introduced by an H2 like "Custom [Category Name] Buying Guide".

Voice and tone:
- Professional but approachable, concrete and specific. Plain US English, no British spellings.
- Always plural product keywords ("custom water bottles", "branded tote bags"), never the singular.
- The buying guide reads like a research piece for someone deciding what and how to order, not a sales page.

Never use: "in today's world", "leverage", "synergy", "unlock", "elevate your brand", "look no further", "the perfect choice", "we've got you covered", "tailored to your needs", openings with "When it comes to" or "Whether you're a...", or em-dashes as filler.

HARD LIMITS (count before returning, rewrite if any fail):
- metaTitle <= 60 chars
- metaDescription <= 155 chars
- h1 between 30 and 80 chars
- introHtml: 170-250 words, 2 paragraphs in <p> tags.
- buyingGuideHtml: 430-600 words, 5 or 6 paragraphs in <p> tags (optional <h3> sub-headers don't count).

The buying guide must cover, woven into a narrative (not labeled): what to look for; materials/build/durability; use cases and which persona each fits (corporate events, trade shows, employee onboarding, safety programs, customer gifts); decoration/customization options that genuinely apply (screen print, embroidery, laser engraving, debossing, full-color); quantity/MOQ guidance; and tips to avoid buying mistakes. Be category-specific, never generic.

KEYWORD DERIVATIVES (inside buyingGuideHtml): naturally include at least 5 of these 7 plural variants, no stuffing: custom [category], promotional [category], branded [category], personalized [category], logo [category] (or logo-printed), bulk [category], wholesale [category].

Do NOT include "Perfect Imprints" inside the H1 or the buyingGuideH2.

OUTPUT: return a single JSON object, no prose, no code fences, with this schema:
{
  "h1": "30-80 chars, includes the plural target keyword",
  "metaTitle": "<=60 chars",
  "metaDescription": "<=155 chars, soft CTA + target keyword",
  "introHtml": "2 <p> paragraphs, 170-250 words",
  "buyingGuideHtml": "5-6 <p> paragraphs, 430-600 words",
  "buyingGuideH2": "title-cased, like 'Custom [Category] Buying Guide'",
  "faqs": [ { "q": "<=80 chars, ends with ?", "a": "50-100 words, plain text" } ],
  "heroAltText": "60-120 chars, includes the target keyword"
}
Exactly 5 FAQ items, all specific to this category.`;
}

function buildUserPrompt(title: string, keyword: string): string {
  return `Write the custom category landing page for:

Category: ${title}
Target keyword (plural): ${keyword}
Buyer personas: ${BUYER_PERSONA}

Return the JSON object now.`;
}

function isValid(c: Partial<GeneratedContent>): c is GeneratedContent {
  return Boolean(
    c &&
      typeof c.h1 === 'string' &&
      typeof c.metaTitle === 'string' &&
      typeof c.metaDescription === 'string' &&
      typeof c.introHtml === 'string' &&
      typeof c.buyingGuideHtml === 'string' &&
      typeof c.buyingGuideH2 === 'string' &&
      Array.isArray(c.faqs),
  );
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
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'DEEPSEEK_API_KEY not configured.' }, { status: 500 });
  }

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
  const keyword = (body.targetKeyword || '').trim() || `custom ${title.toLowerCase()}`;

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.65,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(title, keyword) },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `DeepSeek request failed (${res.status}).`, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: 'Empty response from DeepSeek.' }, { status: 502 });
    }

    let parsed: Partial<GeneratedContent>;
    try {
      parsed = JSON.parse(raw) as Partial<GeneratedContent>;
    } catch {
      return NextResponse.json({ error: 'DeepSeek returned non-JSON content.' }, { status: 502 });
    }

    if (!isValid(parsed)) {
      return NextResponse.json({ error: 'DeepSeek response missing required fields.' }, { status: 502 });
    }

    // Normalize FAQ items.
    const faqs = parsed.faqs
      .filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string')
      .map((f) => ({ q: f.q.trim(), a: f.a.trim() }));

    return NextResponse.json({ ...parsed, faqs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI generation failed.' },
      { status: 502 },
    );
  }
}
