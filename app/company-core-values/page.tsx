import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('company-core-values', '/company-core-values', 'Company Core Values');
}

export default function CoreValuesPage() {
  return <StaticPage slug="company-core-values" fallbackTitle="Company Core Values" />;
}
