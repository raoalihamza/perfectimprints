import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { VideoCardData } from '@/lib/video/card-data';

interface VideoCardProps {
  video: VideoCardData;
}

function PlayIcon() {
  return (
    <span
      aria-hidden
      className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition group-hover:bg-brand-red"
    >
      <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

/**
 * Video card for the index grid + related-videos rail (M5-507). Mirrors the
 * blog card: 16:9 thumbnail, title, date, optional category badge. A play
 * overlay signals it's a video; the thumbnail follows custom → YouTube → none.
 */
export function VideoCard({ video }: VideoCardProps) {
  const { href, title, thumbnailUrl, description, publishDate, categories } = video;
  const excerpt =
    description && description.length > 120 ? `${description.slice(0, 120).trimEnd()}…` : description;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-white transition hover:border-brand-ink hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-bg-soft">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand-ink/5 text-text-muted">
              <span className="text-sm">Perfect Imprints</span>
            </div>
          )}
          <PlayIcon />
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-text-muted">
          {publishDate ? <span>{formatDate(publishDate)}</span> : null}
          {categories.map((c) => (
            <span
              key={c.slug}
              className="rounded-full bg-bg-soft px-2 py-0.5 font-semibold text-brand-red"
            >
              {c.title}
            </span>
          ))}
        </div>
        <h3 className="text-lg font-semibold leading-snug text-brand-ink">
          <Link href={href} className="hover:text-brand-red hover:underline">
            {title}
          </Link>
        </h3>
        {excerpt ? <p className="text-sm leading-relaxed text-text-primary">{excerpt}</p> : null}
        <div className="mt-auto pt-3">
          <Link href={href} className="text-sm font-semibold text-brand-red hover:underline">
            Watch Video →
          </Link>
        </div>
      </div>
    </article>
  );
}
