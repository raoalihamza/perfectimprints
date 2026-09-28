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
// POST { action: 'similar' } → { ok, generatedAt, model, ..., rows } the
//                               advisory "closest wording" figures (AUTO-119),
//                               compact (the panel expands them), or
//                               503 { ok: false, unavailable: true, error }.
//
// Closest wording (AUTO-119) is a SEPARATE action on purpose. The `pool`
// action never calls the embedding service and never reads its figures, so no
// similarity score can change a topic's state, and the list opens whether the
// embedding service is up or down. The panel asks for the figures after the
// list has loaded and shows them beside each topic; if they are unavailable
// it says so in one line and everything else works as before.
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
// Already written (AUTO-117): the drafts and posts that record the topic they
// were generated from are read LIVE on every request too (drafts included,
// uncached, lib/blog-automation/written-topics.ts), never from the cached
// snapshot, so a draft made a minute ago excludes its topic on the next call.
// If that read fails the route answers an error, not a list: a list shown
// without it would pass topics that already have a draft.
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
import { getCachedTopicPoolSnapshot, getCachedTopicSimilarity } from '@/lib/blog-automation/cached-topic-pool';
import { describePoolError } from '@/lib/blog-automation/build-topic-pool';
import { applyNegativeKeywords, applyWrittenTopics, countTopics } from '@/lib/blog-automation/topic-pool';
import { readWrittenTopicSources, WrittenTopicsReadError } from '@/lib/blog-automation/written-topics';

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
 *
 * Raised to 180 s by AUTO-119 for the `similar` action alone: the project's
 * embedding quota is 3,000 texts a minute and one build is about 3,100 texts,
 * so the batches go one at a time, measured at about 85 s (2026-09-28), with
 * a 150 s deadline of their own (SIMILARITY_DEADLINE_MS). `pool` and `refresh`
 * are unchanged and never run the embedding.
 */
export const maxDuration = 180;

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
  const action =
    body.action === 'refresh' ? 'refresh' : body.action === 'pool' ? 'pool' : body.action === 'similar' ? 'similar' : null;
  if (!action) {
    return NextResponse.json({ error: 'action must be "pool", "refresh" or "similar".' }, { status: 400 });
  }

  if (action === 'refresh') {
    // A hard expiry, not the stale-while-revalidate 'max' used elsewhere on
    // the site: the person pressing Refresh is waiting to see new data, and
    // 'max' would serve the old pool once more while rebuilding behind it.
    revalidateTag(BLOG_TOPICS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'similar') {
    // Advisory only (AUTO-119). Any failure here, including the pool snapshot
    // itself, answers "unavailable" and nothing else: the panel keeps working.
    try {
      const snapshot = await getCachedTopicPoolSnapshot();
      const figures = await getCachedTopicSimilarity(snapshot);
      return NextResponse.json({ ok: true, ...figures });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error('[blog-topics] closest wording unavailable:', raw);
      return NextResponse.json(
        {
          ok: false,
          unavailable: true,
          error: 'The closest-wording figures are not available right now.',
          hint: 'Everything else in this tab works as normal. They are tried again the next time the tab opens.',
        },
        { status: 503 },
      );
    }
  }

  try {
    const [snapshot, settings, written] = await Promise.all([
      getCachedTopicPoolSnapshot(),
      getSiteSettings(),
      readWrittenTopicSources(),
    ]);
    // Order: the guard (cached), then already written (AUTO-117, live), then
    // Patrick's blocks (AUTO-116: each entry carries its scope, so the objects
    // are passed, not just the terms). A block wins over everything.
    const topics = applyNegativeKeywords(
      applyWrittenTopics(snapshot.topics, written),
      settings.blogAutomation.negativeKeywords,
    );
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
      /** Drafts and posts that record a topic, checked live on this request. */
      writtenDocuments: written.length,
      topics,
    });
  } catch (err) {
    if (err instanceof WrittenTopicsReadError) {
      console.error('[blog-topics]', err.message);
      return NextResponse.json({ error: err.message, hint: err.hint }, { status: 502 });
    }
    const described = describePoolError(err);
    console.error('[blog-topics]', described.message);
    return NextResponse.json({ error: described.message, hint: described.hint }, { status: described.status });
  }
}
