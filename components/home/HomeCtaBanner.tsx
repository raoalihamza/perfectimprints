import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import type { HomeCtaBannerCopy } from '@/lib/sanity/queries/home';

const DEFAULT_TITLE = 'Need help choosing the right promotional products?';
const DEFAULT_BODY = 'Talk to a product specialist Monday through Friday, 8am to 5pm CT.';
const DEFAULT_BUTTON_LABEL = 'Request a Free Quote';
const DEFAULT_BUTTON_HREF = '/contact';

interface HomeCtaBannerProps {
  copy: HomeCtaBannerCopy;
}

export function HomeCtaBanner({ copy }: HomeCtaBannerProps) {
  const title = copy.title?.trim() || DEFAULT_TITLE;
  const body = copy.body?.trim() || DEFAULT_BODY;
  const buttonLabel = copy.buttonLabel?.trim() || DEFAULT_BUTTON_LABEL;
  const buttonHref = copy.buttonHref?.trim() || DEFAULT_BUTTON_HREF;

  return (
    <section className="bg-brand-red text-white">
      <Container className="flex flex-col items-start gap-6 py-10 md:flex-row md:items-center md:justify-between lg:py-12">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold leading-tight md:text-3xl">{title}</h2>
          <p className="mt-2 text-white/85">{body}</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            href={buttonHref}
            className="inline-flex h-12 items-center justify-center rounded bg-white px-6 font-semibold text-brand-red shadow-sm transition hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-red"
          >
            {buttonLabel}
          </Link>
          <a
            href="tel:8007739472"
            className="text-base font-medium text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-red"
          >
            Or call 800-773-9472
          </a>
        </div>
      </Container>
    </section>
  );
}
