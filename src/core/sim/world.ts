import type { PersonalityId } from '../garden/types';

/**
 * The fireflies, stored as parallel typed arrays (structure of arrays). The
 * simulation touches every firefly every step, and flat numeric arrays keep
 * that fast and allocation-free well past the few dozen the first version
 * needs. A firefly's index is its identity for the whole life of a garden.
 */
export interface World {
  count: number;
  capacity: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** Progress toward the next flash, in [0, 1). */
  phase: Float64Array;
  /** Seconds to charge from reset to a flash. */
  period: Float64Array;
  /** Visible brightness, 1 at the moment of a flash and fading after. */
  glow: Float64Array;
  /** Seconds left during which nudges are ignored. */
  refractory: Float64Array;
  /** Simulation time of the most recent flash. */
  lastFlash: Float64Array;
  /** Wander heading, in radians. */
  heading: Float64Array;
  /** Seconds left of a self-chosen wander-off. */
  restless: Float64Array;
  /** Index into PERSONALITY order; see personalityOf. */
  personality: Uint8Array;
  /** Stable synchronized-group label, or -1 when in no group. */
  group: Int32Array;
  names: string[];
}

const PERSONALITY_ORDER: PersonalityId[] = ['none', 'shy', 'curious', 'loyal', 'wanderer'];

export const personalityIndex = (id: PersonalityId): number => PERSONALITY_ORDER.indexOf(id);
export const personalityOf = (index: number): PersonalityId => PERSONALITY_ORDER[index] ?? 'none';

export function createWorld(capacity = 64): World {
  return {
    count: 0,
    capacity,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    vx: new Float64Array(capacity),
    vy: new Float64Array(capacity),
    phase: new Float64Array(capacity),
    period: new Float64Array(capacity),
    glow: new Float64Array(capacity),
    refractory: new Float64Array(capacity),
    lastFlash: new Float64Array(capacity).fill(-1e9),
    heading: new Float64Array(capacity),
    restless: new Float64Array(capacity),
    personality: new Uint8Array(capacity),
    group: new Int32Array(capacity).fill(-1),
    names: [],
  };
}

function grown<T extends Float64Array | Uint8Array | Int32Array>(
  array: T,
  capacity: number,
  fill = 0,
): T {
  const next = new (array.constructor as new (n: number) => T)(capacity);
  next.set(array);
  if (fill !== 0) next.fill(fill, array.length);
  return next;
}

/** Makes room for one more firefly, doubling capacity when full. Returns the new index. */
export function reserveFirefly(world: World): number {
  if (world.count === world.capacity) {
    const capacity = world.capacity * 2;
    world.x = grown(world.x, capacity);
    world.y = grown(world.y, capacity);
    world.vx = grown(world.vx, capacity);
    world.vy = grown(world.vy, capacity);
    world.phase = grown(world.phase, capacity);
    world.period = grown(world.period, capacity);
    world.glow = grown(world.glow, capacity);
    world.refractory = grown(world.refractory, capacity);
    world.lastFlash = grown(world.lastFlash, capacity, -1e9);
    world.heading = grown(world.heading, capacity);
    world.restless = grown(world.restless, capacity);
    world.personality = grown(world.personality, capacity);
    world.group = grown(world.group, capacity, -1);
    world.capacity = capacity;
  }
  return world.count++;
}
