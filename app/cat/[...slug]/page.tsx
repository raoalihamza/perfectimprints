// TODO: M3-301 - Dynamic catch-all route for all 22,181 category URLs.
// generateStaticParams reads data/pi-urls/category-urls.json + paginated variants.
// loadCategory(): Sanity-first, JSON fallback, then 404.

import { Container } from '@/components/ui/Container';

interface Props {
  params: Promise<{ slug: string[] }>;
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const url = `/cat/${slug.join('/')}`;
  return (
    <Container as="section" className="py-12">
      <h1>Category page stub</h1>
      <p className="mt-2 text-text-muted">URL: {url}</p>
      <p className="mt-4 text-sm text-text-muted">
        Full template wired in M3-301 through M3-310.
      </p>
    </Container>
  );
}
