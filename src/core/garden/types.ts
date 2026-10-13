/**
 * The serializable description of a garden: everything a saved snapshot holds.
 * Runtime-only state (event history, selection, the temporary pond lift,
 * familiarity between fireflies) deliberately lives elsewhere, in the simulation.
 */

export type PersonalityId = 'none' | 'shy' | 'curious' | 'loyal' | 'wanderer';

export interface Pond {
  id: number;
  x: number;
  y: number;
  r: number;
}

export interface Bush {
  id: number;
  x: number;
  y: number;
}

export interface FireflyTraits {
  name: string;
  x: number;
  y: number;
  /** Seconds to charge from reset to a flash: this firefly's own rhythm. */
  period: number;
  /** Progress toward the next flash, in [0, 1). */
  phase: number;
  personality: PersonalityId;
}

export interface Layers {
  /** Layer two. */
  movement: boolean;
  /** Layer three. Requires movement. */
  social: boolean;
}

export interface GardenSettings {
  /** How far a firefly can see another's flash, in garden units. */
  vision: number;
  layers: Layers;
}

export interface GardenData {
  schemaVersion: 1;
  seed: number;
  width: number;
  height: number;
  settings: GardenSettings;
  terrain: { ponds: Pond[]; bushes: Bush[]; nextId: number };
  fireflies: FireflyTraits[];
}

/** What the storage layer keeps for each saved garden. */
export interface GardenRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: GardenData;
}
