/**
 * Patrick's own instruction for the header image (AUTO-220): two Studio
 * actions on blogPost documents (registered in sanity.config.ts), both driven
 * by the "Your instruction for the header image" box in the AI section.
 *
 *   "Change this header picture (your instruction)"
 *       sends the picture now on the post back to the AI with his words
 *       ("make the background a beach", "move the title to the left"). Only
 *       on a picture the current header engine made; never on his own upload
 *       (the button is disabled for one, and the server refuses it by the
 *       upload marker whatever the browser sent).
 *   "New header picture (your instruction)"
 *       makes a new picture from the post's product photos with his words in
 *       place of the engine's own brief.
 *
 * WHAT HIS INSTRUCTION DOES NOT SWITCH OFF. The picture still has to carry the
 * post's exact title (it is read back), the logos are still checked against
 * the list of well known brands, the P! mark is still stamped on, and every
 * press still counts against the daily limit of generated pictures. The
 * result is an AI picture or nothing: a library picture or a product photo is
 * never put in its place.
 *
 * REPLACES, AFTER ASKING, like "Generate another header image". The picture it
 * takes off the post, and the copy kept beside it, are removed once nothing
 * points at them, through the one guarded rule in
 * lib/blog-automation/discard-header-image.ts; an image Patrick uploaded is
 * never removed. THE TYPING WINDOW (AUTO-116): if the header image changed
 * while the picture was being made, his is kept and the new one is removed.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, NO
 * server-only imports.
 */
