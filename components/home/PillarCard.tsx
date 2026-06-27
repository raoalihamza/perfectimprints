import { PortableText, type PortableTextComponents } from '@portabletext/react';

import type { HomeValueProp } from '@/lib/sanity/queries/home';

/**
 * Pillar body is portable text so Patrick can add hyperlinks (e.g. link
 * "Rush Production Available" to /rush-products). Links render in brand red
 * with underline-on-hover; external links open in a new tab with rel noopener.
 *
 * Shared by the static grid (ValuePillars) and the rotating carousel
 * (ValuePillarsCarousel) so the card looks identical in both layouts.
 */
export const pillarComponents: PortableTextComponents = {
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

export function PillarCard({ pillar }: { pillar: HomeValueProp }) {
  return (
    <div className="h-full rounded-md border border-border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-brand-ink md:text-xl">{pillar.title}</h2>
      {pillar.body.length > 0 && (
        <div className="[&>p:first-child]:mt-2">
          <PortableText value={pillar.body} components={pillarComponents} />
        </div>
      )}
    </div>
  );
}
