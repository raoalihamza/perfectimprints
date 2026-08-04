import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { formatUsd } from '../quote-totals';
import type { QuotePdfLine, QuotePdfModel } from '../quote-pdf-model';
import type { QuotePdfImage } from './quote-pdf-images';
import {
  QUOTE_PDF_LOGO,
  QUOTE_PDF_LOGO_HEIGHT,
  QUOTE_PDF_LOGO_WIDTH,
} from './quote-pdf-logo';

/**
 * The printed quote (Q-160): a plain, professional business document a buyer
 * can forward to their boss.
 *
 * IT IS DELIBERATELY NOT A COPY OF THE WEB PAGE. The page is a responsive card
 * list; this is a fixed six-column table. Trying to match them pixel for pixel
 * would guarantee they drift the first time either is touched. What they are
 * NOT allowed to disagree on is the content and the money, and neither is
 * decided here: every string and every amount arrives already resolved on the
 * QuotePdfModel, whose totals come from the shared computeQuoteTotals.
 *
 * TYPOGRAPHY is the renderer's built-in Helvetica. No font file is committed -
 * the repo has no binary font asset today, every existing HTML email is already
 * on the same Arial/Helvetica stack, and the Q-120 spike's explicit
 * recommendation was not to introduce one.
 *
 * THE LOGO is the real one, not a typeface. The renderer decodes JPEG and PNG
 * only and cannot load an SVG file, so `public/logo.svg` is rasterised once by
 * scripts/quick-quote/generate-pdf-logo.mjs into the generated, inlined
 * ./quote-pdf-logo module. It is inlined rather than read from public/ at
 * request time because public assets are served by the static layer and are not
 * guaranteed to be on a serverless function's filesystem, and a customer's
 * quote silently losing its logo is exactly the failure worth spending 48 KB to
 * remove. Re-run that script if the logo ever changes.
 *
 * THE LAYOUT TRAP, from the spike, in one line: every flexible cell needs
 * `flexBasis: 0`. With the default `flexBasis: auto` a single long product name
 * sets the item column's width and silently pushes the money columns off the
 * right edge of the page. It cost the spike a render cycle to find, and it does
 * not show up in any test whose fixture names are short.
 *
 * PAGE BREAKING: the table header is `fixed` so it repeats on every page, rows
 * are `wrap={false}` so a line item is never split, and the page footer is
 * `fixed` with a Page N of M render prop. If anything else is ever marked
 * `fixed`, re-check all three together.
 */

// Brand tokens, from CLAUDE.md Section 10. Reused so the document reads as the
// same brand without imitating the web layout.
const RED = '#E11F1E';
const INK = '#231F20';
const MUTED = '#666666';
const BORDER = '#D9D9D9';
const SOFT = '#F5F5F5';

/**
 * The logo's printed size. 150 pt is two inches, which matches the visual
 * weight the wordmark had, and the 600 px raster across it works out near 290
 * dpi - sharp on paper and when a customer zooms in a PDF viewer. The height is
 * derived from the raster so the aspect ratio can never be wrong by hand.
 */
const LOGO_PT_WIDTH = 150;
const LOGO_PT_HEIGHT = Math.round((LOGO_PT_WIDTH * QUOTE_PDF_LOGO_HEIGHT) / QUOTE_PDF_LOGO_WIDTH);

