import { buildIncoming, runeSpec } from '../circuit';
import type { InputValues, SpellPage } from '../circuit';

export interface InputReading {
  runeId: string;
  value: boolean;
}

/** One rune changing value during a round, with the evidence for why. */
export interface RuneChange {
  runeId: string;
  from: boolean;
  to: boolean;
  /** The values it was reading when it changed. Empty for input runes. */
  inputs: InputReading[];
  rule: string;
}

/**
 * One propagation round. Round 0 is the inputs being set; each later round
 * is every gate reacting at once to the values from the round before.
 * The trace animation plays one round at a time.
 */
export interface TraceRound {
  index: number;
  changes: RuneChange[];
  /** Ink paths carrying a true signal after this round, for glow rendering. */
  litInk: string[];
}

export interface SimulationResult {
  values: Record<string, boolean>;
  rounds: TraceRound[];
  /** False if the circuit was still changing when the round limit hit (oscillation). */
  settled: boolean;
  litInk: string[];
}

export interface SimulationOptions {
  /** Round limit. Defaults to enough for any acyclic page, plus slack for future feedback. */
  maxRounds?: number;
}

/**
 * Evaluates a page by propagating values in synchronous rounds until nothing changes.
 *
 * Acyclic pages settle within (longest chain) rounds. The same loop will
 * handle memory runes and feedback later, which is why this is not a
 * one-pass topological evaluation.
 *
 * Assumes the page passed validation, but never throws on bad data;
 * unknown ink endpoints are simply ignored.
 */
export function simulate(
  page: SpellPage,
  inputValues: InputValues,
  options: SimulationOptions = {},
): SimulationResult {
  const maxRounds = options.maxRounds ?? Math.max(32, page.runes.length * 2 + 4);
  const incoming = buildIncoming(page);
  const values: Record<string, boolean> = {};
  for (const rune of page.runes) values[rune.id] = false;

  const rounds: TraceRound[] = [];

  // Round 0: set the input runes.
  const setChanges: RuneChange[] = [];
  for (const rune of page.runes) {
    if (rune.kind !== 'input') continue;
    const next = inputValues[rune.id] === true;
    if (next !== values[rune.id]) {
      setChanges.push({
        runeId: rune.id,
        from: false,
        to: next,
        inputs: [],
        rule: runeSpec('input').describeRule(),
      });
    }
    values[rune.id] = next;
  }
  rounds.push({ index: 0, changes: setChanges, litInk: litInkFor(page, values) });

  let settled = false;
  for (let index = 1; index <= maxRounds; index += 1) {
    const snapshot = { ...values };
    const changes: RuneChange[] = [];

    for (const rune of page.runes) {
      if (rune.kind === 'input') continue;
      const spec = runeSpec(rune.kind);
      const sources = incoming.get(rune.id) ?? [];
      const readings = sources.map((runeId) => ({ runeId, value: snapshot[runeId] === true }));
      const next = spec.evaluate(
        readings.map((reading) => reading.value),
        snapshot[rune.id] === true,
      );
      if (next !== snapshot[rune.id]) {
        values[rune.id] = next;
        changes.push({
          runeId: rune.id,
          from: snapshot[rune.id] === true,
          to: next,
          inputs: readings,
          rule: spec.describeRule(),
        });
      }
    }

    if (changes.length === 0) {
      settled = true;
      break;
    }
    rounds.push({ index, changes, litInk: litInkFor(page, values) });
  }

  return { values, rounds, settled, litInk: litInkFor(page, values) };
}

function litInkFor(page: SpellPage, values: Record<string, boolean>): string[] {
  return page.ink.filter((path) => values[path.from] === true).map((path) => path.id);
}

export interface RuneExplanation {
  runeId: string;
  kind: string;
  value: boolean;
  rule: string;
  inputs: InputReading[];
}

/** Answers "why is this rune currently on or off?" for the explain panel. */
export function explainRune(
  page: SpellPage,
  values: Record<string, boolean>,
  runeId: string,
): RuneExplanation | undefined {
  const rune = page.runes.find((candidate) => candidate.id === runeId);
  if (!rune) return undefined;
  const sources = buildIncoming(page).get(runeId) ?? [];
  return {
    runeId,
    kind: rune.kind,
    value: values[runeId] === true,
    rule: runeSpec(rune.kind).describeRule(),
    inputs: sources.map((id) => ({ runeId: id, value: values[id] === true })),
  };
}

/** Values of every output rune, keyed by rune id, for driving the scene. */
export function outputValues(page: SpellPage, values: Record<string, boolean>): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const rune of page.runes) {
    if (rune.kind === 'output') result[rune.id] = values[rune.id] === true;
  }
  return result;
}
