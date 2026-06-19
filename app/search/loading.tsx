import { Container } from '@/components/ui/Container';
import { Skeleton, FacetedResultsSkeleton } from '@/components/ui/Skeleton';

// Shown instantly while /search resolves matches server-side (it's dynamic).
export default function SearchLoading() {
  return (
    <Container as="section" className="py-10 sm:py-12">
      <Skeleton className="h-9 w-1/2 sm:h-10" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <Skeleton className="mt-6 h-11 w-full max-w-3xl rounded" />
      <div className="mt-8">
        <FacetedResultsSkeleton count={8} />
      </div>
    </Container>
  );
}
