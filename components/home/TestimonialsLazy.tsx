'use client';

import dynamic from 'next/dynamic';
import type { HomeTestimonial } from '@/lib/sanity/queries/home';

// The testimonials carousel is below the fold and interaction-only, so it is
// loaded client-side (ssr:false) to keep it out of the home page's initial JS.
// A min-height placeholder reserves space so the late mount does not shift layout.
const Testimonials = dynamic(
  () => import('@/components/home/Testimonials').then((m) => m.Testimonials),
  {
    ssr: false,
    loading: () => <div className="min-h-[420px] bg-brand-ink" aria-hidden />,
  },
);

interface TestimonialsLazyProps {
  testimonials: HomeTestimonial[];
  heading?: string;
}

export function TestimonialsLazy(props: TestimonialsLazyProps) {
  return <Testimonials {...props} />;
}
