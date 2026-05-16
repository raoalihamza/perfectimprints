// TODO: M5-508 - Emit canonical URL link tag.

interface CanonicalUrlProps {
  path: string;
}

export function CanonicalUrl({ path }: CanonicalUrlProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://perfectimprints.com';
  const href = `${siteUrl.replace(/\/$/, '')}${path}`;
  return <link rel="canonical" href={href} />;
}
