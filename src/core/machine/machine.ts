import rawTable from './table.generated.json';

/**
 * Runtime for the application-workflow machine compiled from spell.yaml.
 * Pure functions over plain data: no timers, no storage, no DOM.
 */

type GuardOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
type Guard = Partial<Record<GuardOperator, number>>;

export interface TransitionDef {
  from: string;
  to: string;
  label: string;
  requires: Record<string, Guard>;
  effects: Record<string, number>;
}

export interface MachineTable {
  initial: string;
  states: string[];
  variables: Record<string, { initial: number; range: [number, number] }>;
  transitions: TransitionDef[];
}

export interface MachineSnapshot {
  state: string;
  vars: Readonly<Record<string, number>>;
}

export type TransitionOutcome =
  | { ok: true; snapshot: MachineSnapshot; transition: TransitionDef }
  | { ok: false; reason: 'unknown-event' | 'wrong-state' | 'guard-failed' };

export const table = rawTable as unknown as MachineTable;

export function initialSnapshot(machine: MachineTable = table): MachineSnapshot {
  const vars: Record<string, number> = {};
  for (const [name, variable] of Object.entries(machine.variables)) vars[name] = variable.initial;
  return { state: machine.initial, vars };
}

function guardPasses(guard: Guard, value: number): boolean {
  if (guard.gt !== undefined && !(value > guard.gt)) return false;
  if (guard.lt !== undefined && !(value < guard.lt)) return false;
  if (guard.gte !== undefined && !(value >= guard.gte)) return false;
  if (guard.lte !== undefined && !(value <= guard.lte)) return false;
  if (guard.eq !== undefined && value !== guard.eq) return false;
  return true;
}

function isEnabled(transition: TransitionDef, snapshot: MachineSnapshot): boolean {
  return Object.entries(transition.requires).every(([name, guard]) =>
    guardPasses(guard, snapshot.vars[name] ?? 0),
  );
}

/**
 * Attempts the event named `label` from the current snapshot. Returns the next
 * snapshot, or the reason the machine refused. A refusal is information, not
 * an error: the UI uses it to keep disabled actions disabled.
 */
export function step(
  snapshot: MachineSnapshot,
  label: string,
  machine: MachineTable = table,
): TransitionOutcome {
  const named = machine.transitions.filter((transition) => transition.label === label);
  if (named.length === 0) return { ok: false, reason: 'unknown-event' };

  const fromHere = named.filter((transition) => transition.from === snapshot.state);
  if (fromHere.length === 0) return { ok: false, reason: 'wrong-state' };

  const transition = fromHere.find((candidate) => isEnabled(candidate, snapshot));
  if (!transition) return { ok: false, reason: 'guard-failed' };

  return {
    ok: true,
    transition,
    snapshot: { state: transition.to, vars: { ...snapshot.vars, ...transition.effects } },
  };
}

/** Event labels that would currently succeed, e.g. to enable or disable buttons. */
export function availableEvents(snapshot: MachineSnapshot, machine: MachineTable = table): string[] {
  const labels = new Set<string>();
  for (const transition of machine.transitions) {
    if (transition.from === snapshot.state && isEnabled(transition, snapshot)) {
      labels.add(transition.label);
    }
  }
  return [...labels];
}
