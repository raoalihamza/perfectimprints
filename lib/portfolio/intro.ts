import type { PortableTextBlock } from '@portabletext/react';
import { portableTextToPlain } from '@/lib/portable-text/to-plain';

/**
 * The /portfolio page introduction (PORT-115): Patrick's own words about the
 * kind of work he takes on, written in Global Settings > Portfolio Page as a
 * short `richAnswer` (paragraphs, bold, italic, links; nothing else).
 *
 * ONE rule for "is there an intro to show": a value that is not a Portable
 * Text array, an empty array, or an array whose spans hold no text at all
 * (an editor opened the field, pressed Enter and left) resolves to null, and
 * null means the page renders NOTHING for it. Pure and dependency-free so the
 * settings resolver and a test share it rather than each deciding.
 */
export function resolvePortfolioIntro(value: unknown): PortableTextBlock[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return portableTextToPlain(value) ? (value as PortableTextBlock[]) : null;
}
