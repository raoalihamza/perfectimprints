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

/**
 * AUTO-212: the CTA Patrick wants on posts the AI WRITES, his wording exactly
 * (the dash and the apostrophe are the characters of DEFAULT_CTA_BODY above,
 * which is his July copy; the body is that copy with the keyword where it
 * said "product"). {KEYWORD} is the post's search topic, `sourceTopic.query`
 * (lib/blog-automation/draft-document.ts aiPostCta fills it; the heading
 * takes it in title case). Written into a NEW generated draft's `ctaTopic`
 * and `ctaBody` once, at creation, so it is plain editable text in Studio and
 * no post that already exists changes.
 */
export const AI_POST_CTA_HEADING = 'Get Help with {KEYWORD}';
export const AI_POST_CTA_BODY =
  'Our team can help you pick the right {KEYWORD}, decoration, and quantity for your project. Reach out and we’ll send tailored ideas — usually within one business day.';
