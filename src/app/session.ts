import {
  availableEvents,
  createGardenData,
  initialSnapshot,
  step,
  Simulation,
  type GardenRecord,
  type Layers,
  type MachineSnapshot,
  type PersonalityId,
} from '@core';
import type { GardenStore } from './storage';

/**
 * The application, minus any screen. A session owns the workflow machine
 * compiled from firefly.yaml, the garden currently open, and the store of
 * saved gardens. Every user action is one named event in the model: the
 * session asks the machine first and acts only if the machine agrees, so the
 * interface cannot do something the model forbids.
 *
 * It uses no DOM, no timers, and no framework. Tests drive it directly, and
 * any front end (this Svelte one, a different one) is a thin layer over it.
 */

export interface SessionOptions {
  now?: () => number;
  makeSeed?: () => number;
  makeId?: () => string;
}

export type Listener = () => void;

const GARDEN_LABEL_PREFIX = 'reopen-saved-garden';

/** Which of the six reopen events matches a snapshot's layers and terrain. */
export function reopenLabel(layers: Layers, hasBarrier: boolean): string {
  const level = layers.social ? 'with-society' : layers.movement ? 'with-movement' : 'blink-only';
  if (!hasBarrier) return `${GARDEN_LABEL_PREFIX}-${level}`;
  return level === 'blink-only'
    ? `${GARDEN_LABEL_PREFIX}-blink-only-with-barrier`
    : `${GARDEN_LABEL_PREFIX}-${level}-and-barrier`;
}

export class AppSession {
  private machine: MachineSnapshot = initialSnapshot();
  private listeners = new Set<Listener>();
  private records: GardenRecord[] = [];
  private pendingDeleteId: string | undefined;
  private gardenName: string | undefined;
  private sim_: Simulation | undefined;
  private gardenId_: string | undefined;
  private followed_ = -1;
  private notice_: string | undefined;
  private lastSaveError: string | undefined;
  private inflight: Promise<void> = Promise.resolve();
  /** Bumped on every change so a UI layer can cheaply tell when to re-read. */
  version = 0;

  private readonly now: () => number;
  private readonly makeSeed: () => number;
  private readonly makeId: () => string;

  constructor(
    private readonly store: GardenStore,
    options: SessionOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.makeSeed = options.makeSeed ?? (() => (Date.now() ^ Math.floor(Math.random() * 2 ** 32)) >>> 0);
    this.makeId = options.makeId ?? (() => `g-${this.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`);
  }

  // ------------------------------------------------------------------ state

  get state(): string {
    return this.machine.state;
  }
  get vars(): Readonly<Record<string, number>> {
    return this.machine.vars;
  }
  get sim(): Simulation | undefined {
    return this.sim_;
  }
  get library(): readonly GardenRecord[] {
    return this.records;
  }
  get followed(): number {
    return this.followed_;
  }
  get gardenId(): string | undefined {
    return this.gardenId_;
  }
  get pendingDelete(): GardenRecord | undefined {
    return this.records.find((r) => r.id === this.pendingDeleteId);
  }
  get notice(): string | undefined {
    return this.notice_;
  }
  get saveError(): string | undefined {
    return this.lastSaveError;
  }
  get name(): string | undefined {
    return this.gardenName;
  }

