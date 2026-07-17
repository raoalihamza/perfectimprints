import { Container } from '@/components/ui/Container';
import { VideoCard } from '@/components/videos/VideoCard';
import { BlogCard } from '@/components/blog/BlogCard';
import type { CatalogPageDoc } from '@/lib/sanity/queries/catalog-pages';
import { getVideoSummariesBySlugs } from '@/lib/sanity/queries/videos';
import { getBlogSummariesBySlugs, type BlogPostSummary } from '@/lib/sanity/queries/blogs';
import { toVideoCardData, type VideoCardData } from '@/lib/video/card-data';
import { suggestLinksForKind } from '@/lib/ai/internal-links';

/**
 * Related Blogs + Related Videos strips for a catalogPage — the SAME model as
 * /products/<slug> (P2-CP-004 batch 4): manual references first (editor
 * order), topped up with automatic keyword matches via the internal-link
 * engine. Card data loads through the order-preserving tag-cached helpers
 * (RELATED_BLOGS_TAG / VIDEOS_TAG), so a blog/video publish refreshes the
 * strips with no webhook change. Empty results render nothing.
 *
 * Shared by BOTH catalog routes — the gated /shop-by-theme/<slug>/catalog page
 * and the public /shop-by-theme/<slug> landing page — so one catalog shows one
 * consistent set of related content in both places. Async server component;
 * all reads are tag-cached, so both routes stay statically prerenderable.
 */
const RELATED_CONTENT_LIMIT = 4;

async function resolveRelatedContent(
  doc: CatalogPageDoc,
): Promise<{ videos: VideoCardData[]; blogs: BlogPostSummary[] }> {
  const keywords = doc.relatedKeywords?.length ? doc.relatedKeywords : [doc.title];
  const manualVideoSlugs = (doc.relatedVideoSlugs ?? []).filter(Boolean);
  const manualBlogSlugs = (doc.relatedBlogSlugs ?? []).filter(Boolean);

  const [autoVideos, autoBlogs] = await Promise.all([
    manualVideoSlugs.length >= RELATED_CONTENT_LIMIT
      ? Promise.resolve([])
      : suggestLinksForKind('video', keywords, RELATED_CONTENT_LIMIT),
    manualBlogSlugs.length >= RELATED_CONTENT_LIMIT
      ? Promise.resolve([])
      : suggestLinksForKind('blog', keywords, RELATED_CONTENT_LIMIT),
  ]);

  const dedupe = (slugs: string[]) => Array.from(new Set(slugs)).slice(0, RELATED_CONTENT_LIMIT);
  const videoSlugs = dedupe([
    ...manualVideoSlugs,
    ...autoVideos.map((s) => s.href.replace(/^\/videos\//, '')),
  ]);
  const blogSlugs = dedupe([
    ...manualBlogSlugs,
    ...autoBlogs.map((s) => s.href.replace(/^\/blog\//, '')),
  ]);

  const [videoSummaries, blogs] = await Promise.all([
    getVideoSummariesBySlugs(videoSlugs),
    getBlogSummariesBySlugs(blogSlugs),
  ]);
  return { videos: videoSummaries.map(toVideoCardData), blogs };
}

export async function CatalogRelatedContent({ doc }: { doc: CatalogPageDoc }) {
  const { videos, blogs } = await resolveRelatedContent(doc);
  if (blogs.length === 0 && videos.length === 0) return null;

  return (
    <Container as="section" className="pb-12">
      {blogs.length > 0 && (
        <section className="border-t border-border pt-8">
          <h2 className="text-2xl font-bold text-brand-ink">Related Blogs</h2>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {blogs.map((post) => (
              <BlogCard key={post._id} post={post} size="sm" />
            ))}
          </div>
        </section>
      )}
      {videos.length > 0 && (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-2xl font-bold text-brand-ink">Related Videos</h2>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
