import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';

import { buildImageUrl } from '@/lib/sanity/client';
import { buildQuotePdfModel, quotePdfFileName, type QuotePdfQuoteSource } from '../quote-pdf-model';
import { fetchQuotePdfImages } from './quote-pdf-images';
import { QuotePdfDocument } from './QuotePdfDocument';

/**
 * Quote to PDF bytes (Q-160). The ONE place the three pieces meet: the pure
 * model, the defensive image fetch, and the renderer.
 *
 * Kept out of the route file on purpose, so the heavy `@react-pdf/renderer`
 * import graph has a single entry point that is easy to see and easy to prove
 * nothing else pulls in. Next bundles per route, and only the PDF route imports
 * this module, so the library never reaches any page bundle.
 */

export interface RenderedQuotePdf {
  buffer: Buffer;
  fileName: string;
}

export async function renderQuotePdf(
  quote: QuotePdfQuoteSource,
  now: Date,
): Promise<RenderedQuotePdf> {
  // A Sanity-hosted line image (an own-product deref or a custom line's own
  // upload) asked for as JPEG explicitly - the renderer decodes JPEG and PNG
  // only, and cdn.sanity.io honours the format parameter, so this removes the
  // guesswork the Geiger URLs need a magic-number check for.
  const model = buildQuotePdfModel(quote, now, (source) =>
    buildImageUrl(source, (b) => b.width(320).fit('max').format('jpg')),
  );

  // Fetched BEFORE layout, in parallel, each with its own timeout. See the
  // header comment in quote-pdf-images.ts for why the renderer is not allowed
  // to fetch these itself.
  const images = await fetchQuotePdfImages(model.lines.map((line) => line.imageUrl));

  const buffer = await renderToBuffer(<QuotePdfDocument model={model} images={images} />);

  return { buffer, fileName: quotePdfFileName(model.quoteNumber) };
}
