import { createRng } from '../math/rng';
import { createNameSupply } from './names';
import type { FireflyTraits, GardenData } from './types';

export const GARDEN_WIDTH = 1000;
export const GARDEN_HEIGHT = 640;
export const DEFAULT_VISION = 150;
export const MIN_VISION = 40;
export const MAX_VISION = 320;

/** The smallest satisfying garden: thirty fireflies with independent blink timers. */
export function createGardenData(seed: number, count = 30): GardenData {
  const rng = createRng(seed);
  const names = createNameSupply(rng);
  const margin = 60;
  const fireflies: FireflyTraits[] = [];
  for (let i = 0; i < count; i++) {
    fireflies.push({
      name: names.next(),
      x: rng.range(margin, GARDEN_WIDTH - margin),
      y: rng.range(margin, GARDEN_HEIGHT - margin),
      period: Math.min(3.8, Math.max(2.2, 3 + rng.gaussian() * 0.25)),
      phase: rng.next(),
      personality: 'none',
    });
  }
  return {
    schemaVersion: 1,
    seed,
    width: GARDEN_WIDTH,
    height: GARDEN_HEIGHT,
    settings: { vision: DEFAULT_VISION, layers: { movement: false, social: false } },
    terrain: { ponds: [], bushes: [], nextId: 1 },
    fireflies,
  };
}