const COL_QTY = 40;
const COL_UNIT = 58;
const COL_SETUP = 56;
const COL_SHIPPING = 62;
const COL_TOTAL = 66;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
    paddingTop: 36,
    paddingHorizontal: 36,
    // Room for the fixed footer, which sits outside the flow.
    paddingBottom: 54,
    lineHeight: 1.4,
  },

  // ---- Header -------------------------------------------------------------
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: RED,
    paddingBottom: 10,
    marginBottom: 14,
  },
  // The real logo, sized so its 600 px raster lands near 290 dpi on paper.
  logo: { width: LOGO_PT_WIDTH, height: LOGO_PT_HEIGHT, objectFit: 'contain' },
  /** Only reached if the generated logo module is ever empty. */
  wordmark: { fontFamily: 'Helvetica-Bold', fontSize: 17, color: RED, letterSpacing: 0.3 },
  tagline: { fontSize: 8, color: MUTED, marginTop: 5 },
  headerRight: { alignItems: 'flex-end' },
  docLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: MUTED, letterSpacing: 1.2 },
  quoteNumber: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: INK, marginTop: 2 },
  headerMetaRow: { flexDirection: 'row', marginTop: 3 },
  headerMetaLabel: { fontSize: 8.5, color: MUTED },
  headerMetaValue: { fontSize: 8.5, color: INK, marginLeft: 5 },

  // ---- Notice -------------------------------------------------------------
  notice: {
    borderWidth: 1,
    borderColor: RED,
    borderLeftWidth: 3,
    padding: 8,
    marginBottom: 12,
  },
  noticeTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: INK },
  noticeBody: { fontSize: 8.5, color: INK, marginTop: 2 },

  // ---- Parties ------------------------------------------------------------
  parties: { flexDirection: 'row', marginBottom: 14 },
  party: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
  },
  partyGap: { width: 12 },
  partyHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: MUTED,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  partyName: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: INK },
  partyLine: { fontSize: 8.5, color: INK },

  // ---- Table --------------------------------------------------------------
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: SOFT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  headCell: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: MUTED, letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  // flexBasis: 0 is load-bearing (see the header comment).
  itemCell: { flexGrow: 1, flexBasis: 0, flexDirection: 'row', paddingRight: 8 },
  itemText: { flexGrow: 1, flexBasis: 0 },
  thumb: { width: 40, height: 40, objectFit: 'contain', marginRight: 7 },
  thumbPlaceholder: {
    width: 40,
    height: 40,
    marginRight: 7,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SOFT,
  },
  itemTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: INK },
  itemMeta: { fontSize: 8, color: INK, marginTop: 2 },
  itemDescription: { fontSize: 8, color: MUTED, marginTop: 2 },
  itemNote: {
    fontSize: 8,
    color: INK,
    marginTop: 3,
    paddingLeft: 5,
    borderLeftWidth: 1,
    borderColor: BORDER,
  },
  num: { fontSize: 8.5, textAlign: 'right' },
  numStrong: { fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'right' },

  // ---- Totals -------------------------------------------------------------
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totals: { width: 230, borderWidth: 1, borderColor: BORDER, padding: 9 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totalsLabel: { fontSize: 8.5, color: MUTED },
  totalsValue: { fontSize: 8.5, color: INK },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: INK,
    paddingTop: 5,
    marginTop: 3,
  },
  grandLabel: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: INK },
  grandValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: INK },

  // ---- Empty state --------------------------------------------------------
  empty: { borderWidth: 1, borderColor: BORDER, padding: 14, alignItems: 'center' },
  emptyText: { fontSize: 9, color: MUTED },

  // ---- Terms + footer -----------------------------------------------------
  terms: { marginTop: 16, borderTopWidth: 1, borderColor: BORDER, paddingTop: 8 },
  termsText: { fontSize: 7.8, color: MUTED, marginBottom: 3 },
  pageFooter: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingTop: 5,
  },
  footerText: { fontSize: 7.5, color: MUTED },
});

interface Props {
  model: QuotePdfModel;
  /** URL to fetched bytes. A URL absent from the map failed and gets a placeholder. */
  images: Map<string, QuotePdfImage>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.headerMetaRow}>
      <Text style={styles.headerMetaLabel}>{label}</Text>
      <Text style={styles.headerMetaValue}>{value}</Text>
    </View>
  );
}

function TableHead({ model }: { model: QuotePdfModel }) {
  return (
    <View style={styles.tableHeader} fixed>
      <View style={styles.itemCell}>
        <Text style={styles.headCell}>ITEM</Text>
      </View>
      <Text style={[styles.headCell, { width: COL_QTY, textAlign: 'right' }]}>QTY</Text>
      <Text style={[styles.headCell, { width: COL_UNIT, textAlign: 'right' }]}>UNIT</Text>
      {model.showSetupColumn ? (
        <Text style={[styles.headCell, { width: COL_SETUP, textAlign: 'right' }]}>SETUP</Text>
      ) : null}
      {model.showShippingColumn ? (
        <Text style={[styles.headCell, { width: COL_SHIPPING, textAlign: 'right' }]}>SHIPPING</Text>
      ) : null}
      <Text style={[styles.headCell, { width: COL_TOTAL, textAlign: 'right' }]}>LINE TOTAL</Text>
    </View>
  );
}

