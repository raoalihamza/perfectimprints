/**
 * ONE scheduled post, end to end (AUTO-208): the thing a cron firing does.
 * Read the switches live, respect the daily cap, claim the slot, choose the
 * topic, create the draft through the ONE generation function
 * (createBlogDraftFromTopic, AUTO-201), publish it when Patrick's switch
 * says so, record every stage on the run log. Every effect is injected
 * (`SchedulerDeps`), so vitest drives the real orchestration with fakes and
 * the cron route passes the real ones (`defaultSchedulerDeps`, which loads
 * the server-only modules lazily, the resolve-draft-fields pattern).
 *
 * THE ORDER, and why each step is where it is:
 *   1. The switches, LIVE (scheduler-settings.ts). Paused means nothing
 *      happens: no claim, no document, no call. A read that fails also means
 *      nothing happens, because a scheduler that cannot see its own off
 *      switch must not run.
 *   2. The daily cap: as many finished runs today as there are slots means
 *      decline before claiming (run-log.ts).
 *   3. The claim (a `create` with a fixed id; the second firing of a slot
 *      declines or takes over, run-log.ts). From here on the run document
 *      exists and every outcome is written to it.
 *   4. The topic (choose-topic.ts): FIX-920's product spacing at a gap of 7
 *      and the shape look-ahead of 4, over the Blog Topics tab's own usable
 *      list, with the measured depth handed on to the generator.
 *   5. The draft: `createBlogDraftFromTopic`, which guarantees nothing half
 *      made (one create, last; the picture removed on a failed create). It
 *      runs its own two drafts reads as a belt against the tab.
 *   6. Publish, only in publish mode: ONE transaction (createOrReplace of
 *      the published copy with `publishDate` stamped to now, the AUTO-116
 *      rule the Studio's Publish applies, and delete of the draft), so the
 *      post is either live with no draft left or still a complete draft.
 *   7. The record: title, words, strips, picture, links, timings, cost.
 *
 * WHAT A FAILURE LEAVES. Before the draft is created, nothing. The create
 * failing: nothing (the creator's contract). The publish transaction
 * failing: a COMPLETE draft, recorded on the run as `failed` at stage
 * `publish` with the draft's id, which the digest names; the slot's retry
 * firing then takes the claim over and writes ANOTHER post on another
 * topic (the first one's topic is now written), because re-publishing a
 * draft a human may since have opened is not a retry's call. A run killed
 * by Vercel at its maxDuration leaves the claim `running`, which the retry
 * takes over after RUN_STALE_MS; a picture uploaded in that window with no
 * draft is the weekly sweep's (orphan-sweep.ts).
 *
 * WHAT STOPS A FAILING RUN COSTING MONEY IN A LOOP. Four ceilings, each
 * independent of the others: the schedule fires at most four times a day
 * (schedule.ts); the cap declines once the day holds as many finished runs
 * as slots; a failed slot is retried ONCE, by its second firing, never by a
 * loop inside a firing; and the image cap (20 a day, reserved before every
 * generation, header-image-usage.ts) bounds the dear part. The worst a
 * broken day can spend is four DeepSeek calls (about two cents) and the
 * images those four runs reserve.
 *
 * SERVER ONLY by use (the real deps carry the token); this module itself
 * imports nothing from next/* and no server-only module statically.
 */
import type { CreatedBlogDraft } from './create-blog-draft';
import type { ChosenTopic } from './choose-topic';
import { claimRunSlot, countFinishedRuns, runDayKey, updateRun, type RunLogClient, type RunLogDocument, type RunStage } from './run-log';
import { estimateRunCost, stripStats, type RunCostEstimate } from './run-cost';
import { BLOG_POSTS_PER_DAY } from './schedule';
import type { SchedulerSettings } from './scheduler-settings';
import { headerImageWhy } from './header-image';

export interface SchedulerDeps {
  now: () => Date;
  runLog: RunLogClient;
  readSettings: () => Promise<SchedulerSettings>;
  chooseTopic: (settings: SchedulerSettings) => Promise<ChosenTopic | null>;
  createDraft: (chosen: ChosenTopic) => Promise<CreatedBlogDraft>;
  publishDraft: (created: CreatedBlogDraft, now: Date) => Promise<{ publishedId: string }>;
  log?: (line: string) => void;
  /** Default BLOG_POSTS_PER_DAY (the number of slots). */
  postsPerDay?: number;
}

