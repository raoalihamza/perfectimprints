import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('terms', '/terms', 'Terms of Service');
}

export default function TermsPage() {
  return <StaticPage slug="terms" fallbackTitle="Terms of Service" />;
}
