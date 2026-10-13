/**
 * Shared helpers for reading and checking firefly.yaml. Used by the machine
 * compiler and by the model checker so both agree on what a valid model is.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export type Guard = Partial<Record<'gt' | 'lt' | 'gte' | 'lte' | 'eq', number>>;

export interface RawVariable {
  initial: number;
  range: [number, number];
}
export interface RawTransition {
  from: string;
  to: string;
  label: string;
  requires?: Record<string, Guard>;
  effects?: Record<string, number>;
}
export interface RawMachine {
  initial: string;
  states: Record<string, unknown>;
  variables: Record<string, RawVariable>;
  transitions: RawTransition[];
}
export interface RawQuery {
  behavior: { form: string; target: Record<string, number> };
}
export interface RawRequirement {
  statement: string;
  expressed_as: string;
  satisfied_when: 'refuted' | 'reached';
}
export interface ModelDoc {
  machines: Record<string, RawMachine>;
  queries: Record<string, RawQuery>;
  requirements: Record<string, RawRequirement>;
}

const OPERATORS = new Set(['gt', 'lt', 'gte', 'lte', 'eq']);

export function loadModel(path: string): ModelDoc {
  return parse(readFileSync(path, 'utf8')) as ModelDoc;
}

/** Structural checks: every reference resolves and every effect stays in range. */
export function validateModel(doc: ModelDoc): string[] {
  const problems: string[] = [];
  for (const [id, machine] of Object.entries(doc.machines ?? {})) {
    const states = Object.keys(machine.states);
    if (!states.includes(machine.initial)) problems.push(`${id}: initial state "${machine.initial}" is not declared`);
    const seen = new Set<string>();
    for (const t of machine.transitions) {
      if (!states.includes(t.from)) problems.push(`${id}: "${t.label}" has unknown source "${t.from}"`);
      if (!states.includes(t.to)) problems.push(`${id}: "${t.label}" has unknown target "${t.to}"`);
      const key = `${t.from}::${t.label}`;
      if (seen.has(key)) problems.push(`${id}: duplicate "${t.label}" from "${t.from}"`);
      seen.add(key);
      for (const [name, guard] of Object.entries(t.requires ?? {})) {
        if (!(name in machine.variables)) problems.push(`${id}: "${t.label}" requires unknown variable "${name}"`);
        for (const op of Object.keys(guard)) {
          if (!OPERATORS.has(op)) problems.push(`${id}: "${t.label}" uses unsupported operator "${op}"`);
        }
      }
      for (const [name, value] of Object.entries(t.effects ?? {})) {
        const variable = machine.variables[name];
        if (!variable) {
          problems.push(`${id}: "${t.label}" sets unknown variable "${name}"`);
        } else if (value < variable.range[0] || value > variable.range[1]) {
          problems.push(`${id}: "${t.label}" sets "${name}" to ${value}, outside its range`);
        }
      }
    }
  }
  for (const [name, query] of Object.entries(doc.queries ?? {})) {
    for (const key of Object.keys(query.behavior.target)) {
      const [machineId, variable] = key.split('.');
      if (!machineId || !variable || !doc.machines[machineId]?.variables[variable]) {
        problems.push(`query "${name}" targets unknown variable "${key}"`);
      }
    }
  }
  for (const [name, requirement] of Object.entries(doc.requirements ?? {})) {
    if (!doc.queries?.[requirement.expressed_as]) {
      problems.push(`requirement "${name}" uses unknown query "${requirement.expressed_as}"`);
    }
  }
  return problems;
}

function guardPasses(guard: Guard, value: number): boolean {
  if (guard.gt !== undefined && !(value > guard.gt)) return false;
  if (guard.lt !== undefined && !(value < guard.lt)) return false;
  if (guard.gte !== undefined && !(value >= guard.gte)) return false;
  if (guard.lte !== undefined && !(value <= guard.lte)) return false;
  if (guard.eq !== undefined && value !== guard.eq) return false;
  return true;
}

export interface Exploration {
  names: string[];
  /** Every reachable (state, variable-values) configuration. */
  configs: { state: string; values: number[] }[];
  /** Transition labels that are enabled in at least one reachable configuration. */
  fired: Set<string>;
  states: Set<string>;
}

/** Exhaustive breadth-first exploration of one machine from its initial configuration. */
export function explore(machine: RawMachine): Exploration {
  const names = Object.keys(machine.variables);
  const key = (state: string, values: number[]) => `${state}|${values.join(',')}`;
  const start = { state: machine.initial, values: names.map((n) => machine.variables[n]!.initial) };
  const seen = new Map([[key(start.state, start.values), start]]);
  const queue = [start];
  const fired = new Set<string>();
  const states = new Set<string>([machine.initial]);
  for (let head = 0; head < queue.length; head++) {
    const config = queue[head]!;
    const current = Object.fromEntries(names.map((n, i) => [n, config.values[i]!]));
    for (const t of machine.transitions) {
      if (t.from !== config.state) continue;
      const enabled = Object.entries(t.requires ?? {}).every(([n, g]) => guardPasses(g, current[n]!));
      if (!enabled) continue;
      fired.add(t.label);
      const next = { ...current, ...(t.effects ?? {}) };
      const values = names.map((n) => next[n]!);
      const k = key(t.to, values);
      if (!seen.has(k)) {
        const config2 = { state: t.to, values };
        seen.set(k, config2);
        queue.push(config2);
        states.add(t.to);
      }
    }
  }
  return { names, configs: [...seen.values()], fired, states };
}

export function isReachable(
  exploration: Exploration,
  target: Record<string, number>,
): boolean {
  return exploration.configs.some((config) =>
    Object.entries(target).every(([n, v]) => config.values[exploration.names.indexOf(n)] === v),
  );
}
