// DeepSeek generate-blog route for the Sanity "Generate Blog with AI" and
// "Regenerate Blog with AI" document actions (P2-AI-002, tightened in
// P2-AI-002b, dials in FIX-900). The blog-side consumer of the shared AI
// engine (P2-AI-001):
//
// POST { title, template, keywords[], categorySlug?, currentSlug?, wordCount? }
//   → { title, metaTitle, metaDescription, excerpt, body, suggestedLinks[], placedLinks[] }
//
// AUTO-201: the generation itself (DeepSeek, the per-strip product matching,
// the internal links found and PLACED, the Portable Text body) lives in
// lib/blog-automation/generate-blog-post.ts, `generateBlogPost`, which has
// exactly two callers: this route, and `createBlogDraftFromTopic` (the Blog
// Topics tab's Generate draft, and the Stage 2 scheduler). This file keeps
// only the Studio nonce guard, the body parsing and the error mapping, so
// the two actions behave exactly as before: they patch the DRAFT Patrick is
// editing for him to review. Never publishes.
//
// DEEPSEEK_API_KEY stays server-side. The generator reads products.json from
// disk, so this route must NEVER be statically evaluated or moved to the Edge
// runtime; runtime/dynamic exports below mirror the generate-content route.

import { NextResponse } from 'next/server';
import { verifyStudioNonce } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';
import { DeepSeekError } from '@/lib/ai/deepseek';
import { BlogGenerationError, generateBlogPost } from '@/lib/blog-automation/generate-blog-post';
import { templateChoiceOf } from '@/lib/blog-automation/blog-shape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * AUTO-201: explicit, where before it inherited the plan default (300 s on
 * Hobby and Pro alike). The DeepSeek call inside `generateBlogPost` ends
 * itself at BLOG_AI_TIMEOUT_MS (150 s); the strips and links after it are a
 * few seconds of disk and tag-cached reads. 180 leaves room to answer with
 * the timeout message instead of being killed mid-request.
 */
export const maxDuration = 180;

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
    return NextResponse.json({ error: 'A document title is required.' }, { status: 400 });
  }

  try {
    const post = await generateBlogPost({
      title,
      // AUTO-203: the document's Template field; 'list' / 'single' force the body, anything else lets the topic choose.
      template: templateChoiceOf(body.template),
      keywords: Array.isArray(body.keywords) ? body.keywords.map((k) => `${k}`) : [],
      categorySlug: body.categorySlug,
      currentSlug: body.currentSlug,
      wordCount: body.wordCount,
    });
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof DeepSeekError || err instanceof BlogGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI blog generation failed.' },
      { status: 502 },
    );
  }
}
