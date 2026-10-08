/**
 * Topic to saved draft, in one server-side function (AUTO-201, the first
 * build ticket of Stage 2). This is the whole job the Blog Topics tab used
 * to do half in the browser: call the AI, build the body, resolve the
 * strips, place the links, create the draft, record the topic on it.
 *
 * TWO CALLERS, ONE FUNCTION:
 *   - the `generate` action of app/api/sanity/blog-topics/route.ts, which
 *     the tab's Generate draft button calls (the tab no longer creates
 *     anything itself; lib/blog-automation/generation-path.test.ts fails if
 *     it ever does again); and
 *   - the Stage 2 scheduler, next ticket, which will call this directly.
 *
 * What it guarantees:
 *   - Nothing half made. The draft is ONE `create`, performed last, with
 *     every field in it; before it there is nothing to clean up, and after
 *     it there is nothing left to do. The AI answering and the write failing
 *     leaves no document (the spend is lost, about half a cent, and the error
 *     says so); the write succeeding and the response being lost leaves a
 *     complete draft that the guard sees on the next pool call (AUTO-117).
 *   - Not written twice. Unless `allowDuplicate` is set (the tab passes it
 *     only after Patrick has confirmed "generate anyway"), the drafts and
 *     posts that record a topic are read LIVE before the AI is called (so a
 *     taken topic costs nothing) and again just before the create (a draft
 *     made during the one-to-two-minute wait, by another tab or another
 *     run, stops this one). A failed read stops the generation: a check
 *     that could not look is not a check. Two runs that both read before
 *     either creates can still both create; the compare-and-set claim that
 *     closes that is the scheduler ticket's (AUTO-200 2.4).
 *   - The write token. The draft is written with the server's
 *     SANITY_API_TOKEN through `serverSanityClient()` (raw perspective, the
 *     same client the nonce guard reads with), so the browser never holds a
 *     token and a scheduler needs no cookie, no nonce and no Origin. The
 *     mutation is attributed to the token's user, not to Patrick; the
 *     draft's `sourceTopic.recordedAt` says when it was made.
 *
 * SERVER ONLY. Imports nothing from next/*, so a script can run it under
 * tsx; the only I/O is the generator's (DeepSeek, disk, Sanity reads) and
 * the one create.
 */
import type { SanityClient } from '@sanity/client';
import { serverSanityClient } from '../sanity/studio-nonce-auth';
import { slugifyTitle } from '../blog/slugify-title';
import { generateBlogPost, type GeneratedBlogPost } from './generate-blog-post';
import { findWrittenTopic, writtenSentence, type WrittenTopicMatch } from './topic-pool';
import { readWrittenTopicSources } from './written-topics';
import {
  buildBlogDraftDocument,
  newDraftDocumentId,
  topicDraftTitle,
  type BlogDraftDocument,
  type SourceTopicInput,
} from './draft-document';
import type { TemplateChoice } from './blog-shape';
import { defaultDraftFieldsDeps, resolveDraftFields, type DraftFieldsDeps, type ResolvedDraftFields } from './resolve-draft-fields';
import type { HeaderImageOutcome } from './header-image';

export const DEFAULT_DRAFT_WORD_COUNT = 1500;

/** The topic already has a draft or a post; nothing was created. */
export class TopicAlreadyWrittenError extends Error {
  readonly status = 409;
  readonly match: WrittenTopicMatch;
  /** True when the AI had already answered when the second check found it: the call was spent. */
  readonly aiSpent: boolean;
  constructor(match: WrittenTopicMatch, aiSpent: boolean) {
    super(
      `${writtenSentence(match)}${aiSpent ? ' A draft from it appeared while this one was being written, so this one was not saved.' : ''} Nothing was created.`,
    );
    this.name = 'TopicAlreadyWrittenError';
    this.match = match;
    this.aiSpent = aiSpent;
  }
}

/** The post was written and the one create failed: nothing exists, the spend is lost. */
export class DraftWriteError extends Error {
  readonly status = 502;
  constructor(cause: unknown) {
    super(
      `The post was written but the draft could not be saved (${cause instanceof Error ? cause.message : String(cause)}). Nothing was created. Try again.`,
    );
    this.name = 'DraftWriteError';
  }
}

/** The server cannot write: no token or project id in this environment. */
export class DraftClientError extends Error {
  readonly status = 500;
  constructor() {
    super('The server cannot save a draft (SANITY_API_TOKEN or the Sanity project id is not set). Nothing was created. Ali: set SANITY_API_TOKEN in this environment.');
    this.name = 'DraftClientError';
  }
}

/**
 * What the function needs from a Sanity client: a create, and (optionally) a
 * delete, used only to remove a picture already uploaded for a draft that a
 * duplicate check then refused. `serverSanityClient()` satisfies both.
 */
export interface DraftWriter {
  create(doc: BlogDraftDocument): Promise<unknown>;
  delete?(id: string): Promise<unknown>;
}

export interface CreateBlogDraftOptions {
  topic: SourceTopicInput;
  /** 'auto' (the panel's default since AUTO-203) lets the topic choose the shape; 'list' / 'single' force the body template. */
  template: TemplateChoice;
  /** Default 1500, the panel's value. */
  wordCount?: number;
  /** Skip both live checks: the caller has already asked Patrick. Default false. */
  allowDuplicate?: boolean;
  /** The write client (tests pass a fake); default `serverSanityClient()`. */
  client?: DraftWriter | null;
  /** The clock (tests pass a fixed one). */
  now?: () => Date;
  /** AUTO-202: the reads and effects behind the four fields (tests pass fakes); default the real ones over the write client. */
  fieldsDeps?: DraftFieldsDeps;
}

