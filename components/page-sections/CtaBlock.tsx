import Link from 'next/link';
import { SectionShell } from './SectionShell';
import type { CtaBlockSection } from '@/lib/sanity/queries/pages';

export function CtaBlock({ section }: { section: CtaBlockSection }) {
  const { heading, subheading, buttons } = section;
  if (!heading && !subheading && (!buttons || buttons.length === 0)) return null;

  return (
    <SectionShell>
      <div className="rounded-md border border-border bg-bg-soft p-8 text-center">
        {heading && (
          <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
        )}
        {subheading && (
          <p className="mx-auto mt-3 max-w-2xl text-lg text-text-primary">{subheading}</p>
        )}
        {buttons && buttons.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {buttons.map((b, i) => {
              if (!b.label || !b.href) return null;
              const external = /^https?:\/\//i.test(b.href);
              const cls =
                'inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white hover:opacity-90';
              return external ? (
                <a key={b._key ?? i} href={b.href} className={cls}>
                  {b.label}
                </a>
              ) : (
                <Link key={b._key ?? i} href={b.href} className={cls}>
                  {b.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </SectionShell>
  );
}
