import { SectionShell } from './SectionShell';
import { SectionImage } from './SectionImage';
import type { IconFeaturesSection } from '@/lib/sanity/queries/pages';

const COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

export function IconFeatures({ section }: { section: IconFeaturesSection }) {
  const { heading, columns, features } = section;
  if (!features || features.length === 0) return null;
  const colClass = COLS[columns ?? 3] ?? COLS[3];

  return (
    <SectionShell>
      {heading && (
        <h2 className="mb-6 text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
      )}
      <div className={`grid grid-cols-1 gap-8 ${colClass}`}>
        {features.map((f, i) => (
          <div key={f._key ?? i} className="flex flex-col">
            {(f.icon?.asset?._ref || f.imageUrl) && (
              <SectionImage
                image={f.icon}
                imageUrl={f.imageUrl}
                alt={f.heading}
                width={96}
                className="mb-3 h-14 w-14 object-contain"
              />
            )}
            {f.heading && (
              <h3 className="text-lg font-semibold uppercase tracking-tight text-brand-ink">
                {f.heading}
              </h3>
            )}
            {f.text && <p className="mt-2 text-base leading-relaxed text-text-primary">{f.text}</p>}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
