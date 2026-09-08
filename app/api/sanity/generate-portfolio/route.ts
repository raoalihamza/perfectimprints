// Gemini generate-portfolio route for the Sanity "Generate Photo Details with
// AI" button on portfolioItem documents (PORT-170). The ninth generate-* route
// and the first that reads an IMAGE rather than text: it fetches the item's
// uploaded photograph from the Sanity CDN at a modest width, sends it to
// Gemini with the prompt from lib/portfolio/ai-details, validates the answer
// against the site's own colour / decoration / industry vocabularies, and
// returns the six fields. The Studio action fills the DRAFT in the editor's
// browser; this route writes NO content document.
//
// POST { assetRef } or { imageUrl }
//   → { title, alt, description, colors[], decorationMethods[], industry, dropped[], usage, cap }
//
// Order of operations, each of which stops the request before the next:
//   1. FIX-850 nonce guard (first-party Studio session only), before the body
//      is read and before any key is checked.
//   2. Body + image address validation (only the Sanity CDN is ever fetched).
//   3. GOOGLE_GEMINI_API_KEY presence (a clear 500 for Ali, no call made).
//   4. The daily cap reservation in lib/portfolio/ai-usage (persisted in a
//      Sanity counter document, never process memory): a 429 with the
//      plain-words message when the day's slots are gone.
//   5. Fetch the image, call Gemini, validate, respond.
//
// GOOGLE_GEMINI_API_KEY stays server-side (never NEXT_PUBLIC_) and is never
// logged or echoed. `maxDuration` is set explicitly (FIX-850 found none of the
// other generate routes set one): the measured call is about 2.4 s warm, the
// image fetch is capped at 10 s and the Gemini call at 40 s, so 60 is already
// the whole worst case with the quote-PDF route's precedent; the bulk-import
// route's 300 would only widen how long a hung request can bill for.

import { NextResponse } from 'next/server';
import { verifyStudioNonce, serverSanityClient } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';
import { buildImageUrl } from '@/lib/sanity/client';
import { generateJsonFromImage, GeminiError, GEMINI_MODEL } from '@/lib/ai/gemini';
import {
  buildPortfolioDetailsPrompt,
  hasUsableDetails,
  parsePortfolioAiDetails,
} from '@/lib/portfolio/ai-details';
import { reservePortfolioAiCall } from '@/lib/portfolio/ai-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The width the photograph is sent at. Measured in PORT-171 on the caps
 * photograph with the same model and prompt: at 1024px and at 1536px the
 * request cost the SAME 1,866 prompt tokens (the model resamples the image to
 * its own working size, so a larger upload buys no extra tokens of attention)
 * and the reading of the small embroidered monogram was no better ("dark
 * embroidery" against "dark stitching"; neither named the thread colour, the
 * prompt rewrite did that). So 1024 stays: the only thing 1536 changes is the
 * bytes pulled through the function (206,944 against 110,761 for that photo),
 * and the 2,000px+ 4 MB originals would be forty times the bytes for the same
 * reading. `fit=max` never upscales a smaller upload (IMG-110's rule). With
 * the PORT-171 prompt the whole request is about 2,350 prompt tokens.
 */
const IMAGE_WIDTH = 1024;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
/** A 1024px JPEG is 100 to 300 KB; this only exists so a surprise cannot exhaust memory. */
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const SANITY_CDN_HOST = 'cdn.sanity.io';

interface GenBody {
  /** The image's `asset._ref`, e.g. `image-<sha>-1764x1386-png`. Preferred. */
  assetRef?: string;
  /** Or a Sanity CDN URL of the same image; any other host is refused. */
  imageUrl?: string;
}

/** Resolve the body to a Sanity CDN URL at the chosen width, or null. */
function resolveImageUrl(body: GenBody): string | null {
  const ref = (body.assetRef || '').trim();
  if (ref) {
    if (!/^image-[a-f0-9]+-\d+x\d+-[a-z0-9]+$/i.test(ref)) return null;
    return buildImageUrl({ asset: { _ref: ref } }, (b) =>
      b.width(IMAGE_WIDTH).fit('max').format('jpg'),
    );
  }
  const raw = (body.imageUrl || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== SANITY_CDN_HOST) return null;
    url.search = '';
    url.searchParams.set('w', String(IMAGE_WIDTH));
    url.searchParams.set('fit', 'max');
    url.searchParams.set('fm', 'jpg');
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchImage(url: string): Promise<{ mimeType: string; base64: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`The photo could not be fetched from the image CDN (${res.status}).`);
  const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!mimeType.startsWith('image/')) throw new Error('The image CDN did not return an image.');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error('The image CDN returned an empty file.');
  if (bytes.length > IMAGE_MAX_BYTES) throw new Error('The photo is too large to send.');
  return { mimeType, base64: bytes.toString('base64') };
}

