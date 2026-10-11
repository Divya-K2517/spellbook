import type { SpellPage } from '@core/circuit';
import type { PageStore } from './types';

/** A store that forgets everything on reload. Used as a fallback when IndexedDB is unavailable. */
export function createMemoryStore(): PageStore {
  const pages = new Map<string, SpellPage>();
  return {
    async list() {
      return [...pages.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async get(id) {
      const page = pages.get(id);
      return page ? structuredClone(page) : undefined;
    },
    async put(page) {
      pages.set(page.id, structuredClone(page));
    },
    async delete(id) {
      pages.delete(id);
    },
  };
}
