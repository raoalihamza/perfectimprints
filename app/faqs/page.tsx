// TODO: M5-506 - FAQs page.

import { Container } from '@/components/ui/Container';

export const metadata = { title: 'FAQs' };

export default function FaqsPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Frequently Asked Questions</h1>
      <p className="mt-4 text-text-primary">FAQ list wired in M5-506.</p>
    </Container>
  );
}
