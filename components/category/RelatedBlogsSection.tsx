import Link from 'next/link';
import { urlForImage } from '@/lib/sanity/client';
import { getRelatedBlogs } from '@/lib/sanity/queries/related-blogs';

interface RelatedBlogsSectionProps {
  categorySlug: string;
  categoryTitle: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function RelatedBlogsSection({ categorySlug, categoryTitle }: RelatedBlogsSectionProps) {
  const blogs = await getRelatedBlogs(categorySlug);
  if (blogs.length === 0) return null;

  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">
        Related Blogs About {categoryTitle}
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {blogs.map((blog) => {
          const href = `/blog/${blog.slug.current}`;
          const imageUrl = blog.headerImage
            ? urlForImage(blog.headerImage).width(600).height(338).fit('crop').url()
            : null;
          return (
            <article
              key={blog._id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-white transition hover:border-brand-ink hover:shadow-md"
            >
              <Link href={href} className="block">
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-bg-soft">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={blog.title}
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
                  {formatDate(blog.publishDate)}
                </div>
                <h3 className="text-base font-semibold leading-snug text-brand-ink">
                  <Link href={href} className="hover:text-brand-red hover:underline">
                    {blog.title}
                  </Link>
                </h3>
                {blog.excerpt && (
                  <p className="text-sm leading-relaxed text-text-primary line-clamp-3">
                    {blog.excerpt}
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
