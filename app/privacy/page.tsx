// TODO: M5-506 - Privacy page.

import { Container } from '@/components/ui/Container';

export const metadata = { title: 'Privacy & Security' };

export default function PrivacyPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Privacy & Security</h1>
      <p className="mt-4 text-text-primary">Page wired in M5-506.</p>
    </Container>
  );
}
