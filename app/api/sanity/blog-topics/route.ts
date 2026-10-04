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
// POST { action: 'generate', topic: { key, query, variants, spacingGroups? },
//        template, wordCount?, allowDuplicate? }
//                            → { ok, documentId, draftId, title, slug,
//                                variants, placedLinks[], suggestedLinks,
//                                words } after writing ONE blog DRAFT, or
//                               409 { error, hint, match } when the topic
//                               already has a draft or a post (AUTO-201).
//
// Generate (AUTO-201, the first Stage 2 ticket): the whole job from topic to
// saved draft runs on the server, in lib/blog-automation/create-blog-draft.ts
// `createBlogDraftFromTopic`, the ONE function the tab's button and the Stage
// 2 scheduler share. The tab sends the topic it displayed and gets back the
// draft's id; it writes nothing itself. The function reads the drafts live
// before the AI is called and again before the create unless
// `allowDuplicate` is set, which the tab sets only after Patrick confirmed
// "generate anyway". This is the ONLY action here that writes to Sanity, and
// it writes exactly one document, last.
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
// The wider window (AUTO-121): the pool now also holds the searches in the
// band over the last 16 months, and every topic carries both windows' figures
// and when it was last seen. The cached entry is kept under the data cache's
// 2 MB ceiling by construction (packSnapshot), and this route watches for the
// one failure that used to be silent: if two pool calls on one instance come
// back freshly built inside the cache lifetime with no Refresh between them,
// the cache is not storing, and the response says so (`cacheWarning`).
//
// Already written (AUTO-117): the drafts and posts that record the topic they
// were generated from are read LIVE on every request too (drafts included,
// uncached, lib/blog-automation/written-topics.ts), never from the cached
// snapshot, so a draft made a minute ago excludes its topic on the next call.
// If that read fails the route answers an error, not a list: a list shown
// without it would pass topics that already have a draft.
//
// Search volume (AUTO-123): the `pool` answer also carries the committed
// search-volume file (data/blog-automation/search-volumes.json, written by
// Ali's occasional script run through Patrick's DataForSEO account, from
// Ali's machine; nothing on the server calls any keyword API and no
// keyword-API credential is set in Vercel). It is read from disk per request, never
// cached in the snapshot, and no state, rule, count or order reads it: it is
// a column, as the closest-wording figures are. Missing file: null, and the
// panel works exactly as before.
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
import { cacheWarningFor, noteRefreshRequested } from '@/lib/blog-automation/cache-watch';
import { readSearchVolumeFile } from '@/lib/blog-automation/search-volume-file';
import { queryTopicKey, SOURCE_TOPIC_MAX_VARIANTS } from '@/lib/blog-automation/topic-pool';
import { DeepSeekError } from '@/lib/ai/deepseek';
import { BlogGenerationError } from '@/lib/blog-automation/generate-blog-post';
import {
  createBlogDraftFromTopic,
  DraftClientError,
  DraftWriteError,
  TopicAlreadyWrittenError,
} from '@/lib/blog-automation/create-blog-draft';
import type { SourceTopicInput } from '@/lib/blog-automation/draft-document';
import { headerImageSummary } from '@/lib/blog-automation/header-image';

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
 *
 * AUTO-121: a cold `pool` build now pulls five query windows in parallel plus
 * the regex-filtered ranking pages, measured 57.6 to 93.2 s across three runs
 * (2026-10-01), and the capped embedding 110 to 114 s; both inside 180.
 *
 * Raised to 240 s by AUTO-201 for the `generate` action alone: the DeepSeek
 * call ends itself at BLOG_AI_TIMEOUT_MS (150 s, lib/blog-automation/
 * generate-blog-post.ts), the two live drafts reads are about a second each,
 * the strips and links a few seconds, the create under a second; 240 leaves
 * room to answer with the timeout message rather than be killed. Still
 * inside the 300 s ceiling of every Vercel plan. `pool`, `refresh` and
 * `similar` are unchanged and never run the AI.
 */
export const maxDuration = 240;

interface RequestBody {
  action?: string;
  topic?: { key?: unknown; query?: unknown; variants?: unknown; spacingGroups?: unknown; page?: unknown };
  template?: unknown;
  wordCount?: unknown;
  allowDuplicate?: unknown;
}

const MAX_QUERY_CHARS = 200;
/** A ranking page is a URL or a path (AUTO-202); longer than this is not one. */
const MAX_PAGE_CHARS = 500;

/** The ranking page as the tab displayed it: a string of sane length, else null (the field resolver reads the root out of it, or nothing). */
function readPage(raw: unknown): string | null {
  const page = typeof raw === 'string' ? raw.trim() : '';
  return page && page.length <= MAX_PAGE_CHARS ? page : null;
}

/**
 * The topic as the tab displayed it, checked field by field: the search is
 * required, the key is recomputed when missing (the one grouping rule,
 * `queryTopicKey`), the variants and merged spellings are kept only as
 * strings and capped. Null when there is no usable search.
 */
