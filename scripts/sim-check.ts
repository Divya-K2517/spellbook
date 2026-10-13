/**
 * Behavior checks for the simulation core and the application session.
 * Headless: nothing here needs a browser. Run with: npm run sim:check
 *
 * These are not unit tests of every function. Each check states one thing the
 * design promises (synchrony can emerge, ponds separate groups, layers climb a
 * ladder, unsaved work is never silently lost) and tries to catch it failing.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppSession, MemoryGardenStore } from '../src/app';
import {
  DEFAULT_CONFIG,
  LayerLadderError,
  Simulation,
  blinkTable,
  constellation,
  createGardenData,
  describePostcard,
  generateStory,
  readRecord,
  step,
  initialSnapshot,
  table,
  type GardenData,
} from '../src/core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks: { name: string; run: () => void | Promise<void> }[] = [];
const check = (name: string, run: () => void | Promise<void>) => checks.push({ name, run });

function gardenWith(seed: number, layers = { movement: false, social: false }, mutate?: (d: GardenData) => void) {
  const data = createGardenData(seed);
  data.settings.layers = layers;
  mutate?.(data);
  return Simulation.create(data);
}

function run(sim: Simulation, seconds: number) {
  const steps = Math.round(seconds / DEFAULT_CONFIG.stepSeconds);
  for (let i = 0; i < steps; i++) sim.step();
}

/** Fraction of the time synchrony is reported, sampled once a second. */
function syncFraction(sim: Simulation, seconds: number): number {
  let seen = 0;
  for (let s = 0; s < seconds; s++) {
    run(sim, 1);
    if (sim.observed.syncSeen) seen += 1;
  }
  return seen / seconds;
}

// --------------------------------------------------------------- simulation

check('the same seed replays the same garden exactly', () => {
  const a = gardenWith(11, { movement: true, social: true });
  const b = gardenWith(11, { movement: true, social: true });
  run(a, 20);
  run(b, 20);
  assert.deepEqual([...a.world.x.slice(0, 30)], [...b.world.x.slice(0, 30)]);
  assert.deepEqual([...a.world.phase.slice(0, 30)], [...b.world.phase.slice(0, 30)]);
});

check('coupling produces synchrony that an uncoupled garden does not', () => {
  let coupled = 0;
  let uncoupled = 0;
  for (const seed of [1, 2, 3]) {
    const uncoupledCfg = structuredClone(DEFAULT_CONFIG);
    uncoupledCfg.blink.epsilon = 0;
    const withCoupling = Simulation.create(createGardenData(seed), structuredClone(DEFAULT_CONFIG));
    const withoutCoupling = Simulation.create(createGardenData(seed), uncoupledCfg);
    run(withCoupling, 30);
    run(withoutCoupling, 30);
    coupled += syncFraction(withCoupling, 60);
    uncoupled += syncFraction(withoutCoupling, 60);
  }
  assert.ok(coupled / 3 > 0.7, `coupled gardens should report synchrony most of the time, got ${coupled / 3}`);
  assert.ok(uncoupled / 3 < 0.45, `uncoupled gardens should rarely report it, got ${uncoupled / 3}`);
});

check('a firefly ignores nudges while flashing, and flashes only after charging', () => {
  assert.equal(blinkTable.initial, 'charging');
  let snap = initialSnapshot(blinkTable);
  const nudge = step(snap, 'neighbor-flash-nudges-timer', blinkTable);
  assert.ok(nudge.ok);
  snap = step(snap, 'threshold-reached', blinkTable).ok ? (step(snap, 'threshold-reached', blinkTable) as { snapshot: typeof snap }).snapshot : snap;
  assert.equal(snap.state, 'flashing');
  const refused = step(snap, 'neighbor-flash-nudges-timer', blinkTable);
  assert.equal(refused.ok, false);
  const reset = step(snap, 'flash-ends-and-timer-resets', blinkTable);
  assert.ok(reset.ok && reset.snapshot.vars.nudged === 0);

  // The running simulation honors the same rule: no firefly is nudged mid-refractory.
  const sim = gardenWith(5);
  run(sim, 40);
  for (let i = 0; i < sim.world.count; i++) assert.ok(sim.world.phase[i]! >= 0 && sim.world.phase[i]! < 1);
});

