import type { AppState } from '@app';

/**
 * What the spread should currently show for signals: which runes read as
 * "on", which ink glows, and which runes just changed. Pure and framework-free.
 *
 * In preview this is the settled result. In the trace inspector it is the
 * circuit as it stood after the chosen propagation round, so the animation
 * can step through the reasoning one round at a time.
 */
export interface Display {
  /** True when signal values should be drawn at all. */
  showValues: boolean;
  values: Record<string, boolean>;
  litInk: Set<string>;
  /** Runes that changed in the round being inspected (trace only). */
  changedRunes: Set<string>;
}

const EMPTY: Display = {
  showValues: false,
  values: {},
  litInk: new Set(),
  changedRunes: new Set(),
};

export function displayState(state: AppState): Display {
  const mode = state.snapshot.state;
  const simulation = state.simulation;
  if (!simulation || (mode !== 'preview' && mode !== 'tracing')) return EMPTY;

  if (mode === 'preview') {
    return {
      showValues: true,
      values: simulation.values,
      litInk: new Set(simulation.litInk),
      changedRunes: new Set(),
    };
  }

  const values: Record<string, boolean> = {};
  const last = Math.min(state.traceRound, simulation.rounds.length - 1);
  for (let index = 0; index <= last; index += 1) {
    for (const change of simulation.rounds[index]?.changes ?? []) values[change.runeId] = change.to;
  }
  const round = simulation.rounds[last];
  return {
    showValues: true,
    values,
    litInk: new Set(round?.litInk ?? []),
    changedRunes: new Set((round?.changes ?? []).map((change) => change.runeId)),
  };
}
