import type { SpellPage } from '@core/circuit';

/**
 * Where saved pages live. The controller only knows this interface,
 * so IndexedDB can be swapped for the in-memory store (tests, private
 * browsing fallbacks) without touching any other code.
 */
export interface PageStore {
  /** All saved pages, newest first. */
  list(): Promise<SpellPage[]>;
  get(id: string): Promise<SpellPage | undefined>;
  put(page: SpellPage): Promise<void>;
  delete(id: string): Promise<void>;
}
