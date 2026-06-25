import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('privacy-security', '/privacy-security', 'Privacy & Security');
}

export default function PrivacyPage() {
  return <StaticPage slug="privacy-security" fallbackTitle="Privacy & Security" />;
}