function LineRow({
  line,
  model,
  images,
}: {
  line: QuotePdfLine;
  model: QuotePdfModel;
  images: Map<string, QuotePdfImage>;
}) {
  const image = line.imageUrl ? images.get(line.imageUrl) : undefined;

  return (
    // wrap={false}: a quote line split across a page break is unreadable. The
    // model caps the description and the note so a row can never outgrow a page.
    <View style={styles.row} wrap={false}>
      <View style={styles.itemCell}>
        {image ? (
          <Image style={styles.thumb} src={{ data: image.data, format: image.format }} />
        ) : line.imageUrl ? (
          // The line HAS a picture and we could not get it. An empty framed box
          // keeps the row aligned and says nothing alarming to the customer;
          // the failure is logged server-side instead.
          <View style={styles.thumbPlaceholder} />
        ) : null}

        <View style={styles.itemText}>
          <Text style={styles.itemTitle}>{line.title}</Text>
          {line.decoration ? (
            <Text style={styles.itemMeta}>Decoration: {line.decoration}</Text>
          ) : null}
          {line.description ? (
            <Text style={styles.itemDescription}>{line.description}</Text>
          ) : null}
          {line.note ? <Text style={styles.itemNote}>{line.note}</Text> : null}
        </View>
      </View>

      <Text style={[styles.num, { width: COL_QTY }]}>
        {line.quantity !== null ? line.quantity.toLocaleString('en-US') : ''}
      </Text>
      <Text style={[styles.num, { width: COL_UNIT }]}>
        {line.unitAmount !== null ? formatUsd(line.unitAmount) : ''}
      </Text>
      {/* A charge line has no setup and no shipping, so those cells stay blank
          rather than printing $0.00 - a zero reads as a charge that was waived,
          which is not what it means. A column NO line uses is dropped entirely
          (model.showSetupColumn / showShippingColumn). */}
      {model.showSetupColumn ? (
        <Text style={[styles.num, { width: COL_SETUP }]}>
          {line.setup !== null ? formatUsd(line.setup) : ''}
        </Text>
      ) : null}
      {model.showShippingColumn ? (
        <Text style={[styles.num, { width: COL_SHIPPING }]}>
          {line.shipping !== null ? formatUsd(line.shipping) : ''}
        </Text>
      ) : null}
      <Text style={[styles.numStrong, { width: COL_TOTAL }]}>{formatUsd(line.total)}</Text>
    </View>
  );
}

