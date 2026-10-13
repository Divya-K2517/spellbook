import type { GardenData, GardenRecord, PersonalityId } from './types';

const PERSONALITIES: readonly PersonalityId[] = ['none', 'shy', 'curious', 'loyal', 'wanderer'];

/**
 * Validates and normalizes a stored record. Storage is untrusted input: a
 * record from an older build or a damaged database must not crash the app.
 * New schema versions are handled here, in one place, by migrating forward.
 */
export function readRecord(raw: unknown): GardenRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Partial<GardenRecord>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || !r.data) return undefined;
  const data = r.data as Partial<GardenData>;
  if (data.schemaVersion !== 1 || !Array.isArray(data.fireflies) || !data.terrain || !data.settings) return undefined;

  const movement = Boolean(data.settings.layers?.movement);
  const normalized: GardenData = {
    schemaVersion: 1,
    seed: Number(data.seed) || 1,
    width: Number(data.width) || 1000,
    height: Number(data.height) || 640,
    settings: {
      vision: Number(data.settings.vision) || 150,
      // The layer ladder: society cannot exist without movement.
      layers: { movement, social: movement && Boolean(data.settings.layers?.social) },
    },
    terrain: {
      ponds: Array.isArray(data.terrain.ponds) ? data.terrain.ponds : [],
      bushes: Array.isArray(data.terrain.bushes) ? data.terrain.bushes : [],
      nextId: Number(data.terrain.nextId) || 1,
    },
    fireflies: data.fireflies.map((f) => ({
      name: String(f.name),
      x: Number(f.x),
      y: Number(f.y),
      period: Number(f.period) || 3,
      phase: Number(f.phase) || 0,
      personality: PERSONALITIES.includes(f.personality) ? f.personality : 'none',
    })),
  };
  return {
    id: r.id,
    name: r.name,
    createdAt: Number(r.createdAt) || Date.now(),
    updatedAt: Number(r.updatedAt) || Date.now(),
    data: normalized,
  };
}
