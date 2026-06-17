import Link from 'next/link';
import Image from 'next/image';
import { Container } from '@/components/ui/Container';
import { SearchBox } from '@/components/forms/SearchBox';
import { MobileDrawer } from './MobileDrawer';
import { ShopByMegaMenu } from './ShopByMegaMenu';
import { AllCategoriesPopover } from './AllCategoriesPopover';
import { SimpleNavDropdown } from './SimpleNavDropdown';
import { getMegaMenu } from '@/lib/sanity/queries/mega-menu';

export async function Header() {
  // Primary navigation is driven by the Sanity `megaMenu` singleton (M5-503).
  // Seed it with `pnpm seed-mega-menu`; reorder / rename / hide / add from Studio.
  const { desktopItems, mobileItems } = await getMegaMenu();

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
            {desktopItems.map((item) => {
              if (item.kind === 'megaPanel') {
                return item.variant === 'cascade' ? (
                  <ShopByMegaMenu
                    key={item.label}
                    label={item.label}
                    departments={item.departments}
                  />
                ) : (
                  <AllCategoriesPopover
                    key={item.label}
                    label={item.label}
                    departments={item.departments}
                  />
                );
              }
              if (item.kind === 'dropdown') {
                return <SimpleNavDropdown key={item.label} item={item.item} />;
              }
              return (
                <li key={item.label} role="none">
                  <Link
                    href={item.href}
                    role="menuitem"
                    className="block rounded px-3 py-3 text-sm font-medium text-brand-ink hover:text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="md:hidden">
          <SearchBox className="py-2" />
        </div>
      </Container>
    </header>
  );
}
