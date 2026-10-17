// The morning digest (AUTO-208, Part 8): its OWN cron firing (12:00 UTC,
// vercel.json via lib/blog-automation/schedule.ts), separate from the
// writing runs, so a morning with nothing written still produces an email
// saying so. Also the weekly orphan-picture sweep, on SWEEP_WEEKDAY_UTC,
// dry run unless BLOG_ORPHAN_SWEEP_COMMIT is `true`.
//
// Same production lock and secret as the writer, as the first statement.
// Reads: the day's run documents, the switches LIVE (so the footer says
// what is true now), the image counter. Sends ONE email through the
// existing Gmail transport (lib/email/gmail-smtp.ts `sendBuiltEmail`) to
// BLOG_DIGEST_TO, else LEAD_EMAIL_TO, else Patrick. GMAIL_USER and
// GMAIL_APP_PASSWORD are what the transport needs; they are the lead
// form's variables and are already set in production.
//
// maxDuration 120: the reads are a few hundred milliseconds; the sweep's
// reference count over every unreferenced asset is the slow part (a few
// seconds measured by FIX-920's script); the send is a second.

import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/blog-automation/scheduler-auth';
import { BLOG_POSTS_PER_DAY, SWEEP_WEEKDAY_UTC } from '@/lib/blog-automation/schedule';
import { readRunsForDay, runDayKey } from '@/lib/blog-automation/run-log';
import { readSchedulerSettings } from '@/lib/blog-automation/scheduler-settings';
import { buildDigestEmail } from '@/lib/blog-automation/digest';
import { sweepOrphanHeaderImages, sweepSentence } from '@/lib/blog-automation/orphan-sweep';
import { BLOG_IMAGE_AI_DAILY_CAP, BLOG_IMAGE_AI_USAGE_DOC_ID } from '@/lib/blog-automation/header-image-usage';
import { serverSanityClient } from '@/lib/sanity/studio-nonce-auth';
import { sendBuiltEmail } from '@/lib/email/gmail-smtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** The Studio's base path (sanity/sanity.config.ts); spelled here for the links only. */
const STUDIO_PATH = '/admin3773752';

export async function GET(request: Request) {
  const auth = authorizeCronRequest({
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    cronSecret: process.env.CRON_SECRET,
    authorization: request.headers.get('authorization'),
  });
  if (auth.ok === false) {
    console.error(`[blog-digest] refused (${auth.reason}): ${auth.message}`);
    return NextResponse.json({ ok: false, error: auth.message, reason: auth.reason }, { status: auth.status });
  }
  const client = serverSanityClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: 'The server cannot read Sanity (SANITY_API_TOKEN is not set).' }, { status: 500 });
  }
  const now = new Date();
  const day = new URL(request.url).searchParams.get('day') ?? runDayKey(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ ok: false, error: 'day must be YYYY-MM-DD.' }, { status: 400 });
  }

  const [runs, settings] = await Promise.all([readRunsForDay(client, day), readSchedulerSettings(client)]);
  let imageCap: { used: number; cap: number } | null = null;
  try {
    const usage = await client.fetch<{ day?: string; count?: number } | null>(`*[_id == $id][0]{ day, count }`, { id: BLOG_IMAGE_AI_USAGE_DOC_ID }, { cache: 'no-store' });
    imageCap = { used: usage?.day === day && typeof usage.count === 'number' ? usage.count : 0, cap: BLOG_IMAGE_AI_DAILY_CAP };
  } catch {
    imageCap = null;
  }

  let sweep: { sentence: string } | null = null;
  const forceSweep = new URL(request.url).searchParams.get('sweep') === '1';
  if (now.getUTCDay() === SWEEP_WEEKDAY_UTC || forceSweep) {
    const report = await sweepOrphanHeaderImages(client, { commit: process.env.BLOG_ORPHAN_SWEEP_COMMIT === 'true', now, log: (l) => console.info(l) });
    sweep = { sentence: sweepSentence(report) };
  }

  const email = buildDigestEmail({
    day,
    runs,
    switches: { paused: settings.paused, publishMode: settings.publishMode },
    imageCap,
    sweep,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? '',
    studioPath: STUDIO_PATH,
    slots: BLOG_POSTS_PER_DAY,
  });
  // BLOG_DIGEST_TO (optional) overrides the lead address; both are Vercel env vars Ali owns.
  const to = process.env.BLOG_DIGEST_TO || process.env.LEAD_EMAIL_TO || 'patrick@perfectimprints.com';
  try {
    await sendBuiltEmail({ to, subject: email.subject, text: email.text, html: email.html });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[blog-digest] the email could not be sent: ${message}`);
    return NextResponse.json({ ok: false, error: `The digest could not be sent: ${message}`, day, runs: runs.length }, { status: 502 });
  }
  return NextResponse.json({ ok: true, day, to, runs: runs.length, subject: email.subject, sweep: sweep?.sentence ?? null });
}
