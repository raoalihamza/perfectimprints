import type { PageSection } from '@/lib/sanity/queries/pages';
import { HeroBanner } from './HeroBanner';
import { RichText } from './RichText';
import { ImageText } from './ImageText';
import { Infographic } from './Infographic';
import { IconFeatures } from './IconFeatures';
import { StatBanner } from './StatBanner';
import { CardGrid } from './CardGrid';
import { CtaBlock } from './CtaBlock';
import { EventList } from './EventList';
import { VideoEmbedSection } from './VideoEmbedSection';
import { FaqAccordion } from './FaqAccordion';
import { ProductStrip } from './ProductStrip';
import { PortfolioGallerySection } from '@/components/portfolio/PortfolioGallerySection';

/**
 * Maps each section `_type` to its renderer. Hidden sections are skipped here,
 * so the page-builder's per-section hide toggle works without each component
 * re-checking. Unknown types render nothing (forward-compatible if a new
 * section type ships in Studio before its renderer).
 */
function renderSection(section: PageSection) {
  switch (section._type) {
    case 'heroBanner':
      return <HeroBanner section={section} />;
    case 'richText':
      return <RichText section={section} />;
    case 'imageText':
      return <ImageText section={section} />;
    case 'infographic':
      return <Infographic section={section} />;
    case 'iconFeatures':
      return <IconFeatures section={section} />;
    case 'statBanner':
      return <StatBanner section={section} />;
    case 'cardGrid':
      return <CardGrid section={section} />;
    case 'ctaBlock':
      return <CtaBlock section={section} />;
    case 'eventList':
      return <EventList section={section} />;
    case 'videoEmbed':
      return <VideoEmbedSection section={section} />;
    case 'faqAccordion':
      return <FaqAccordion section={section} />;
    case 'productStrip':
      return <ProductStrip section={section} />;
    // PORT-120: the shared Portfolio Gallery block as a page section. The
    // block's own `hidden` is the section `hidden` this renderer already
    // honours; the component resolves and renders, or renders nothing.
    case 'portfolioGallery':
      return <PortfolioGallerySection gallery={section} host="section" layout="section" />;
    default:
      return null;
  }
}

export function SectionRenderer({ sections }: { sections: PageSection[] }) {
  return (
    <>
      {sections
        .filter((s) => !s.hidden)
        .map((section) => (
          <div
            key={section._key}
            id={section.anchorId || undefined}
            className={section.anchorId ? 'scroll-mt-24' : undefined}
          >
            {renderSection(section)}
          </div>
        ))}
    </>
  );
}
