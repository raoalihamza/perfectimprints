/**
 * "Is an AI button running on this blog document?", shared by the three blog
 * actions (AUTO-116 built it for the two writing buttons; AUTO-202 moved it
 * here so the header image button joins the same lock). While any of the
 * three is working on a document, all three are disabled, so two pictures
 * are never paid for at once and a picture made by one button cannot be
 * mistaken for an upload by another. Module-level state read through
 * `useSyncExternalStore`; Studio-only, no imports.
 */
import { useSyncExternalStore } from 'react';

const running = new Set<string>();
const listeners = new Set<() => void>();

export function setBlogActionRunning(id: string, on: boolean): void {
  if (on) running.add(id);
  else running.delete(id);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useBlogActionRunning(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => running.has(id),
    () => running.has(id),
  );
}
