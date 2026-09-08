'use client';

import Link from 'next/link';
import type { PortfolioShopLink } from '@/lib/portfolio/shop-link';

interface PortfolioShopLinksProps {
  /** The links to show, in sidebar order; an empty list renders nothing. */
  links: readonly PortfolioShopLink[];
  className?: string;
}

/**
 * The "Shop all custom ..." link(s) under a portfolio grid (PORT-160). One
 * link reads as a sentence ("Shop all custom caps and hats"); several read as
 * a short list led by one phrase, so the unfiltered gallery page carries a
 * link into every category's shop without repeating "Shop all custom" four
 * times. Internal `next/link`, same tab, brand-red with underline on hover,
 * the site's convention for an internal text link (RichAnswer's LINK_CLASS).
 *
 * Rendered by the /portfolio browser (under the grid, from the ticked
 * categories or the shown tiles) and by the gallery block in category mode
 * (the block's one category). Renders nothing for an empty list, so a
 * category with no shop slug leaves no stray heading behind. Marked
 * 'use client' because every host renders it inside a client tree; it holds
 * no state and reads no URL.
 */
export function PortfolioShopLinks({ links, className }: PortfolioShopLinksProps) {
  if (links.length === 0) return null;
  const linkClass = 'font-semibold text-brand-red hover:underline';
  if (links.length === 1) {
    const link = links[0];
    return (
      <p className={className}>
        <Link href={link.href} className={linkClass}>
          {link.label}
        </Link>
      </p>
    );
  }
  return (
    <nav className={className} aria-label="Shop these products">
      <p className="text-text-primary">
        <span className="font-semibold text-brand-ink">Shop this kind of work: </span>
        {links.map((link, index) => (
          <span key={link.categorySlug || link.href}>
            {index > 0 ? <span aria-hidden="true"> / </span> : null}
            <Link href={link.href} className={linkClass}>
              {link.title ? `Custom ${link.title}` : link.label}
            </Link>
          </span>
        ))}
      </p>
    </nav>
  );
}
