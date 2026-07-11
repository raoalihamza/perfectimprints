import { Container } from '@/components/ui/Container';
import { EmptyStateCTAButton } from './EmptyStateCTAButton';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';

interface CategoryCtaBarProps {
  categoryTitle: string;
  sourceUrl: string;
}

/**
 * The "Not finding the exact [category] you're looking for?" prompt
 * (P2-CTA-001), rendered below the product grid and above the FAQs on every
 * category / facet page that SHOWS PRODUCTS. Pages in EmptyStateCTA mode never
 * render this (they already carry the big CTA in place of the grid).
 *
 * SERVER component — the copy is baked into the static HTML. Wording lives in
 * `globalSettings.categoryCtaBar` and is read via the per-request-deduped
 * `getSiteSettings()` (non-CDN cachedClient + SETTINGS_TAG, revalidate:false):
 * the layout Footer performs the same read in the same render, so this adds
 * ZERO extra Sanity fetches and cannot flip /cat off static prerendering. The
 * `{category}` token in heading/body is replaced with the category name; only
 * the button is a client island (the existing "Find Products for Me" modal
 * wiring, identical lead flow to the empty-state CTA).
 */
export async function CategoryCtaBar({ categoryTitle, sourceUrl }: CategoryCtaBarProps) {
  const { categoryCtaBar } = await getSiteSettings();
  if (!categoryCtaBar.enabled) return null;

  const fill = (text: string) => text.replace(/\{category\}/g, categoryTitle);
  const heading = fill(categoryCtaBar.heading);
  const body = fill(categoryCtaBar.body);
  if (!heading && !body) return null;

  return (
    <Container as="section" className="pb-10">
      <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-bg-soft p-6 sm:p-7 md:flex-row md:items-center md:justify-between md:gap-8">
        <div>
          {heading && (
            <h2 className="text-lg font-semibold leading-snug text-brand-ink md:text-xl">
              {heading}
            </h2>
          )}
          {body && (
            <p className="mt-1.5 text-sm leading-relaxed text-text-primary md:text-base">{body}</p>
          )}
        </div>
        <div className="shrink-0">
          <EmptyStateCTAButton
            categoryTitle={categoryTitle}
            sourceUrl={sourceUrl}
            label={categoryCtaBar.buttonLabel}
          />
        </div>
      </div>
    </Container>
  );
}
