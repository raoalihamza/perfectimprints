// TODO: M5-502 - Search results page. Lazy-loads Fuse.js and the prebuilt index.

import { Container } from '@/components/ui/Container';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  return (
    <Container as="section" className="py-12">
      <h1>Search</h1>
      {q ? (
        <p className="mt-2 text-text-muted">
          Query: <strong className="text-text-primary">{q}</strong>
        </p>
      ) : (
        <p className="mt-2 text-text-muted">Enter a query to find categories, blogs, brands.</p>
      )}
      <p className="mt-4 text-sm text-text-muted">Wired in M5-502.</p>
    </Container>
  );
}
