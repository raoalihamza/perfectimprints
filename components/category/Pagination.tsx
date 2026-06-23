import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Clean base URL for the category, e.g. "/cat/water-bottles". No trailing slash, no /page/N. */
  baseUrl: string;
  /**
   * When provided, pagination is CLIENT-driven (buttons calling this instead of
   * path-based <Link>s). Used for filtered views in CategoryShell, where the
   * static page URL stays put and the grid re-paginates in-browser.
   */
  onPageChange?: (page: number) => void;
}

function pageHref(baseUrl: string, page: number): string {
  return page <= 1 ? baseUrl : `${baseUrl}/page/${page}`;
}

/** A page control that is a path <Link> by default, or a client button when `onPageChange` is set. */
function PageControl({
  page,
  baseUrl,
  onPageChange,
  className,
  prefetch,
  rel,
  ariaLabel,
  children,
}: {
  page: number;
  baseUrl: string;
  onPageChange?: (page: number) => void;
  className: string;
  prefetch?: boolean;
  rel?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  if (onPageChange) {
    return (
      <button type="button" onClick={() => onPageChange(page)} className={className} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }
  return (
    <Link href={pageHref(baseUrl, page)} prefetch={prefetch} className={className} rel={rel} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  const pages: (number | 'ellipsis')[] = [];
  const windowSize = 2;
  const showFirst = 1;
  const showLast = totalPages;

  const start = Math.max(showFirst + 1, currentPage - windowSize);
  const end = Math.min(showLast - 1, currentPage + windowSize);

  pages.push(showFirst);
  if (start > showFirst + 1) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < showLast - 1) pages.push('ellipsis');
  if (showLast > showFirst) pages.push(showLast);

  return pages;
}

const baseBtn =
  'inline-flex h-10 min-w-10 items-center justify-center rounded border border-border bg-white px-3 text-sm font-medium text-brand-ink transition hover:border-brand-ink hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2';
const activeBtn =
  'inline-flex h-10 min-w-10 items-center justify-center rounded border border-brand-ink bg-brand-ink px-3 text-sm font-semibold text-white';
const disabledBtn =
  'inline-flex h-10 min-w-10 items-center justify-center rounded border border-border bg-bg-soft px-3 text-sm font-medium text-text-muted/60 cursor-not-allowed';

export function Pagination({ currentPage, totalPages, baseUrl, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const prevPage = currentPage - 1;
  const nextPage = currentPage + 1;
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <nav
      aria-label="Category pagination"
      className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-6"
    >
      {/* Mobile: prev / "N of M" / next */}
      <div className="flex w-full items-center justify-between gap-3 sm:hidden">
        {hasPrev ? (
          <PageControl page={prevPage} baseUrl={baseUrl} onPageChange={onPageChange} prefetch className={baseBtn} rel="prev">
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </PageControl>
        ) : (
          <span className={disabledBtn} aria-disabled="true">
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </span>
        )}
        <span className="text-sm font-medium text-text-primary" aria-live="polite">
          Page {currentPage} of {totalPages}
        </span>
        {hasNext ? (
          <PageControl page={nextPage} baseUrl={baseUrl} onPageChange={onPageChange} prefetch className={baseBtn} rel="next">
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </PageControl>
        ) : (
          <span className={disabledBtn} aria-disabled="true">
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </span>
        )}
      </div>

      {/* Desktop: full numbered nav */}
      <div className="hidden flex-wrap items-center justify-center gap-2 sm:flex">
        {hasPrev ? (
          <PageControl page={prevPage} baseUrl={baseUrl} onPageChange={onPageChange} prefetch className={baseBtn} rel="prev">
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </PageControl>
        ) : (
          <span className={disabledBtn} aria-disabled="true">
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </span>
        )}

        {pages.map((p, idx) => {
          if (p === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${idx}`}
                className="px-2 text-sm text-text-muted"
                aria-hidden="true"
              >
                &hellip;
              </span>
            );
          }
          const isActive = p === currentPage;
          if (isActive) {
            return (
              <span key={p} aria-current="page" className={activeBtn}>
                {p}
              </span>
            );
          }
          // Prefetch only adjacent pages — avoids wasted requests on a 17-page grid.
          const isAdjacent = p === prevPage || p === nextPage;
          return (
            <PageControl
              key={p}
              page={p}
              baseUrl={baseUrl}
              onPageChange={onPageChange}
              prefetch={isAdjacent}
              className={baseBtn}
              ariaLabel={`Page ${p}`}
            >
              {p}
            </PageControl>
          );
        })}

        {hasNext ? (
          <PageControl page={nextPage} baseUrl={baseUrl} onPageChange={onPageChange} prefetch className={baseBtn} rel="next">
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </PageControl>
        ) : (
          <span className={disabledBtn} aria-disabled="true">
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </span>
        )}
      </div>
    </nav>
  );
}
