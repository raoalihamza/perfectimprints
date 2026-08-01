import { quoteDescriptionPreview } from '@/lib/quotes/quote-display';

/**
 * A quote line's description with a Read more control (Q-140).
 *
 * A quote with eight long descriptions is unreadable, so anything past the
 * preview length is folded behind a native <details>/<summary> - the same
 * no-JavaScript accordion the FAQ sections use
 * (components/page-sections/FaqAccordion.tsx), so this page needs no client
 * component and its full text is in the static HTML either way.
 *
 * PRINT: a closed <details> does not print its content, and the CSS that
 * forces it open (`::details-content`) is too new to rely on for a customer's
 * saved copy. So the full text is ALSO rendered in a print-only paragraph and
 * the interactive block is hidden when printing (see QuotePrintStyles). The
 * text appears twice in the markup and never twice on screen; that duplication
 * is the price of a printed quote that is guaranteed complete in every browser.
 */
export function QuoteLineDescription({ description }: { description: string | null | undefined }) {
  const parsed = quoteDescriptionPreview(description);
  if (!parsed) return null;

  if (!parsed.needsToggle) {
    return <p className="mt-1 text-sm leading-relaxed text-text-muted">{parsed.full}</p>;
  }

  return (
    <>
      <details className="group quote-screen-only mt-1">
        <summary className="cursor-pointer list-none text-sm leading-relaxed text-text-muted [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">{parsed.preview} </span>
          <span className="font-semibold text-brand-red underline">
            <span className="group-open:hidden">Read more</span>
            <span className="hidden group-open:inline">Read less</span>
          </span>
        </summary>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">{parsed.full}</p>
      </details>
      {/* Print twin: hidden on screen, shown by the print stylesheet. */}
      <p className="quote-print-only mt-1 hidden text-sm leading-relaxed text-text-muted">
        {parsed.full}
      </p>
    </>
  );
}
