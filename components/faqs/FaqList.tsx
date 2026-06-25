import { FAQ_CATEGORIES, FAQ_CATEGORY_VALUES } from '@/lib/faqs/categories';
import type { FaqDoc } from '@/lib/sanity/queries/faqs';

const OTHER = { value: 'other-questions', title: 'More Questions' };

/**
 * Renders the answered FAQs grouped into the canonical category sections
 * (lib/faqs/categories.ts), each an accordion of native <details>/<summary>
 * elements — accessible and zero client JS. Section `id`s double as the
 * /faq#<category> anchors that search results link to.
 */
export function FaqList({ faqs }: { faqs: FaqDoc[] }) {
  const byCategory = new Map<string, FaqDoc[]>();
  for (const f of faqs) {
    const cat =
      f.faqCategory && FAQ_CATEGORY_VALUES.has(f.faqCategory) ? f.faqCategory : OTHER.value;
    const list = byCategory.get(cat) ?? [];
    list.push(f);
    byCategory.set(cat, list);
  }

  const sections = [...FAQ_CATEGORIES, OTHER]
    .map((c) => ({ ...c, items: byCategory.get(c.value) ?? [] }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="mt-10 space-y-12">
      {sections.map((s) => (
        <section key={s.value} id={s.value} className="scroll-mt-24">
          <h2 className="text-xl font-bold text-brand-ink md:text-2xl">{s.title}</h2>
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
            {s.items.map((f) => (
              <details
                key={f._id}
                className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-brand-ink">
                  <span>{f.question}</span>
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-brand-red transition-transform duration-200 group-open:rotate-180"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </summary>
                <div className="mt-3 whitespace-pre-line leading-relaxed text-text-primary">
                  {f.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
