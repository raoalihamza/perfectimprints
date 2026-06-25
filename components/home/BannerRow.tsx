import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import type { HomeBanner } from '@/lib/sanity/queries/home';

/**
 * Editable row of up to three equal-size banner images that link out (M5-506).
 * Fed by `homePage.bannerRow`; renders nothing when empty, so it's fully
 * optional. Banners keep their own aspect ratio (`h-auto`) — uniformity comes
 * from Patrick uploading consistently-sized images, never from a forced crop.
 */
export function BannerRow({ banners }: { banners: HomeBanner[] }) {
  if (banners.length === 0) return null;

  return (
    <section className="border-t border-border bg-white">
      <Container className="py-8 md:py-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
          {banners.map((b, i) => {
            // The banner row is the first image on the (text-hero) home page, so
            // the first banner is the most likely image LCP candidate — load it
            // eagerly with high fetch priority; the rest stay lazy. Explicit
            // width/height (parsed from the Sanity asset ref) reserve exact space
            // so the row contributes zero CLS without forcing a crop.
            const eager = i === 0;
            const img = (
              // eslint-disable-next-line @next/next/no-img-element -- Sanity CDN banner, sized by editor
              <img
                src={b.imageUrl}
                alt={b.alt}
                {...(b.width && b.height ? { width: b.width, height: b.height } : {})}
                loading={eager ? 'eager' : 'lazy'}
                fetchPriority={eager ? 'high' : 'auto'}
                decoding="async"
                className="h-auto w-full rounded-md border border-border object-cover transition group-hover:opacity-95"
              />
            );
            const cls = 'group block overflow-hidden rounded-md';
            const key = `${b.imageUrl}-${i}`;

            if (!b.link) {
              return (
                <div key={key} className={cls}>
                  {img}
                </div>
              );
            }
            // Outbound links open in the same tab (CLAUDE.md). Internal paths use <Link>.
            return /^https?:\/\//i.test(b.link) ? (
              <a key={key} href={b.link} className={cls}>
                {img}
              </a>
            ) : (
              <Link key={key} href={b.link} className={cls}>
                {img}
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
