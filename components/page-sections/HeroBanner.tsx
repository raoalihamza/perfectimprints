import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SectionImage } from './SectionImage';
import { FormModalButton } from '@/components/forms/FormModalButton';
import { getFormBySlug, toFormRenderDef } from '@/lib/sanity/queries/forms';
import type { FormDef } from '@/lib/forms/form-def';
import type { HeroBannerSection } from '@/lib/sanity/queries/pages';

const ctaClass =
  'mt-6 inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white hover:opacity-90';

// A hero CTA with a resolved form-builder form (P2-FB-001) opens it in a
// modal; otherwise it is the pre-existing link. An unresolved form slug falls
// back to the link so the CTA never dead-ends.
function Cta({ label, href, form }: { label?: string; href?: string; form?: FormDef | null }) {
  if (!label) return null;
  if (form) return <FormModalButton form={form} label={label} className={ctaClass} />;
  if (!href) return null;
  const external = /^https?:\/\//i.test(href);
  return external ? (
    <a href={href} className={ctaClass}>
      {label}
    </a>
  ) : (
    <Link href={href} className={ctaClass}>
      {label}
    </Link>
  );
}

export async function HeroBanner({ section }: { section: HeroBannerSection }) {
  const { image, imageUrl, heading, subheading, overlayText, ctaLabel, ctaHref, ctaFormSlug } =
    section;
  const hasImage = Boolean(image?.asset?._ref || imageUrl);
  // Tag-cached read (FORMS_TAG + form:<slug>) — static-safe, webhook-revalidated.
  const formDoc = ctaFormSlug ? await getFormBySlug(ctaFormSlug) : null;
  const form = formDoc ? toFormRenderDef(formDoc) : null;

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
          <Cta label={ctaLabel} href={ctaHref} form={form} />
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
        <Cta label={ctaLabel} href={ctaHref} form={form} />
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
