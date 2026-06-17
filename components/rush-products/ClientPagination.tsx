'use client';

interface ClientPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
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

export function ClientPagination({
  currentPage,
  totalPages,
  onPageChange,
}: ClientPaginationProps) {
  if (totalPages <= 1) return null;

  const prevPage = currentPage - 1;
  const nextPage = currentPage + 1;
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <nav
      aria-label="Rush products pagination"
      className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-6"
    >
      <div className="flex w-full items-center justify-between gap-3 sm:hidden">
        {hasPrev ? (
          <button type="button" onClick={() => onPageChange(prevPage)} className={baseBtn}>
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </button>
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
          <button type="button" onClick={() => onPageChange(nextPage)} className={baseBtn}>
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </button>
        ) : (
          <span className={disabledBtn} aria-disabled="true">
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </span>
        )}
      </div>

      <div className="hidden flex-wrap items-center justify-center gap-2 sm:flex">
        {hasPrev ? (
          <button type="button" onClick={() => onPageChange(prevPage)} className={baseBtn}>
            <span aria-hidden>&larr;</span>
            <span className="ml-1">Previous</span>
          </button>
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
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={baseBtn}
              aria-label={`Page ${p}`}
            >
              {p}
            </button>
          );
        })}

        {hasNext ? (
          <button type="button" onClick={() => onPageChange(nextPage)} className={baseBtn}>
            <span className="mr-1">Next</span>
            <span aria-hidden>&rarr;</span>
          </button>
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
