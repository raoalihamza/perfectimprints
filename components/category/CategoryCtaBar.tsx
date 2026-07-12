import { Container } from '@/components/ui/Container';
import { EmptyStateCTAButton } from './EmptyStateCTAButton';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';

interface CategoryCtaBarProps {
  /**
   * Context name: the category title (category variant — also fills the
   * `{category}` token) or the video title (video variant). Passed to the lead
   * modal as `categoryTitle` either way, so Patrick sees where the lead came from.
   */
  categoryTitle: string;
  sourceUrl: string;
  /** Which Global Settings copy variant to render. Default: the category bar. */
  variant?: 'category' | 'video';
  /**
   * Render the bare bar without the page-level <Container> wrapper — for
   * placement inside a narrower column (e.g. the video article's max-w-4xl).
   */
  inline?: boolean;
}

/**
 * The lead-capture CTA bar (P2-CTA-001), one shared component for two surfaces:
 *
 * - `variant="category"` — "Not finding the exact [category] you're looking
 *   for?" below the product grid / above the FAQs on every product-bearing
 *   category / facet page. EmptyStateCTA-mode pages never render this (they
 *   already carry the big CTA in place of the grid). `{category}` in the copy
 *   is replaced with the category name.
 * - `variant="video"` — "Need help choosing the right Promotional Products?
 *   We're here." on `/videos/<slug>`, below the related-products strip. There
 *   is no category on a video page, so a `{category}` token typed into the
 *   copy substitutes a generic "promotional products" instead of leaking raw.
 *
 * SERVER component — the copy is baked into the static HTML. Wording lives in
 * `globalSettings.categoryCtaBar` / `.videoCtaBar` and is read via the
 * per-request-deduped `getSiteSettings()` (non-CDN cachedClient + SETTINGS_TAG,
 * revalidate:false): the layout Footer performs the same read in the same
 * render, so this adds ZERO extra Sanity fetches and cannot flip the host
 * route off static prerendering. Only the button is a client island (the
 * existing "Find Products for Me" modal wiring, identical lead flow to the
 * empty-state CTA).
 */
export async function CategoryCtaBar({
  categoryTitle,
  sourceUrl,
  variant = 'category',
  inline = false,
}: CategoryCtaBarProps) {
  const settings = await getSiteSettings();
  const bar = variant === 'video' ? settings.videoCtaBar : settings.categoryCtaBar;
  if (!bar.enabled) return null;

  const tokenValue = variant === 'video' ? 'promotional products' : categoryTitle;
  const fill = (text: string) => text.replace(/\{category\}/g, tokenValue);
  const heading = fill(bar.heading);
  const body = fill(bar.body);
  if (!heading && !body) return null;

  const barEl = (
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
          label={bar.buttonLabel}
        />
      </div>
    </div>
  );

  // Inline mode carries its own top margin so a disabled bar leaves no
  // spacing artifact behind (the whole component renders nothing).
  if (inline) return <section className="mt-10">{barEl}</section>;
  return (
    <Container as="section" className="pb-10">
      {barEl}
    </Container>
  );
}
