import { createNameSupply } from '../garden/names';
import { DEFAULT_VISION, MAX_VISION, MIN_VISION } from '../garden/defaults';
import type { Bush, GardenData, Layers, PersonalityId, Pond } from '../garden/types';
import { createRng, type Rng } from '../math/rng';
import { clamp } from '../math/vec';
import { DEFAULT_CONFIG, type PersonalityRule, PERSONALITY_RULES, type SimConfig } from './config';
import { SpatialGrid } from './grid';
import { assertLadder, LAYER_ORDER, LAYERS } from './layers';
import { EventLog, type EditKind } from './log';
import { ORDER, type Familiarity, type Hooks, type StepContext, type System } from './system';
import { blinkSystem } from './systems/blink';
import { observerSystem, type ObserverOutput } from './systems/observer';
import { recorderSystem } from './systems/recorder';
import { Terrain } from './terrain';
import { createWorld, personalityIndex, personalityOf, reserveFirefly, type World } from './world';

/** What erasing a pond left behind: the model needs to know whether any pond remains. */
export type PondErase = 'none' | 'some' | 'last';

/**
 * One garden, alive. Owns the fireflies, the terrain, the layers, and the
 * night's log. Pure: no DOM, no timers, no storage. Anything that draws or
 * saves reads from it through the methods below.
 *
 * All edits go through this class so the saved description (`exportGarden`)
 * and the running world can never disagree.
 */
export class Simulation {
  readonly cfg: SimConfig;
  readonly world: World = createWorld();
  readonly terrain = new Terrain();
  readonly grid: SpatialGrid;
  readonly log: EventLog;
  readonly familiarity = new Map<number, Familiarity>();
  readonly observed: ObserverOutput = { groups: 0, largest: 0, syncSeen: false };
  readonly settings: { vision: number; layers: Layers };
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  time = 0;

  /** Called when synchrony is gained or lost, after the observer's hold time. */
  onSyncChange: ((syncSeen: boolean) => void) | undefined;
  /** Called once, the first time anything is recorded this night. */
  onFirstRecord: (() => void) | undefined;

  private readonly rng: Rng;
  private readonly hooks: Hooks = { coupling: () => 1, rule: () => PERSONALITY_RULES.none, steering: [] };
  private systems: System[] = [];
  private readonly ctx: StepContext;
  private carry = 0;
  private announcedRecord = false;
  private readonly names;

  private constructor(data: GardenData, cfg: SimConfig) {
    this.cfg = cfg;
    this.seed = data.seed;
    this.width = data.width;
    this.height = data.height;
    this.rng = createRng(data.seed ^ 0x9e3779b9);
    this.settings = { vision: data.settings.vision, layers: { ...data.settings.layers } };
    assertLadder(this.settings.layers);
    this.grid = new SpatialGrid(data.width, data.height);
    this.log = new EventLog(cfg.recorder.maxEvents, cfg.recorder.pathCapacity);

    this.terrain.ponds = data.terrain.ponds.map((p) => ({ ...p }));
    this.terrain.bushes = data.terrain.bushes.map((b) => ({ ...b }));
    this.terrain.nextId = data.terrain.nextId;

    for (const f of data.fireflies) {
      const i = reserveFirefly(this.world);
      this.world.x[i] = f.x;
      this.world.y[i] = f.y;
      this.world.phase[i] = f.phase;
      this.world.period[i] = f.period;
      this.world.personality[i] = personalityIndex(f.personality);
      this.world.heading[i] = this.rng.range(0, Math.PI * 2);
      this.world.names.push(f.name);
    }
    this.names = createNameSupply(createRng(data.seed + 7), this.world.names);

    this.ctx = {
      world: this.world,
      grid: this.grid,
      terrain: this.terrain,
      settings: this.settings,
      cfg,
      rng: this.rng,
      log: this.log,
      hooks: this.hooks,
      familiarity: this.familiarity,
      time: 0,
      dt: cfg.stepSeconds,
      flashes: [],
    };
    this.log.ensure(this.world.count);
    this.rebuildSystems();
    this.rebuildGrid();
  }

