import 'server-only';

/**
 * Fetching the line photos for a quote PDF (Q-160), BEFORE the document is laid
 * out.
 *
 * WHY WE FETCH THESE OURSELVES INSTEAD OF LETTING THE RENDERER DO IT. The Q-120
 * spike measured a dead image URL costing about 1,700 ms while the renderer
 * discovered it mid-layout - roughly five times a whole normal render, for one
 * image. The renderer exposes no per-image timeout, so a quote with several
 * photos on a slow or dead host would keep the customer waiting with no ceiling.
 * Fetching here gives three things the renderer cannot:
 *
 *   1. AN EXPLICIT TIMEOUT, applied per image, so a hanging host costs one
 *      bounded wait rather than an open-ended one.
 *   2. ALL IMAGES IN PARALLEL, so N slow images cost one timeout and not N.
 *   3. A FORMAT GUARANTEE. The renderer decodes JPEG and PNG only. We send an
 *      Accept header that asks for exactly those (the Geiger CDN
 *      content-negotiates, which is the whole reason `format=webp` in the
 *      catalog URLs has been harmless so far) AND then verify the returned
 *      bytes by magic number. Anything else is dropped rather than handed to
 *      the renderer to fail on.
 *
 * A MISSING PHOTO MUST NEVER FAIL THE DOWNLOAD. Every failure here resolves to
 * null, the row renders a clean empty placeholder, and the customer gets their
 * complete quote. Failures are logged deliberately and loudly BECAUSE they are
 * silent to the customer: a systematically broken image host would otherwise
 * ship unnoticed for weeks (the Q-120 report's "failures are quiet" warning).
 */

/** One image's wait ceiling. Comfortably above a healthy CDN, well under a customer's patience. */
export const QUOTE_PDF_IMAGE_TIMEOUT_MS = 3_500;

/** Refuse anything absurd before it reaches the renderer, or the PDF. */
export const QUOTE_PDF_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

/**
 * How many line photos are embedded at all. The spike measured roughly 17 KB of
 * PDF per photo, so this bounds both the file a customer downloads and the work
 * one request does. A quote with more lines than this still prints every line -
 * only the pictures past the limit are skipped.
 */
export const QUOTE_PDF_MAX_IMAGES = 14;

export interface QuotePdfImage {
  data: Buffer;
  format: 'jpg' | 'png';
}

/** JPEG (FFD8FF) or PNG (89504E470D0A1A0A) by magic number, else null. */
function detectFormat(bytes: Uint8Array): 'jpg' | 'png' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  return null;
}

/** Never log a full private URL alongside a quote; the host is enough to act on. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable url)';
  }
}

async function fetchOne(url: string): Promise<QuotePdfImage | null> {
  try {
    const res = await fetch(url, {
      // Asks the CDN for the only two formats the renderer can decode, and
      // deliberately offers no wildcard fallback: a host that can ONLY give us
      // webp should refuse here rather than send bytes the magic-number check
      // below is going to throw away anyway.
      headers: { accept: 'image/jpeg,image/png' },
      signal: AbortSignal.timeout(QUOTE_PDF_IMAGE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[quote-pdf] image ${res.status} from ${hostOf(url)} - rendering a placeholder.`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > QUOTE_PDF_IMAGE_MAX_BYTES) {
      console.warn(
        `[quote-pdf] image from ${hostOf(url)} was ${buffer.byteLength} bytes - skipped.`,
      );
      return null;
    }
    const format = detectFormat(buffer);
    if (!format) {
      // The case the spike warned about: a host that really does return webp.
      console.warn(
        `[quote-pdf] image from ${hostOf(url)} is not JPEG or PNG (content-type ${res.headers.get('content-type') ?? 'unknown'}) - skipped.`,
      );
      return null;
    }
    return { data: buffer, format };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    console.warn(
      `[quote-pdf] image from ${hostOf(url)} ${timedOut ? `timed out after ${QUOTE_PDF_IMAGE_TIMEOUT_MS}ms` : 'could not be fetched'} - rendering a placeholder.`,
    );
    return null;
  }
}

/**
 * Every distinct URL fetched once, concurrently, keyed back by URL. A URL that
 * fails is simply absent from the map, which the renderer reads as "this line
 * had a picture and we could not get it" and prints a placeholder for.
 */
export async function fetchQuotePdfImages(
  urls: (string | null | undefined)[],
): Promise<Map<string, QuotePdfImage>> {
  const unique = Array.from(
    new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0)),
  ).slice(0, QUOTE_PDF_MAX_IMAGES);

  const results = new Map<string, QuotePdfImage>();
  if (unique.length === 0) return results;

  const settled = await Promise.all(unique.map((url) => fetchOne(url)));
  unique.forEach((url, index) => {
    const image = settled[index];
    if (image) results.set(url, image);
  });
  return results;
}
