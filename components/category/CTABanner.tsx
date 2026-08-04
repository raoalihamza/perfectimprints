import Link from 'next/link';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';

interface CTABannerProps {
  categoryTitle: string;
}

export async function CTABanner({ categoryTitle }: CTABannerProps) {
  // Hours come from globalSettings.hoursOfOperation (same field the footer
  // renders, so the two can never disagree). getSiteSettings() is React-cache()d
  // and already fetched by the layout Footer in the same render — zero extra
  // Sanity reads, and the tagged read keeps every host page static.
  const { contact } = await getSiteSettings();
  const hours =
    contact.hours?.replace(/\s*\n\s*/g, ', ') ?? 'Monday through Friday, 9am to 5pm EST';
  return (
    <section className="mt-16 bg-brand-red text-white">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-start gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8 lg:py-12">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold leading-tight md:text-3xl">
            Need help choosing the right {categoryTitle}? We&rsquo;re here.
          </h2>
          <p className="mt-2 text-white/85">Talk to a product specialist {hours}.</p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center md:shrink-0">
          <a
            href="tel:8007739472"
            className="inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded bg-white px-6 font-semibold text-brand-red shadow-sm hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-red"
          >
            Call 800-773-9472
          </a>
          <Link
            href="/contact"
            className="inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded border-2 border-white px-6 font-semibold text-white hover:bg-white hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-red"
          >
            Email Us
          </Link>
        </div>
      </div>
    </section>
  );
}
