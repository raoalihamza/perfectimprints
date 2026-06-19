import { cn } from '@/lib/utils';

/** Base shimmer block. Compose into route-level loading.tsx skeletons. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-bg-soft', className)} aria-hidden="true" />;
}

/** One product-card placeholder, matching ProductCard's aspect + spacing. */
function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded border border-border bg-white">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-5 w-1/3" />
      </div>
    </div>
  );
}

/** Grid of product-card placeholders. Matches ProductGrid's column counts. */
export function ProductGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Filter-sidebar placeholder (matches the 260px rail). */
export function FilterSidebarSkeleton() {
  return (
    <div className="hidden rounded-md border border-border p-5 lg:block">
      <Skeleton className="mb-4 h-5 w-40" />
      {Array.from({ length: 4 }).map((_, s) => (
        <div key={s} className="mb-6">
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, r) => (
              <Skeleton key={r} className="h-3.5 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sidebar + product-grid placeholder used by category/search/brand loaders. */
export function FacetedResultsSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <FilterSidebarSkeleton />
      <div>
        <Skeleton className="mb-4 h-6 w-40" />
        <ProductGridSkeleton count={count} />
      </div>
    </div>
  );
}