export async function POST(request: Request) {
  // FIX-850: first-party Studio session only (the Site Refresh / Bulk Upload
  // nonce scheme). Rejects before any body parsing, key check or Gemini call.
  const auth = await verifyStudioNonce(request, {
    authDocId: GENERATE_AUTH_DOC_ID,
    headerName: GENERATE_NONCE_HEADER,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized.' }, { status: auth.status });
  }

  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const imageUrl = resolveImageUrl(body);
  if (!imageUrl) {
    return NextResponse.json(
      { error: 'Upload the photo first, then generate. (No usable image was sent.)' },
      { status: 400 },
    );
  }

  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          'The AI photo service is not set up on this site yet (GOOGLE_GEMINI_API_KEY is missing on the server). Ask Ali to add it. You can fill the fields in by hand meanwhile.',
      },
      { status: 500 },
    );
  }

  // The cap: reserve a slot BEFORE anything is sent to Google. A failure
  // after this point still consumes the slot, which is the honest ceiling.
  const sanity = serverSanityClient();
  if (!sanity) {
    return NextResponse.json(
      { error: 'Server is missing SANITY_API_TOKEN / Sanity project config, so the daily limit cannot be counted.' },
      { status: 500 },
    );
  }
  const reservation = await reservePortfolioAiCall(sanity);
  if (reservation.ok === false) {
    return NextResponse.json(
      { error: reservation.message, cap: { used: reservation.used, cap: reservation.cap } },
      { status: reservation.reason === 'cap' ? 429 : 503 },
    );
  }

  try {
    const image = await fetchImage(imageUrl);
    const { system, user } = buildPortfolioDetailsPrompt();
    const result = await generateJsonFromImage<unknown>({ system, user, image });
    const { details, dropped } = parsePortfolioAiDetails(result.data);

    console.info(
      `[generate-portfolio] ${GEMINI_MODEL} prompt=${result.usage.promptTokens} output=${result.usage.outputTokens} thoughts=${result.usage.thoughtTokens} ms=${result.elapsedMs} cap=${reservation.used}/${reservation.cap}${dropped.length ? ` dropped=${dropped.join('|')}` : ''}`,
    );

    if (!hasUsableDetails(details)) {
      return NextResponse.json(
        { error: 'The AI could not describe this photo (no title or alt text came back). Click Generate again, or fill the fields in by hand.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ...details,
      dropped,
      usage: {
        model: result.model,
        promptTokens: result.usage.promptTokens,
        outputTokens: result.usage.outputTokens,
        elapsedMs: result.elapsedMs,
      },
      cap: { used: reservation.used, cap: reservation.cap },
    });
  } catch (err) {
    if (err instanceof GeminiError) {
      console.error(`[generate-portfolio] Gemini failed: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'AI photo description failed.';
    console.error(`[generate-portfolio] failed: ${message}`);
    return NextResponse.json({ error: `${message} Click Generate again, or fill the fields in by hand.` }, { status: 502 });
  }
}
