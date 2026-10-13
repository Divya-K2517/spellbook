import type { GardenRecord } from '@core/garden/types';
import type { GardenStore } from './types';

/** An in-memory store, for tests and for a browser that has no usable IndexedDB. */
export class MemoryGardenStore implements GardenStore {
  private readonly records = new Map<string, GardenRecord>();
  /** Test hook: make the next writes fail. */
  failWrites = false;

  async list(): Promise<GardenRecord[]> {
    return [...this.records.values()]
      .map((r) => structuredClone(r))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async put(record: GardenRecord): Promise<void> {
    if (this.failWrites) throw new Error('storage is unavailable');
    this.records.set(record.id, structuredClone(record));
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}
