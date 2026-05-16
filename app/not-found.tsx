import Link from 'next/link';
import { Container } from '@/components/ui/Container';

export default function NotFound() {
  return (
    <Container as="section" className="py-20 text-center">
      <h1 className="text-balance">Page not found</h1>
      <p className="mx-auto mt-4 max-w-prose text-text-primary">
        We could not find the page you were looking for. Try searching or head back to the
        home page.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded bg-brand-green px-5 font-medium text-white hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          Back to home
        </Link>
        <Link
          href="/contact"
          className="inline-flex h-11 items-center justify-center rounded border border-brand-ink px-5 font-medium text-brand-ink hover:bg-brand-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2"
        >
          Contact us
        </Link>
      </div>
    </Container>
  );
}
