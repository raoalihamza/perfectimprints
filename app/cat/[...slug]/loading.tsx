import { Container } from '@/components/ui/Container';
import { Skeleton, FacetedResultsSkeleton } from '@/components/ui/Skeleton';

// Shown instantly on navigation while the category page renders on the server
// (on-demand SSG / filtered views). Mirrors the real page layout so there's no
// jump when content arrives. Also makes <Link> prefetch effective for the
// dynamic facet routes.
export default function CategoryLoading() {
  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Skeleton className="h-4 w-72 max-w-full" />
      </Container>

      <Container as="section" className="pb-8">
        <Skeleton className="h-9 w-2/3 md:h-12" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full max-w-3xl" />
          <Skeleton className="h-4 w-5/6 max-w-3xl" />
        </div>
      </Container>

      <Container as="section" className="pb-10">
        <FacetedResultsSkeleton count={12} />
      </Container>
    </>
  );
}
