/**
 * The daily cap on generated blog header images (AUTO-202), PORT-170's
 * pattern through the shared lib/ai/daily-usage-cap.ts: a counter in an
 * invisible Sanity document (never process memory), a slot reserved BEFORE
 * anything is sent to Google, fail closed when the counter cannot be written.
 * Its `_type` is deliberately NOT registered in sanity/schemas/index.ts.
 *
 * THE NUMBER. 20 images per UTC day. What a day needs: the scheduler at two
 * posts a day is two images, four if both first attempts fail the text-and-
 * logo check and are retried once; Patrick pressing "Generate another header
 * image" on a handful of posts, two or three tries each, is another ten or
 * fifteen. Twenty is above that and far above the run rate, while a runaway
 * day costs at most 20 x USD 0.067, about USD 1.40 (a month of such days
 * about USD 42), which is the ceiling the promise "it cannot run up a bill"
 * needs. Every press of the regenerate button counts against it, and the
 * refusal says so in plain words with the reset time. Raise it here, in one
 * place, if Patrick finds it in the way; the measured need is far below it.
 *
 * SEPARATE from the portfolio counter on purpose: a photo session that spends
 * the portfolio's slots must not leave the morning's blog drafts without
 * images, and the other way round.
 */
import { reserveDailyAiCall, type DailyCapClient, type DailyCapReservation } from '../ai/daily-usage-cap';

/** Generated header images allowed per UTC day. See the header comment before changing it. */
export const BLOG_IMAGE_AI_DAILY_CAP = 20;

export const BLOG_IMAGE_AI_USAGE_DOC_ID = 'blogImageAiUsage';
export const BLOG_IMAGE_AI_USAGE_DOC_TYPE = 'blogImageAiUsage';

export type BlogImageUsageClient = DailyCapClient;
export type BlogImageReservation = DailyCapReservation;

/** The plain-words refusal the Studio shows when the cap is reached. */
export function blogImageCapMessage(cap: number): string {
  return `The daily limit of ${cap} generated header images has been reached, so no image was made. The limit resets at midnight UTC (evening in Florida). You can upload your own header image meanwhile, and the post itself is not affected.`;
}

/** Reserve one generated image for today. Never throws. */
export function reserveBlogImageCall(
  client: BlogImageUsageClient,
  now: Date = new Date(),
  cap: number = BLOG_IMAGE_AI_DAILY_CAP,
): Promise<BlogImageReservation> {
  return reserveDailyAiCall(
    client,
    { docId: BLOG_IMAGE_AI_USAGE_DOC_ID, docType: BLOG_IMAGE_AI_USAGE_DOC_TYPE, cap, capMessage: blogImageCapMessage },
    now,
  );
}
