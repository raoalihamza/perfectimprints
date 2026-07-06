/**
 * Landmark-inclusion check for AI landing-page generation (P2-AI-005). Patrick's
 * hard requirement: every landmark he lists MUST appear in the generated copy.
 * The prompt instructs the model to weave each one in; this check ENFORCES it —
 * the generate-landing route rejects (502, "click Generate again") any result
 * that dropped a landmark, so a page can never quietly ship without them.
 *
 * Matching is forgiving on formatting but strict on content:
 *   - case-insensitive, whitespace runs collapsed, straight/curly apostrophes
 *     normalized;
 *   - WORD-BOUNDED — the landmark must appear as whole words, so the landmark
 *     "Destin" is NOT satisfied by the word "destination";
 *   - PER-SEGMENT — when the text is passed as an array of blocks (paragraphs,
 *     headings, list items), the landmark must appear within a SINGLE block, so
 *     a multi-word landmark can't false-match across two adjacent blocks'
 *     boundary (e.g. one paragraph ending "…the Harbor" + the next starting
 *     "Village shops…" does not satisfy "Harbor Village").
 *
 * Pure module: no fs, no Sanity, no React — unit-tested by the offline verifier.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'") // curly → straight apostrophes
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-bounded regex for a normalized landmark: no letter/digit may directly
 * precede or follow the match, and internal whitespace matches any run.
 */
function landmarkRegex(landmark: string): RegExp {
  const body = escapeRegExp(landmark).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${body}(?![a-z0-9])`);
}

/**
 * Returns the landmarks (original casing) NOT found in `text`. Empty array =
 * every landmark present. Blank landmark entries are ignored. Pass the content
 * as an ARRAY of blocks where possible — each block is checked independently
 * (see the per-segment note above); a single string is treated as one block.
 */
export function findMissingLandmarks(landmarks: string[], text: string | string[]): string[] {
  const segments = (Array.isArray(text) ? text : [text]).map(normalize).filter(Boolean);
  return landmarks
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((landmark) => {
      const re = landmarkRegex(normalize(landmark));
      return !segments.some((segment) => re.test(segment));
    });
}
