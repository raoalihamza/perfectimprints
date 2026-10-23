// The blog scheduler's writing route (AUTO-208): ONE post per invocation,
// fired by the Vercel cron entries in vercel.json (lib/blog-automation/
// schedule.ts spells them once: slot `a` at 02:00 and 02:30 UTC, slot `b` at
// 08:00 and 08:30 UTC; the second firing of each slot is the retry). GET,
// because that is what Vercel sends.
//
// ORDER OF OPERATIONS, each of which stops the request before the next:
//   1. The production lock and the cron secret (lib/blog-automation/
//      scheduler-auth.ts), as the FIRST statement: the host of
//      NEXT_PUBLIC_SITE_URL must be the production host (staging deploys the
//      same vercel.json and would otherwise write into the same blog), and
//      the Authorization header must carry CRON_SECRET. Nothing below runs
//      on a refusal; the refusal is logged with its reason and never with
//      the secret.
//   2. The slot: from the x-vercel-cron-schedule header through the
//      schedule table, else `?slot=` (a proof run), else the UTC hour.
//   3. `runScheduledPost` (lib/blog-automation/scheduler.ts) with the real
//      dependencies: the live switches, the run log, the topic choice, the
//      one generation function, the publish transaction.
//
// maxDuration 300: the generation is 150 s of DeepSeek at most (AUTO-201's
// deadline) + the 100 s image budget (AUTO-207's 90 s, raised by AUTO-209 for
// the title on the picture) + a few seconds of reads and
// the create; choosing the topic is a cached pool read plus a handful of
// depth measurements (about a second each), or up to 93 s when the pool
// cache is cold (AUTO-121's measured cold build, only after a deploy or
// after the 24-hour cache lifetime). 300 is the ceiling every Vercel plan
// allows without Fluid compute being confirmed on this project; a firing
// that runs out of time is retried by the slot's second firing thirty
// minutes later, by then with the pool warm (the cache stores the pool the
// moment it is built, before the generation that may be cut off). Raise to
// 480 once Ali confirms Fluid compute (800 s ceiling) on the production
// project; nothing else needs changing.
//
// nodejs + force-dynamic: no render path; it cannot affect any page's
// staticness. The response is the scheduler's outcome as JSON, for the
// Vercel cron log.

import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/blog-automation/scheduler-auth';
import { CRON_SCHEDULE_HEADER, slotForFiring } from '@/lib/blog-automation/schedule';
import { runScheduledPost } from '@/lib/blog-automation/scheduler';
import { defaultSchedulerDeps } from '@/lib/blog-automation/scheduler-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = authorizeCronRequest({
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    cronSecret: process.env.CRON_SECRET,
    authorization: request.headers.get('authorization'),
  });
  if (auth.ok === false) {
    console.error(`[blog-scheduler] refused (${auth.reason}): ${auth.message}`);
    return NextResponse.json({ ok: false, error: auth.message, reason: auth.reason }, { status: auth.status });
  }
  const now = new Date();
  const slot = slotForFiring({ scheduleHeader: request.headers.get(CRON_SCHEDULE_HEADER), slotParam: new URL(request.url).searchParams.get('slot'), now });
  const outcome = await runScheduledPost(slot, await defaultSchedulerDeps());
  return NextResponse.json({ ok: outcome.kind !== 'failed', ...outcome });
}
