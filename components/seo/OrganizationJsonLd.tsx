import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import { organizationSchema } from '@/lib/seo/schema-generators';
import { jsonLdHtml } from '@/lib/seo/json-ld';

/**
 * Sitewide Organization JSON-LD, rendered in the root layout.
 *
 * Split into its own async server component so the layout itself stays sync and
 * the Sanity read (socials + contact from globalSettings) is colocated with the
 * schema it feeds — same pattern as the Header reading the mega menu.
 * `getSiteSettings()` is React-`cache()`d, so this shares one fetch with the
 * Footer per render.
 */
export async function OrganizationJsonLd() {
  const settings = await getSiteSettings();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(organizationSchema(settings)) }}
    />
  );
}
