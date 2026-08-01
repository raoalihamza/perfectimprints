/**
 * Print stylesheet for the customer quote page (Q-140).
 *
 * Until the PDF ships, the browser's own "Print to PDF" is how a customer
 * saves or forwards a quote, so a printed quote has to look like a document
 * rather than a screenshot of a website. This hides the site chrome (the
 * sticky header and the dark footer), drops the screen-only controls, and
 * keeps a line item from splitting across a page break.
 *
 * Scoped by construction: this <style> element is rendered ONLY by the quote
 * page, so `body > header` / `body > footer` cannot affect any other route.
 * `dangerouslySetInnerHTML` is used because React escapes text children, and an
 * escaped `>` would break the child-combinator selectors.
 */

const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }

  /* Site chrome: the sticky header and the dark footer are not part of the
     quote. Both are direct children of <body> (rendered by the root layout). */
  body > header,
  body > footer { display: none !important; }

  body { background: #fff !important; color: #000 !important; font-size: 11pt; }

  /* Screen-only affordances: the "Read more" control and anything else that
     only makes sense with a pointer. Their print twin carries the same text. */
  .quote-screen-only { display: none !important; }
  .quote-print-only { display: block !important; }

  /* Keep a line item, and the totals, whole on one page. */
  .quote-line,
  .quote-totals,
  .quote-header { break-inside: avoid; page-break-inside: avoid; }

  /* Flat, ink-friendly surfaces - printers render heavy fills badly and most
     browsers strip backgrounds anyway. */
  .quote-surface {
    background: transparent !important;
    border-color: #999 !important;
  }
}
`;

export function QuotePrintStyles() {
  return <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />;
}
