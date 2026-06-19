import { Container } from '@/components/ui/Container';
import { Skeleton, ProductGridSkeleton } from '@/components/ui/Skeleton';

// Shown instantly on navigation to a brand page (e.g. from search) while it renders.
export default function BrandLoading() {
  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Skeleton className="h-4 w-64 max-w-full" />
      </Container>

      <Container as="section" className="pb-8">
        <Skeleton className="h-9 w-1/2 md:h-12" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full max-w-3xl" />
          <Skeleton className="h-4 w-4/6 max-w-3xl" />
        </div>
      </Container>

      <Container as="section" className="pb-10">
        <ProductGridSkeleton count={12} />
      </Container>
    </>
  );
}
