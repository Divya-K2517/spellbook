import { readRecord } from '@core/garden/serialize';
import type { GardenRecord } from '@core/garden/types';
import type { GardenStore } from './types';

const DB_NAME = 'firefly-society';
const STORE = 'gardens';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Saved gardens in the browser's IndexedDB. Nothing leaves the device. */
export class IndexedDbGardenStore implements GardenStore {
  private db: Promise<IDBDatabase> | undefined;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('could not open IndexedDB'));
    });
    return this.db;
  }

  async list(): Promise<GardenRecord[]> {
    const db = await this.open();
    const raw = await request(db.transaction(STORE).objectStore(STORE).getAll());
    // Storage is untrusted input: damaged or outdated records are skipped, not fatal.
    return raw
      .map(readRecord)
      .filter((r): r is GardenRecord => r !== undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async put(record: GardenRecord): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    await done(tx);
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await done(tx);
  }
}
