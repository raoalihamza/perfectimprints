// TODO: M4-403 - Blog index page.

import { Container } from '@/components/ui/Container';

export const metadata = {
  title: 'Promotional Products Blog | Ideas That Actually Work',
  description:
    'Get proven promotional product ideas, trade show strategies, and marketing tips to help your brand stand out and drive real results.',
};

export default function BlogIndexPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Promotional Products Blog: Ideas That Actually Work</h1>
      <p className="mt-4 max-w-prose text-text-primary">
        Stay ahead with proven promotional product ideas, trade show strategies, and
        real-world marketing insights that actually drive results.
      </p>
      <p className="mt-6 text-sm text-text-muted">
        Blog index (submenu, grid, pagination) wired in M4-403.
      </p>
    </Container>
  );
}
