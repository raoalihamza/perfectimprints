import Link from 'next/link';

/**
 * Server-rendered, URL-based pagination for /promotional-products. Builds hrefs
 * that preserve the active filter/sort query params and set `page`, so no client
 * JS is needed and each page is a real, crawl-able URL (page 2+ is noindex via
 * the route's generateMetadata).
 */
export function PromoPagination({
  page,
  totalPages,
  baseQuery,
}: {
  page: number;
  totalPages: number;
  /** Current query string (filters + sort), without the `page` param. */
  baseQuery: string;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(baseQuery);
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    const qs = params.toString();
    return `/promotional-products${qs ? `?${qs}` : ''}`;
  };

  // Windowed page numbers: first, current±1, last (with ellipses).
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const linkCls =
    'inline-flex h-10 min-w-10 items-center justify-center rounded border border-border bg-white px-3 text-sm font-medium text-brand-ink hover:border-brand-ink';
  const activeCls =
    'inline-flex h-10 min-w-10 items-center justify-center rounded border border-brand-ink bg-brand-ink px-3 text-sm font-semibold text-white';
  const disabledCls =
    'inline-flex h-10 min-w-10 cursor-not-allowed items-center justify-center rounded border border-border bg-bg-soft px-3 text-sm font-medium text-text-muted';

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkCls} rel="prev">
          ← Prev
        </Link>
      ) : (
        <span className={disabledCls} aria-disabled>
          ← Prev
        </span>
      )}

      {list.map((p, i) => {
        const prev = list[i - 1];
        const gap = prev !== undefined && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-2">
            {gap && <span className="px-1 text-text-muted">…</span>}
            {p === page ? (
              <span className={activeCls} aria-current="page">
                {p}
              </span>
            ) : (
              <Link href={href(p)} className={linkCls}>
                {p}
              </Link>
            )}
          </span>
        );
      })}

      {page < totalPages ? (
        <Link href={href(page + 1)} className={linkCls} rel="next">
          Next →
        </Link>
      ) : (
        <span className={disabledCls} aria-disabled>
          Next →
        </span>
      )}
    </nav>
  );
}
