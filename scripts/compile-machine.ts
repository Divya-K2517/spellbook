/**
 * Compiles every machine in firefly.yaml into a plain JSON transition table the
 * runtime can import. firefly.yaml stays the source of truth; the generated file
 * is never edited by hand and is not committed.
 *
 * Run with: npm run compile:machine
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, validateModel } from './lib/model';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(root, 'src/core/machine/table.generated.json');

const doc = loadModel(resolve(root, 'firefly.yaml'));
const problems = validateModel(doc);
if (problems.length > 0) {
  for (const problem of problems) console.error(`compile-machine: ${problem}`);
  process.exit(1);
}

const machines: Record<string, unknown> = {};
for (const [id, machine] of Object.entries(doc.machines)) {
  machines[id] = {
    initial: machine.initial,
    states: Object.keys(machine.states),
    variables: machine.variables,
    transitions: machine.transitions.map((t) => ({
      from: t.from,
      to: t.to,
      label: t.label,
      requires: t.requires ?? {},
      effects: t.effects ?? {},
    })),
  };
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify({ generatedFrom: 'firefly.yaml', machines }, null, 2)}\n`);
console.log(
  `compile-machine: ${Object.keys(machines).join(', ')} -> ${outPath.replace(`${root}/`, '')}`,
);
