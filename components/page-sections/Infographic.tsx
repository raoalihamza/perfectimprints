import { SectionShell } from './SectionShell';
import { SectionImage } from './SectionImage';
import type { InfographicSection } from '@/lib/sanity/queries/pages';

export function Infographic({ section }: { section: InfographicSection }) {
  const { image, imageUrl, heading, caption } = section;
  if (!image?.asset?._ref && !imageUrl) {
    // No image yet — render just the heading so the placeholder is visible in Studio drafts.
    if (!heading) return null;
  }
  return (
    <SectionShell>
      {heading && (
        <h2 className="mb-5 text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
      )}
      <SectionImage
        image={image}
        imageUrl={imageUrl}
        alt={heading || caption}
        width={1400}
        className="w-full rounded-md object-contain"
      />
      {caption && <p className="mt-3 text-sm text-text-muted">{caption}</p>}
    </SectionShell>
  );
}
