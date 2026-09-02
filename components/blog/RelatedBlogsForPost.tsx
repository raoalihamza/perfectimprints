import Link from 'next/link';
import { buildRenderImageUrl } from '@/lib/sanity/client';
import type { BlogPostSummary } from '@/lib/sanity/queries/blogs';

interface RelatedBlogsForPostProps {
  posts: BlogPostSummary[];
  topic: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function RelatedBlogsForPost({ posts, topic }: RelatedBlogsForPostProps) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-12 border-t border-border pt-10">
      <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">
        See Related Blogs About {topic}
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((post) => {
          const href = `/blog/${post.slug.current}`;
          const imageUrl = buildRenderImageUrl(post.headerImage, (b) =>
            b.width(600).height(338).fit('crop'),
          );
          return (
            <article
              key={post._id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-white transition hover:border-brand-ink hover:shadow-md"
            >
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
                    <div className="flex h-full w-full items-center justify-center text-sm text-text-muted">
                      Perfect Imprints
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="text-xs uppercase tracking-wider text-text-muted">
                  {formatDate(post.publishDate)}
                </div>
                <h3 className="text-base font-semibold leading-snug text-brand-ink">
                  <Link href={href} className="hover:text-brand-red hover:underline">
                    {post.title}
                  </Link>
                </h3>
                {post.excerpt && (
                  <p className="text-sm leading-relaxed text-text-primary line-clamp-3">
                    {post.excerpt}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
