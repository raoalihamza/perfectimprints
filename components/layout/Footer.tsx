import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SocialIcon } from '@/components/icons/social-icons';
import {
  getSiteSettings,
  type FooterColumn,
  type SiteAddress,
} from '@/lib/sanity/queries/global-settings';

// Fallback nav columns — rendered only when `globalSettings.footerColumns` is
// empty/unset, so the footer is never blank. When Patrick populates
// footerColumns in Studio (seeded with these exact values by
// `pnpm seed-footer-columns`), Sanity wins. The Contact column + social row are
// always Sanity-driven from globalSettings.contact / .socialLinks — see below.
const NAV_COLUMNS: FooterColumn[] = [
  {
    heading: 'About Us',
    links: [
      { label: 'About Perfect Imprints', href: '/about' },
      { label: 'Company Core Values', href: '/company-core-values' },
      { label: 'Blog', href: '/blog' },
      { label: 'Privacy & Security', href: '/privacy-security' },
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
      { label: 'FAQs', href: '/faq' },
      { label: 'Sample Policy', href: '/sample-policy' },
      { label: 'US & International Shipping', href: '/shipping-policy' },
      { label: 'Returns & Refunds', href: '/returns' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
];

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

function addressLines(a: SiteAddress): string[] {
  const lines: string[] = [];
  if (a.street) lines.push(a.street);
  const cityLine = [a.city, [a.region, a.postalCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  if (cityLine) lines.push(cityLine);
  return lines;
}

export async function Footer() {
  const { socialLinks, contact, footerColumns } = await getSiteSettings();
  const year = new Date().getFullYear();

  // Sanity-driven footer columns win; fall back to the hardcoded set so the
  // footer never renders empty (e.g. before footerColumns is seeded).
  const navColumns = footerColumns.length > 0 ? footerColumns : NAV_COLUMNS;

  return (
    <footer className="border-t border-border bg-brand-ink text-white">
      <Container className="grid grid-cols-1 gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {navColumns.map((col) => (
          <div key={col.heading}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-white">
              {col.heading}
            </h3>
            <ul className="mt-4 space-y-2">
              {col.links.map((link) => (
                <li key={`${col.heading}-${link.label}`}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/80 hover:text-brand-red"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-sm text-white/80 hover:text-brand-red">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Contact column — phone(s) / email / address from globalSettings.contact */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-white">
            Contact Us
          </h3>
          <ul className="mt-4 space-y-2">
            {contact.phones.map((phone) => (
              <li key={phone}>
                <a href={telHref(phone)} className="text-sm text-white/80 hover:text-brand-red">
                  {phone}
                </a>
              </li>
            ))}
            {contact.email && (
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className="text-sm text-white/80 hover:text-brand-red"
                >
                  {contact.email}
                </a>
              </li>
            )}
            <li>
              <Link href="/contact" className="text-sm text-white/80 hover:text-brand-red">
                Contact Form
              </Link>
            </li>
            {contact.address && (
              <li className="text-sm not-italic text-white/80">
                <address className="not-italic">
                  {addressLines(contact.address).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </li>
            )}
            <li className="text-sm text-white/80">Mon-Fri 8am-5pm CST</li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col items-start justify-between gap-4 py-6 sm:flex-row sm:items-center">
          <p className="text-sm text-white/70">© {year} Perfect Imprints. All Rights Reserved.</p>
          {socialLinks.length > 0 && (
            <ul className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <li key={social.url}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded border border-white/30 text-white hover:bg-white hover:text-brand-ink"
                  >
                    <SocialIcon
                      platform={social.platform}
                      iconUrl={social.iconUrl}
                      className="h-4 w-4"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </div>
    </footer>
  );
}
