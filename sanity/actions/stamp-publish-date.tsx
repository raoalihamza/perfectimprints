/**
 * Publish, with the publish date stamped at the moment of publishing
 * (AUTO-116). Wraps the Studio's own Publish action for blogPost only
 * (sanity.config.ts replaces `action === 'publish'` with this).
 *
 * Why: the AI paths used to set `publishDate` when the draft was GENERATED,
 * so a draft reviewed a week later went live dated a week ago (AUTO-115).
 * Neither generate path sets it any more; instead, when Patrick presses
 * Publish on a post whose publish date is EMPTY, this sets it to now and then
 * hands over to the stock Publish. A date that is already filled in (every
 * imported post, and any date Patrick chose himself) is never touched.
 *
 * Why it is safe to patch and then publish in the same click (verified in
 * Sanity 3.99's document store, not assumed): `publish` is one of the
 * operations that first commits every pending local patch and waits for the
 * document to be consistent before it runs, and the publish itself is a
 * server-side action on the stored draft, so the stamped date is part of what
 * goes live. This is also the pattern Sanity documents for "set a field, then
 * publish". Everything else about Publish (validation gating, permissions,
 * the label, the shortcut) is the stock action's, untouched.
 */
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { isBlank } from '../components/blank-fields';

// One wrapper per original, so the config resolver (which may run on every
// document render) always hands React the SAME component and the stock
// Publish keeps its internal state (its "waiting to publish" flag).
const wrapped = new WeakMap<DocumentActionComponent, DocumentActionComponent>();

export function withPublishDateStamp(Original: DocumentActionComponent): DocumentActionComponent {
  const existing = wrapped.get(Original);
  if (existing) return existing;
  const Stamped: DocumentActionComponent = (props) => {
    // Both are hooks and are always called, in the same order.
    const description = Original(props);
    const { patch } = useDocumentOperation(props.id, props.type);
    if (!description) return description;
    const draft = props.draft as { publishDate?: unknown } | null;
    if (!draft || !isBlank(draft.publishDate)) return description;
    const originalHandle = description.onHandle;
    return {
      ...description,
      onHandle: () => {
        patch.execute([{ set: { publishDate: new Date().toISOString() } }]);
        originalHandle?.();
      },
    };
  };
  Stamped.action = Original.action;
  Stamped.displayName = `PublishWithDate(${Original.displayName ?? 'Publish'})`;
  wrapped.set(Original, Stamped);
  return Stamped;
}
