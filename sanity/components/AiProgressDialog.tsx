/**
 * Shared progress content for the "Generate … with AI" document actions
 * (P2-AI-002d). The action button's "Generating…" label is invisible in
 * practice — the document-actions menu closes on click — so each action shows
 * this inside a Sanity action `dialog` while its fetch runs: a spinning dashed
 * circle + what is being written + a note that the result fills in
 * automatically. The dialog closes itself when generation finishes (the
 * action's `dialog` becomes false); closing it early only hides it —
 * generation keeps running.
 *
 * Studio-only: plain React, no @sanity/ui, no server imports (keep it that way
 * — this ships in the Studio bundle).
 */

const spinnerStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: '3px dashed #e11f1e',
  borderTopColor: 'transparent',
  animation: 'pi-ai-spin 1s linear infinite',
};

export function AiProgressContent({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        textAlign: 'center',
        maxWidth: 420,
      }}
    >
      <style>{'@keyframes pi-ai-spin { to { transform: rotate(360deg); } }'}</style>
      <div role="status" aria-label="Generating" style={spinnerStyle} />
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message}</div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
        The result is filled into the document automatically when it finishes. You can close this
        window and keep working — generation continues in the background.
      </div>
    </div>
  );
}

export default AiProgressContent;
