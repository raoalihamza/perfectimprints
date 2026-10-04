/**
 * The one slug rule for a blog post made from its title (AUTO-116, moved
 * here by AUTO-201 so the server-side draft creator and the Studio action
 * share it). Pure, dependency-free: safe in the Studio bundle, in routes and
 * in scripts. `sanity/actions/blog-generate-plan.ts` re-exports it, so every
 * caller that imported it from there is unchanged.
 */
export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}
