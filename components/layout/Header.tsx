import Link from 'next/link';
import Image from 'next/image';
import { Container } from '@/components/ui/Container';
import { SearchBox } from '@/components/forms/SearchBox';
import { MegaMenu, type MegaMenuItem } from './MegaMenu';
import { MobileDrawer } from './MobileDrawer';

const HARDCODED_MENU: MegaMenuItem[] = [
  {
    label: 'Promotional Products',
    href: '/cat/promotional-products',
    children: [
      { label: 'Bags & Totes', href: '/cat/bags-and-totes' },
      { label: 'Drinkware', href: '/cat/drinkware' },
      { label: 'Health & Wellness', href: '/cat/health-and-wellness' },
      { label: 'Home & Auto', href: '/cat/home-and-auto' },
      { label: 'Office & Technology', href: '/cat/office-and-technology' },
      { label: 'Sports & Outdoor', href: '/cat/sports-and-outdoor' },
      { label: 'Trade Show & Event', href: '/cat/trade-show-and-event' },
      { label: 'Writing Instruments', href: '/cat/writing-instruments' },
    ],
  },
  {
    label: 'Custom Apparel',
    href: '/cat/custom-apparel',
    children: [
      { label: 'Athleisure', href: '/cat/athleisure' },
      { label: 'Caps & Hats', href: '/cat/caps-and-hats' },
      { label: 'Dress Shirts', href: '/cat/dress-shirts' },
      { label: 'T-Shirts', href: '/cat/t-shirts' },
      { label: 'Tank Tops', href: '/cat/tank-tops' },
      { label: 'Workwear', href: '/cat/workwear' },
      { label: 'Quarter Zips', href: '/cat/quarter-zips' },
      { label: 'Hoodies', href: '/cat/hoodies' },
      { label: 'Polos & Golf Shirts', href: '/cat/polos-and-golf-shirts' },
      { label: 'Jackets', href: '/cat/jackets' },
    ],
  },
  { label: 'Featured Promos', href: '#', featured: true, children: [] },
  { label: 'New Products', href: '#', featured: true, children: [] },
  { label: 'Rush Products', href: '/rush-promotional-products' },
  {
    label: 'Services',
    href: '#',
    children: [
      { label: 'Kitting', href: '/services/kitting' },
      { label: 'Company Stores', href: '/services/company-stores' },
      { label: 'Popup Stores', href: '/services/popup-stores' },
      { label: '100% Custom Products', href: '/services/custom-products' },
    ],
  },
  { label: 'Videos', href: '/videos' },
  { label: 'Blog', href: '/blog' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white">
      <Container className="flex items-center gap-4 py-3">
        <Link
          href="/"
          aria-label="Perfect Imprints home"
          className="flex shrink-0 items-center"
        >
          <Image
            src="/logo.svg"
            alt="Perfect Imprints"
            width={180}
            height={48}
            priority
            className="h-10 w-auto sm:h-12"
          />
        </Link>

        <div className="hidden flex-1 max-w-xl md:block">
          <SearchBox />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <a
            href="tel:800-773-9472"
            className="hidden whitespace-nowrap text-sm font-medium text-brand-ink hover:text-brand-red sm:inline"
          >
            800-773-9472
          </a>
          <Link
            href="/contact"
            className="hidden whitespace-nowrap rounded px-3 py-2 text-sm font-medium text-brand-ink hover:bg-bg-soft hover:text-brand-red sm:inline"
          >
            Contact Us
          </Link>
          <MobileDrawer items={HARDCODED_MENU} />
        </div>
      </Container>

      <Container className="border-t border-border py-1">
        <MegaMenu items={HARDCODED_MENU} />
        <div className="md:hidden">
          <SearchBox className="py-2" />
        </div>
      </Container>
    </header>
  );
}
