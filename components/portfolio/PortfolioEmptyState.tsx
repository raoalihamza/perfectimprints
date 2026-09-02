import Link from 'next/link';

/**
 * What /portfolio shows while it holds no published items (PORT-110). This
 * is the page's actual state at launch: Patrick is still photographing his
 * work. A plain, unapologetic notice with two useful exits, no filter
 * sidebar (there is nothing to filter) and no error. The page is noindex and
 * out of the sitemap in this state (see app/portfolio/page.tsx), and both
 * flip automatically once an item is published. Server component: no state,
 * no hooks, no data.
 */
export function PortfolioEmptyState() {
  return (
    <div className="rounded-lg border border-border bg-bg-soft px-6 py-14 text-center">
      <h2 className="text-2xl font-semibold text-brand-ink">Photos are on their way</h2>
      <p className="mx-auto mt-3 max-w-prose leading-relaxed text-text-primary">
        We are photographing recent jobs, from printed shirts and embroidered caps to branded
        drinkware and signs. In the meantime, tell us what you are planning and we will send
        examples of similar work.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/contact"
          className="inline-flex h-11 items-center justify-center rounded bg-brand-green px-5 font-medium text-white hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          Ask for examples
        </Link>
        <Link
          href="/promotional-products"
          className="inline-flex h-11 items-center justify-center rounded border border-border bg-white px-5 font-medium text-brand-ink hover:border-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2"
        >
          Browse products
        </Link>
      </div>
    </div>
  );
}
