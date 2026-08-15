/**
 * The one place JSON-LD is turned into the string that goes inside a
 * `<script type="application/ld+json">` tag (FIX-830 task 4).
 *
 * WHY THIS EXISTS. Half the JSON-LD emitters in this codebase already escaped
 * `<` (products, shop-by-theme, landing pages, customSchema) and half did not
 * (blog posts, breadcrumbs, videos, the FAQ library, page FAQ accordions, the
 * Organization block, the WebSite block, and the `Schema` component that every
 * one of the 22,180 category pages renders through). The values interpolated
 * into those blocks are Sanity fields Patrick edits - a title, a description, a
 * breadcrumb label - so a value containing `</script` would end the script
 * element early. That breaks the page's structured data outright and is a
 * markup-injection path, not a cosmetic inconsistency.
 *
 * THE ESCAPE IS NOT NEW. It is character-for-character the expression the four
 * already-correct call sites used (`.replace(/</g, '\\u003c')`), lifted into one
 * function so the two halves cannot drift again. `<` is the JSON escape for
 * `<`, so a parser reads exactly the same string back: output is byte-identical
 * for any content that contains no `<`, which is all normal content.
 *
 * Pure and dependency-free - safe to import from server components, client
 * components, and tests alike.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
