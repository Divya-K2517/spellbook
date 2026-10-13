import type { AppSession } from '@app';
import type { PersonalityId } from '@core';

export type Tool = 'pond' | 'bush' | 'firefly' | 'personality' | 'erase';

/**
 * Makes the framework-free session reactive. Every change to the session bumps
 * one counter; each getter reads it first, so any component that reads the
 * session through here re-runs when the session changes, and not otherwise.
 * Screens hold only look-and-feel choices of their own (the selected tool, the
 * playback speed); everything about the garden itself stays in the session.
 */
export class Ui {
  #tick = $state(0);

  tool = $state<Tool>('pond');
  rhythm = $state(3);
  personality = $state<PersonalityId>('shy');
  speed = $state(1);
  replayProgress = $state(0);
  confirmDiscard = $state(false);

  constructor(readonly session: AppSession) {
    session.subscribe(() => {
      this.#tick += 1;
    });
  }

  get state() {
    this.#tick;
    return this.session.state;
  }
  get vars() {
    this.#tick;
    return this.session.vars;
  }
  get library() {
    this.#tick;
    return this.session.library;
  }
  get sim() {
    this.#tick;
    return this.session.sim;
  }
  get followed() {
    this.#tick;
    return this.session.followed;
  }
  get notice() {
    this.#tick;
    return this.session.notice;
  }
  get saveError() {
    this.#tick;
    return this.session.saveError;
  }
  get name() {
    this.#tick;
    return this.session.name;
  }
  get pendingDelete() {
    this.#tick;
    return this.session.pendingDelete;
  }
  /** Layer switches, read fresh each time: the simulation object itself never changes identity. */
  get layers() {
    this.#tick;
    return this.session.sim?.settings.layers;
  }
  get vision() {
    this.#tick;
    return this.session.sim?.settings.vision ?? 150;
  }
  /** Garden clock and group counts change every frame, so the screen asks for a refresh a few times a second. */
  get clock() {
    this.#tick;
    const sim = this.session.sim;
    return { time: sim?.time ?? 0, count: sim?.world.count ?? 0, groups: sim?.observed.groups ?? 0 };
  }
  refresh() {
    this.#tick += 1;
  }
  get dirty() {
    return this.vars.dirty === 1;
  }
}
