import { PortableText, type PortableTextComponents } from '@portabletext/react';

import { Container } from '@/components/ui/Container';
import type { HomeValueProp } from '@/lib/sanity/queries/home';

interface ValuePillarsProps {
  pillars: HomeValueProp[];
}

/**
 * Pillar body is portable text so Patrick can add hyperlinks (e.g. link
 * "Rush Production Available" to /rush-products). Links render in brand red
 * with underline-on-hover; external links open in a new tab with rel noopener.
 */
const pillarComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => (
      <p className="mt-2 text-sm leading-relaxed text-text-primary md:text-base">{children}</p>
    ),
  },
  marks: {
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    link: ({ value, children }) => {
      const href = (value?.href as string) || '#';
      const cls = 'text-brand-red underline decoration-from-font hover:no-underline';
      const external = /^https?:\/\//i.test(href);
      return external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {children}
        </a>
      ) : (
        <a href={href} className={cls}>
          {children}
        </a>
      );
    },
  },
};

export function ValuePillars({ pillars }: ValuePillarsProps) {
  if (pillars.length === 0) return null;

  return (
    <section className="border-y border-border bg-bg-soft">
      <Container className="py-10 md:py-14">
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {pillars.map((p) => (
            <li
              key={p.title}
              className="rounded-md border border-border bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-brand-ink md:text-xl">{p.title}</h2>
              {p.body.length > 0 && (
                <div className="[&>p:first-child]:mt-2">
                  <PortableText value={p.body} components={pillarComponents} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
