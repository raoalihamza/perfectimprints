/**
 * The run log and the slot claim (AUTO-208, Part 2). One Sanity document per
 * writing slot per UTC day, `blogAutomationRun.<day>.<slot>`, read only in
 * the Studio, holding what the firing did and what it cost. Client-agnostic
 * like lib/ai/daily-usage-cap.ts: the scheduler passes the server client, the
 * tests a fake with real conflict semantics. No next/*, no fs.
 *
 * THE CLAIM IS A `create` WITH A FIXED `_id`. Sanity refuses a `create` whose
 * id already exists, so whichever firing creates the document owns the slot,
 * and two firings delivered at once (Vercel's delivery can duplicate a run)
 * cannot both own it: the second's create fails and it reads the document
 * instead. That read decides what the second firing does:
 *   - `written` or `published`: the slot is done; decline.
 *   - `claimed` or `running` touched within RUN_STALE_MS: a live run; decline.
 *   - `claimed` or `running` older than that, or `failed`: take the claim
 *     over with `ifRevisionId` (the compare-and-set lib/quotes/numbering.ts
 *     and daily-usage-cap.ts use), so of two firings that both find a stale
 *     claim exactly one wins the takeover and the other sees a conflict.
 * The owner bumps `updatedAt` at every stage, so a slow but live run keeps its
 * claim and a dead one (the function killed at its maxDuration) is taken over
 * by the slot's second firing thirty minutes later: that is the retry.
 *
 * THE DAILY CAP is the number of slots (schedule.ts, BLOG_POSTS_PER_DAY): a
 * firing declines when the day already holds that many finished runs, before
 * it claims anything. A post Patrick writes by hand creates no run document
 * and so never eats a slot. The generated-image cap of 20 a day stays shared
 * with the Studio buttons (header-image-usage.ts) and is reserved inside the
 * image chain as before.
 *
 * The `_type` IS registered in sanity/schemas/index.ts, unlike the two usage
 * counters, because Patrick is meant to read it (the morning digest is the
 * same information by email); every field is read only there.
 */

import type { TitleShape } from './blog-shape';

export const RUN_LOG_TYPE = 'blogAutomationRun';

/** A claim untouched for this long is dead (the writer's maxDuration is 300 s). */
export const RUN_STALE_MS = 10 * 60 * 1000;

export type RunStatus = 'claimed' | 'running' | 'written' | 'published' | 'failed';

/** The stage a run is in, or failed at. */
export type RunStage = 'claim' | 'choose' | 'generate' | 'publish' | 'record';

export interface RunTopic {
  query: string;
  key: string;
  page?: string | null;
  /** Position in the usable queue the scheduler walked (1 = the head). */
  queuePosition?: number;
}

export interface RunCost {
  /** DeepSeek calls made (the post, plus a title shortening when needed). */
  deepseekCalls: number;
  deepseekUsd: number;
  imageUsd: number;
  totalUsd: number;
  /** Whether the figures are measured from reported tokens (image) or the documented estimate (DeepSeek). */
  basis: string;
}

export interface RunLogDocument {
  _id: string;
  _type: typeof RUN_LOG_TYPE;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  slot: string;
  status: RunStatus;
  stage: RunStage;
  /** 1 for the first owner, +1 per takeover. */
  attempts: number;
  claimedAt: string;
  updatedAt: string;
  finishedAt?: string;
  /** The status the claim was taken over from, when it was. */
  takenOverFrom?: RunStatus;
  /** The switches as read live at the start of this run. */
  switches?: { paused: boolean; publishMode: 'draft' | 'publish' };
  topic?: RunTopic;
  titleShape?: TitleShape;
  template?: 'list' | 'single';
  /** Without the `drafts.` prefix. */
  documentId?: string;
  draftId?: string;
  publishedId?: string;
  title?: string;
  slug?: string;
  words?: number;
  /** Product rows in the body and products across them. */
  strips?: { rows: number; products: number };
  placedLinks?: number;
  pictureSource?: 'ai' | 'library' | 'product' | 'none';
  pictureNote?: string;
  /** The recent product keys and shape the choice was spaced against, and the candidates it chose among. */
  choice?: { recentKeys: string[]; recentShape: string | null; candidates: string[]; shape: string | null };
  timings?: { chooseMs?: number; generateMs?: number; publishMs?: number; totalMs?: number };
  cost?: RunCost;
  error?: { stage: RunStage; message: string };
  /** Anything worth a sentence in the digest (a title shortened, a picture refused and retried, a field left empty). */
  notes?: string[];
}