check('a pond blocks sight and is never entered; lifting it restores both', () => {
  const sim = gardenWith(3, { movement: true, social: false });
  sim.addPond(500, 320, 120);
  assert.equal(sim.terrain.visible(300, 320, 700, 320), false);
  assert.equal(sim.terrain.visible(300, 100, 700, 100), true);
  run(sim, 60);
  const w = sim.world;
  for (let i = 0; i < w.count; i++) {
    assert.ok(Math.hypot(w.x[i]! - 500, w.y[i]! - 320) >= 119, 'a firefly entered the pond');
  }
  sim.setLifted(true);
  assert.equal(sim.terrain.visible(300, 320, 700, 320), true);
  sim.setLifted(false);
  assert.equal(sim.terrain.visible(300, 320, 700, 320), false);
});

check('fireflies stay inside the garden', () => {
  const sim = gardenWith(9, { movement: true, social: true });
  run(sim, 90);
  for (let i = 0; i < sim.world.count; i++) {
    assert.ok(sim.world.x[i]! >= 0 && sim.world.x[i]! <= sim.width);
    assert.ok(sim.world.y[i]! >= 0 && sim.world.y[i]! <= sim.height);
  }
});

check('bushes gather fireflies', () => {
  const baseline = gardenWith(4, { movement: true, social: false });
  const bushy = gardenWith(4, { movement: true, social: false });
  bushy.addBush(500, 320);
  run(baseline, 120);
  run(bushy, 120);
  const near = (s: Simulation) => {
    let n = 0;
    for (let i = 0; i < s.world.count; i++) if (Math.hypot(s.world.x[i]! - 500, s.world.y[i]! - 320) < 110) n++;
    return n;
  };
  assert.ok(near(bushy) > near(baseline), `bush should draw fireflies in: ${near(bushy)} vs ${near(baseline)}`);
});

check('the layer ladder is enforced by the simulation as well as the model', () => {
  const sim = gardenWith(2);
  assert.throws(() => sim.setLayers({ movement: false, social: true }), LayerLadderError);
  sim.setLayers({ movement: true, social: false });
  sim.setLayers({ movement: true, social: true });
  assert.throws(() => sim.setLayers({ movement: false, social: true }), LayerLadderError);
  assert.throws(() => Simulation.create({ ...createGardenData(1), settings: { vision: 150, layers: { movement: false, social: true } } }), LayerLadderError);
  // A damaged snapshot cannot smuggle the ladder past the loader.
  const record = readRecord({
    id: 'x', name: 'x', createdAt: 1, updatedAt: 1,
    data: { ...createGardenData(1), settings: { vision: 150, layers: { movement: false, social: true } } },
  });
  assert.equal(record?.data.settings.layers.social, false);
});

check('familiarity grows from company, fades after separation, and changes behavior', () => {
  const sim = gardenWith(6, { movement: true, social: true }, (d) => {
    d.fireflies.length = 2;
    d.fireflies[0]!.x = 400; d.fireflies[0]!.y = 300;
    d.fireflies[1]!.x = 440; d.fireflies[1]!.y = 300;
  });
  // Keep the pair in company: left alone they would wander apart.
  for (let i = 0; i < 40 * 60; i++) {
    sim.world.x[0] = 400; sim.world.y[0] = 300;
    sim.world.x[1] = 440; sim.world.y[1] = 300;
    sim.step();
  }
  const grown = sim.familiarityOf(0, 1);
  assert.ok(grown > 0.2, `company should build familiarity, got ${grown}`);

  // Drag them apart and let separation do its work.
  for (let i = 0; i < 60 * 60; i++) {
    sim.world.x[0] = 50; sim.world.y[0] = 60;
    sim.world.x[1] = 950; sim.world.y[1] = 600;
    sim.step();
  }
  assert.ok(sim.familiarityOf(0, 1) < grown, 'separation should fade familiarity');

  // Familiarity changes influence strength, not just a label.
  const familiar = gardenWith(7, { movement: true, social: true }, (d) => { d.fireflies.length = 2; });
  const strangers = gardenWith(7, { movement: true, social: true }, (d) => { d.fireflies.length = 2; });
  familiar.familiarity.set(0 * 100003 + 1, { value: 1, lastContact: 0 });
  assert.equal(familiar.familiarityOf(0, 1), 1);
  assert.equal(strangers.familiarityOf(0, 1), 0);
});

