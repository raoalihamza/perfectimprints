import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import type { HomeFeaturedBlock } from '@/lib/sanity/queries/home';

interface FeaturedBlocksProps {
  blocks: HomeFeaturedBlock[];
  heading?: string;
}

/**
 * Six featured category image blocks (per client-page-spec.md). Data comes from
 * the `homePage` singleton's `featuredBlocks` field, with hard-coded fallbacks
 * in `getHomePage()` so the grid never collapses before Patrick populates Sanity.
 * Blocks without a Sanity image fall back to a brand-tinted tile showing the
 * title, so every block still links correctly (M5-501 acceptance).
 */
export function FeaturedBlocks({ blocks, heading = 'Shop by Category' }: FeaturedBlocksProps) {
  if (blocks.length === 0) return null;

  return (
    <section className="border-t border-border">
      <Container className="py-14 md:py-20">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
        </div>

        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
          {blocks.map((block) => (
            <li key={block.href}>
              <Link
                href={block.href}
                className="group relative block aspect-[4/3] overflow-hidden rounded-md border border-border bg-bg-soft shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                aria-label={block.title}
              >
                {block.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={block.imageUrl}
                    alt={block.imageAlt}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-brand-ink/5" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-ink/80 to-transparent p-4 pt-10">
                  <span className="text-lg font-semibold text-white md:text-xl">{block.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
