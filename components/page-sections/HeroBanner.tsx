import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SectionImage } from './SectionImage';
import type { HeroBannerSection } from '@/lib/sanity/queries/pages';

function Cta({ label, href }: { label?: string; href?: string }) {
  if (!label || !href) return null;
  const external = /^https?:\/\//i.test(href);
  const cls =
    'mt-6 inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white hover:opacity-90';
  return external ? (
    <a href={href} className={cls}>
      {label}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

export function HeroBanner({ section }: { section: HeroBannerSection }) {
  const { image, imageUrl, heading, subheading, overlayText, ctaLabel, ctaHref } = section;
  const hasImage = Boolean(image?.asset?._ref || imageUrl);

  if (overlayText && hasImage) {
    return (
      <section className="relative isolate overflow-hidden bg-brand-ink">
        <SectionImage
          image={image}
          imageUrl={imageUrl}
          alt={heading}
          width={1920}
          priority
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <Container className="relative z-10 flex min-h-[260px] flex-col justify-center py-14 md:min-h-[360px]">
          {heading && (
            <h1 className="max-w-3xl text-3xl font-bold leading-tight text-white drop-shadow md:text-5xl">
              {heading}
            </h1>
          )}
          {subheading && (
            <p className="mt-4 max-w-2xl text-lg text-white/90 drop-shadow md:text-xl">
              {subheading}
            </p>
          )}
          <Cta label={ctaLabel} href={ctaHref} />
        </Container>
      </section>
    );
  }

  // Non-overlay: heading + subheading + CTA stacked on top, then the banner
  // image full-width below (object-contain so the whole graphic shows, never
  // cropped). This is the default service-page hero.
  return (
    <section className="bg-bg-soft">
      <Container className="py-10 text-center">
        {heading && (
          <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-5xl">{heading}</h1>
        )}
        {subheading && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-text-primary md:text-xl">
            {subheading}
          </p>
        )}
        <Cta label={ctaLabel} href={ctaHref} />
      </Container>
      {hasImage && (
        <Container className="pb-10">
          <SectionImage
            image={image}
            imageUrl={imageUrl}
            alt={heading}
            width={1400}
            priority
            className="mx-auto w-full max-w-5xl rounded-md object-contain"
          />
        </Container>
      )}
    </section>
  );
}
