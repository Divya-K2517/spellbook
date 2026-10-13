import type { Layers } from '../garden/types';
import type { Familiarity, Hooks, StepContext, System } from './system';
import type { World } from './world';
import { movementSystem } from './systems/movement';
import { installSocialHooks, socialSystem } from './systems/social';

/**
 * The layer ladder. Layer one (blinking) is always on and is not listed here.
 * A layer is a bundle of systems plus any hooks it installs into the others.
 * Adding a fourth layer means writing its systems, adding one entry below, and
 * adding its id to the garden types. Nothing in the existing systems changes.
 */
export type LayerId = keyof Layers;

export interface LayerEnv {
  hooks: Hooks;
  world: World;
  familiarity: Map<number, Familiarity>;
  cfg: StepContext['cfg'];
  settings: StepContext['settings'];
  terrain: StepContext['terrain'];
  grid: StepContext['grid'];
}

export interface LayerDef {
  id: LayerId;
  label: string;
  /** Layers that must be on for this one to be on. */
  requires: LayerId[];
  systems(): System[];
  install?(env: LayerEnv): void;
}

export const LAYERS: Record<LayerId, LayerDef> = {
  movement: {
    id: 'movement',
    label: 'Movement',
    requires: [],
    systems: () => [movementSystem()],
  },
  social: {
    id: 'social',
    label: 'Society',
    requires: ['movement'],
    systems: () => [socialSystem()],
    install: installSocialHooks,
  },
};

/** Bottom of the ladder first, so a layer's prerequisites are installed before it. */
export const LAYER_ORDER: LayerId[] = ['movement', 'social'];

export class LayerLadderError extends Error {}

/** Throws if a layer is on while one it requires is off. */
export function assertLadder(layers: Layers): void {
  for (const id of LAYER_ORDER) {
    if (!layers[id]) continue;
    for (const needed of LAYERS[id].requires) {
      if (!layers[needed]) {
        throw new LayerLadderError(`${LAYERS[id].label} cannot be on while ${LAYERS[needed].label} is off`);
      }
    }
  }
}
