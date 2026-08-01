/**
 * Uploaded-file handling shared by every public write route that accepts
 * artwork (Q-150).
 *
 * EXTRACTED VERBATIM from the two identical blocks in app/api/leads/route.ts:
 * read each file's bytes ONCE and reuse the same Buffer for the email
 * attachment and the Sanity asset upload (reading a File twice would either
 * fail or double the memory), then upload each as a Sanity file asset with the
 * `att-<n>` keys the leadSubmission schema already stores.
 *
 * Uploading is NON-FATAL by design and that policy lives here: a failed asset
 * upload logs and is skipped, because by the time this runs the notification
 * email has already gone out and losing the record would be worse than losing
 * the attachment.
 */
import type { SanityClient } from '@sanity/client';

import type { LeadEmailAttachment } from '@/lib/email/gmail-smtp';

export interface FileBuffer {
  filename: string;
  contentType?: string;
  buffer: Buffer;
}

export interface SanityFileRef {
  _key: string;
  _type: 'file';
  asset: { _type: 'reference'; _ref: string };
}

/** Reads each uploaded File into a Buffer exactly once. */
export async function readFileBuffers(files: File[]): Promise<FileBuffer[]> {
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      contentType: file.type || undefined,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );
}

/** The same buffers, shaped for Nodemailer. */
export function toEmailAttachments(buffers: FileBuffer[]): LeadEmailAttachment[] {
  return buffers.map((f) => ({
    filename: f.filename,
    content: f.buffer,
    contentType: f.contentType,
  }));
}

/**
 * Uploads each buffer as a Sanity file asset and returns the array item refs.
 * A failure on any one file is logged and skipped, never thrown.
 */
export async function uploadAttachmentRefs(
  sanity: SanityClient,
  buffers: FileBuffer[],
  logPrefix = 'leads',
): Promise<SanityFileRef[]> {
  const refs: SanityFileRef[] = [];
  for (let i = 0; i < buffers.length; i += 1) {
    const f = buffers[i];
    try {
      const asset = await sanity.assets.upload('file', f.buffer, {
        filename: f.filename,
        contentType: f.contentType,
      });
      refs.push({
        _key: `att-${i}`,
        _type: 'file',
        asset: { _type: 'reference', _ref: asset._id },
      });
    } catch (err) {
      console.error(`[${logPrefix}] sanity asset upload failed (non-fatal)`, err);
    }
  }
  return refs;
}