export interface CreatedBlogDraft {
  /** The id without the `drafts.` prefix, for `navigateIntent('edit', { id })`. */
  documentId: string;
  draftId: string;
  title: string;
  slug: string;
  /** The searches the record names, for the panel's local already-written list. */
  variants: string[];
  placedLinks: GeneratedBlogPost['placedLinks'];
  suggestedLinks: GeneratedBlogPost['suggestedLinks'];
  words: number;
  /** The document exactly as written. */
  document: BlogDraftDocument;
  /** AUTO-202: what was filled beside the body, and what could not be and why. */
  fields: Pick<ResolvedDraftFields, 'authorId' | 'categoryIds' | 'relatedCategorySlugs' | 'notes'>;
  headerImage: HeaderImageOutcome;
}

/** Remove a picture the chain uploaded for a draft that is not going to be created. Never throws. */
async function discardGeneratedPicture(client: DraftWriter, outcome: HeaderImageOutcome): Promise<void> {
  if (outcome.kind !== 'asset' || outcome.source !== 'ai' || typeof client.delete !== 'function') return;
  try {
    await client.delete(outcome.image.asset._ref);
  } catch (err) {
    console.error(`[create-blog-draft] could not remove the unused picture ${outcome.image.asset._ref}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** True when the writer is a full Sanity client (fetch + assets), not a test fake with only the create. */
function isFullClient(client: DraftWriter): client is DraftWriter & SanityClient {
  const c = client as Partial<SanityClient>;
  return typeof c.fetch === 'function' && typeof c.assets?.upload === 'function';
}

/**
 * Generate a post for a topic and save it as a NEW draft. Throws
 * `TopicAlreadyWrittenError` (409), `DraftClientError` (500),
 * `DraftWriteError` (502), `BlogGenerationError` (502 / 400) or
 * `DeepSeekError` (502 / 504 / 500); in every case nothing was created.
 */
export async function createBlogDraftFromTopic(opts: CreateBlogDraftOptions): Promise<CreatedBlogDraft> {
  const client = opts.client === undefined ? serverSanityClient() : opts.client;
  if (!client) throw new DraftClientError();
  const now = opts.now ?? (() => new Date());
  const wordCount = opts.wordCount ?? DEFAULT_DRAFT_WORD_COUNT;

  // 1) The topic must not already have a draft or a post (live, drafts included).
  if (!opts.allowDuplicate) {
    const before = findWrittenTopic(opts.topic, await readWrittenTopicSources());
    if (before) throw new TopicAlreadyWrittenError(before, false);
  }

  // 2) The post: AI, strips, links, body. Nothing exists yet if this throws.
  const generated = await generateBlogPost({
    title: topicDraftTitle(opts.topic.query),
    template: opts.template,
    keywords: [opts.topic.query],
    wordCount,
  });

  // 3) The fields beside the body (AUTO-202): author, categories, related
  //    category slugs and the header image. The resolver never throws; a
  //    field it cannot determine is left empty and named in `notes`, so a
  //    failed picture or a missing author never stops the draft. The image
  //    is generated here, before the one write below, so the draft is
  //    complete the moment it exists.
  let fields: ResolvedDraftFields;
  try {
    const fieldsDeps = opts.fieldsDeps ?? (await defaultDraftFieldsDeps(isFullClient(client) ? client : null));
    fields = await resolveDraftFields(
      {
        topic: opts.topic,
        title: generated.title,
        slug: slugifyTitle(generated.title.trim()) || 'blog-header',
        body: generated.body,
      },
      fieldsDeps,
    );
  } catch (err) {
    // The resolver never throws by contract; this is the belt, so that even a
    // failure to load its dependencies leaves the post with empty fields
    // rather than no draft.
    const why = `the fields beside the body could not be resolved: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[create-blog-draft] ${why}`);
    fields = { authorId: null, categoryIds: [], relatedCategorySlugs: [], headerImage: { kind: 'none', notes: [why] }, notes: [why] };
  }

  // 3b) A draft made during the wait stops this one before anything is
  //     written. JUST before the create, after the image (the review of
  //     AUTO-202's first cut: with the check before the image, the window in
  //     which two runs could both create was the whole image chain). A
  //     picture already uploaded for a draft that will not exist is removed
  //     again, best effort.
  if (!opts.allowDuplicate) {
    const after = findWrittenTopic(opts.topic, await readWrittenTopicSources());
    if (after) {
      await discardGeneratedPicture(client, fields.headerImage);
      throw new TopicAlreadyWrittenError(after, true);
    }
  }

  // 4) ONE create, last, with everything in it.
  const documentId = newDraftDocumentId();
  const document = buildBlogDraftDocument({
    documentId,
    generated,
    // The template the post was actually built with (AUTO-203: 'auto' is a
    // request, never a stored value), so Regenerate on the draft keeps its shape.
    template: generated.template,
    wordCount,
    topic: opts.topic,
    recordedAt: now().toISOString(),
    fields,
  });
  try {
    await client.create(document);
  } catch (err) {
    throw new DraftWriteError(err);
  }

  return {
    documentId,
    draftId: document._id,
    title: document.title,
    slug: document.slug.current,
    variants: document.sourceTopic.variants,
    placedLinks: generated.placedLinks,
    suggestedLinks: generated.suggestedLinks,
    words: generated.words,
    document,
    fields: {
      authorId: fields.authorId,
      categoryIds: fields.categoryIds,
      relatedCategorySlugs: fields.relatedCategorySlugs,
      notes: fields.notes,
    },
    headerImage: fields.headerImage,
  };
}
