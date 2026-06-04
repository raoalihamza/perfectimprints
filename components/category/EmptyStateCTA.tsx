import { EmptyStateCTAButton } from './EmptyStateCTAButton';

interface EmptyStateCTAProps {
  categoryTitle: string;
  sourceUrl: string;
}

export function EmptyStateCTA({ categoryTitle, sourceUrl }: EmptyStateCTAProps) {
  return (
    <section className="rounded-lg border-l-4 border-brand-red bg-bg-soft p-8 sm:p-10">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">
          Don&rsquo;t See The Products Listed? We Still Have Options.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-text-primary md:text-lg">
          Our online catalog only shows a portion of what we can source. Perfect Imprints has access
          to a database of over 1,000,000 promotional products, and our team can personally help you
          find the best options for your event, budget, quantity, and deadline.
        </p>
        <div className="mt-8 flex justify-center">
          <EmptyStateCTAButton categoryTitle={categoryTitle} sourceUrl={sourceUrl} />
        </div>
        <p className="mt-4 text-sm text-text-muted">
          Takes less than 60 seconds. No pressure, just helpful product ideas sent your way fast!
        </p>
      </div>
    </section>
  );
}
