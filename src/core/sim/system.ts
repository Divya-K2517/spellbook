import type { Rng } from '../math/rng';
import type { GardenSettings } from '../garden/types';
import type { SimConfig, PersonalityRule } from './config';
import type { SpatialGrid } from './grid';
import type { EventLog } from './log';
import type { Terrain } from './terrain';
import type { World } from './world';

/** Familiarity between one pair of fireflies. */
export interface Familiarity {
  value: number;
  lastContact: number;
}

/** A force a layer adds to a firefly's steering, accumulated into `out`. */
export type SteeringContributor = (index: number, out: { x: number; y: number }) => void;

/**
 * Seams that let a layer change how another layer behaves without either
 * knowing about the other. The society layer, for example, scales blink
 * coupling and adds attraction by installing hooks; the blink and movement
 * systems only ever read the hooks.
 */
export interface Hooks {
  /** Multiplier on how strongly j's flash nudges i. Defaults to 1. */
  coupling: (i: number, j: number) => number;
  /** The personality rules that apply to firefly i. */
  rule: (i: number) => PersonalityRule;
  steering: SteeringContributor[];
}

/** Everything a system may read or change during one step. */
export interface StepContext {
  world: World;
  grid: SpatialGrid;
  terrain: Terrain;
  settings: GardenSettings;
  cfg: SimConfig;
  rng: Rng;
  log: EventLog;
  hooks: Hooks;
  familiarity: Map<number, Familiarity>;
  /** Simulation time at the end of this step. */
  time: number;
  dt: number;
  /** Fireflies that flashed during this step, in order. */
  flashes: number[];
}

/**
 * One unit of simulation. Systems run in `order`, share the context, and keep
 * their own private state in a closure. A new behavior is a new system.
 */
export interface System {
  id: string;
  order: number;
  update(ctx: StepContext): void;
}

/** Fixed positions in the step, so layers agree on what runs before what. */
export const ORDER = {
  movement: 10,
  grid: 15,
  blink: 20,
  social: 30,
  observer: 40,
  recorder: 50,
} as const;
