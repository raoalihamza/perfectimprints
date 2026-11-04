// SEC-100: a live answer to "can this deployment read the private Sanity
// dataset, and is the dataset still refusing anonymous reads?"
//
// Called by the post-flip script (scripts/security/verify-site-whole.ts) on
// each host. Every page is served from cache once the dataset is private, so
// a cached page proves nothing about the token; this does, live.
//
// Answers only the shape below: two states and a sentence. No document field,
// no count of customer records, no token. Rate limited per IP (each call is two
// small Sanity reads). `/api` is disallowed in robots.txt and never in the
// sitemap. Status 200 when the token reads, 503 when it does not, so an uptime
// monitor pointed here alarms on exactly the failure that matters.

import { NextResponse } from 'next/server';
import { createRateLimiter, getClientIp } from '@/lib/api/rate-limit';
import { checkSanityReadHealth } from '@/lib/sanity/read-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = createRateLimiter({ max: 30, windowMs: 60 * 60 * 1000 });

export async function GET(request: Request) {
  if (limiter.isRateLimited(getClientIp(request))) {
    return NextResponse.json({ ok: false, error: 'Too many checks. Try again in an hour.' }, { status: 429 });
  }
  const health = await checkSanityReadHealth();
  return NextResponse.json(health, {
    status: health.readToken === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
