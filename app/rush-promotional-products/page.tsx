// Legacy preserved URL (CLAUDE.md §4). The live rush aggregator lives at
// /rush-products; this URL resolves (no redirect for preserved URLs) but
// canonicalizes to /rush-products so SEO equity points at the real content
// instead of this thin placeholder.

import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

export const metadata: Metadata = {
  title: { absolute: 'Rush Promotional Products | Perfect Imprints' },
  description:
    'Need custom promotional products fast? Shop rush and 24-hour production promotional items with bulk pricing and quick turnaround for trade shows and events.',
  alternates: { canonical: `${SITE_URL}/rush-products` },
};

export default function RushPromotionalProductsPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Rush Promotional Products</h1>
      <p className="mt-4 text-text-primary">Page content wired in M5-506.</p>
    </Container>
  );
}
