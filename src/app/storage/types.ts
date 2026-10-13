import type { GardenRecord } from '@core/garden/types';

/**
 * Where saved gardens live. The app talks only to this interface, so moving
 * from the browser's IndexedDB to files, a server, or a sync service means
 * writing one new class and changing one line where the app is assembled.
 */
export interface GardenStore {
  /** Every saved garden, newest first. */
  list(): Promise<GardenRecord[]>;
  put(record: GardenRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
