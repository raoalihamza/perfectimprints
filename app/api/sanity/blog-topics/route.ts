// The blog opportunity pool for the Studio "Blog Topics" panel (AUTO-110,
// Stage 1 of the blog automation module). Read only: it calls Search Console
// and Sanity, writes nothing, and never runs on its own.
//
// POST { action: 'pool' }    → { ok, generatedAt, property, window, floor, band,
//                                threshold, publishedPosts, gsc, counts,
//                                negativeKeywords, topics[] }
// POST { action: 'refresh' } → { ok: true } after expiring the cached pool, so
//                               the panel's NEXT `pool` call rebuilds it from
//                               a fresh Search Console pull (one pull, not two).
//
// Auth (FIX-850): the same first-party Studio nonce guard as the nine
// generate-* routes, with the same handshake document and header, applied
// as the first statement of POST, ahead of body parsing, ahead of any call
// to Google. Rejections carry the helper's own status (401 / 403 / 500).
//
// Cache: the Search Console pull, the grouping and the guard are cached for
// 24 hours under BLOG_TOPICS_TAG (lib/blog-automation/cached-topic-pool.ts).
// Patrick's negative keywords are read on EVERY request through the
// SETTINGS_TAG-tagged getSiteSettings(), so a block written by the panel and
// busted by the globalSettings webhook branch takes effect without a refresh.
//
// GSC_SERVICE_ACCOUNT_JSON_B64 stays server-side; no response, log line or
// error built here can contain it (see lib/blog-automation/gsc-client.ts).
// nodejs + force-dynamic: it has no render path and cannot affect any page's
// staticness.

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { verifyStudioNonce } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';
import { BLOG_TOPICS_TAG } from '@/lib/sanity/cache-tags';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import { getCachedTopicPoolSnapshot } from '@/lib/blog-automation/cached-topic-pool';
import { describePoolError } from '@/lib/blog-automation/build-topic-pool';
import { applyNegativeKeywords, countTopics } from '@/lib/blog-automation/topic-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * A cold build is several paginated Search Console calls (AUTO-100 read
 * 28,564 query rows over two pages and about as many query x page rows) plus
 * one Sanity read and the in-process scoring of about 2,400 topics. The
 * AUTO-110 verification report records the measured wall-clock; 120 s is
 * several times that with the same reasoning the quote PDF route used for
 * 60: enough that a slow Google day still answers, not so wide that a hung
 * request bills for five minutes. A warm request is a cache read and answers
 * in well under a second.
 */
export const maxDuration = 120;

interface RequestBody {
  action?: string;
}

export async function POST(request: Request) {
  // FIX-850: first-party Studio session only. Rejects before any body parsing
  // or any call to Google.
  const auth = await verifyStudioNonce(request, {
    authDocId: GENERATE_AUTH_DOC_ID,
    headerName: GENERATE_NONCE_HEADER,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized.' }, { status: auth.status });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const action = body.action === 'refresh' ? 'refresh' : body.action === 'pool' ? 'pool' : null;
  if (!action) {
    return NextResponse.json({ error: 'action must be "pool" or "refresh".' }, { status: 400 });
  }

  if (action === 'refresh') {
    // A hard expiry, not the stale-while-revalidate 'max' used elsewhere on
    // the site: the person pressing Refresh is waiting to see new data, and
    // 'max' would serve the old pool once more while rebuilding behind it.
    revalidateTag(BLOG_TOPICS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true });
  }

  try {
    const [snapshot, settings] = await Promise.all([getCachedTopicPoolSnapshot(), getSiteSettings()]);
    const terms = settings.blogAutomation.negativeKeywords.map((k) => k.term);
    const topics = applyNegativeKeywords(snapshot.topics, terms);
    return NextResponse.json({
      ok: true,
      generatedAt: snapshot.generatedAt,
      property: snapshot.property,
      window: snapshot.window,
      floor: snapshot.floor,
      band: snapshot.band,
      threshold: snapshot.threshold,
      publishedPosts: snapshot.publishedPosts,
      gsc: snapshot.gsc,
      buildMs: snapshot.buildMs,
      counts: countTopics(topics),
      negativeKeywords: settings.blogAutomation.negativeKeywords,
      topics,
    });
  } catch (err) {
    const described = describePoolError(err);
    console.error('[blog-topics]', described.message);
    return NextResponse.json({ error: described.message, hint: described.hint }, { status: described.status });
  }
}
