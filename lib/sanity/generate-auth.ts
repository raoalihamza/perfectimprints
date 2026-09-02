/**
 * Shared constants for the Studio nonce guard on the AI generate routes
 * (FIX-850). Pure and dependency-free on purpose: the eight
 * app/api/sanity/generate-* routes import it on the server, and the Studio
 * hook sanity/components/useGenerateAuthFetch.ts imports it in the browser
 * bundle, so the document id and header name structurally cannot drift.
 *
 * The mechanism itself is the existing lib/sanity/studio-nonce-auth.ts
 * (the Site Refresh + Bulk Upload scheme). This file only names the doc and
 * header those eight routes share; it must be a DRAFT id, as the helper's
 * contract requires (a draft is invisible to anonymous dataset reads).
 */

/** Handshake document the Studio writes the nonce to. MUST stay a draft id. */
export const GENERATE_AUTH_DOC_ID = 'drafts.generateAuth';

/** `_type` of that handshake document (deliberately NOT a registered schema type). */
export const GENERATE_AUTH_DOC_TYPE = 'generateAuth';

/** Request header every generate call carries the nonce in. */
export const GENERATE_NONCE_HEADER = 'x-generate-nonce';
