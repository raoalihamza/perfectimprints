/**
 * Path of the live Sanity search-delta route (app/api/search-index/route.ts).
 * Dep-free so the client fetcher (lib/search/load-index.ts) and the Sanity
 * publish webhook can both import it and stay in sync — the webhook calls
 * `revalidatePath(SEARCH_INDEX_ROUTE)` to refresh it the moment an editor
 * publishes (the route otherwise self-refreshes weekly via ISR).
 */
export const SEARCH_INDEX_ROUTE = '/api/search-index';
