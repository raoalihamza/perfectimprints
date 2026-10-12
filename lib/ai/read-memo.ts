/**
 * One memo for the Sanity reads of ONE generation (AUTO-205 Part 1).
 *
 * WHY. The AUTO-205 diagnostic timed a 12-idea list post at 104.8 s against
 * a guide post at 55.6 s, and the difference was one phase: 65 sequential
 * Sanity reads at about 0.85 s each, made by the product matcher once per
 * idea. Replaying FIX-911's 107 ideas made 509 read requests of which only 52
 * were distinct: the category control sets, the custom products, the product
 * pages and the hidden-SKU context are the same documents every idea, and the
 * category reads repeat whenever two ideas resolve to one root. On Vercel the
 * tagged fetches sit behind Next's data cache and request memo, so the
 * production figure is smaller than the tsx one (the diagnostic warned of
 * that and this module does not claim otherwise); on a Pro Sanity plan every
 * request still costs, and a scheduler will make them twice a day.
 *
 * HOW. An AsyncLocalStorage scope opened by `withReadMemo` around one
 * generation; inside it `memoizedRead(key, load)` returns the same promise for
 * the same key. OUTSIDE a scope `memoizedRead` is a plain call-through, so a
 * render path that happens to share a function with the generator (the
 * `/products/<slug>` carousel reads categories through the same matcher)
 * behaves exactly as before: nothing is memoised across requests, nothing is
 * memoised at all unless a generation opened the scope. A rejected promise is
 * forgotten at once, so a transient failure is retried by the next caller
 * rather than remembered for the whole generation.
 *
 * WHAT IT MUST NOT COVER. `readWrittenTopicSources` (the AUTO-117 live
 * drafts read) is deliberately `no-store` and read twice on purpose (before
 * the AI and just before the create); it never goes through this memo, and a
 * test says so.
 *
 * Server only (node:async_hooks); imported by server modules under lib/ai,
 * lib/sanity/queries and lib/blog-automation, never by Studio code.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

type MemoStore = Map<string, Promise<unknown>>;

const storage = new AsyncLocalStorage<MemoStore>();

/** Run `fn` with one read memo. A nested call joins the scope already open rather than shadowing it. */
export function withReadMemo<T>(fn: () => Promise<T>): Promise<T> {
  const existing = storage.getStore();
  if (existing) return fn();
  return storage.run(new Map(), fn);
}

/** True inside a `withReadMemo` scope. */
export function inReadMemo(): boolean {
  return storage.getStore() !== undefined;
}

/**
 * The memoised read for `key` inside a scope; a plain `load()` outside one.
 * A failed load is not remembered.
 */
export function memoizedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return load();
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;
  const promise = load();
  store.set(key, promise);
  promise.catch(() => {
    if (store.get(key) === promise) store.delete(key);
  });
  return promise;
}

/** How many distinct reads the open scope holds (for logs and the harness); 0 outside a scope. */
export function readMemoSize(): number {
  return storage.getStore()?.size ?? 0;
}
