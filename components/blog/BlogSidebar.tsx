import Link from 'next/link';
import { BlogSidebarContactCard } from './BlogSidebarContactCard';
import type { BlogCategoryDetail } from '@/lib/sanity/queries/blogs';

interface PopularLink {
  label: string;
  href: string;
}

const POPULAR_LINKS: PopularLink[] = [
  { label: 'Water Bottles', href: '/cat/water-bottles' },
  { label: 'Apparel', href: '/cat/apparel' },
  { label: 'Tote Bags', href: '/cat/tote-bags' },
  { label: 'Backpacks', href: '/cat/backpacks' },
  { label: 'Drinkware', href: '/cat/drinkware' },
  { label: 'Custom Pens', href: '/cat/pens' },
  { label: 'Promotional Products', href: '/cat/products' },
  { label: 'Golf', href: '/cat/golf' },
];

interface BlogSidebarProps {
  categories: BlogCategoryDetail[];
}

export function BlogSidebar({ categories }: BlogSidebarProps) {
  return (
    <aside className="flex flex-col gap-8">
      {categories.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-ink">
            Categories
          </h2>
          <ul className="mt-3 space-y-2">
            {categories.map((c) => (
              <li key={c._id}>
                <Link
                  href={`/blog/cat/${c.slug.current}`}
                  className="text-sm text-text-primary hover:text-brand-red hover:underline"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-ink">
          Popular Links
        </h2>
        <ul className="mt-3 space-y-2">
          {POPULAR_LINKS.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="text-sm text-text-primary hover:text-brand-red hover:underline"
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <BlogSidebarContactCard />
    </aside>
  );
}