function readTopic(raw: RequestBody['topic']): SourceTopicInput | null {
  const query = typeof raw?.query === 'string' ? raw.query.trim().replace(/\s+/g, ' ') : '';
  if (!query || query.length > MAX_QUERY_CHARS) return null;
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_QUERY_CHARS).map((v) => v.trim())
      : [];
  const variants = strings(raw?.variants).slice(0, SOURCE_TOPIC_MAX_VARIANTS);
  const spacingGroups = Array.isArray(raw?.spacingGroups)
    ? raw.spacingGroups
        .filter((g): g is { query: string; key?: unknown; page?: unknown } => !!g && typeof g === 'object' && typeof (g as { query?: unknown }).query === 'string')
        .map((g) => ({
          query: g.query.trim(),
          key: typeof g.key === 'string' && g.key.trim() ? g.key.trim() : queryTopicKey(g.query),
          page: readPage(g.page),
        }))
        .filter((g) => g.query.length > 0 && g.query.length <= MAX_QUERY_CHARS)
        .slice(0, SOURCE_TOPIC_MAX_VARIANTS)
    : [];
  const key = typeof raw?.key === 'string' && raw.key.trim() ? raw.key.trim() : queryTopicKey(query);
  return { key, query, variants: variants.length > 0 ? variants : [query], spacingGroups, page: readPage(raw?.page) };
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
    body.action === 'refresh'
      ? 'refresh'
      : body.action === 'pool'
        ? 'pool'
        : body.action === 'similar'
          ? 'similar'
          : body.action === 'generate'
            ? 'generate'
            : null;
  if (!action) {
    return NextResponse.json({ error: 'action must be "pool", "refresh", "similar" or "generate".' }, { status: 400 });
  }

  if (action === 'generate') {
    // AUTO-201: topic to saved draft, in the one shared function. The tab
    // has already asked Patrick about an excluded or already-written topic;
    // `allowDuplicate` carries his answer and nothing else skips the check.
    const topic = readTopic(body.topic);
    if (!topic) {
      return NextResponse.json({ error: 'A topic with a search term is required.' }, { status: 400 });
    }
    const template = body.template === 'single' ? 'single' : 'list';
    const wordCount = typeof body.wordCount === 'number' && Number.isFinite(body.wordCount) ? body.wordCount : undefined;
    try {
      const created = await createBlogDraftFromTopic({
        topic,
        template,
        wordCount,
        allowDuplicate: body.allowDuplicate === true,
      });
      return NextResponse.json({
        ok: true,
        documentId: created.documentId,
        draftId: created.draftId,
        title: created.title,
        slug: created.slug,
        variants: created.variants,
        placedLinks: created.placedLinks,
        suggestedLinks: created.suggestedLinks,
        words: created.words,
        // AUTO-202: what was filled beside the body, so the tab can say so.
        headerImage: {
          kind: created.headerImage.kind,
          source: created.headerImage.kind === 'none' ? null : created.headerImage.source,
          summary: headerImageSummary(created.headerImage),
        },
        fields: {
          author: Boolean(created.fields.authorId),
          categories: created.fields.categoryIds.length,
          relatedCategorySlugs: created.fields.relatedCategorySlugs,
          notes: created.fields.notes,
        },
      });
    } catch (err) {
      if (err instanceof TopicAlreadyWrittenError) {
        return NextResponse.json(
          {
            error: err.message,
            hint: err.aiSpent
              ? 'Open that draft instead. To write a second post on the same topic anyway, press Generate draft again and confirm.'
              : 'Open that draft instead, or press Generate draft again and confirm to write another.',
            match: err.match,
            aiSpent: err.aiSpent,
          },
          { status: err.status },
        );
      }
      if (err instanceof WrittenTopicsReadError) {
        console.error('[blog-topics] generate:', err.message);
        return NextResponse.json({ error: `${err.message} Nothing was generated.`, hint: err.hint }, { status: 502 });
      }
      if (
        err instanceof DraftClientError ||
        err instanceof DraftWriteError ||
        err instanceof BlogGenerationError ||
        err instanceof DeepSeekError
      ) {
        console.error('[blog-topics] generate:', err.message);
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      const raw = err instanceof Error ? err.message : String(err);
      console.error('[blog-topics] generate:', raw);
      return NextResponse.json({ error: `The draft could not be generated: ${raw}. Nothing was created.` }, { status: 502 });
    }
  }

  if (action === 'refresh') {
    // A hard expiry, not the stale-while-revalidate 'max' used elsewhere on
    // the site: the person pressing Refresh is waiting to see new data, and
    // 'max' would serve the old pool once more while rebuilding behind it.
    revalidateTag(BLOG_TOPICS_TAG, { expire: 0 });
    noteRefreshRequested();
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
    const cacheWarning = cacheWarningFor(snapshot);
    if (cacheWarning) console.error('[blog-topics]', cacheWarning);
    if (snapshot.omittedOlderTopics > 0) {
      console.error(`[blog-topics] ${snapshot.omittedOlderTopics} older topics were left out of the cached list to keep it under the data cache ceiling (${snapshot.cacheBytes} bytes stored).`);
    }
    return NextResponse.json({
      ok: true,
      generatedAt: snapshot.generatedAt,
      property: snapshot.property,
      window: snapshot.window,
      longWindow: snapshot.longWindow,
      floor: snapshot.floor,
      band: snapshot.band,
      threshold: snapshot.threshold,
      publishedPosts: snapshot.publishedPosts,
      gsc: snapshot.gsc,
      buildMs: snapshot.buildMs,
      /** AUTO-121: the stored entry's size, what was trimmed to fit, and whether the cache is being kept. */
      cacheBytes: snapshot.cacheBytes,
      omittedOlderTopics: snapshot.omittedOlderTopics,
      cacheWarning,
      counts: countTopics(topics),
      negativeKeywords: settings.blogAutomation.negativeKeywords,
      /** Drafts and posts that record a topic, checked live on this request. */
      writtenDocuments: written.length,
      /**
       * AUTO-123: the committed search-volume file, read from disk on this
       * request and NOT part of the cached snapshot (it comes from a file in
       * the deployment, never from an API; a deploy is what changes it). Null
       * when the file is missing or unreadable; the panel then shows "not
       * looked up" on every row and nothing else changes. Nothing reads it
       * before this line, so no state above depends on it.
       */
      searchVolumes: readSearchVolumeFile(),
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
