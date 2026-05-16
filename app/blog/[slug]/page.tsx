// TODO: M4-403 - Blog post page.

import { Container } from '@/components/ui/Container';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Container as="article" className="py-12">
      <h1>Blog post stub</h1>
      <p className="mt-2 text-text-muted">Slug: {slug}</p>
      <p className="mt-4 text-sm text-text-muted">Full template wired in M4-403.</p>
    </Container>
  );
}
