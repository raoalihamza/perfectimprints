// TODO: M1-104 - Mount Sanity Studio at /admin once project credentials exist.
// Real mount uses NextStudio from next-sanity and the config from /sanity/sanity.config.ts.

import { Container } from '@/components/ui/Container';

export const dynamic = 'force-static';

export default function StudioPage() {
  return (
    <Container as="section" className="py-12">
      <h1>Sanity Studio</h1>
      <p className="mt-4 text-text-primary">
        Studio mount is pending. Once Patrick&apos;s Sanity project is created and the
        environment variables are populated, this route will render the NextStudio embed.
      </p>
      <p className="mt-4 text-sm text-text-muted">
        For local development run <code>pnpm sanity:dev</code> at port 3333.
      </p>
    </Container>
  );
}
