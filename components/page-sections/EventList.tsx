import { SectionShell } from './SectionShell';
import type { EventListSection } from '@/lib/sanity/queries/pages';

export function EventList({ section }: { section: EventListSection }) {
  const { heading, events } = section;
  if (!events || events.length === 0) return null;

  return (
    <SectionShell>
      {heading && (
        <h2 className="mb-6 text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((e, i) => (
          <li
            key={e._key ?? i}
            className="rounded-md border border-border bg-white p-5 text-center"
          >
            {e.city && <p className="text-lg font-semibold text-brand-red">{e.city}</p>}
            {e.date && <p className="mt-1 font-medium text-brand-ink">{e.date}</p>}
            {e.venue && <p className="mt-1 text-sm text-text-primary">{e.venue}</p>}
            {e.time && <p className="mt-1 text-sm text-text-muted">{e.time}</p>}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
