import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { BlogCard } from '@/components/blog/BlogCard';
import type { BlogPostSummary } from '@/lib/sanity/queries/blogs';

interface BlogPreviewProps {
  posts: BlogPostSummary[];
  heading: string;
}

export function BlogPreview({ posts, heading }: BlogPreviewProps) {
  if (posts.length === 0) return null;

  return (
    <section className="bg-bg-soft">
      <Container className="py-14 md:py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
            <p className="mt-2 max-w-xl text-base text-text-primary">
              Buying guides, decoration how-tos, and ideas for branded giveaways that get used.
            </p>
          </div>
          <Link
            href="/blog"
            className="hidden text-sm font-semibold text-brand-red hover:underline sm:inline-flex"
          >
            All posts →
          </Link>
        </div>

        <ul className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
          {posts.slice(0, 3).map((post) => (
            <li key={post._id}>
              <BlogCard post={post} />
            </li>
          ))}
        </ul>

        <div className="mt-6 sm:hidden">
          <Link href="/blog" className="text-sm font-semibold text-brand-red hover:underline">
            All posts →
          </Link>
        </div>
      </Container>
    </section>
  );
}
