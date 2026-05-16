// TODO: M5-506 - Terms page.

import { Container } from '@/components/ui/Container';

export const metadata = { title: 'Terms of Use' };

export default function TermsPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Terms of Use</h1>
      <p className="mt-4 text-text-primary">Page wired in M5-506.</p>
    </Container>
  );
}
