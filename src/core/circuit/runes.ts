import type { RuneKind } from './types';

/**
 * Rune registry: the single place that says what each rune kind is.
 *
 * Validator and simulator both read from here, so adding a new rune
 * (for example a memory rune later) means adding one entry rather than
 * editing several switch statements.
 */
export interface RuneSpec {
  kind: RuneKind;
  /** Fewest incoming ink paths allowed. */
  minInputs: number;
  /** Most incoming ink paths allowed (Infinity for any number). */
  maxInputs: number;
  /** Whether this rune produces a signal other runes can listen to. */
  hasOutput: boolean;
  /**
   * Computes this rune's value from the values of its incoming ink paths.
   * `previous` is the rune's own value from the prior round, which memory
   * runes will need later; combinational runes ignore it.
   */
  evaluate(inputs: readonly boolean[], previous: boolean): boolean;
  /** Short plain-language rule, used by "why is this on/off?" explanations. */
  describeRule(): string;
}

const specs: Record<RuneKind, RuneSpec> = {
  input: {
    kind: 'input',
    minInputs: 0,
    maxInputs: 0,
    hasOutput: true,
    // Input values are supplied from outside; the simulator never calls this.
    evaluate: (_inputs, previous) => previous,
    describeRule: () => 'A switch you set yourself.',
  },
  output: {
    kind: 'output',
    minInputs: 1,
    maxInputs: 1,
    hasOutput: false,
    evaluate: (inputs) => inputs[0] ?? false,
    describeRule: () => 'Takes on the value of whatever feeds it.',
  },
  or: {
    kind: 'or',
    minInputs: 1,
    maxInputs: Infinity,
    hasOutput: true,
    evaluate: (inputs) => inputs.some(Boolean),
    describeRule: () => 'Either: on when at least one input is on.',
  },
  and: {
    kind: 'and',
    minInputs: 1,
    maxInputs: Infinity,
    hasOutput: true,
    evaluate: (inputs) => inputs.length > 0 && inputs.every(Boolean),
    describeRule: () => 'Both: on only when every input is on.',
  },
  not: {
    kind: 'not',
    minInputs: 1,
    maxInputs: 1,
    hasOutput: true,
    evaluate: (inputs) => !(inputs[0] ?? false),
    describeRule: () => 'Opposite: on when its input is off, and off when it is on.',
  },
};

export function runeSpec(kind: RuneKind): RuneSpec {
  return specs[kind];
}

export const ALL_RUNE_KINDS: readonly RuneKind[] = Object.keys(specs) as RuneKind[];

export function isRuneKind(value: unknown): value is RuneKind {
  return typeof value === 'string' && value in specs;
}