export interface SchedulerTimings {
  chooseMs: number;
  generateMs: number;
  publishMs: number;
  totalMs: number;
}

export type SchedulerOutcome =
  | { kind: 'skipped'; reason: 'paused' | 'cap' | 'settings-unreadable'; day: string; slot: string; message: string }
  | { kind: 'declined'; reason: 'done' | 'in-progress' | 'lost-race' | 'unavailable'; day: string; slot: string; runId: string; message: string }
  | {
      kind: 'written' | 'published';
      day: string;
      slot: string;
      runId: string;
      attempt: number;
      documentId: string;
      draftId: string;
      publishedId: string | null;
      title: string;
      slug: string;
      words: number;
      shape: string;
      topic: string;
      timings: SchedulerTimings;
      cost: RunCostEstimate;
    }
  | { kind: 'failed'; day: string; slot: string; runId: string; stage: RunStage; message: string; draftId: string | null };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The picture source of a created draft, for the run log. */
export function pictureSourceOf(created: Pick<CreatedBlogDraft, 'headerImage'>): 'ai' | 'library' | 'product' | 'none' {
  const h = created.headerImage;
  return h.kind === 'none' ? 'none' : h.source;
}

/**
 * Run one slot. Never throws: every outcome is a value, and every outcome
 * after the claim is on the run document.
 */
