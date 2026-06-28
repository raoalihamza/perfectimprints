'use client';

import dynamic from 'next/dynamic';
import type { HomeValueProp } from '@/lib/sanity/queries/home';

// The >3-pillar carousel is interaction-only; loading it client-side (ssr:false)
// keeps the carousel JS out of the home page's initial bundle in the common
// (≤3-pillar) case where it never renders at all.
const ValuePillarsCarousel = dynamic(
  () => import('@/components/home/ValuePillarsCarousel').then((m) => m.ValuePillarsCarousel),
  {
    ssr: false,
    loading: () => <div className="min-h-[220px]" aria-hidden />,
  },
);

export function ValuePillarsCarouselLazy({ pillars }: { pillars: HomeValueProp[] }) {
  return <ValuePillarsCarousel pillars={pillars} />;
}
