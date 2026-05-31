import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Clean base URL for the category, e.g. "/cat/water-bottles". No trailing slash, no /page/N. */
  baseUrl: string;
}

function pageHref(baseUrl: string, page: number): string {
  return page <= 1 ? baseUrl : `${baseUrl}/page/${page}`;
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

export function Pagination({ currentPage, totalPages, baseUrl }: PaginationProps) {
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
          <Link href={pageHref(baseUrl, prevPage)} prefetch className={baseBtn} rel="prev">
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </Link>
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
          <Link href={pageHref(baseUrl, nextPage)} prefetch className={baseBtn} rel="next">
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </Link>
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
          <Link href={pageHref(baseUrl, prevPage)} prefetch className={baseBtn} rel="prev">
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </Link>
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
          // Prefetch only adjacent pages — rendering Link with prefetch=false for everything
          // else avoids wasted requests on a 17-page apparel grid.
          const isAdjacent = p === prevPage || p === nextPage;
          return (
            <Link
              key={p}
              href={pageHref(baseUrl, p)}
              prefetch={isAdjacent ? true : false}
              className={baseBtn}
              aria-label={`Page ${p}`}
            >
              {p}
            </Link>
          );
        })}

        {hasNext ? (
          <Link href={pageHref(baseUrl, nextPage)} prefetch className={baseBtn} rel="next">
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </Link>
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