import { useRef, useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';
import { useHeaderAssetDiscard } from '../components/useHeaderAssetDiscard';
import {
  capOf,
  changePictureBlocker,
  copyAssetRefsOf,
  generatedAssetRefOf,
  generatedCopyRefOf,
  headerAssetRefOf,
  headerImageSignature,
  headerInstructionOf,
  imageWhy,
  instructionRequestBody,
  patchForOutcome,
  type BlogImageDoc,
  type ImageResponse,
} from './blog-image-request';
import { setBlogActionRunning, useBlogActionRunning } from './blog-running';

type Mode = 'edit' | 'instruction';

interface Outcome {
  summary: string;
  /** Patrick's own image was kept because it changed during the wait. */
  kept: boolean;
  cap?: { used: number; cap: number };
}

const NO_INSTRUCTION = 'Type what you want in the "Your instruction for the header image" box first (in the AI section of this post).';

function makeInstructionAction(mode: Mode): DocumentActionComponent {
  const action: DocumentActionComponent = (props) => {
    const { id, type, draft, published, onComplete } = props;
    const { patch } = useDocumentOperation(id, type);
    // FIX-850: carries the Studio session nonce the generate routes require.
    const authFetch = useGenerateAuthFetch();
    const discard = useHeaderAssetDiscard();
    // Shared with the other blog AI buttons: one at a time per document.
    const isRunning = useBlogActionRunning(id);
    const [isGenerating, setIsGenerating] = useState(false);
    const [hideProgress, setHideProgress] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outcome, setOutcome] = useState<Outcome | null>(null);

    const doc = (draft ?? published) as BlogImageDoc | null;
    const latest = useRef<BlogImageDoc | null>(doc);
    latest.current = doc;

    if (type !== 'blogPost') return null;

    const hasTitle = typeof doc?.title === 'string' && doc.title.trim().length > 0;
    const hasImage = headerImageSignature(doc) !== '';
    const instruction = headerInstructionOf(doc);
    const blocker = mode === 'edit' ? changePictureBlocker(doc) : null;

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
          body: JSON.stringify(instructionRequestBody(atClick, mode)),
        });
        const data = (await res.json().catch(() => ({}))) as ImageResponse;
        if (!res.ok || !data.outcome) {
          throw new Error(data.error || 'The picture could not be made. Nothing on the post was changed.');
        }
        const why = imageWhy(data);
        // His instruction is an AI picture or nothing: anything else is not put on the post.
        const toPatch = data.outcome.kind === 'asset' && data.outcome.source === 'ai' ? patchForOutcome(data.outcome) : null;
        if (!toPatch) {
          setError(`No picture was made.${why ? ` ${why}` : ''} Nothing on the post was changed.`);
          return;
        }
        // The typing window: an image changed during the wait is Patrick's.
        if (headerImageSignature(latest.current) !== signatureAtClick) {
          const unusedRef = generatedAssetRefOf(data.outcome);
          if (unusedRef) discard.unused(unusedRef);
          const unusedCopy = generatedCopyRefOf(data.outcome);
          if (unusedCopy) discard.unused(unusedCopy);
          setOutcome({ summary: data.summary ?? '', kept: true, cap: capOf(data.outcome) });
          return;
        }
        patch.execute([{ set: toPatch.set }, { unset: toPatch.unset }]);
        // The picture this replaced goes, with the copies kept beside it, if it was a generated one and nothing else uses it.
        const replacedRef = headerAssetRefOf(atClick);
        if (replacedRef && replacedRef !== generatedAssetRefOf(data.outcome)) discard.afterReplace(replacedRef);
        for (const copy of copyAssetRefsOf(atClick)) {
          if (copy !== generatedCopyRefOf(data.outcome) && copy !== generatedAssetRefOf(data.outcome)) discard.afterReplace(copy);
        }
        setOutcome({ summary: data.summary ?? '', kept: false, cap: capOf(data.outcome) });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The picture could not be made. Nothing on the post was changed.');
      } finally {
        setIsGenerating(false);
        setBlogActionRunning(id, false);
      }
    };

    const idleLabel = mode === 'edit' ? 'Change this header picture (your instruction)' : 'New header picture (your instruction)';
    const disabledReason = !hasTitle
      ? 'Add a title first: the picture carries the post\'s title.'
      : isRunning && !isGenerating
        ? 'The AI is already working on this post.'
        : !instruction
          ? NO_INSTRUCTION
          : blocker;

    return {
      label: isGenerating ? (mode === 'edit' ? 'Changing the picture…' : 'Making the picture…') : idleLabel,
      disabled: isRunning || isGenerating || Boolean(disabledReason),
      title:
        disabledReason ??
        (mode === 'edit'
          ? 'Sends the picture now on this post back to the AI with your instruction and replaces it with the result. Asks first. Costs about four cents and counts against the daily limit.'
          : 'Makes a new picture from the product photos in the post, following your instruction, and replaces the current header image. Asks first. Costs about six cents and counts against the daily limit.'),
      onHandle: () => {
        if (mode === 'edit' || hasImage) {
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
                  <strong>{mode === 'edit' ? 'This changes the current header picture' : 'This replaces the current header image'}</strong>{' '}
                  {mode === 'edit' ? 'the way your instruction says:' : 'with a new picture made your way:'}
                </p>
                <p style={{ fontStyle: 'italic' }}>&ldquo;{instruction}&rdquo;</p>
                <p>
                  {mode === 'edit'
                    ? 'The AI redraws the whole picture from the one you have, so small details can shift. The picture you have now comes off the post.'
                    : 'The current one comes off this post.'}{' '}
                  The new picture still carries the post&rsquo;s title and the P! mark, and it counts against the daily limit of generated images.
                </p>
              </div>
            ),
            confirmButtonText: mode === 'edit' ? 'Change the picture' : 'Make a new picture',
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
              header: mode === 'edit' ? 'Changing the header picture…' : 'Making the header picture…',
              onClose: () => setHideProgress(true),
              content: (
                <AiProgressContent message="Drawing the picture your way, then reading the title and the logos back and adding the P! mark. This usually takes 25 to 45 seconds." />
              ),
            }
          : error
            ? {
                type: 'dialog' as const,
                header: 'No picture was made',
                onClose: () => setError(null),
                content: <div style={{ ...box, color: '#e11f1e' }}>{error}</div>,
              }
            : outcome
              ? {
                  type: 'dialog' as const,
                  header: outcome.kept ? 'Your image was kept' : 'Header image updated',
                  onClose: () => {
                    setOutcome(null);
                    onComplete();
                  },
                  content: (
                    <div style={box}>
                      {outcome.kept ? (
                        <p>The header image changed while the picture was being made, so your image was kept and the new picture was not put on the post.</p>
                      ) : (
                        <>
                          <p>{outcome.summary}</p>
                          <p>
                            <strong>Look at it before you publish.</strong> Not what you meant? Reword the instruction and press again, or upload your
                            own.
                          </p>
                        </>
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
  return action;
}

const box: React.CSSProperties = { padding: 16, fontSize: 14, lineHeight: 1.5, maxWidth: 520 };

/** "Change this header picture (your instruction)". */
export const changeBlogImageWithInstruction = makeInstructionAction('edit');
/** "New header picture (your instruction)". */
export const newBlogImageWithInstruction = makeInstructionAction('instruction');
