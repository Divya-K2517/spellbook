/**
 * Model-checks firefly.yaml: explores every reachable configuration of each
 * machine, answers each reachability query, and confirms every requirement.
 * Also reports dead states and transitions that can never be enabled.
 *
 * Run with: npm run model:check
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explore, isReachable, loadModel, validateModel } from './lib/model';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const doc = loadModel(resolve(root, 'firefly.yaml'));
const failures: string[] = validateModel(doc);

const explorations = new Map<string, ReturnType<typeof explore>>();
for (const [id, machine] of Object.entries(doc.machines)) {
  const exploration = explore(machine);
  explorations.set(id, exploration);
  console.log(`${id}: ${exploration.configs.length} reachable configurations`);
  for (const state of Object.keys(machine.states)) {
    if (!exploration.states.has(state)) failures.push(`${id}: state "${state}" is unreachable`);
  }
  for (const t of machine.transitions) {
    if (!exploration.fired.has(t.label)) failures.push(`${id}: transition "${t.label}" is never enabled`);
  }
}

const reached = new Map<string, boolean>();
for (const [name, query] of Object.entries(doc.queries)) {
  const targets = Object.keys(query.behavior.target);
  const machineId = targets[0]!.split('.')[0]!;
  const exploration = explorations.get(machineId)!;
  const local = Object.fromEntries(
    Object.entries(query.behavior.target).map(([k, v]) => [k.split('.')[1]!, v]),
  );
  reached.set(name, isReachable(exploration, local));
}

for (const [name, requirement] of Object.entries(doc.requirements)) {
  const isReached = reached.get(requirement.expressed_as) ?? false;
  const satisfied = requirement.satisfied_when === 'refuted' ? !isReached : isReached;
  console.log(`${satisfied ? 'PASS' : 'FAIL'}  ${name}`);
  if (!satisfied) failures.push(`requirement "${name}" is not satisfied`);
}

if (failures.length > 0) {
  console.error('\nmodel:check failed');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('model:check ok');
