// TODO: M5-501 - Build full home page from `homePage` Sanity singleton.

import { Container } from '@/components/ui/Container';

export default function HomePage() {
  return (
    <Container as="section" className="py-16">
      <h1>Perfect Imprints</h1>
      <p className="mt-4 max-w-prose text-text-primary">
        Custom promotional products, branded apparel, and corporate gifts. Built for
        marketers, HR, and business owners who want items that get used, remembered, and
        deliver ROI.
      </p>
      <p className="mt-6 text-sm text-text-muted">
        Home page content (hero, featured blocks, brands grid) is wired up in M5-501.
      </p>
    </Container>
  );
}
