const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&reg;': '®',
  '&trade;': '™',
  '&copy;': '©',
};

const ENTITY_RE = /&(?:amp|quot|#039|#39|apos|lt|gt|nbsp|reg|trade|copy);/g;

export function decodeHtmlEntities(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(ENTITY_RE, (m) => HTML_ENTITIES[m] ?? m);
}
