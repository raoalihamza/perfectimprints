/**
 * "Redraw title on header image" Studio action (AUTO-209). Appears on a
 * blogPost ONLY when its generated header picture carries a title that no
 * longer matches the post's title (the warning on the Header Image field
 * names this button). It asks /api/sanity/generate-blog-image to put the
 * current title on the kept untitled copy of the same picture, in the same
 * placement and fill: no AI call, no cap slot, free, a few seconds. It
 * patches the DRAFT and never publishes.
 *
 * An image Patrick uploaded can never reach this button: it has no
 * `titleOnImage` and no untitled copy, and the route refuses anything that
 * is not a picture the site generated.
 *
 * Studio-only: plain React + the `sanity` action API, no server imports; the
 * pure request helpers and the pure drift rule only.
 */
import { useRef, useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { titleOnImageDrift } from '../../lib/blog/header-image';
import { AiProgressContent } from '../components/AiProgressDialog';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';
import { useHeaderAssetDiscard } from '../components/useHeaderAssetDiscard';
import {
  headerAssetRefOf,
  headerImageSignature,
  patchForOutcome,
  retitleRequestBody,
  titleOnImageOf,
  untitledAssetRefOf,
  type BlogImageDoc,
  type ImageResponse,
} from './blog-image-request';
import { setBlogActionRunning, useBlogActionRunning } from './blog-running';

export const redrawBlogTitle: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  const authFetch = useGenerateAuthFetch();
  const discard = useHeaderAssetDiscard();
  const isRunning = useBlogActionRunning(id);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const doc = (draft ?? published) as BlogImageDoc | null;
  const latest = useRef<BlogImageDoc | null>(doc);
  latest.current = doc;

  if (type !== 'blogPost') return null;
  const drawn = titleOnImageOf(doc);
  const untitled = untitledAssetRefOf(doc);
  const title = typeof doc?.title === 'string' ? doc.title : '';
  // Shown only when there is something to redraw: a generated picture, its untitled copy, and a title that moved.
  if (!drawn || !untitled || !titleOnImageDrift(drawn, title)) return null;

  const run = async () => {
    const atClick = latest.current;
    const signatureAtClick = headerImageSignature(atClick);
    setIsWorking(true);
    setBlogActionRunning(id, true);
    setError(null);
    try {
      const res = await authFetch('/api/sanity/generate-blog-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retitleRequestBody(atClick)),
      });
      const data = (await res.json().catch(() => ({}))) as ImageResponse;
      if (!res.ok || !data.outcome) throw new Error(data.error || 'The title could not be redrawn. Nothing on the post was changed.');
      const toPatch = patchForOutcome(data.outcome);
      if (!toPatch) throw new Error('The title could not be redrawn. Nothing on the post was changed.');
      // The typing window (AUTO-116): a header image changed during the wait is Patrick's.
      if (headerImageSignature(latest.current) !== signatureAtClick) {
        const unusedRef = data.outcome.image?.asset?._ref;
        if (unusedRef) discard.unused(unusedRef);
        setDone('The header image changed while the title was being redrawn, so your image was kept.');
        return;
      }
      patch.execute([{ set: toPatch.set }, { unset: toPatch.unset }]);
      // The picture with the old title goes (ours, and referenced by nothing once the patch commits); the untitled copy stays.
      const replaced = headerAssetRefOf(atClick);
      if (replaced && replaced !== data.outcome.image?.asset?._ref) discard.afterReplace(replaced);
      setDone(data.summary ?? 'The current title is now on the header picture.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The title could not be redrawn. Nothing on the post was changed.');
    } finally {
      setIsWorking(false);
      setBlogActionRunning(id, false);
    }
  };

  return {
    label: isWorking ? 'Redrawing the title…' : 'Redraw title on header image',
    disabled: isRunning || isWorking,
    title: isRunning && !isWorking ? 'The AI is already working on this post.' : `Puts the current title on the same picture, in the same place. Free, a few seconds. The picture now shows "${drawn}".`,
    onHandle: () => {
      void run();
    },
    dialog: isWorking
      ? {
          type: 'dialog' as const,
          header: 'Redrawing the title…',
          onClose: () => {},
          content: <AiProgressContent message="Drawing the current title on the picture. This takes a few seconds and costs nothing." />,
        }
      : error
        ? {
            type: 'dialog' as const,
            header: 'The title was not redrawn',
            onClose: () => setError(null),
            content: <div style={{ ...box, color: '#e11f1e' }}>{error}</div>,
          }
        : done
          ? {
              type: 'dialog' as const,
              header: 'Header image updated',
              onClose: () => {
                setDone(null);
                onComplete();
              },
              content: (
                <div style={box}>
                  <p>{done}</p>
                  <p>Look at it before you publish: the picture is the same, only the lettering changed.</p>
                </div>
              ),
            }
          : false,
  };
};

const box: React.CSSProperties = { padding: 16, fontSize: 14, lineHeight: 1.5, maxWidth: 520 };

export default redrawBlogTitle;
