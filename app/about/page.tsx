// TODO: M5-506 - About page.

import { Container } from '@/components/ui/Container';

export const metadata = { title: 'About Us' };

export default function AboutPage() {
  return (
    <Container as="section" className="py-12">
      <h1>About Perfect Imprints</h1>
      <p className="mt-4 text-text-primary">Page wired in M5-506.</p>
    </Container>
  );
}
