/**
 * "Generate header image" / "Generate another header image" Studio action
 * (AUTO-202). Appears only on blogPost documents (registered in
 * sanity.config.ts). It is the first of Patrick's two controls on an image he
 * does not like (the other is uploading his own, the ordinary image field):
 * it asks /api/sanity/generate-blog-image for a NEW picture made from the
 * post's title, topic keywords and the real product photos in its strips,
 * and patches it onto the DRAFT. It never publishes.
 *
 * REPLACES, AFTER ASKING. Unlike Generate Blog with AI (which only fills an
 * empty image), this button exists to replace, so when the post already has
 * a header image, uploaded or generated, it shows a confirmation first that
 * says so; with no image it just runs. Every press costs money (about seven
 * cents) and counts against the daily cap of generated images, and when the
 * cap refuses, the refusal is shown in the dialog in its own words.
 *
 * THE TYPING WINDOW. If the header image changed while the picture was being
 * made (Patrick uploaded one during the wait), his is kept and the dialog
 * says so; the generated picture is left in the media library unused. The
 * AUTO-116 rule.
 *
 * The chain behind the route can also answer with a library picture or the
 * first product photo (when the AI picture fails and a fallback exists); the
 * dialog names which, and a product photo is written as the hot link
 * (`externalHeaderImage`) with the uploaded image cleared, so the readers,
 * which prefer the asset, show the new picture.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, NO
 * server-only imports; the pure strip collector and blank-field helpers only.
 */
