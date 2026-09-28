/**
 * The live read behind the guard's third rule (AUTO-117): every blog post,
 * DRAFTS INCLUDED, that records the topic it was generated from or the
 * keywords it was written for. SERVER ONLY (it carries the Sanity token), and
 * like build-topic-pool.ts it imports nothing from next/*, so the measuring
 * script runs the identical read under tsx.
 *
 * Why here and not inside the internal-links detector
 * (`loadLinkDocsForKind('blog')` in lib/ai/internal-links.ts):
 *
 *   - The detector's job is suggesting LINKS, and it reads published posts
 *     only on purpose. A draft read there would put unpublished drafts into
 *     every generated post's internal links, and a link to a draft 404s.
 *   - The detector's answer is baked into the 24-hour cached snapshot. This
 *     read must NOT be cached: a draft made a minute ago has to exclude its
 *     topic on the very next pool call, or a scheduler running inside that
 *     day writes the topic again. So it runs per request, next to the
 *     negative keywords, and is cheap enough to (one GROQ query, a few dozen
 *     documents, a few KB).
 *
 * Why its own client: drafts are not publicly readable, so the read needs
 * the server token, and the site's `cachedClient` is pinned to the
 * `published` perspective. This client is `raw` (drafts and published side by
 * side), non-CDN, and used for this one read. It is never imported by a render
 * path: its only callers are the force-dynamic /api/sanity/blog-topics route
 * and the read-only measuring script.
 *
 * It FAILS LOUDLY. A guard that cannot see the drafts would silently pass
 * every topic that already has one, which is exactly the fault AUTO-117
 * exists to remove, so the route answers an error instead of a list.
 */

import { createClient, type SanityClient } from '@sanity/client';

import {
  WRITTEN_TOPICS_QUERY,
  writtenTopicSources,
  type WrittenTopicDoc,
  type WrittenTopicSource,
} from './topic-pool';

export class WrittenTopicsReadError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = 'WrittenTopicsReadError';
    this.hint = hint;
  }
}

function draftsClient(): SanityClient {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !token) {
    throw new WrittenTopicsReadError(
      'The server cannot read blog drafts (SANITY_API_TOKEN or NEXT_PUBLIC_SANITY_PROJECT_ID is not set), so it cannot tell which topics already have a draft.',
      'Ali: set SANITY_API_TOKEN in this environment. The list is withheld rather than shown without that check.',
    );
  }
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', token, useCdn: false, perspective: 'raw' });
}

export interface ReadWrittenTopicsOptions {
  /** A client to read through (tests); default the token client above. */
  client?: Pick<SanityClient, 'fetch'>;
}

/** Every draft or post that covers a topic, read live. Throws `WrittenTopicsReadError`. */
export async function readWrittenTopicSources(opts: ReadWrittenTopicsOptions = {}): Promise<WrittenTopicSource[]> {
  const client = opts.client ?? draftsClient();
  let docs: WrittenTopicDoc[] | null;
  try {
    // `cache: 'no-store'`: inside Next this is never a data-cache entry, which
    // is the whole point; outside Next (the script) the option is ignored.
    docs = await client.fetch<WrittenTopicDoc[] | null>(WRITTEN_TOPICS_QUERY, {}, { cache: 'no-store' });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new WrittenTopicsReadError(
      `Could not read your blog drafts to check which topics already have one: ${raw}`,
      'Try again in a minute. The list is withheld rather than shown without that check.',
    );
  }
  return writtenTopicSources(docs ?? []);
}
