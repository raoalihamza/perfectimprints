// TODO: M5-507 - Videos index page.

import { Container } from '@/components/ui/Container';

export const metadata = { title: 'Videos' };

export default function VideosIndexPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Videos</h1>
      <p className="mt-4 text-text-primary">Video grid wired in M5-507.</p>
    </Container>
  );
}