  static create(data: GardenData, cfg: SimConfig = DEFAULT_CONFIG): Simulation {
    return new Simulation(data, cfg);
  }

  // ---------------------------------------------------------------- stepping

  /** Advances by `seconds` of garden time in whole fixed steps. Returns steps taken. */
  advance(seconds: number, maxSteps = 20): number {
    this.carry += seconds;
    let steps = 0;
    while (this.carry >= this.cfg.stepSeconds && steps < maxSteps) {
      this.step();
      this.carry -= this.cfg.stepSeconds;
      steps += 1;
    }
    // Falling behind: drop the backlog rather than spiral.
    if (steps === maxSteps) this.carry = 0;
    return steps;
  }

  step(): void {
    const ctx = this.ctx;
    ctx.dt = this.cfg.stepSeconds;
    ctx.time = this.time + ctx.dt;
    ctx.flashes.length = 0;
    for (const system of this.systems) system.update(ctx);
    this.time = ctx.time;
    if (!this.announcedRecord && this.log.recorded) {
      this.announcedRecord = true;
      this.onFirstRecord?.();
    }
  }

  private rebuildSystems(): void {
    const hooks = this.hooks;
    hooks.coupling = () => 1;
    hooks.rule = () => PERSONALITY_RULES.none;
    hooks.steering.length = 0;

    const systems: System[] = [
      { id: 'grid', order: ORDER.grid, update: () => this.rebuildGrid() },
      blinkSystem(),
      observerSystem(this.observed, (seen) => this.onSyncChange?.(seen)),
      recorderSystem(),
    ];
    for (const id of LAYER_ORDER) {
      if (!this.settings.layers[id]) continue;
      const layer = LAYERS[id];
      systems.push(...layer.systems());
      layer.install?.({
        hooks,
        world: this.world,
        familiarity: this.familiarity,
        cfg: this.cfg,
        settings: this.settings,
        terrain: this.terrain,
        grid: this.grid,
      });
    }
    this.systems = systems.sort((a, b) => a.order - b.order);
  }

  private rebuildGrid(): void {
    const { recorder, social, movement } = this.cfg;
    const cell = Math.max(
      this.settings.vision,
      recorder.meetExit,
      social.encounterRadius,
      movement.separationDistance,
    );
    this.grid.rebuild(this.world, cell);
  }

  // ------------------------------------------------------------------- edits

  private note(what: EditKind, x?: number, y?: number): void {
    this.log.push(x === undefined ? { t: this.time, kind: 'edit', what } : { t: this.time, kind: 'edit', what, x, y });
  }

  addPond(x: number, y: number, r: number): Pond {
    const pond: Pond = { id: this.terrain.nextId++, x, y, r: clamp(r, 20, 260) };
    this.terrain.ponds.push(pond);
    this.pushOutOfPond(pond);
    this.rebuildGrid();
    this.note('pond-added', x, y);
    return pond;
  }

  /** Erases the pond under (x, y). Says whether any pond remains. */
  erasePondAt(x: number, y: number): PondErase {
    const pond = this.terrain.pondAt(x, y);
    if (!pond) return 'none';
    this.terrain.ponds = this.terrain.ponds.filter((p) => p.id !== pond.id);
    this.note('pond-erased', pond.x, pond.y);
    return this.terrain.ponds.length > 0 ? 'some' : 'last';
  }

  addBush(x: number, y: number): Bush {
    const bush: Bush = { id: this.terrain.nextId++, x, y };
    this.terrain.bushes.push(bush);
    this.note('bush-added', x, y);
    return bush;
  }

  removeBushAt(x: number, y: number, reach = 22): boolean {
    const near = this.terrain.nearestBush(x, y, reach);
    if (!near) return false;
    this.terrain.bushes = this.terrain.bushes.filter((b) => b.id !== near.bush.id);
    this.note('bush-removed', near.bush.x, near.bush.y);
    return true;
  }

