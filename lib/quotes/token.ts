/**
 * Private quote-link token (Q-110). The customer's link to a quote is
 * /quote/<token> - an unguessable 128-bit value stored as the quote
 * document's SLUG (so the existing webhook projection, which already carries
 * `slug`, needs no change at all).
 *
 * Format: 16 cryptographically random bytes rendered as LOWERCASE
 * hexadecimal (32 chars). Lowercase is mandatory, not cosmetic: the cache-tag
 * sanitizer (`sanitizeTagValue` in lib/sanity/cache-tags.ts) lowercases tag
 * values, so a mixed-case token would collapse two different tokens onto one
 * cache tag. Hex also survives copy/paste and email-client URL mangling.
 *
 * The token lives in the URL PATH, never a query parameter - reading
 * `searchParams` in a page is a Dynamic API that would force the route
 * dynamic and break the static model (CLAUDE.md Section 13).
 *
 * NEVER log a full token. If something must be logged, log the quote number.
 *
 * This is the SERVER-SIDE generator (node:crypto), for the future route that
 * creates quotes programmatically. The Studio twin lives inline in
 * sanity/schemas/documents/quote.ts (the slug's initialValue, using Web
 * Crypto - schema files stay dependency-free for the standalone Studio
 * bundler). Keep the two in agreement: 16 bytes, lowercase hex.
 */

import { randomBytes } from 'node:crypto';

/** Exactly 32 lowercase hex chars - what a valid quote token looks like. */
export const QUOTE_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

export function generateQuoteToken(): string {
  return randomBytes(16).toString('hex');
}

export function isQuoteToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && QUOTE_TOKEN_PATTERN.test(value);
}
