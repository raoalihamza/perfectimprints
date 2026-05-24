interface CTABannerProps {
  categoryTitle: string;
}

export function CTABanner({ categoryTitle }: CTABannerProps) {
  return (
    <section className="mt-16 bg-brand-red text-white">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-start gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8 lg:py-12">
        <div>
          <h2 className="text-2xl font-semibold leading-tight md:text-3xl">
            Need help choosing the right {categoryTitle}? We&rsquo;re here.
          </h2>
          <p className="mt-2 text-white/85">
            Talk to a product specialist Monday through Friday, 8am to 5pm CT.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <a
            href="tel:8007739472"
            className="inline-flex h-12 items-center justify-center rounded bg-white px-6 font-semibold text-brand-red shadow-sm hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-red"
          >
            Call 800-773-9472
          </a>
          <a
            href="mailto:patrick@perfectimprints.com"
            className="text-base font-medium text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-red"
          >
            patrick@perfectimprints.com
          </a>
        </div>
      </div>
    </section>
  );
}