import { useRef, useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';
import { capOf, headerImageSignature, imageRequestBody, imageWhy, patchForOutcome, type BlogImageDoc, type ImageResponse } from './blog-image-request';
import { setBlogActionRunning, useBlogActionRunning } from './blog-running';

type BlogDoc = BlogImageDoc;

interface Outcome {
  /** The whole line, what and why: printed once, and nothing repeats it (AUTO-204). */
  summary: string;
  /** The reasons alone, for the two cases that word the first half themselves. */
  why: string;
  /** Where the picture came from: the AI, or a stand-in (a library picture, a product photo). */
  source: 'ai' | 'library' | 'product' | null;
  /** Patrick's own image was kept: 'changed' (it changed during the wait) or 'no-ai' (the AI made nothing and a fallback must not replace an upload). */
  kept: 'changed' | 'no-ai' | null;
  cap?: { used: number; cap: number };
}

export const generateBlogImageWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  // FIX-850: carries the Studio session nonce the generate routes require.
  const authFetch = useGenerateAuthFetch();
  // Shared with Generate / Regenerate Blog with AI: one AI button at a time per document.
  const isRunning = useBlogActionRunning(id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const doc = (draft ?? published) as BlogDoc | null;
  const latest = useRef<BlogDoc | null>(doc);
  latest.current = doc;

  if (type !== 'blogPost') return null;

  const hasTitle = typeof doc?.title === 'string' && doc.title.trim().length > 0;
  const hasImage = headerImageSignature(doc) !== '';

  const run = async () => {
    const atClick = latest.current;
    const signatureAtClick = headerImageSignature(atClick);
    setIsGenerating(true);
    setBlogActionRunning(id, true);
    setHideProgress(false);
    setError(null);
    try {
      const res = await authFetch('/api/sanity/generate-blog-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageRequestBody(atClick, 'ai')),
      });
      const data = (await res.json().catch(() => ({}))) as ImageResponse;
      if (!res.ok || !data.outcome) {
        throw new Error(data.error || 'The header image could not be made. Nothing on the post was changed.');
      }
      const why = imageWhy(data);
      const summary = data.summary ?? '';
      const source = data.outcome.source ?? null;
      const cap = capOf(data.outcome);
      const toPatch = patchForOutcome(data.outcome);
      if (!toPatch) {
        setError(`No picture could be made.${why ? ` ${why}` : ''} Nothing on the post was changed. You can upload a header image yourself.`);
        return;
      }
      // This button was pressed for an AI picture. When the AI made none and
      // the chain fell back to a library picture or a product photo, that
      // fallback may FILL an empty slot but must never REPLACE an image
      // already on the post (the review of the proof run: an upload swapped
      // for a Geiger thumbnail because the model was down).
      if (signatureAtClick !== '' && data.outcome.source !== 'ai') {
        setOutcome({ summary, why, source, kept: 'no-ai', cap });
        return;
      }
      // The typing window: an image changed during the wait is Patrick's.
      if (headerImageSignature(latest.current) !== signatureAtClick) {
        setOutcome({ summary, why, source, kept: 'changed', cap });
        return;
      }
      patch.execute([{ set: toPatch.set }, { unset: toPatch.unset }]);
      setOutcome({ summary, why, source, kept: null, cap });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The header image could not be made. Nothing on the post was changed.');
    } finally {
      setIsGenerating(false);
      setBlogActionRunning(id, false);
    }
  };

  return {
    label: isGenerating ? 'Making the picture…' : hasImage ? 'Generate another header image' : 'Generate header image',
    disabled: isRunning || isGenerating || !hasTitle,
    title: !hasTitle
      ? 'Add a title first: the picture is made from the title and the product photos in the post.'
      : isRunning && !isGenerating
        ? 'The AI is already working on this post.'
        : hasImage
        ? 'Makes a new picture and replaces the current header image. Asks first. Costs about seven cents and counts against the daily limit.'
        : 'Makes a picture from the title and the product photos in the post. Costs about seven cents and counts against the daily limit.',
    onHandle: () => {
      if (hasImage) {
        setConfirming(true);
        return;
      }
      void run();
    },
    dialog: confirming
      ? {
          type: 'confirm' as const,
          tone: 'caution' as const,
          message: (
            <div style={box}>
              <p>
                <strong>This replaces the current header image</strong> with a new picture made by the AI. The current one stays in
                the media library but comes off this post. It cannot be undone by this button; you can upload the old one again.
              </p>
              <p>Each press costs about seven cents and counts against the daily limit of generated images.</p>
            </div>
          ),
          confirmButtonText: 'Make a new picture',
          cancelButtonText: 'Keep the current image',
          onConfirm: () => {
            setConfirming(false);
            void run();
          },
          onCancel: () => {
            setConfirming(false);
            onComplete();
          },
        }
      : isGenerating && !hideProgress
        ? {
            type: 'dialog' as const,
            header: 'Making the header image…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Reading the product photos in the post, drawing the picture, then checking it for logos, brand names and stray words. This usually takes 15 to 30 seconds." />
            ),
          }
        : error
          ? {
              type: 'dialog' as const,
              header: 'No header image was made',
              onClose: () => setError(null),
              content: <div style={{ ...box, color: '#e11f1e' }}>{error}</div>,
            }
          : outcome
            ? {
                type: 'dialog' as const,
                header: outcome.kept ? 'Your image was kept' : outcome.source === 'ai' ? 'Header image updated' : 'A stand-in picture was used',
                onClose: () => {
                  setOutcome(null);
                  onComplete();
                },
                content: (
                  <div style={box}>
                    {outcome.kept === 'changed' ? (
                      <p>
                        The header image changed while the picture was being made, so your image was kept and the new picture
                        was not put on the post.
                      </p>
                    ) : outcome.kept === 'no-ai' ? (
                      <>
                        <p>
                          The AI could not make a new picture this time, so your current header image was kept. A stand-in (a
                          library picture or a product photo) is only ever put on a post that has no image.
                        </p>
                        {outcome.why && <p>{outcome.why}</p>}
                      </>
                    ) : (
                      // What the image is and why, once. The reasons are part of this line and are not repeated below it.
                      <p>{outcome.summary}</p>
                    )}
                    {outcome.kept === null && outcome.source === 'ai' && (
                      <p>
                        <strong>Look at it before you publish.</strong> Every generated picture is checked for logos, brand
                        names and stray words before it is used, but the check is a machine: read the picture with your own
                        eyes. Do not like it? Press the button again, or upload your own.
                      </p>
                    )}
                    {outcome.kept === null && outcome.source !== 'ai' && (
                      <p>
                        <strong>This is a stand-in, not a picture made for this post.</strong> Press the button again to try
                        for an AI picture, or upload your own.
                      </p>
                    )}
                    {outcome.cap && (
                      <p style={{ color: '#6b7280', fontSize: 12 }}>
                        {outcome.cap.used} of {outcome.cap.cap} generated header images used today.
                      </p>
                    )}
                  </div>
                ),
              }
            : false,
  };
};

const box: React.CSSProperties = { padding: 16, fontSize: 14, lineHeight: 1.5, maxWidth: 520 };

export default generateBlogImageWithAi;