/** What the module needs from a Sanity client; the server client and the test fake both provide it. */
export interface RunLogClient {
  create(doc: RunLogDocument): Promise<unknown>;
  fetch<T = unknown>(query: string, params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<T>;
  patch(id: string): {
    set(attrs: Record<string, unknown>): { commit(): Promise<unknown> };
    ifRevisionId(rev: string): { set(attrs: Record<string, unknown>): { commit(): Promise<unknown> } };
  };
}

/** The UTC calendar day a moment falls in, `YYYY-MM-DD`. */
export function runDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function runLogId(day: string, slot: string): string {
  return `${RUN_LOG_TYPE}.${day}.${slot}`;
}

export type ClaimResult =
  | { ok: true; id: string; attempt: number; takenOverFrom: RunStatus | null }
  | { ok: false; id: string; reason: 'done' | 'in-progress' | 'lost-race' | 'unavailable'; existingStatus: RunStatus | null; message: string };

const EXISTING_QUERY = `*[_id == $id][0]{ _rev, status, attempts, updatedAt, claimedAt }`;

interface ExistingClaim {
  _rev?: string;
  status?: RunStatus;
  attempts?: number;
  updatedAt?: string;
  claimedAt?: string;
}

function ms(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Claim the slot for `day`. Exactly one caller can own it at a time.
 */
export async function claimRunSlot(
  client: RunLogClient,
  args: { day: string; slot: string; now: Date; switches?: RunLogDocument['switches'] },
): Promise<ClaimResult> {
  const id = runLogId(args.day, args.slot);
  const nowIso = args.now.toISOString();
  const fresh: RunLogDocument = {
    _id: id,
    _type: RUN_LOG_TYPE,
    day: args.day,
    slot: args.slot,
    status: 'claimed',
    stage: 'claim',
    attempts: 1,
    claimedAt: nowIso,
    updatedAt: nowIso,
    ...(args.switches ? { switches: args.switches } : {}),
  };
  try {
    await client.create(fresh);
    return { ok: true, id, attempt: 1, takenOverFrom: null };
  } catch {
    // The document exists (or the create failed for another reason, which
    // the read below tells apart): read it and decide.
  }
  let existing: ExistingClaim | null;
  try {
    existing = await client.fetch<ExistingClaim | null>(EXISTING_QUERY, { id }, { cache: 'no-store' });
  } catch (err) {
    return { ok: false, id, reason: 'unavailable', existingStatus: null, message: `The run log could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!existing?._rev) {
    return { ok: false, id, reason: 'unavailable', existingStatus: null, message: 'The claim could not be created and no existing run was found.' };
  }
  const status = existing.status ?? 'claimed';
  if (status === 'written' || status === 'published') {
    return { ok: false, id, reason: 'done', existingStatus: status, message: `Slot ${args.slot} on ${args.day} already produced a post (${status}).` };
  }
  const touched = Math.max(ms(existing.updatedAt), ms(existing.claimedAt));
  const stale = args.now.getTime() - touched >= RUN_STALE_MS;
  if ((status === 'claimed' || status === 'running') && !stale) {
    return { ok: false, id, reason: 'in-progress', existingStatus: status, message: `Slot ${args.slot} on ${args.day} is being written by another run (touched ${Math.round((args.now.getTime() - touched) / 1000)} s ago).` };
  }
  const attempts = (typeof existing.attempts === 'number' && existing.attempts > 0 ? Math.floor(existing.attempts) : 1) + 1;
  try {
    await client
      .patch(id)
      .ifRevisionId(existing._rev)
      .set({
        status: 'claimed',
        stage: 'claim',
        attempts,
        takenOverFrom: status,
        claimedAt: nowIso,
        updatedAt: nowIso,
        error: null,
        ...(args.switches ? { switches: args.switches } : {}),
      })
      .commit();
    return { ok: true, id, attempt: attempts, takenOverFrom: status };
  } catch {
    return { ok: false, id, reason: 'lost-race', existingStatus: status, message: `Another run took slot ${args.slot} on ${args.day} over first.` };
  }
}

/** Record progress on a run this caller owns. Never throws: a run log that cannot be written must not stop a post. */
export async function updateRun(client: RunLogClient, id: string, attrs: Partial<RunLogDocument> & { now: Date }): Promise<boolean> {
  const { now, ...rest } = attrs;
  try {
    await client.patch(id).set({ ...rest, updatedAt: now.toISOString() }).commit();
    return true;
  } catch (err) {
    console.error(`[run-log] could not update ${id}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** How many runs of the day finished with a post. */
export async function countFinishedRuns(client: RunLogClient, day: string): Promise<number> {
  const n = await client.fetch<number | null>(
    `count(*[_type == $type && day == $day && status in ["written", "published"]])`,
    { type: RUN_LOG_TYPE, day },
    { cache: 'no-store' },
  );
  return typeof n === 'number' ? n : 0;
}

/** Every run of a day, oldest first (the digest). */
export async function readRunsForDay(client: RunLogClient, day: string): Promise<RunLogDocument[]> {
  const docs = await client.fetch<RunLogDocument[] | null>(
    `*[_type == $type && day == $day] | order(claimedAt asc)`,
    { type: RUN_LOG_TYPE, day },
    { cache: 'no-store' },
  );
  return docs ?? [];
}

/** The shape of the most recently finished run, for the look-ahead's first pick. */
export async function readLastRunShape(client: RunLogClient): Promise<TitleShape | null> {
  const shape = await client.fetch<string | null>(
    `*[_type == $type && status in ["written", "published"] && defined(titleShape)] | order(finishedAt desc)[0].titleShape`,
    { type: RUN_LOG_TYPE },
    { cache: 'no-store' },
  );
  return shape === 'list' || shape === 'guide' || shape === 'question' || shape === 'howto' || shape === 'comparison' ? shape : null;
}