  /** Event labels the machine would accept right now. */
  get available(): readonly string[] {
    return availableEvents(this.machine);
  }
  can(label: string): boolean {
    return step(this.machine, label).ok;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clearNotice(): void {
    if (this.notice_ === undefined) return;
    this.notice_ = undefined;
    this.changed();
  }

  private changed(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** Asks the machine. A refusal changes nothing and is reported as a notice. */
  private fire(label: string, refusal?: string): boolean {
    const outcome = step(this.machine, label);
    if (!outcome.ok) {
      if (refusal) this.notice_ = refusal;
      this.changed();
      return false;
    }
    this.machine = outcome.snapshot;
    this.changed();
    return true;
  }

  /**
   * Aligns the two library facts the model tracks with what the store really
   * holds. They describe the outside world, so they are set, not derived from
   * a transition.
   */
  private hydrate(): void {
    this.machine = {
      state: this.machine.state,
      vars: {
        ...this.machine.vars,
        library_has_gardens: this.records.length > 0 ? 1 : 0,
        library_has_many: this.records.length > 1 ? 1 : 0,
      },
    };
  }

  private async refreshLibrary(): Promise<void> {
    try {
      this.records = await this.store.list();
    } catch {
      this.notice_ = 'Saved gardens could not be read from this browser.';
      this.records = [];
    }
    this.hydrate();
    this.changed();
  }

  /** Resolves once any library refresh started by an earlier action has finished. */
  idle(): Promise<void> {
    return this.inflight;
  }

  async init(): Promise<void> {
    await this.refreshLibrary();
  }

  // ------------------------------------------------------- garden lifecycle

  createGarden(): boolean {
    if (!this.fire('create-new-garden')) return false;
    this.attach(Simulation.create(createGardenData(this.makeSeed())), undefined, undefined);
    return true;
  }

  openGarden(id: string): boolean {
    const record = this.records.find((r) => r.id === id);
    if (!record) return false;
    const label = reopenLabel(record.data.settings.layers, record.data.terrain.ponds.length > 0);
    if (!this.fire(label)) return false;
    this.attach(Simulation.create(record.data), id, record.name);
    return true;
  }

  /** Leaves for the library. Refused while there are unsaved changes. */
  returnToLibrary(): boolean {
    if (!this.fire('return-to-library', 'Save or discard your changes before leaving this garden.')) return false;
    this.detach();
    return true;
  }

  /** The explicit, confirmed way out with unsaved changes. */
  discardAndReturn(): boolean {
    if (!this.fire('confirm-discard-and-return')) return false;
    this.detach();
    return true;
  }

  requestDelete(id: string): boolean {
    if (!this.records.some((r) => r.id === id)) return false;
    if (!this.fire('request-delete-garden')) return false;
    this.pendingDeleteId = id;
    this.changed();
    return true;
  }

  cancelDelete(): boolean {
    if (!this.fire('cancel-delete')) return false;
    this.pendingDeleteId = undefined;
    this.changed();
    return true;
  }

  async confirmDelete(): Promise<boolean> {
    const id = this.pendingDeleteId;
    if (!id || this.machine.state !== 'confirming-delete') return false;
    try {
      await this.store.delete(id);
    } catch {
      this.notice_ = 'That garden could not be deleted.';
      this.cancelDelete();
      return false;
    }
    // Pick the event from what is left, and fire it while the model still holds
    // the library facts from before the deletion; then bring those facts up to date.
    const remaining = this.records.length - 1;
    const label =
      remaining <= 0
        ? 'confirm-delete-last-garden'
        : remaining === 1
          ? 'confirm-delete-leaving-one'
          : 'confirm-delete-leaving-several';
    const ok = this.fire(label);
    this.pendingDeleteId = undefined;
    await this.refreshLibrary();
    return ok;
  }

  private attach(sim: Simulation, id: string | undefined, name: string | undefined): void {
    this.sim_ = sim;
    this.gardenId_ = id;
    this.gardenName = name;
    this.followed_ = -1;
    this.lastSaveError = undefined;
    sim.onSyncChange = (seen) => {
      this.fire(seen ? 'synchrony-observed' : 'synchrony-lost');
    };
    this.changed();
  }

  private detach(): void {
    this.sim_ = undefined;
    this.gardenId_ = undefined;
    this.gardenName = undefined;
    this.followed_ = -1;
    this.inflight = this.refreshLibrary();
  }

  // ----------------------------------------------------- shaping the world

  drawPond(x: number, y: number, r: number): boolean {
    const sim = this.sim_;
    if (!sim || !this.fire('draw-pond')) return false;
    sim.addPond(x, y, r);
    return true;
  }

  erasePondAt(x: number, y: number): boolean {
    const sim = this.sim_;
    if (!sim || !sim.terrain.pondAt(x, y)) return false;
    const label = sim.pondCount > 1 ? 'erase-pond-leaving-some' : 'erase-last-pond';
    if (!this.fire(label)) return false;
    sim.erasePondAt(x, y);
    return true;
  }

  placeBush(x: number, y: number): boolean {
    const sim = this.sim_;
    if (!sim || !this.fire('place-bush')) return false;
    sim.addBush(x, y);
    return true;
  }

  removeBushAt(x: number, y: number): boolean {
    const sim = this.sim_;
    if (!sim || !sim.terrain.nearestBush(x, y, 22)) return false;
    if (!this.fire('remove-bush')) return false;
    sim.removeBushAt(x, y);
    return true;
  }

  addFirefly(period: number, x?: number, y?: number): boolean {
    const sim = this.sim_;
    if (!sim || !this.fire('add-firefly-with-new-rhythm')) return false;
    sim.addFirefly(period, x, y);
    return true;
  }

  assignPersonality(index: number, personality: PersonalityId): boolean {
    const sim = this.sim_;
    if (!sim || index < 0 || index >= sim.world.count) return false;
    if (!this.fire('assign-personality')) return false;
    sim.setPersonality(index, personality);
    return true;
  }

  /** The vision slider works while shaping and, live, while watching. */
  setVision(vision: number): boolean {
    const sim = this.sim_;
    if (!sim) return false;
    const label = this.machine.state === 'observing' ? 'adjust-vision-range-live' : 'adjust-vision-range';
    if (!this.fire(label)) return false;
    sim.setVision(vision);
    return true;
  }

  setLayer(layer: keyof Layers, on: boolean): boolean {
    const sim = this.sim_;
    if (!sim) return false;
    const label =
      layer === 'movement'
        ? on ? 'enable-movement-layer' : 'disable-movement-layer'
        : on ? 'enable-social-layer' : 'disable-social-layer';
    const refusal =
      layer === 'movement' && !on
        ? 'Turn society off before turning movement off: familiarity needs neighbors to change.'
        : layer === 'social' && on
          ? 'Turn movement on first: familiarity grows from encounters.'
          : undefined;
    if (!this.fire(label, refusal)) return false;
    sim.setLayers({ ...sim.settings.layers, [layer]: on });
    return true;
  }

  // ------------------------------------------------------ running the garden

  startSimulation(): boolean {
    return this.fire('start-simulation');
  }

  pauseToShape(): boolean {
    const sim = this.sim_;
    if (!this.fire('pause-to-shape')) return false;
    // The model puts a lifted pond back before any terrain edit; so does the world.
    sim?.setLifted(false);
    this.followed_ = -1;
    this.changed();
    return true;
  }

  /** Drives the simulation by `seconds`. Does nothing unless the garden is being watched. */
  advance(seconds: number): void {
    const sim = this.sim_;
    if (!sim || this.machine.state !== 'observing') return;
    sim.advance(seconds);
    if (sim.log.recorded && this.machine.vars.history_recorded === 0) this.fire('events-recorded');
  }

  follow(index: number): boolean {
    const sim = this.sim_;
    if (!sim || index < 0 || index >= sim.world.count) return false;
    if (!this.fire('follow-firefly')) return false;
    this.followed_ = index;
    this.changed();
    return true;
  }

  unfollow(): boolean {
    if (!this.fire('unfollow-firefly')) return false;
    this.followed_ = -1;
    this.changed();
    return true;
  }

  liftBarrier(): boolean {
    if (!this.fire('lift-barrier')) return false;
    this.sim_?.setLifted(true);
    return true;
  }

  restoreBarrier(): boolean {
    if (!this.fire('restore-barrier')) return false;
    this.sim_?.setLifted(false);
    return true;
  }

  // ------------------------------------------------------- reading the night

  openStory(): boolean {
    return this.fire('open-story', 'Follow a firefly and let the garden run for a moment first.');
  }
  closeStory(): boolean {
    return this.fire('close-story');
  }
  openPathReplay(): boolean {
    return this.fire('open-path-replay', 'Follow a firefly and let the garden run for a moment first.');
  }
  closePathReplay(): boolean {
    return this.fire('close-path-replay');
  }
  openPostcard(): boolean {
    return this.fire('open-postcard', 'Let the garden run for a moment before asking for a postcard.');
  }
  closePostcard(): boolean {
    return this.fire('close-postcard');
  }

  // ------------------------------------------------------------------- saving

  async save(): Promise<boolean> {
    if (!this.sim_ || !this.fire('save-garden')) return false;
    return this.persist();
  }

  async retrySave(): Promise<boolean> {
    if (!this.fire('retry-save')) return false;
    return this.persist();
  }

  returnToShapingAfterSaveError(): boolean {
    return this.fire('return-to-shaping-after-save-error');
  }

  private async persist(): Promise<boolean> {
    const sim = this.sim_;
    if (!sim) return false;
    const existing = this.records.find((r) => r.id === this.gardenId_);
    const stamp = this.now();
    const record: GardenRecord = {
      id: this.gardenId_ ?? this.makeId(),
      name: this.gardenName ?? this.defaultName(stamp),
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
      data: sim.exportGarden(),
    };
    try {
      await this.store.put(record);
    } catch (error) {
      this.lastSaveError = error instanceof Error ? error.message : 'unknown error';
      this.fire('save-failed');
      return false;
    }
    this.lastSaveError = undefined;
    this.gardenId_ = record.id;
    this.gardenName = record.name;
    // The three success events differ only in what the library held before.
    const ok =
      this.fire('save-succeeded-existing-garden') ||
      this.fire('save-succeeded-first-garden') ||
      this.fire('save-succeeded-additional-garden');
    await this.refreshLibrary();
    return ok;
  }

  private defaultName(stamp: number): string {
    const date = new Date(stamp);
    const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `Garden of ${day}, ${time}`;
  }
}
