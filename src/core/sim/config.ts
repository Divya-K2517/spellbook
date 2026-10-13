import type { PersonalityId } from '../garden/types';

/**
 * Every tunable number in the simulation lives here, as data. Systems read
 * from this object and never hard-code a constant, so a new experiment is a
 * config change and the simulation can be retuned without touching its logic.
 */
export interface SimConfig {
  /** Fixed simulation step, in seconds. The renderer interpolates nothing; it just draws the latest state. */
  stepSeconds: number;

  blink: {
    /** Pulse-coupling strength: how far one visible flash pushes a neighbor's timer. */
    epsilon: number;
    /** Curvature of the charging curve. Higher means nudges matter more late in the cycle. */
    curvature: number;
    /** Seconds after a flash during which a firefly ignores nudges. */
    refractory: number;
    /** Time constant of the visible glow fading after a flash. */
    glowDecay: number;
  };

  movement: {
    cruiseSpeed: number;
    maxSpeed: number;
    /** Heading change per sqrt(second), in radians. */
    wanderTurn: number;
    /** Neighbors closer than this push each other apart. */
    separationDistance: number;
    separationPush: number;
    bushRange: number;
    bushPull: number;
    /** Distance at which a firefly settles around a bush instead of pressing closer. */
    bushSettle: number;
    wallMargin: number;
    wallPush: number;
    pondMargin: number;
    pondPush: number;
    /** Chance per second that a firefly wanders off on its own. */
    restlessRate: number;
    restlessSeconds: number;
    restlessBoost: number;
    /** How quickly velocity follows the desired velocity, per second. */
    responsiveness: number;
  };

  social: {
    /** Two fireflies this close (and farther than separation) count as meeting. */
    encounterRadius: number;
    /** Familiarity gained per second of peaceful company, scaled by room left to grow. */
    gain: number;
    /** Seconds apart before familiarity starts to fade. */
    graceSeconds: number;
    /** Familiarity lost per second once the grace period has passed. */
    decay: number;
    /** Familiarity of 1 multiplies the coupling strength by 1 + couplingBoost. */
    couplingBoost: number;
    attractionPull: number;
    crowdPush: number;
  };

  observer: {
    intervalSeconds: number;
    /** Two flashing neighbors count as together when their phases differ by less than this. */
    phaseTolerance: number;
    minGroupSize: number;
    /** Seconds a state must hold before synchrony is reported as gained or lost. */
    holdSeconds: number;
  };

  recorder: {
    intervalSeconds: number;
    pathIntervalSeconds: number;
    pathCapacity: number;
    maxEvents: number;
    /** Two flashes this close in time, between neighbors, count as a match. */
    matchWindowSeconds: number;
    meetEnter: number;
    meetExit: number;
  };
}

export const DEFAULT_CONFIG: SimConfig = {
  stepSeconds: 1 / 60,
  blink: { epsilon: 0.03, curvature: 3, refractory: 0.2, glowDecay: 0.22 },
  movement: {
    cruiseSpeed: 20,
    maxSpeed: 48,
    wanderTurn: 1.5,
    separationDistance: 26,
    separationPush: 70,
    bushRange: 170,
    bushPull: 26,
    bushSettle: 34,
    wallMargin: 50,
    wallPush: 90,
    pondMargin: 26,
    pondPush: 140,
    restlessRate: 0.012,
    restlessSeconds: 3.5,
    restlessBoost: 2.2,
    responsiveness: 2.2,
  },
  social: {
    encounterRadius: 52,
    gain: 0.05,
    graceSeconds: 12,
    decay: 0.012,
    couplingBoost: 1.5,
    attractionPull: 24,
    crowdPush: 38,
  },
  observer: { intervalSeconds: 0.25, phaseTolerance: 0.05, minGroupSize: 4, holdSeconds: 1.5 },
  recorder: {
    intervalSeconds: 0.25,
    pathIntervalSeconds: 0.5,
    pathCapacity: 480,
    maxEvents: 4000,
    matchWindowSeconds: 0.12,
    meetEnter: 44,
    meetExit: 80,
  },
};

/**
 * What a personality changes. Rules are data: a fifth personality is one new
 * row here and one new id in the garden types, with no new branching in the
 * systems that read them.
 */
export interface PersonalityRule {
  label: string;
  /** Pull toward neighbors, scaled by how familiar they are. */
  familiarAttraction: number;
  /** Pull toward neighbors, scaled by how unfamiliar they are. Negative repels. */
  strangerAttraction: number;
  /** More visible neighbors than this and the firefly backs away from the crowd. */
  crowdLimit: number;
  /** Multiplier on how often the firefly wanders off alone. */
  restlessMultiplier: number;
  blurb: string;
}

export const PERSONALITY_RULES: Record<PersonalityId, PersonalityRule> = {
  none: {
    label: 'Ordinary',
    familiarAttraction: 1,
    strangerAttraction: 0,
    crowdLimit: Number.POSITIVE_INFINITY,
    restlessMultiplier: 1,
    blurb: 'Drifts toward familiar company.',
  },
  shy: {
    label: 'Shy',
    familiarAttraction: 0.8,
    strangerAttraction: -0.4,
    crowdLimit: 4,
    restlessMultiplier: 1,
    blurb: 'Prefers smaller groups and keeps away from strangers.',
  },
  curious: {
    label: 'Curious',
    familiarAttraction: 0.3,
    strangerAttraction: 1.1,
    crowdLimit: Number.POSITIVE_INFINITY,
    restlessMultiplier: 1.5,
    blurb: 'Approaches fireflies it does not know yet.',
  },
  loyal: {
    label: 'Loyal',
    familiarAttraction: 2.2,
    strangerAttraction: 0,
    crowdLimit: Number.POSITIVE_INFINITY,
    restlessMultiplier: 0.4,
    blurb: 'Stays near familiar neighbors.',
  },
  wanderer: {
    label: 'Wanderer',
    familiarAttraction: 0.4,
    strangerAttraction: 0.2,
    crowdLimit: Number.POSITIVE_INFINITY,
    restlessMultiplier: 5,
    blurb: 'Frequently leaves its current group.',
  },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITY_RULES) as PersonalityId[];
