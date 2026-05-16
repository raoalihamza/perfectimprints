import categoryUrlsRaw from '@/data/pi-urls/category-urls.json';
import blogUrlsRaw from '@/data/pi-urls/blog-urls.json';

export type CategoryUrlEntry =
  | {
      url: string;
      type: 'root';
      rootSlug: string;
    }
  | {
      url: string;
      type: 'facet';
      rootSlug: string;
      facetType: string;
      facetValue: string;
    };

export interface CategoryUrlIndex {
  totalCount: number;
  rootCount: number;
  facetCount: number;
  urls: CategoryUrlEntry[];
}

export interface BlogUrlEntry {
  url: string;
  slug: string;
}

export interface BlogUrlIndex {
  totalCount: number;
  urls: BlogUrlEntry[];
}

const categoryIndex = categoryUrlsRaw as CategoryUrlIndex;
const blogIndex = blogUrlsRaw as BlogUrlIndex;

export function getAllCategoryUrls(): CategoryUrlEntry[] {
  return categoryIndex.urls;
}

export function getRootCategoryUrls(): CategoryUrlEntry[] {
  return categoryIndex.urls.filter((u) => u.type === 'root');
}

export function getFacetCategoryUrls(): CategoryUrlEntry[] {
  return categoryIndex.urls.filter((u) => u.type === 'facet');
}

export function getCategoryCounts(): {
  total: number;
  root: number;
  facet: number;
} {
  return {
    total: categoryIndex.totalCount,
    root: categoryIndex.rootCount,
    facet: categoryIndex.facetCount,
  };
}

export function getAllBlogUrls(): BlogUrlEntry[] {
  return blogIndex.urls;
}

export function getBlogCount(): number {
  return blogIndex.totalCount;
}
