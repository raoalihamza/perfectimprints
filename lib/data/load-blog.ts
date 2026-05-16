// TODO: M4-403 - Implement blog loader.
// Reads blogPost and blogCategory documents from Sanity. Listing query supports
// pagination, filtering by category, and related-post lookups.

export interface BlogPostSummary {
  slug: string;
  title: string;
  headerImage?: string;
  publishDate?: string;
  excerpt?: string;
}

export async function loadBlogIndex(): Promise<BlogPostSummary[]> {
  // TODO M4-403
  return [];
}

export async function loadBlogPost(_slug: string): Promise<BlogPostSummary | null> {
  // TODO M4-403
  return null;
}
