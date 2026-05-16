// TODO: M5-506 - Contact page with embedded lead form.

import { Container } from '@/components/ui/Container';

export const metadata = { title: 'Contact Us' };

export default function ContactPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Contact Us</h1>
      <p className="mt-4 text-text-primary">
        Call <a href="tel:800-773-9472" className="underline">800-773-9472</a> or send a
        message. Form wires up in M3-308.
      </p>
    </Container>
  );
}
