import { SectionShell } from './SectionShell';
import type { FaqAccordionSection } from '@/lib/sanity/queries/pages';
import { jsonLdHtml } from '@/lib/seo/json-ld';

/**
 * Native <details>/<summary> accordion — no client JS needed, fully accessible,
 * and the FAQPage schema below makes the Q&A eligible for rich results.
 */
export function FaqAccordion({ section }: { section: FaqAccordionSection }) {
  const { heading, items } = section;
  if (!items || items.length === 0) return null;

  const validItems = items.filter((i) => i.question && i.answer);
  const schema =
    validItems.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: validItems.map((i) => ({
            '@type': 'Question',
            name: i.question,
            acceptedAnswer: { '@type': 'Answer', text: i.answer },
          })),
        }
      : null;

  return (
    <SectionShell>
      {heading && (
        <h2 className="mb-6 text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
      )}
      <div className="divide-y divide-border rounded-md border border-border">
        {items.map((item, i) => {
          if (!item.question) return null;
          return (
            <details key={item._key ?? i} className="group p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-brand-ink">
                {item.question}
                <span className="ml-4 text-brand-red transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              {item.answer && (
                <p className="mt-3 text-base leading-relaxed text-text-primary">{item.answer}</p>
              )}
            </details>
          );
        })}
      </div>
      {schema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(schema) }}
        />
      )}
    </SectionShell>
  );
}
