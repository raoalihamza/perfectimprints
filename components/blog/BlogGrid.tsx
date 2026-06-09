import { BlogCard } from './BlogCard';
import type { BlogPostSummary } from '@/lib/sanity/queries/blogs';

interface BlogGridProps {
  posts: BlogPostSummary[];
  emptyMessage?: string;
}

export function BlogGrid({ posts, emptyMessage = 'No posts yet.' }: BlogGridProps) {
  if (posts.length === 0) {
    return <p className="py-12 text-center text-text-muted">{emptyMessage}</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <BlogCard key={p._id} post={p} />
      ))}
    </div>
  );
}
