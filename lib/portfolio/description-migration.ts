/**
 * The pure half of the PORT-210 description migration.
 *
 * `portfolioItem.description` became rich text (the shared `richAnswer`
 * type) so a word in it can link to the product shown. The documents written
 * before that hold a plain string, which every reader on the site tolerates
 * but which Studio shows as "Invalid property value" with only a Reset
 * button, so they are converted once by scripts/migrations/
 * migrate-richtext-answers.ts. Deciding WHICH documents convert and what
 * each becomes lives here, with no client and no filesystem, so the plan a
 * dry run prints is the plan a unit test can check.
 *
 * Rules:
 *   - a non-empty string converts to paragraph blocks (blank lines split
 *     paragraphs; NO auto-linking, the text is the text);
 *   - an empty or whitespace-only string converts to NO field (unset), the
 *     shape an item with nothing to say already has;
 *   - an array, whatever it holds, is already the new shape and is skipped,
 *     which is what makes a second run a no-op;
 *   - an absent, null or other-typed value is left alone.
 */
import { plainTextToBlocks } from '../portable-text/html-to-blocks';

export interface DescriptionMigrationRow {
  _id: string;
  title?: string | null;
  description?: unknown;
}

export type DescriptionMigrationAction =
  | { kind: 'convert'; _id: string; title: string; blocks: ReturnType<typeof plainTextToBlocks> }
  | { kind: 'unset'; _id: string; title: string }
  | { kind: 'skip'; _id: string; title: string; reason: 'already-rich' | 'no-description' };

export interface DescriptionMigrationPlan {
  actions: DescriptionMigrationAction[];
  /** Documents whose string becomes blocks. */
  convert: number;
  /** Documents whose empty string is removed. */
  unset: number;
  /** Documents already holding an array. */
  alreadyRich: number;
  /** Documents with no description at all. */
  noDescription: number;
}

export function planDescriptionMigration(rows: readonly DescriptionMigrationRow[]): DescriptionMigrationPlan {
  const actions: DescriptionMigrationAction[] = [];
  let convert = 0;
  let unset = 0;
  let alreadyRich = 0;
  let noDescription = 0;
  for (const row of rows) {
    const title = (row.title ?? '').trim() || row._id;
    const value = row.description;
    if (typeof value === 'string') {
      if (value.trim()) {
        actions.push({ kind: 'convert', _id: row._id, title, blocks: plainTextToBlocks(value) });
        convert++;
      } else {
        actions.push({ kind: 'unset', _id: row._id, title });
        unset++;
      }
    } else if (Array.isArray(value)) {
      actions.push({ kind: 'skip', _id: row._id, title, reason: 'already-rich' });
      alreadyRich++;
    } else {
      actions.push({ kind: 'skip', _id: row._id, title, reason: 'no-description' });
      noDescription++;
    }
  }
  return { actions, convert, unset, alreadyRich, noDescription };
}