  /** Adds a firefly with its own rhythm. Returns its index. */
  addFirefly(period: number, x?: number, y?: number): number {
    const i = reserveFirefly(this.world);
    const w = this.world;
    w.x[i] = clamp(x ?? this.rng.range(80, this.width - 80), 10, this.width - 10);
    w.y[i] = clamp(y ?? this.rng.range(80, this.height - 80), 10, this.height - 10);
    w.vx[i] = 0;
    w.vy[i] = 0;
    w.period[i] = clamp(period, 1, 8);
    w.phase[i] = this.rng.next();
    w.glow[i] = 0;
    w.refractory[i] = 0;
    w.heading[i] = this.rng.range(0, Math.PI * 2);
    w.personality[i] = 0;
    w.names.push(this.names.next());
    this.log.ensure(w.count);
    this.rebuildGrid();
    this.note('firefly-added', w.x[i], w.y[i]);
    return i;
  }

  setPersonality(index: number, personality: PersonalityId): void {
    this.world.personality[index] = personalityIndex(personality);
    this.note('personality-changed');
  }

  setVision(vision: number): void {
    this.settings.vision = clamp(vision, MIN_VISION, MAX_VISION);
    this.rebuildGrid();
    this.note('vision-changed');
  }

  /** Switches layers. Throws if a layer would be on without one it requires. */
  setLayers(layers: Layers): void {
    assertLadder(layers);
    this.settings.layers = { ...layers };
    this.rebuildSystems();
    this.note('layers-changed');
  }

  /** Temporarily lifts or restores ponds. A view of the garden, never saved. */
  setLifted(lifted: boolean): void {
    if (this.terrain.lifted === lifted) return;
    this.terrain.lifted = lifted;
    this.note(lifted ? 'barrier-lifted' : 'barrier-restored');
  }

  private pushOutOfPond(pond: Pond): void {
    const w = this.world;
    for (let i = 0; i < w.count; i++) {
      const dx = w.x[i]! - pond.x;
      const dy = w.y[i]! - pond.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < pond.r) {
        w.x[i] = pond.x + (dx / d) * (pond.r + 4);
        w.y[i] = pond.y + (dy / d) * (pond.r + 4);
      }
    }
  }

  // ----------------------------------------------------------------- queries

  /** Index of the firefly nearest (x, y) within `maxDistance`, or -1. */
  pick(x: number, y: number, maxDistance: number): number {
    const w = this.world;
    let best = -1;
    let bestSq = maxDistance * maxDistance;
    for (let i = 0; i < w.count; i++) {
      const d2 = (w.x[i]! - x) ** 2 + (w.y[i]! - y) ** 2;
      if (d2 <= bestSq) {
        bestSq = d2;
        best = i;
      }
    }
    return best;
  }

  familiarityOf(a: number, b: number): number {
    const key = a < b ? a * 100003 + b : b * 100003 + a;
    return this.familiarity.get(key)?.value ?? 0;
  }

  ruleOf(index: number): PersonalityRule {
    return PERSONALITY_RULES[personalityOf(this.world.personality[index]!)];
  }

  get pondCount(): number {
    return this.terrain.ponds.length;
  }

  /** The garden as a saved snapshot: layout, population, and settings. Not the night's history. */
  exportGarden(): GardenData {
    const w = this.world;
    return {
      schemaVersion: 1,
      seed: this.seed,
      width: this.width,
      height: this.height,
      settings: { vision: this.settings.vision || DEFAULT_VISION, layers: { ...this.settings.layers } },
      terrain: {
        ponds: this.terrain.ponds.map((p) => ({ ...p })),
        bushes: this.terrain.bushes.map((b) => ({ ...b })),
        nextId: this.terrain.nextId,
      },
      fireflies: Array.from({ length: w.count }, (_, i) => ({
        name: w.names[i]!,
        x: w.x[i]!,
        y: w.y[i]!,
        period: w.period[i]!,
        phase: w.phase[i]!,
        personality: personalityOf(w.personality[i]!),
      })),
    };
  }
}
