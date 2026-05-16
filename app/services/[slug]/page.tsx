// TODO: M5-506 - Services pages (Kitting, Company Stores, Popup Stores, 100% Custom Products).

import { Container } from '@/components/ui/Container';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  return (
    <Container as="section" className="py-12">
      <h1>Service stub</h1>
      <p className="mt-2 text-text-muted">Slug: {slug}</p>
      <p className="mt-4 text-sm text-text-muted">Page wired in M5-506.</p>
    </Container>
  );
}
