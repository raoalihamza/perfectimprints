// TODO: M4-403 - Blog category filter page.

import { Container } from '@/components/ui/Container';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Container as="section" className="py-12">
      <h1>Blog category stub</h1>
      <p className="mt-2 text-text-muted">Category slug: {slug}</p>
      <p className="mt-4 text-sm text-text-muted">Filtered listing wired in M4-403.</p>
    </Container>
  );
}
