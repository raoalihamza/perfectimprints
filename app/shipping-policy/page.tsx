import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('shipping-policy', '/shipping-policy', 'U.S. & International Shipping');
}

export default function ShippingPage() {
  return <StaticPage slug="shipping-policy" fallbackTitle="U.S. & International Shipping" />;
}
