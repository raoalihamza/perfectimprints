import Link from 'next/link';
import Image from 'next/image';
import { Container } from '@/components/ui/Container';
import { SearchBox } from '@/components/forms/SearchBox';
import { type MegaMenuItem } from './MegaMenu';
import { MobileDrawer } from './MobileDrawer';
import { ShopByMegaMenu } from './ShopByMegaMenu';
import { AllCategoriesPopover } from './AllCategoriesPopover';
import { SimpleNavDropdown } from './SimpleNavDropdown';
import { getDepartments } from '@/lib/nav-data';

const SIMPLE_NAV: MegaMenuItem[] = [
  { label: 'Promotional Products', href: '/cat/promotional-products' },
  { label: 'New Products', href: '/cat/new-products' },
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

function buildMobileItems(
  departments: ReturnType<typeof getDepartments>,
): MegaMenuItem[] {
  const availableLeaves = departments.flatMap((d) => [
    ...(d.available && d.href ? [{ label: d.label, href: d.href }] : []),
    ...d.children
      .filter((c) => c.available && c.href)
      .map((c) => ({ label: `${d.label} · ${c.label}`, href: c.href as string })),
  ]);
  const allCategories: MegaMenuItem = {
    label: 'All Categories',
    href: '#',
    children: availableLeaves,
  };
  return [allCategories, ...SIMPLE_NAV];
}

export function Header() {
  const departments = getDepartments();
  const mobileItems = buildMobileItems(departments);

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
          <MobileDrawer items={mobileItems} />
        </div>
      </Container>

      <Container className="border-t border-border py-1">
        <nav aria-label="Primary">
          <ul role="menubar" className="hidden items-center gap-1 lg:flex">
            <ShopByMegaMenu departments={departments} />
            <AllCategoriesPopover departments={departments} />
            {SIMPLE_NAV.map((item) =>
              item.children && item.children.length > 0 ? (
                <SimpleNavDropdown key={item.label} item={item} />
              ) : (
                <li key={item.label} role="none">
                  <Link
                    href={item.href}
                    role="menuitem"
                    className="block rounded px-3 py-3 text-sm font-medium text-brand-ink hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
        <div className="md:hidden">
          <SearchBox className="py-2" />
        </div>
      </Container>
    </header>
  );
}