export async function runScheduledPost(slot: string, deps: SchedulerDeps): Promise<SchedulerOutcome> {
  const log = deps.log ?? ((line: string) => console.info(line));
  const started = deps.now();
  const day = runDayKey(started);
  const postsPerDay = deps.postsPerDay ?? BLOG_POSTS_PER_DAY;

  // 1) The switches, live.
  let settings: SchedulerSettings;
  try {
    settings = await deps.readSettings();
  } catch (err) {
    const message = errorText(err);
    log(`[blog-scheduler] ${day} ${slot}: ${message}`);
    return { kind: 'skipped', reason: 'settings-unreadable', day, slot, message };
  }
  if (settings.paused) {
    log(`[blog-scheduler] ${day} ${slot}: the automation is paused in Global Settings; nothing written.`);
    return { kind: 'skipped', reason: 'paused', day, slot, message: 'The automatic blog posts are paused in Global Settings. Nothing was written.' };
  }

  // 2) The daily cap.
  let finished: number;
  try {
    finished = await countFinishedRuns(deps.runLog, day);
  } catch (err) {
    const message = `The run log could not be read (${errorText(err)}), so the day's count is unknown. Nothing was written.`;
    log(`[blog-scheduler] ${day} ${slot}: ${message}`);
    return { kind: 'skipped', reason: 'settings-unreadable', day, slot, message };
  }
  if (finished >= postsPerDay) {
    const message = `Today already has ${finished} finished post(s), the daily number (${postsPerDay}). Nothing was written.`;
    log(`[blog-scheduler] ${day} ${slot}: ${message}`);
    return { kind: 'skipped', reason: 'cap', day, slot, message };
  }

  // 3) The claim.
  const claim = await claimRunSlot(deps.runLog, { day, slot, now: started, switches: { paused: settings.paused, publishMode: settings.publishMode } });
  if (claim.ok === false) {
    log(`[blog-scheduler] ${day} ${slot}: declined (${claim.reason}): ${claim.message}`);
    return { kind: 'declined', reason: claim.reason, day, slot, runId: claim.id, message: claim.message };
  }
  const runId = claim.id;
  const notes: string[] = [];
  if (claim.takenOverFrom) notes.push(`This firing took the slot over from a ${claim.takenOverFrom} run (attempt ${claim.attempt}).`);

  const fail = async (stage: RunStage, err: unknown, draftId: string | null = null): Promise<SchedulerOutcome> => {
    const message = errorText(err);
    log(`[blog-scheduler] ${day} ${slot}: FAILED at ${stage}: ${message}`);
    await updateRun(deps.runLog, runId, {
      now: deps.now(),
      status: 'failed',
      stage,
      finishedAt: deps.now().toISOString(),
      error: { stage, message },
      ...(draftId ? { draftId } : {}),
      notes,
    });
    return { kind: 'failed', day, slot, runId, stage, message, draftId };
  };

  // 4) The topic.
  await updateRun(deps.runLog, runId, { now: deps.now(), status: 'running', stage: 'choose' });
  const chooseStart = deps.now().getTime();
  let chosen: ChosenTopic | null;
  try {
    chosen = await deps.chooseTopic(settings);
  } catch (err) {
    return fail('choose', err);
  }
  const chooseMs = deps.now().getTime() - chooseStart;
  if (!chosen) {
    return fail('choose', new Error('No usable topic is left in the Blog Topics list: every topic is excluded, blocked or already written. Nothing was written.'));
  }
  await updateRun(deps.runLog, runId, {
    now: deps.now(),
    stage: 'generate',
    topic: { query: chosen.topic.query, key: chosen.topic.key, page: chosen.topic.page ?? null, queuePosition: chosen.queuePosition },
    titleShape: chosen.shape,
    choice: {
      recentKeys: chosen.recent.keys.filter((k): k is string => k !== null),
      recentShape: chosen.recent.shape,
      candidates: chosen.candidates.map((c) => `${c.query} [${c.key ?? '-'} / ${c.shape}]`),
      shape: chosen.shape,
    },
    timings: { chooseMs },
  });
  log(`[blog-scheduler] ${day} ${slot}: topic "${chosen.topic.query}" (#${chosen.queuePosition} of ${chosen.usable} usable; ${chosen.shape}; depth ${chosen.depth.depth}) in ${chooseMs} ms`);

  // 5) The draft.
  const generateStart = deps.now().getTime();
  let created: CreatedBlogDraft;
  try {
    created = await deps.createDraft(chosen);
  } catch (err) {
    return fail('generate', err);
  }
  const generateMs = deps.now().getTime() - generateStart;
  if (created.titleRepair === 'shortened') notes.push('The title ran past 75 characters and was shortened.');
  const why = headerImageWhy(created.headerImage);
  if (why) notes.push(`Header image: ${why}`);
  for (const n of created.fields.notes) notes.push(n);
  const cost = estimateRunCost({
    deepseekCalls: created.deepseekCalls,
    image:
      created.headerImage.kind === 'asset' && created.headerImage.source === 'ai' && created.headerImage.usage
        ? { model: created.headerImage.usage.model, imageTokens: created.headerImage.usage.imageTokens, promptTokens: created.headerImage.usage.promptTokens, attempts: created.headerImage.usage.attempts }
        : null,
  });
  const strips = stripStats(created.document.body);
  const base: Partial<RunLogDocument> = {
    documentId: created.documentId,
    draftId: created.draftId,
    title: created.title,
    slug: created.slug,
    words: created.words,
    template: created.document.aiTemplate,
    titleShape: created.titleShape,
    strips,
    placedLinks: created.placedLinks.length,
    pictureSource: pictureSourceOf(created),
    ...(why ? { pictureNote: why } : {}),
    cost: { ...cost },
    notes,
  };
  await updateRun(deps.runLog, runId, { now: deps.now(), stage: 'record', ...base, timings: { chooseMs, generateMs } });
  log(`[blog-scheduler] ${day} ${slot}: draft "${created.title}" (${created.words} words, ${strips.rows} product rows) in ${generateMs} ms`);

  // 6) Publish, when the switch says so.
  let publishedId: string | null = null;
  let publishMs = 0;
  if (settings.publishMode === 'publish') {
    await updateRun(deps.runLog, runId, { now: deps.now(), stage: 'publish' });
    const publishStart = deps.now().getTime();
    try {
      publishedId = (await deps.publishDraft(created, deps.now())).publishedId;
    } catch (err) {
      return fail('publish', err, created.draftId);
    }
    publishMs = deps.now().getTime() - publishStart;
    log(`[blog-scheduler] ${day} ${slot}: published as ${publishedId} in ${publishMs} ms`);
  }

  // 7) The record.
  const finishedAt = deps.now();
  const timings: SchedulerTimings = { chooseMs, generateMs, publishMs, totalMs: finishedAt.getTime() - started.getTime() };
  const status = publishedId ? 'published' : 'written';
  await updateRun(deps.runLog, runId, {
    now: finishedAt,
    status,
    stage: 'record',
    finishedAt: finishedAt.toISOString(),
    ...(publishedId ? { publishedId } : {}),
    timings,
    error: undefined,
  });
  return {
    kind: status,
    day,
    slot,
    runId,
    attempt: claim.attempt,
    documentId: created.documentId,
    draftId: created.draftId,
    publishedId,
    title: created.title,
    slug: created.slug,
    words: created.words,
    shape: created.titleShape,
    topic: chosen.topic.query,
    timings,
    cost,
  };
}
