/**
 * Default copy for the blog "Order Custom … Today" CTA block (OrderTodayCTA).
 *
 * The heading has a per-post override (`blogPost.ctaTopic`); the BODY paragraph
 * now has one too (`blogPost.ctaBody`). Both the component fallback and the
 * one-time backfill script import THIS constant so the stored text and the
 * rendered default can never drift. Pure module (no React / no 'use client')
 * so a Node migration script can import it safely.
 */
export const DEFAULT_CTA_BODY =
  'Our team can help you pick the right product, decoration, and quantity for your project. Reach out and we’ll send tailored ideas — usually within one business day.';
