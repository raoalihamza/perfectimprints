/**
 * Shared client-side attachment limits + validation for the lead forms
 * (LeadForm + the product-page ProductQuoteForm). Kept in sync with the
 * server-side limits in app/api/leads/route.ts — change both together.
 * Extracted verbatim from LeadForm (P2-CP configurator) so the two forms can
 * never drift from each other.
 */

export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB per file
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // ~20MB total (under Gmail's 25MB ceiling)
export const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ai', '.eps'];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Validates the selected attachments. Returns an error string, or null when OK. */
export function validateFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files.`;
  let total = 0;
  for (const file of files) {
    const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `${file.name}: unsupported file type. Allowed: ${ACCEPTED_EXTENSIONS.join(', ')}.`;
    }
    if (file.size > MAX_FILE_BYTES) {
      return `${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`;
    }
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return `Total attachment size exceeds ${formatBytes(MAX_TOTAL_BYTES)}.`;
  }
  return null;
}
