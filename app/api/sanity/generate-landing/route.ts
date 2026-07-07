// DeepSeek generate-landing route for the Sanity "Generate Landing Page with
// AI" button (P2-AI-005 part 1). The landing-page consumer of the shared AI
// engine (P2-AI-001) — thin wrapper, nothing rebuilt:
//
// POST { title, city, state, product, landmarks[], keywords[], currentSlug? }
//   → { heroHeading, heroSubheading, localIntro, optionsIdeas, whyUs, faqs,
//       relatedProducts, metaTitle, metaDescription, suggestedLinks }
//
// The orchestration itself (DeepSeek prompt, landmark enforcement, internal
// links, Portable Text bodies, related products) lives in
// lib/ai/generate-landing-content.ts — SHARED with the landing seed script
// (scripts/seed/seed-landing-pages.ts), one source of truth. This route only
// parses/validates the HTTP request and maps the typed errors to responses:
// LandingGenerationError / DeepSeekError → their message + status (502/500),
// exactly the pre-extraction behavior. Never publishes.
//
// DEEPSEEK_API_KEY stays server-side. The engine reads products.json from
// disk, so this route must NEVER be statically evaluated or moved to the Edge
// runtime — runtime/dynamic exports below mirror the generate-blog/-video/-page
// routes.

import { NextResponse } from 'next/server';
import { DeepSeekError } from '@/lib/ai/deepseek';
import {
  generateLandingContent,
  LandingGenerationError,
} from '@/lib/ai/generate-landing-content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GenBody {
  title?: string;
  city?: string;
  state?: string;
  product?: string;
  landmarks?: string[];
  keywords?: string[];
  /** The doc's existing slug, so page/landing link suggestions never point at itself. */
  currentSlug?: string;
}

export async function POST(request: Request) {
  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const city = (body.city || '').trim();
  const state = (body.state || '').trim();
  const product = (body.product || '').trim();
  if (!city || !state || !product) {
    return NextResponse.json(
      { error: 'Fill in City, State, and Product / topic first.' },
      { status: 400 },
    );
  }

  try {
    const result = await generateLandingContent({
      title: body.title,
      city,
      state,
      product,
      landmarks: Array.isArray(body.landmarks) ? body.landmarks : [],
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      currentSlug: body.currentSlug,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LandingGenerationError || err instanceof DeepSeekError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI landing-page generation failed.' },
      { status: 502 },
    );
  }
}
