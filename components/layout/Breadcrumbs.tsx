import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// Schema.org requires `item` (the @id) to be an absolute URL — relative hrefs
// trip Google Rich Results' "Invalid URL in field 'id'". Prefix any relative
// href with the canonical origin; pass-through absolute hrefs untouched.
function absoluteUrl(href: string): string {
  return /^https?:\/\//i.test(href) ? href : `${SITE_URL}${href}`;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className={cn('text-sm text-text-muted', className)}>
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-brand-ink hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className="text-text-primary">
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="text-text-muted">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </nav>
  );
}
