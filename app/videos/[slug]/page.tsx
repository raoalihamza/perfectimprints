// TODO: M5-507 - Video detail page (YouTube embed + related videos).

import { Container } from '@/components/ui/Container';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function VideoDetailPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Container as="article" className="py-12">
      <h1>Video stub</h1>
      <p className="mt-2 text-text-muted">Slug: {slug}</p>
      <p className="mt-4 text-sm text-text-muted">Detail page wired in M5-507.</p>
    </Container>
  );
}