check('a loyal firefly is drawn to familiar company more than a curious one', () => {
  const lean = (personality: 'loyal' | 'curious') => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.movement.wanderTurn = 0; // fixed headings, so only the social pull differs
    cfg.movement.restlessRate = 0;
    const data = createGardenData(8);
    data.settings.layers = { movement: true, social: true };
    data.fireflies.length = 3;
    Object.assign(data.fireflies[0]!, { x: 300, y: 320, personality });
    Object.assign(data.fireflies[1]!, { x: 400, y: 320 }); // familiar, to the right
    Object.assign(data.fireflies[2]!, { x: 300, y: 220 }); // stranger, above
    const sim = Simulation.create(data, cfg);
    sim.world.heading[0] = Math.PI / 2; // facing neither
    sim.familiarity.set(0 * 100003 + 1, { value: 1, lastContact: 1e9 });
    const start = sim.world.x[0]!;
    run(sim, 3);
    return sim.world.x[0]! - start; // positive means it moved toward the familiar neighbor
  };
  const loyal = lean('loyal');
  const curious = lean('curious');
  assert.ok(loyal > curious + 5, `loyal (${loyal.toFixed(1)}) should lean toward the familiar neighbor more than curious (${curious.toFixed(1)})`);
});

check('stories are built only from what the log recorded', () => {
  const sim = gardenWith(12, { movement: true, social: true });
  assert.match(generateStory(sim, 0).join(' '), /only just started/);
  sim.addBush(500, 320);
  run(sim, 90);
  const lines = generateStory(sim, 0);
  assert.ok(lines.length > 0);
  for (const line of lines) assert.ok(!/undefined|NaN/.test(line), line);
  const card = describePostcard(sim);
  assert.ok(card.lines.length >= 2);
  const map = constellation(sim, 0);
  assert.ok(map.nodes.every((n) => n.weight > 0 && n.weight <= 1));
  assert.ok(sim.log.pathOf(0).length > 20, 'paths should be recorded for replay');
});

check('a firefly added with a new rhythm keeps its own period', () => {
  const sim = gardenWith(13);
  const index = sim.addFirefly(5.5, 200, 200);
  assert.equal(index, 30);
  assert.equal(sim.world.period[index], 5.5);
  run(sim, 5);
  assert.equal(sim.exportGarden().fireflies.length, 31);
  assert.equal(sim.exportGarden().fireflies[index]!.period, 5.5);
});

check('the step stays affordable at several hundred fireflies', () => {
  const data = createGardenData(5, 300);
  data.settings.layers = { movement: true, social: true };
  const sim = Simulation.create(data);
  run(sim, 1);
  const t0 = performance.now();
  run(sim, 2);
  const perStep = (performance.now() - t0) / 120;
  assert.ok(perStep < 12, `300 fireflies should step well under a frame, took ${perStep.toFixed(1)} ms`);
});

// ----------------------------------------------------------------- session

check('create, shape, save, leave, reopen, and delete walk the model', async () => {
  const store = new MemoryGardenStore();
  let tick = 1000;
  const session = new AppSession(store, { now: () => (tick += 1000), makeSeed: () => 21 });
  await session.init();
  assert.equal(session.state, 'library');
  assert.equal(session.can('reopen-saved-garden-blink-only'), false);

  assert.ok(session.createGarden());
  assert.equal(session.state, 'shaping');
  assert.equal(session.vars.dirty, 1);
  assert.equal(session.returnToLibrary(), false, 'unsaved work must not be abandoned silently');
  assert.equal(session.state, 'shaping');

  assert.ok(session.drawPond(500, 320, 100));
  assert.equal(session.vars.barrier_present, 1);
  assert.equal(session.setLayer('social', true), false, 'society needs movement first');
  assert.ok(session.setLayer('movement', true));
  assert.ok(session.setLayer('social', true));
  assert.equal(session.setLayer('movement', false), false, 'movement cannot go while society is on');

  assert.ok(await session.save());
  assert.equal(session.state, 'shaping');
  assert.equal(session.vars.dirty, 0);
  assert.equal(session.vars.library_has_gardens, 1);
  assert.ok(session.returnToLibrary());
  await session.idle();
  assert.equal(session.state, 'library');
  assert.equal(session.library.length, 1);

  const id = session.library[0]!.id;
  assert.ok(session.openGarden(id));
  assert.equal(session.state, 'shaping');
  assert.equal(session.vars.dirty, 0);
  assert.equal(session.vars.barrier_present, 1);
  assert.equal(session.vars.social_enabled, 1);
  assert.equal(session.sim?.pondCount, 1);

  // A second garden makes the library hold several.
  assert.ok(session.returnToLibrary());
  await session.idle();
  assert.ok(session.createGarden());
  assert.ok(await session.save());
  assert.equal(session.vars.library_has_many, 1);
  assert.ok(session.returnToLibrary());
  await session.idle();
  assert.equal(session.library.length, 2);

  // Deletion always asks first.
  assert.ok(session.requestDelete(id));
  assert.equal(session.state, 'confirming-delete');
  assert.ok(session.cancelDelete());
  assert.equal(session.library.length, 2);
  assert.ok(session.requestDelete(id));
  assert.ok(await session.confirmDelete());
  assert.equal(session.state, 'library');
  assert.equal(session.library.length, 1);
  assert.equal(session.vars.library_has_many, 0);

  assert.ok(session.requestDelete(session.library[0]!.id));
  assert.ok(await session.confirmDelete());
  assert.equal(session.library.length, 0);
  assert.equal(session.vars.library_has_gardens, 0);
});

