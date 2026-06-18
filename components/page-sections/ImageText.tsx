import { PortableText } from '@portabletext/react';
import { SectionShell } from './SectionShell';
import { SectionImage } from './SectionImage';
import { pagePortableComponents } from './portable-text';
import type { ImageTextSection } from '@/lib/sanity/queries/pages';

/**
 * Stacks vertically: heading → full-width image → body text. The heading is
 * never overlaid on the image (only the hero banner does that intentionally).
 * Single column on every breakpoint, so it's mobile-responsive by default and
 * aligns to the same content column as every other section (SectionShell).
 */
export function ImageText({ section }: { section: ImageTextSection }) {
  const { image, imageUrl, heading, body } = section;
  const hasImage = Boolean(image?.asset?._ref || imageUrl);

  return (
    <SectionShell>
      {heading && <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>}
      {hasImage && (
        <SectionImage
          image={image}
          imageUrl={imageUrl}
          alt={heading}
          width={1400}
          className="mt-5 w-full rounded-md object-contain"
        />
      )}
      {body && body.length > 0 && (
        <div className="mt-5">
          <PortableText value={body} components={pagePortableComponents} />
        </div>
      )}
    </SectionShell>
  );
}
