import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('returns', '/returns', 'Returns & Refunds');
}

export default function ReturnsPage() {
  return <StaticPage slug="returns" fallbackTitle="Returns & Refunds" />;
}
