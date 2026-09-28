/**
 * "Is this field empty?" for the Studio AI actions. Moved here VERBATIM from
 * the portfolio action (PORT-170 / PORT-210) by AUTO-116, so the blog actions
 * use the same rule instead of a second copy. Pure, no imports.
 */

/** True for a Portable Text block whose spans hold no text (an opened, untyped rich field). */
export function isEmptyBlock(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const block = entry as { _type?: unknown; children?: unknown };
  if (block._type !== 'block') return false;
  const children = Array.isArray(block.children) ? block.children : [];
  return children.every((c) => typeof (c as { text?: unknown })?.text !== 'string' || !(c as { text: string }).text.trim());
}

export function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  // An empty array, or (PORT-210) a rich-text array Patrick opened and left
  // without typing, is blank; a colours array with one value is not.
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyBlock);
  return false;
}
