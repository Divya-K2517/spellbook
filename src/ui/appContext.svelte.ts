import { getContext, setContext } from 'svelte';
import { availableEvents } from '@core/machine';
import type { AppState, Controller } from '@app';
import { displayState, type Display } from './display';

/**
 * Bridges the controller into Svelte. The controller is the only way the UI
 * changes anything; `app.state` is a reactive, read-only view of its state.
 */
export interface AppContext {
  readonly controller: Controller;
  readonly state: AppState;
  /** Signal values and glow for the current mode (preview or trace). */
  readonly display: Display;
  /** True if the machine would currently accept this event, e.g. 'save-page'. */
  can(label: string): boolean;
}

const KEY = Symbol('spellbook-app');

export function provideApp(controller: Controller): AppContext {
  let current = $state.raw<AppState>(controller.getState());
  controller.subscribe((next) => {
    current = next;
  });

  const context: AppContext = {
    controller,
    get state() {
      return current;
    },
    get display() {
      return displayState(current);
    },
    can(label: string) {
      return availableEvents(current.snapshot).includes(label);
    },
  };
  setContext(KEY, context);
  return context;
}

export function useApp(): AppContext {
  return getContext<AppContext>(KEY);
}
