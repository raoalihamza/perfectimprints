// DeepSeek generate-schema route for the Custom Schema AI button (Task C-2).
//
// POST { schemaType, aiContext?, pageUrl? } → { jsonLd: "<pretty JSON-LD string>" }.
// Prompts DeepSeek to return ONE valid JSON-LD object of the chosen type,
// pre-filled with Perfect Imprints / page context. The Studio action appends the
// returned string as a new block in customSchema.jsonLd[] for Patrick to review —
// never auto-published. Mirrors the customCategory generate-content route (same
// DEEPSEEK_API_KEY, server-side only).

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// Curated AI-generatable types — must mirror AI_SCHEMA_TYPES in
// sanity/schemas/documents/custom-schema.ts. Deliberately excludes the schemas
// the site already emits automatically (FAQPage, Organization, WebSite,
// BreadcrumbList, VideoObject, CollectionPage, BlogPosting).
const ALLOWED_TYPES = new Set([
  'WebApplication',
  'SoftwareApplication',
  'Product',
  'Service',
  'Offer',
  'HowTo',
  'Article',
  'Event',
  'Review',
  'AggregateRating',
  'ItemList',
]);

interface GenBody {
  schemaType?: string;
  aiContext?: string;
  pageUrl?: string;
}

function buildSystemPrompt(schemaType: string): string {
  return `You generate schema.org structured data (JSON-LD) for Perfect Imprints, a B2B custom promotional-products distributor in the United States (https://www.perfectimprints.com).

Your job: produce ONE valid JSON-LD object of @type "${schemaType}", filled with sensible, accurate values for Perfect Imprints and the given page. Use realistic placeholder values ONLY where a real value isn't provided, and keep them clearly editable (the human will review and correct before publishing).

HARD RULES:
- Output a SINGLE JSON object, nothing else. No prose, no explanation, no markdown, no code fences.
- It MUST include "@context": "https://schema.org" and "@type": "${schemaType}".
- Use only standard schema.org properties valid for "${schemaType}". Do not invent properties.
- Do not fabricate ratings, review counts, prices, or dates that you cannot reasonably infer — omit a property rather than inventing a misleading value.
- Where a URL is relevant, prefer the page URL provided; otherwise use the Perfect Imprints site URL.
- Keep it concise and import-ready: a Google Rich Results test of this object must parse with no syntax errors.`;
}

function buildUserPrompt(schemaType: string, aiContext: string, pageUrl: string): string {
  const absolute = pageUrl ? `${SITE_URL}${pageUrl}` : SITE_URL;
  const lines = [
    `Generate a "${schemaType}" JSON-LD object for this Perfect Imprints page.`,
    `Page path: ${pageUrl || '(site-wide / home)'}`,
    `Page URL: ${absolute}`,
  ];
  if (aiContext) lines.push(`Details to use: ${aiContext}`);
  lines.push('', 'Return the single JSON-LD object now.');
  return lines.join('\n');
}

/** schema.org @type can be a string or an array of strings. */
function typeMatches(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value === expected;
  if (Array.isArray(value)) return value.some((t) => t === expected);
  return false;
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI is not configured (DEEPSEEK_API_KEY missing). You can still paste schema manually.' },
      { status: 500 },
    );
  }

  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const schemaType = (body.schemaType || '').trim();
  if (!schemaType) {
    return NextResponse.json({ error: 'Pick a Schema type first.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(schemaType)) {
    return NextResponse.json({ error: `Unsupported schema type "${schemaType}".` }, { status: 400 });
  }
  const aiContext = (body.aiContext || '').trim();
  const pageUrl = (body.pageUrl || '').trim();

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(schemaType) },
          { role: 'user', content: buildUserPrompt(schemaType, aiContext, pageUrl) },
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

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: 'Empty response from DeepSeek.' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'DeepSeek returned non-JSON content.' }, { status: 502 });
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'AI did not return a single JSON-LD object. Try again or paste manually.' },
        { status: 502 },
      );
    }
    const obj = parsed as Record<string, unknown>;
    if (!('@context' in obj)) {
      return NextResponse.json({ error: 'Generated schema is missing "@context".' }, { status: 502 });
    }
    if (!typeMatches(obj['@type'], schemaType)) {
      return NextResponse.json(
        { error: `Generated schema "@type" did not match "${schemaType}". Try again.` },
        { status: 502 },
      );
    }

    // Pretty-print so the appended block is readable/editable in the Studio textarea.
    return NextResponse.json({ jsonLd: JSON.stringify(obj, null, 2) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI generation failed.' },
      { status: 502 },
    );
  }
}