check('discarding unsaved work needs the explicit action', async () => {
  const session = new AppSession(new MemoryGardenStore(), { makeSeed: () => 3 });
  await session.init();
  session.createGarden();
  session.placeBush(100, 100);
  assert.equal(session.returnToLibrary(), false);
  assert.ok(session.notice);
  assert.ok(session.discardAndReturn());
  await session.idle();
  assert.equal(session.state, 'library');
  assert.equal(session.library.length, 0);
});

check('a failed save keeps the work and can be retried', async () => {
  const store = new MemoryGardenStore();
  const session = new AppSession(store, { makeSeed: () => 4 });
  await session.init();
  session.createGarden();
  session.placeBush(100, 100);
  store.failWrites = true;
  assert.equal(await session.save(), false);
  assert.equal(session.state, 'save-error');
  assert.equal(session.vars.dirty, 1);
  assert.ok(session.saveError);
  store.failWrites = false;
  assert.ok(await session.retrySave());
  assert.equal(session.state, 'shaping');
  assert.equal(session.vars.dirty, 0);
});

check('watching, following, reading the night, and the temporary pond lift', async () => {
  const session = new AppSession(new MemoryGardenStore(), { makeSeed: () => 5 });
  await session.init();
  session.createGarden();
  session.drawPond(500, 320, 110);
  assert.equal(session.liftBarrier(), false, 'nothing to lift while shaping');
  assert.ok(session.startSimulation());
  assert.equal(session.openStory(), false, 'no story before anything is followed');
  assert.equal(session.openPostcard(), false, 'no postcard before anything is recorded');
  assert.equal(session.pauseToShape() && session.startSimulation(), true);

  session.advance(5);
  assert.equal(session.vars.history_recorded, 1);
  assert.equal(session.openStory(), false, 'still nothing followed');
  assert.ok(session.follow(0));
  assert.ok(session.liftBarrier());
  assert.equal(session.sim?.terrain.lifted, true);
  assert.equal(session.vars.dirty, 1, 'only the earlier pond edit made it dirty');
  assert.ok(session.restoreBarrier());
  assert.ok(session.openStory());
  assert.equal(session.vars.sim_running, 0);
  session.advance(5);
  const before = session.sim!.time;
  session.advance(5);
  assert.equal(session.sim!.time, before, 'the simulation is paused while the story is open');
  assert.ok(session.closeStory());
  assert.ok(session.openPostcard());
  assert.ok(session.closePostcard());
  assert.ok(session.liftBarrier());
  assert.ok(session.pauseToShape());
  assert.equal(session.sim?.terrain.lifted, false, 'pausing puts the pond back');
  assert.equal(session.vars.barrier_open, 0);
});

check('the session can reach every event the model defines', () => {
  const source = readFileSync(join(root, 'src/app/session.ts'), 'utf8');
  for (const t of table.transitions) {
    const used = source.includes(`'${t.label}'`) || source.includes(`\`${t.label}`) || source.includes(`-${t.label.split('-').slice(-2).join('-')}`);
    assert.ok(used || t.label.startsWith('reopen-saved-garden'), `the app never fires "${t.label}"`);
  }
});

check('the core stays pure: no DOM, no framework, no storage', () => {
  const banned = /\b(document|window|localStorage|indexedDB|requestAnimationFrame|from 'svelte)/;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
    });
  for (const file of walk(join(root, 'src/core'))) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!banned.test(code), `${file.replace(root, '')} reaches for the browser or a framework`);
  }
  for (const file of walk(join(root, 'src/app')).filter((f) => !f.includes('indexedDbStore'))) {
    const code = readFileSync(file, 'utf8');
    assert.ok(!/\bdocument\b|\bwindow\b|from 'svelte/.test(code), `${file.replace(root, '')} reaches for the browser`);
  }
});

// ------------------------------------------------------------------- runner

let failed = 0;
for (const { name, run: body } of checks) {
  try {
    await body();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${(error as Error).message.split('\n').join('\n      ')}`);
  }
}
if (failed > 0) {
  console.error(`\nsim:check failed (${failed} of ${checks.length})`);
  process.exit(1);
}
console.log(`\nsim:check ok (${checks.length} checks)`);
