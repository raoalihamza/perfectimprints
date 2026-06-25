import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('sample-policy', '/sample-policy', 'Sample Policy');
}

export default function SamplePolicyPage() {
  return <StaticPage slug="sample-policy" fallbackTitle="Sample Policy" />;
}
