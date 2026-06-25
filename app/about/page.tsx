import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('about', '/about', 'About Perfect Imprints');
}

export default function AboutPage() {
  return <StaticPage slug="about" fallbackTitle="About Perfect Imprints" />;
}
