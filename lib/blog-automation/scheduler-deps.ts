/**
 * The REAL dependencies of one scheduled post (AUTO-208): what the cron
 * route hands `runScheduledPost`. Everything heavy is loaded lazily inside a
 * function (the resolve-draft-fields pattern): the product matcher carries
 * the `server-only` marker and `cached-topic-pool` imports next/cache, so
 * this module stays importable by vitest and by the proof harness under
 * tsx, which overrides the pool read (next/cache has no runtime there).
 *
 * The reads, and which are live:
 *   - the switches and blocks: LIVE, one uncached read (scheduler-settings.ts);
 *   - the written topics: LIVE, raw perspective (written-topics.ts, AUTO-117);
 *   - the recent posts' product keys: LIVE, the last PRODUCT_SPACING_GAP posts
 *     generated from a topic, drafts included, newest first, de-duplicated by
 *     document, then oldest first as the spacing rule wants them;
 *   - the shape of the last finished run: the run log;
 *   - the pool: the 24-hour cached snapshot the Blog Topics tab reads
 *     (cached-topic-pool.ts). Search Console updates once a day, so a cached
 *     pool is right; the live reads above are what change hour to hour.
 */
import type { SanityClient } from '@sanity/client';
import { serverSanityClient } from '../sanity/studio-nonce-auth';
import type { CreatedBlogDraft } from './create-blog-draft';
import { chooseNextTopic, type ChooseTopicDeps, type RecentPosts } from './choose-topic';
import { readLastRunShape } from './run-log';
import { readSchedulerSettings, type SchedulerSettings } from './scheduler-settings';
import type { SchedulerDeps } from './scheduler';
import { readWrittenTopicSources } from './written-topics';
import { PRODUCT_SPACING_GAP, productKeyOf } from './topic-spacing';
import type { Topic } from './topic-pool';

export class SchedulerClientError extends Error {
  constructor() {
    super('The server cannot write (SANITY_API_TOKEN or the Sanity project id is not set). Ali: set it in the production Vercel project.');
    this.name = 'SchedulerClientError';
  }
}

/** The recent generated posts, newest first, each document once. */
export const RECENT_POSTS_QUERY = `*[_type == "blogPost" && !(_id in path("versions.**")) && defined(sourceTopic.query)] | order(sourceTopic.recordedAt desc)[0...40]{ _id, "query": sourceTopic.query, "recordedAt": sourceTopic.recordedAt }`;

/** Product keys of the last `gap` generated posts, oldest first. */
export async function readRecentProductKeys(
  client: Pick<SanityClient, 'fetch'>,
  categoryFor: (query: string) => Promise<string | null>,
  gap: number = PRODUCT_SPACING_GAP,
): Promise<(string | null)[]> {
  const rows = (await client.fetch<{ _id: string; query: string; recordedAt?: string }[] | null>(RECENT_POSTS_QUERY, {}, { cache: 'no-store' })) ?? [];
  const seen = new Set<string>();
  const newestFirst: string[] = [];
  for (const r of rows) {
    const base = r._id.replace(/^drafts\./, '');
    if (seen.has(base) || typeof r.query !== 'string' || !r.query.trim()) continue;
    seen.add(base);
    newestFirst.push(r.query.trim());
    if (newestFirst.length >= gap) break;
  }
  const keys: (string | null)[] = [];
  for (const q of newestFirst.reverse()) keys.push(productKeyOf(q, await categoryFor(q)));
  return keys;
}

/** Publish a created draft: one transaction, the published copy with the publish date stamped, the draft removed. */
export async function publishCreatedDraft(client: SanityClient, created: CreatedBlogDraft, now: Date): Promise<{ publishedId: string }> {
  const publishedId = created.documentId;
  const published = { ...created.document, _id: publishedId, publishDate: now.toISOString() };
  await client.transaction().createOrReplace(published).delete(created.draftId).commit();
  return { publishedId };
}

export interface SchedulerDepsOverrides {
  /** The pool read (the harness builds it directly; the route reads the 24-hour cache). */
  poolTopics?: () => Promise<readonly Topic[]>;
  client?: SanityClient;
  now?: () => Date;
  log?: (line: string) => void;
}

/** The real dependencies. Throws `SchedulerClientError` when the server cannot write. */
export async function defaultSchedulerDeps(overrides: SchedulerDepsOverrides = {}): Promise<SchedulerDeps> {
  const client = overrides.client ?? serverSanityClient();
  if (!client) throw new SchedulerClientError();
  const now = overrides.now ?? (() => new Date());
  const log = overrides.log ?? ((line: string) => console.info(line));

  const matcher = await import('../ai/related-products');
  const generator = await import('./generate-blog-post');
  const draftModule = await import('./create-blog-draft');
  const categoryFor = async (query: string): Promise<string | null> => {
    try {
      return await matcher.resolveCategoryForKeywords(query);
    } catch {
      return null;
    }
  };
  const poolTopics =
    overrides.poolTopics ??
    (async () => {
      const { getCachedTopicPoolSnapshot } = await import('./cached-topic-pool');
      return (await getCachedTopicPoolSnapshot()).topics;
    });

  const chooseTopic = async (settings: SchedulerSettings) => {
    const deps: ChooseTopicDeps = {
      poolTopics,
      writtenSources: () => readWrittenTopicSources({ client }),
      blockRules: async () => settings.negativeKeywords,
      categoryFor,
      depthFor: (query) => generator.measureDepthForTopic(query),
      recentPosts: async (): Promise<RecentPosts> => ({
        keys: await readRecentProductKeys(client, categoryFor),
        shape: await readLastRunShape(client),
      }),
    };
    return chooseNextTopic(deps);
  };

  return {
    now,
    runLog: client,
    readSettings: () => readSchedulerSettings(client),
    chooseTopic,
    createDraft: (chosen) =>
      draftModule.createBlogDraftFromTopic({
        topic: { key: chosen.topic.key, query: chosen.topic.query, variants: chosen.topic.variants, spacingGroups: chosen.topic.spacingGroups, page: chosen.topic.page },
        template: 'auto',
        depth: chosen.depth,
        client,
        now,
      }),
    publishDraft: (created, at) => publishCreatedDraft(client, created, at),
    log,
  };
}
