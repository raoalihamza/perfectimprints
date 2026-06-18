import { Container } from '@/components/ui/Container';
import type { StatBannerSection } from '@/lib/sanity/queries/pages';

const BG: Record<string, string> = {
  red: 'bg-brand-red text-white',
  ink: 'bg-brand-ink text-white',
  green: 'bg-brand-green text-white',
  soft: 'bg-bg-soft text-brand-ink',
};

export function StatBanner({ section }: { section: StatBannerSection }) {
  const { background, statText, subtext } = section;
  if (!statText && !subtext) return null;
  const bg = BG[background ?? 'red'] ?? BG.red;

  return (
    <section className={`my-8 ${bg}`}>
      <Container className="py-10 text-center">
        {statText && (
          <p className="text-2xl font-bold leading-tight md:text-4xl">{statText}</p>
        )}
        {subtext && <p className="mt-2 text-lg md:text-2xl">{subtext}</p>}
      </Container>
    </section>
  );
}
