'use client';

import { usePathname } from 'next/navigation';

export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin3773752')) return null;
  return <>{children}</>;
}
