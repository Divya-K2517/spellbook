import type { SpellPage } from '@core/circuit';
import type { PageStore } from './types';

const DB_NAME = 'logic-spellbook';
const DB_VERSION = 1;
const PAGES = 'pages';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAGES)) {
        db.createObjectStore(PAGES, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the spellbook database.'));
    request.onblocked = () => reject(new Error('The spellbook database is blocked by another tab.'));
  });
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Database request failed.'));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Database transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Database transaction aborted.'));
  });
}

/** Browser-only persistence: every saved page is one record, keyed by page id. */
export function createIndexedDbStore(): PageStore {
  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = () => (dbPromise ??= openDatabase());

  return {
    async list() {
      const database = await db();
      const pages = await wrap<SpellPage[]>(
        database.transaction(PAGES, 'readonly').objectStore(PAGES).getAll(),
      );
      return pages.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async get(id) {
      const database = await db();
      return wrap<SpellPage | undefined>(
        database.transaction(PAGES, 'readonly').objectStore(PAGES).get(id),
      );
    },
    async put(page) {
      const database = await db();
      const tx = database.transaction(PAGES, 'readwrite');
      tx.objectStore(PAGES).put(page);
      await finished(tx);
    },
    async delete(id) {
      const database = await db();
      const tx = database.transaction(PAGES, 'readwrite');
      tx.objectStore(PAGES).delete(id);
      await finished(tx);
    },
  };
}

/** Probes IndexedDB once so callers can fall back instead of failing at first save. */
export async function indexedDbAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const database = await openDatabase();
    database.close();
    return true;
  } catch {
    return false;
  }
}
