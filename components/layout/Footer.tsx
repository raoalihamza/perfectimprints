import Link from 'next/link';
import { Container } from '@/components/ui/Container';

interface FooterColumn {
  heading: string;
  links: Array<{ label: string; href: string }>;
}

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    heading: 'About Us',
    links: [
      { label: 'About Me', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Privacy & Security', href: '/privacy' },
      { label: 'Company Core Values', href: '/about#values' },
    ],
  },
  {
    heading: 'Popular Links',
    links: [
      { label: 'Drinkware', href: '/cat/drinkware' },
      { label: 'Bags & Totes', href: '/cat/bags-and-totes' },
      { label: 'T-Shirts', href: '/cat/t-shirts' },
      { label: 'Writing Instruments', href: '/cat/writing-instruments' },
      { label: 'Trade Show & Event', href: '/cat/trade-show-and-event' },
    ],
  },
  {
    heading: 'Customer Service',
    links: [
      { label: 'FAQs', href: '/faqs' },
      { label: 'Sample Policy', href: '/sample-policy' },
      { label: 'US & International Shipping', href: '/shipping' },
      { label: 'Returns & Refunds', href: '/returns' },
    ],
  },
  {
    heading: 'Contact Us',
    links: [
      { label: '800-773-9472', href: 'tel:800-773-9472' },
      { label: 'Contact Form', href: '/contact' },
      { label: 'Mon-Fri 9am-5pm CT', href: '/contact#hours' },
    ],
  },
];

const SOCIAL_LINKS = [
  { platform: 'Facebook', label: 'F', href: '#' },
  { platform: 'Instagram', label: 'IG', href: '#' },
  { platform: 'LinkedIn', label: 'in', href: '#' },
  { platform: 'YouTube', label: 'YT', href: '#' },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-brand-ink text-white">
      <Container className="grid grid-cols-1 gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {DEFAULT_COLUMNS.map((col) => (
          <div key={col.heading}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-white">
              {col.heading}
            </h3>
            <ul className="mt-4 space-y-2">
              {col.links.map((link) => (
                <li key={`${col.heading}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/80 hover:text-brand-red"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col items-start justify-between gap-4 py-6 sm:flex-row sm:items-center">
          <p className="text-sm text-white/70">
            © {year} Perfect Imprints. All Rights Reserved.
          </p>
          <ul className="flex items-center gap-3">
            {SOCIAL_LINKS.map((s) => (
              <li key={s.platform}>
                <a
                  href={s.href}
                  aria-label={s.platform}
                  className="inline-flex h-9 w-9 items-center justify-center rounded border border-white/30 text-xs font-semibold text-white hover:bg-white hover:text-brand-ink"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </Container>
      </div>
    </footer>
  );
}