export function QuotePdfDocument({ model, images }: Props) {
  const title = model.quoteNumber ? `Quote ${model.quoteNumber}` : 'Quote';
  const hasLines = model.lines.length > 0;

  return (
    <Document
      title={`${title} - Perfect Imprints`}
      author="Perfect Imprints"
      subject="Quotation"
      creator="Perfect Imprints"
      producer="Perfect Imprints"
    >
      <Page size="LETTER" style={styles.page}>
        {/* ---- Who it is from, and which quote it is ---- */}
        <View style={styles.header}>
          <View>
            {/* The REAL logo, rasterised from public/logo.svg at build-script
                time into an inlined PNG (the renderer cannot load an SVG file,
                and this is what the browser's own print output shows, so the
                two should not disagree). The text wordmark survives only as a
                fallback for a corrupted regeneration - it is never reached in
                a healthy build. */}
            {QUOTE_PDF_LOGO.data.byteLength > 0 ? (
              <Image style={styles.logo} src={QUOTE_PDF_LOGO} />
            ) : (
              <Text style={styles.wordmark}>PERFECT IMPRINTS</Text>
            )}
            <Text style={styles.tagline}>Custom promotional products and branded apparel</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docLabel}>QUOTATION</Text>
            {model.quoteNumber ? <Text style={styles.quoteNumber}>{model.quoteNumber}</Text> : null}
            {model.quoteDate ? <MetaRow label="Quote date:" value={model.quoteDate} /> : null}
            {model.expiryDate ? (
              <MetaRow
                label={model.expired ? 'Expired:' : 'Valid until:'}
                value={model.expiryDate}
              />
            ) : null}
          </View>
        </View>

        {/* ---- Expired: say so, keep every price on the page ---- */}
        {model.expired ? (
          <View style={styles.notice} wrap={false}>
            <Text style={styles.noticeTitle}>This quote has passed its expiry date</Text>
            <Text style={styles.noticeBody}>
              {model.expiryDate
                ? `The pricing below was valid until ${model.expiryDate}. `
                : 'The pricing below has passed its valid-until date. '}
              It may still be available, and we are happy to refresh it for you
              {model.repName ? ` - just get in touch with ${model.repName}` : ''}.
            </Text>
          </View>
        ) : null}

        {/* ---- Who it is for, and who to reply to ---- */}
        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.partyHeading}>PREPARED FOR</Text>
            {model.customerCompany ? (
              <Text style={styles.partyName}>{model.customerCompany}</Text>
            ) : null}
            {model.customerName ? <Text style={styles.partyLine}>{model.customerName}</Text> : null}
            {!model.customerCompany && !model.customerName ? (
              <Text style={styles.partyLine}>Your custom quotation</Text>
            ) : null}
          </View>
          <View style={styles.partyGap} />
          <View style={styles.party}>
            <Text style={styles.partyHeading}>YOUR PERFECT IMPRINTS CONTACT</Text>
            {model.repName ? <Text style={styles.partyName}>{model.repName}</Text> : null}
            {model.repEmail ? <Text style={styles.partyLine}>{model.repEmail}</Text> : null}
            {model.repPhone ? <Text style={styles.partyLine}>{model.repPhone}</Text> : null}
            {!model.repName && !model.repEmail && !model.repPhone ? (
              <Text style={styles.partyLine}>
                Reply to the email this quote came from and we will pick it up.
              </Text>
            ) : null}
          </View>
        </View>

        {/* ---- The line items ---- */}
        {hasLines ? (
          <>
            <TableHead model={model} />
            {model.lines.map((line) => (
              <LineRow key={line.key} line={line} model={model} images={images} />
            ))}
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No items have been added to this quote yet.</Text>
          </View>
        )}

        {/* ---- Totals: computed from the stored line fields, never stored ---- */}
        {hasLines ? (
          <View style={styles.totalsWrap} wrap={false}>
            <View style={styles.totals}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotal</Text>
                <Text style={styles.totalsValue}>{formatUsd(model.subtotal)}</Text>
              </View>
              {model.shippingTotal > 0 ? (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Shipping</Text>
                  <Text style={styles.totalsValue}>{formatUsd(model.shippingTotal)}</Text>
                </View>
              ) : null}
              {model.salesTax > 0 ? (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Sales tax</Text>
                  <Text style={styles.totalsValue}>{formatUsd(model.salesTax)}</Text>
                </View>
              ) : null}
              <View style={styles.grandRow}>
                <Text style={styles.grandLabel}>Total</Text>
                <Text style={styles.grandValue}>{formatUsd(model.grandTotal)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ---- Terms ---- */}
        <View style={styles.terms} wrap={false}>
          <Text style={styles.termsText}>
            This is a quotation, not an invoice. Nothing is ordered and nothing is charged until you
            approve it.
            {model.expiryDate && !model.expired ? ` Pricing shown holds until ${model.expiryDate}.` : ''}
          </Text>
          <Text style={styles.termsText}>
            Prices are in US dollars and cover the items and quantities shown. Freight, taxes and
            artwork changes can affect the final invoice, and we will confirm anything that moves
            before you approve.
          </Text>
        </View>

        {/* ---- Repeating page footer ---- */}
        <View style={styles.pageFooter} fixed>
          <Text style={styles.footerText}>
            {model.quoteNumber ? `Quote ${model.quoteNumber} - ` : ''}Perfect Imprints
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
