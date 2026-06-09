import Link from 'next/link';

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
}

function pageHref(baseUrl: string, page: number): string {
  return page <= 1 ? baseUrl : `${baseUrl}/page/${page}`;
}

const baseBtn =
  'inline-flex h-10 min-w-10 items-center justify-center rounded border border-border bg-white px-3 text-sm font-medium text-brand-ink transition hover:border-brand-ink hover:bg-bg-soft';
const activeBtn =
  'inline-flex h-10 min-w-10 items-center justify-center rounded border border-brand-ink bg-brand-ink px-3 text-sm font-semibold text-white';
const disabledBtn =
  'inline-flex h-10 min-w-10 items-center justify-center rounded border border-border bg-bg-soft px-3 text-sm font-medium text-text-muted/60 cursor-not-allowed';

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  const pages: (number | 'ellipsis')[] = [];
  const windowSize = 2;
  const start = Math.max(2, currentPage - windowSize);
  const end = Math.min(totalPages - 1, currentPage + windowSize);
  pages.push(1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push('ellipsis');
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

export function BlogPagination({ currentPage, totalPages, baseUrl }: BlogPaginationProps) {
  if (totalPages <= 1) return null;
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <nav aria-label="Blog pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-border pt-6">
      {hasPrev ? (
        <Link href={pageHref(baseUrl, currentPage - 1)} prefetch rel="prev" className={baseBtn}>
          ← Previous
        </Link>
      ) : (
        <span className={disabledBtn}>← Previous</span>
      )}
      {pages.map((p, i) => {
        if (p === 'ellipsis') {
          return (
            <span key={`e-${i}`} className="px-2 text-sm text-text-muted">
              …
            </span>
          );
        }
        if (p === currentPage) {
          return (
            <span key={p} aria-current="page" className={activeBtn}>
              {p}
            </span>
          );
        }
        const isAdj = p === currentPage - 1 || p === currentPage + 1;
        return (
          <Link
            key={p}
            href={pageHref(baseUrl, p)}
            prefetch={isAdj}
            className={baseBtn}
            aria-label={`Page ${p}`}
          >
            {p}
          </Link>
        );
      })}
      {hasNext ? (
        <Link href={pageHref(baseUrl, currentPage + 1)} prefetch rel="next" className={baseBtn}>
          Next →
        </Link>
      ) : (
        <span className={disabledBtn}>Next →</span>
      )}
    </nav>
  );
}
