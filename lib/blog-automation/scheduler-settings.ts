/**
 * The scheduler's LIVE read of Patrick's switches and blocks (AUTO-208, Part
 * 3). One uncached GROQ read of the PUBLISHED Global Settings document at the
 * start of every firing, resolved by the SAME `resolveBlogAutomation` the
 * cached site settings use, so the two reads can never disagree on what a
 * blank field means.
 *
 * WHY NOT `getSiteSettings()`. That read is tag-cached with `revalidate:
 * false` and busted by `revalidateTag(SETTINGS_TAG, 'max')`, a
 * stale-while-revalidate profile that SERVES THE OLD VALUE to the first
 * request after a bust and refreshes behind it (CLAUDE.md, the MERCH-100
 * sitemap paragraph). A cron firing is exactly one request, so a switch
 * Patrick flipped would be read as its old value by the next firing and
 * take effect one firing later, hours after he pressed it. A switch that
 * does nothing for hours is worse than no switch. This read goes to the API
 * with `cache: 'no-store'`, the way the drafts read does
 * (written-topics.ts), and costs one small request a firing.
 *
 * The negative keywords ride the same read for the same reason: a topic
 * Patrick blocked at 9 pm must be off the queue at the 2 am firing.
 *
 * SERVER ONLY (the token client); imports nothing from next/*, so the proof
 * harness runs the identical read under tsx.
 */
import { publishModeOf, resolveBlogAutomation, type BlogPublishMode, type NegativeKeyword } from '../sanity/queries/global-settings';

export interface SchedulerSettings {
  paused: boolean;
  publishMode: BlogPublishMode;
  negativeKeywords: NegativeKeyword[];
}

/** The one projection, over the published document (the token client reads `raw`, where `globalSettings` without a `drafts.` prefix IS the published copy). */
export const SCHEDULER_SETTINGS_QUERY = `*[_id == "globalSettings"][0].blogAutomation{ paused, publishMode, negativeKeywords[]{ term, scope, addedAt, note } }`;

export interface SettingsReadClient {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<T>;
}

export class SchedulerSettingsReadError extends Error {
  constructor(cause: unknown) {
    super(`The blog automation switches could not be read: ${cause instanceof Error ? cause.message : String(cause)}. Nothing was written: a scheduler that cannot see its own off switch must not run.`);
    this.name = 'SchedulerSettingsReadError';
  }
}

/** Read the switches live. Throws `SchedulerSettingsReadError`; the scheduler treats that as "do nothing". */
export async function readSchedulerSettings(client: SettingsReadClient): Promise<SchedulerSettings> {
  let raw: { paused?: boolean | null; publishMode?: string | null; negativeKeywords?: Array<{ term?: string; scope?: string; addedAt?: string; note?: string }> } | null;
  try {
    raw = await client.fetch(SCHEDULER_SETTINGS_QUERY, {}, { cache: 'no-store' });
  } catch (err) {
    throw new SchedulerSettingsReadError(err);
  }
  // A missing object is the documented default (running, drafts, no blocks):
  // the singleton existed before this object did, and a blank field is never
  // pre-filled on an existing singleton (the FIX-861 lesson).
  const resolved = resolveBlogAutomation(raw ?? {});
  return { paused: resolved.paused, publishMode: publishModeOf(resolved.publishMode), negativeKeywords: resolved.negativeKeywords };
}
