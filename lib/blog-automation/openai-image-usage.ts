/**
 * The daily cap on header pictures drawn by the OpenAI image model (AUTO-220),
 * the same mechanism as the Gemini counter beside it (header-image-usage.ts,
 * through the shared lib/ai/daily-usage-cap.ts): a counter in an invisible
 * Sanity document, never process memory, a slot reserved BEFORE anything is
 * sent to OpenAI, fail closed when the counter cannot be written. Its `_type`
 * is deliberately NOT registered in sanity/schemas/index.ts.
 *
 * ITS OWN COUNTER, separate from the Gemini one: the Gemini model is now the
 * fallback, and a day that spends the main model's slots must still be able
 * to count what the fallback draws, and the other way round.
 *
 * THE NUMBER. 40 pictures per UTC day. What a day needs: the scheduler at two
 * posts a day is two pictures, four if both are redrawn once (a title that
 * did not read back, or a recognised brand name); every press of Generate
 * another header image, Change this picture and Make a new picture counts
 * too, and Patrick working through a batch of drafts presses them often. Forty
 * is far above the run rate and still a hard ceiling: a runaway day costs at
 * most 40 x USD 0.06, about USD 2.40. Raise it here, in one place.
 */
import { reserveDailyAiCall, type DailyCapClient, type DailyCapReservation } from '../ai/daily-usage-cap';

/** Header pictures the OpenAI model may draw per UTC day. See the header before changing it. */
export const BLOG_IMAGE_OPENAI_DAILY_CAP = 40;

export const BLOG_IMAGE_OPENAI_USAGE_DOC_ID = 'blogImageOpenAiUsage';
export const BLOG_IMAGE_OPENAI_USAGE_DOC_TYPE = 'blogImageOpenAiUsage';

/** The plain-words refusal the Studio shows when the cap is reached. */
export function openAiImageCapMessage(cap: number): string {
  return `The daily limit of ${cap} header pictures has been reached, so no picture was made. The limit resets at midnight UTC (evening in Florida). You can upload your own header image meanwhile, and the post itself is not affected.`;
}

/** Reserve one picture for today. Never throws. */
export function reserveOpenAiImageCall(
  client: DailyCapClient,
  now: Date = new Date(),
  cap: number = BLOG_IMAGE_OPENAI_DAILY_CAP,
): Promise<DailyCapReservation> {
  return reserveDailyAiCall(
    client,
    { docId: BLOG_IMAGE_OPENAI_USAGE_DOC_ID, docType: BLOG_IMAGE_OPENAI_USAGE_DOC_TYPE, cap, capMessage: openAiImageCapMessage },
    now,
  );
}
