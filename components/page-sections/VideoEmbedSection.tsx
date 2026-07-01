import { SectionShell } from './SectionShell';
import { VideoEmbed } from '@/components/videos/VideoEmbed';
import type { VideoEmbedSection as VideoEmbedSectionType } from '@/lib/sanity/queries/pages';

/**
 * Page-builder video section. Wraps the shared responsive `VideoEmbed` player
 * (YouTube / Shorts / Vimeo / Instagram / Facebook — provider auto-detected from
 * the pasted URL). Renders nothing when no URL is set so an empty section
 * degrades gracefully.
 */
export function VideoEmbedSection({ section }: { section: VideoEmbedSectionType }) {
  const { heading, url, caption } = section;
  if (!url) return null;

  return (
    <SectionShell>
      {heading && (
        <h2 className="mb-5 text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
      )}
      <VideoEmbed url={url} title={heading || caption || 'Video'} />
      {caption && <p className="mt-3 text-sm text-text-muted">{caption}</p>}
    </SectionShell>
  );
}
