/**
 * WHEN the blog scheduler fires (AUTO-208), spelled ONCE. `vercel.json` must
 * carry exactly these entries (lib/blog-automation/scheduler-guard.test.ts
 * re-derives the file from this table and fails on any difference), and the
 * cron routes read the slot off the `x-vercel-cron-schedule` header through
 * this table. Pure: no imports.
 *
 * THE SHAPE. One post per invocation, two posts a day, FOUR writing firings:
 * each slot fires twice, thirty minutes apart. The second firing is the retry
 * (Vercel never retries a failed cron invocation, and delivery is best
 * effort: a run can be missed or delivered twice, docs read 2026-10-17): it
 * finds the slot's run document, declines when the first firing finished,
 * and takes the claim over when the first firing is stale (older than
 * RUN_STALE_MS in run-log.ts, and the writer's maxDuration is 300 s, so
 * thirty minutes later a still-"running" claim is certainly dead) or failed.
 * So the spare firings are the retry AND the ceiling: at most two posts a
 * day can come out of this table, however many times it fires.
 *
 * THE TIMES, in UTC (Vercel's only timezone). Patrick is in Florida (UTC-4 in
 * summer, UTC-5 in winter). Slot `a` at 02:00 UTC (10 pm / 9 pm in Florida)
 * and slot `b` at 08:00 UTC (4 am / 3 am), so both posts are written
 * overnight, before the morning digest at 12:00 UTC (8 am / 7 am), and all
 * three fall inside ONE UTC day, which is what the digest and the daily
 * image cap (midnight UTC) count by. Nothing writes during his working day,
 * so a post he is reading in the Studio is never changed under him, and the
 * two slots are six hours apart so the Blog Topics tab, the drafts read and
 * the written-topics guard have long since seen the first post when the
 * second is chosen.
 */

/** A writing slot: at most ONE post a day comes out of it. */
export type WritingSlot = 'a' | 'b';

export interface WritingFiring {
  slot: WritingSlot;
  /** The cron expression, in UTC. */
  schedule: string;
  /** 1 for the first firing of the slot, 2 for the retry. */
  attempt: 1 | 2;
}

/** The route Vercel calls to write one post. */
export const WRITER_CRON_PATH = '/api/cron/blog-automation';
/** The route Vercel calls for the morning digest (and the weekly sweep). */
export const DIGEST_CRON_PATH = '/api/cron/blog-digest';

/** The four writing firings, two per slot. */
export const WRITING_FIRINGS: readonly WritingFiring[] = [
  { slot: 'a', schedule: '0 2 * * *', attempt: 1 },
  { slot: 'a', schedule: '30 2 * * *', attempt: 2 },
  { slot: 'b', schedule: '0 8 * * *', attempt: 1 },
  { slot: 'b', schedule: '30 8 * * *', attempt: 2 },
];

/** The digest, after both slots and before Florida's morning. */
export const DIGEST_SCHEDULE = '0 12 * * *';

/** The UTC weekday (0 = Sunday) on which the digest firing also runs the orphan picture sweep. */
export const SWEEP_WEEKDAY_UTC = 1;

/** How many posts a day the table can produce: the number of distinct slots. */
export const BLOG_POSTS_PER_DAY = new Set(WRITING_FIRINGS.map((f) => f.slot)).size;

/** The header Vercel sends with the cron expression that fired. */
export const CRON_SCHEDULE_HEADER = 'x-vercel-cron-schedule';

/** The `crons` array vercel.json must carry, derived from the table above. */
export function expectedVercelCrons(): { path: string; schedule: string }[] {
  return [
    ...WRITING_FIRINGS.map((f) => ({ path: WRITER_CRON_PATH, schedule: f.schedule })),
    { path: DIGEST_CRON_PATH, schedule: DIGEST_SCHEDULE },
  ];
}

/** The slot a cron expression belongs to, or null when it is not one of ours. */
export function slotForSchedule(schedule: string | null | undefined): WritingSlot | null {
  if (typeof schedule !== 'string') return null;
  const hit = WRITING_FIRINGS.find((f) => f.schedule === schedule.trim());
  return hit ? hit.slot : null;
}

/**
 * The slot for a firing with no recognisable schedule header (a manual call
 * with the secret): by the UTC hour, so a hand-fired run before 06:00 UTC is
 * slot `a` and anything later is slot `b`. A slot can be named explicitly
 * instead (`?slot=...`, used by the proof runs); the route validates it.
 */
export function slotForHour(hourUtc: number): WritingSlot {
  return hourUtc < 6 ? 'a' : 'b';
}

/** A slot name as the route accepts it: one of the two, or a short lower-case tag for a hand-fired proof run. */
export function isSlotName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,23}$/.test(value);
}

/**
 * The slot a firing is for: the schedule header Vercel sends, else an
 * explicit `slot` query parameter (a hand-fired proof run, with the secret),
 * else the UTC hour.
 */
export function slotForFiring(input: { scheduleHeader: string | null; slotParam: string | null; now: Date }): string {
  const fromHeader = slotForSchedule(input.scheduleHeader);
  if (fromHeader) return fromHeader;
  if (isSlotName(input.slotParam)) return input.slotParam;
  return slotForHour(input.now.getUTCHours());
}
