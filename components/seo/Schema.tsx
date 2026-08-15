// Renders arbitrary JSON-LD in a <script type="application/ld+json">. This is
// the emitter every one of the 22,180 /cat pages and every customCategory page
// goes through (CollectionPage, ItemList, FAQPage), so its escaping is the
// widest-reaching of the lot - see lib/seo/json-ld.ts (FIX-830 task 4).
import { jsonLdHtml } from '@/lib/seo/json-ld';

interface SchemaProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function Schema({ data }: SchemaProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}
