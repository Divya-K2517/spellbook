/**
 * Compiles the application-workflow machine in spell.yaml into a plain JSON
 * transition table the runtime can import. spell.yaml stays the source of
 * truth; the generated file is never edited by hand.
 *
 * Run with: npm run compile:machine
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = resolve(root, 'spell.yaml');
const outPath = resolve(root, 'src/core/machine/table.generated.json');

const MACHINE_ID = 'application-workflow';
const GUARD_OPERATORS = new Set(['gt', 'lt', 'gte', 'lte', 'eq']);

interface RawVariable {
  initial: number;
  range: [number, number];
}
interface RawTransition {
  from: string;
  to: string;
  label: string;
  requires?: Record<string, Record<string, number>>;
  effects?: Record<string, number>;
}

function fail(message: string): never {
  console.error(`compile-machine: ${message}`);
  process.exit(1);
}

const doc = parse(readFileSync(specPath, 'utf8')) as {
  machines?: Record<
    string,
    {
      initial: string;
      states: Record<string, unknown>;
      variables: Record<string, RawVariable>;
      transitions: RawTransition[];
    }
  >;
};

const machine = doc.machines?.[MACHINE_ID];
if (!machine) fail(`machine "${MACHINE_ID}" not found in spell.yaml`);

const states = Object.keys(machine.states);
const variables = machine.variables;

if (!states.includes(machine.initial)) fail(`initial state "${machine.initial}" is not a declared state`);

const seenLabels = new Map<string, string>();
for (const t of machine.transitions) {
  if (!states.includes(t.from)) fail(`transition "${t.label}" has unknown source state "${t.from}"`);
  if (!states.includes(t.to)) fail(`transition "${t.label}" has unknown target state "${t.to}"`);
  for (const [name, guard] of Object.entries(t.requires ?? {})) {
    if (!(name in variables)) fail(`transition "${t.label}" requires unknown variable "${name}"`);
    for (const op of Object.keys(guard)) {
      if (!GUARD_OPERATORS.has(op)) fail(`transition "${t.label}" uses unsupported guard operator "${op}"`);
    }
  }
  for (const [name, value] of Object.entries(t.effects ?? {})) {
    const variable = variables[name];
    if (!variable) fail(`transition "${t.label}" sets unknown variable "${name}"`);
    if (value < variable.range[0] || value > variable.range[1]) {
      fail(`transition "${t.label}" sets "${name}" to ${value}, outside its range`);
    }
  }
  // The same label may appear on several transitions only if their source states differ.
  const key = `${t.from}::${t.label}`;
  if (seenLabels.has(key)) fail(`duplicate transition "${t.label}" from state "${t.from}"`);
  seenLabels.set(key, t.to);
}

const table = {
  generatedFrom: 'spell.yaml',
  machine: MACHINE_ID,
  initial: machine.initial,
  states,
  variables,
  transitions: machine.transitions.map((t) => ({
    from: t.from,
    to: t.to,
    label: t.label,
    requires: t.requires ?? {},
    effects: t.effects ?? {},
  })),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(table, null, 2)}\n`);
console.log(
  `compile-machine: ${states.length} states, ${machine.transitions.length} transitions -> ${outPath.replace(`${root}/`, '')}`,
);
