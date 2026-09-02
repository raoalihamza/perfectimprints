import Link from 'next/link';
import { buildRenderImageUrl } from '@/lib/sanity/client';
import type { BlogPostSummary } from '@/lib/sanity/queries/blogs';

interface BlogCardProps {
  post: BlogPostSummary;
  size?: 'sm' | 'md';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function deriveExcerpt(post: BlogPostSummary, max = 150): string {
  const source = post.excerpt || post.metaDescription || '';
  if (!source) return '';
  return source.length > max ? `${source.slice(0, max).trimEnd()}…` : source;
}

export function BlogCard({ post, size = 'md' }: BlogCardProps) {
  const href = `/blog/${post.slug.current}`;
  const imageUrl = buildRenderImageUrl(post.headerImage, (b) =>
    b.width(800).height(450).fit('crop'),
  );
  const excerpt = deriveExcerpt(post);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-white transition hover:border-brand-ink hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-bg-soft">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={post.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <span className="text-sm">Perfect Imprints</span>
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="text-xs uppercase tracking-wider text-text-muted">
          {formatDate(post.publishDate)}
          {post.author?.name ? <span> · {post.author.name}</span> : null}
        </div>
        <h3
          className={
            size === 'sm'
              ? 'text-base font-semibold leading-snug text-brand-ink'
              : 'text-lg font-semibold leading-snug text-brand-ink md:text-xl'
          }
        >
          <Link href={href} className="hover:text-brand-red hover:underline">
            {post.title}
          </Link>
        </h3>
        {excerpt && (
          <p className="text-sm leading-relaxed text-text-primary">{excerpt}</p>
        )}
        <div className="mt-auto pt-3">
          <Link
            href={href}
            className="text-sm font-semibold text-brand-red hover:underline"
          >
            Read More →
          </Link>
        </div>
      </div>
    </article>
  );
}
