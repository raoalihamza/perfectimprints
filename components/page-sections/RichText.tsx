import { PortableText } from '@portabletext/react';
import { SectionShell } from './SectionShell';
import { pagePortableComponents } from './portable-text';
import type { RichTextSection } from '@/lib/sanity/queries/pages';

export function RichText({ section }: { section: RichTextSection }) {
  const { heading, body } = section;
  if (!heading && (!body || body.length === 0)) return null;
  return (
    <SectionShell>
      {heading && <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>}
      {body && body.length > 0 && (
        <PortableText value={body} components={pagePortableComponents} />
      )}
    </SectionShell>
  );
}
