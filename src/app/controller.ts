import {
  DEFAULT_RULES,
  canConnect,
  connectInk,
  createEmptyPage,
  deleteInk,
  deleteRune,
  duplicatePage,
  makeId,
  moveRune,
  placeRune,
  renamePage,
  renameRune,
  setSceneTheme,
  type CircuitRules,
  type RuneKind,
  type SpellPage,
} from '@core/circuit';
import { initialSnapshot, step, type MachineSnapshot } from '@core/machine';
import { deserializePage, serializePage } from '@core/persistence';
import { simulate } from '@core/simulator';
import { validate } from '@core/validator';
import type { AppState, Notice, Selection } from './state';
import type { PageStore } from './storage';

export interface ControllerOptions {
  store: PageStore;
  rules?: CircuitRules;
}

/**
 * The one object the UI talks to.
 *
 * Every user intention is a method here. Each method asks the spell.yaml
 * machine whether the action is allowed right now, and only then changes
 * the page, calls the validator or simulator, or touches storage. The UI
 * never edits a page directly, so the safety properties in spell.yaml
 * (validate before preview, no silent loss of unsaved work, confirmed
 * deletion) hold no matter how the interface is skinned.
 */
export function createController({ store, rules = DEFAULT_RULES }: ControllerOptions) {
  let state: AppState = {
    snapshot: initialSnapshot(),
    page: null,
    library: [],
    libraryLoaded: false,
    inputValues: {},
    validation: null,
    simulation: null,
    selection: null,
    traceRound: 0,
    pendingDeleteId: null,
    discardPromptOpen: false,
    saveError: null,
    notice: null,
  };

  const listeners = new Set<(state: AppState) => void>();
  let noticeSeq = 0;

  function set(patch: Partial<AppState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  function notify(kind: Notice['kind'], code: string, detail?: string): void {
    noticeSeq += 1;
    set({ notice: { seq: noticeSeq, kind, code, ...(detail ? { detail } : {}) } });
  }

  /** Asks the machine for a transition. Returns whether it was taken. */
  function fire(label: string): boolean {
    const outcome = step(state.snapshot, label);
    if (!outcome.ok) {
      notify('refusal', 'action-not-allowed', `${label}: ${outcome.reason}`);
      return false;
    }
    set({ snapshot: outcome.snapshot });
    return true;
  }

  /** Takes the first of several alternative transitions the machine allows. */
  function fireFirst(labels: string[]): boolean {
    for (const label of labels) {
      const outcome = step(state.snapshot, label);
      if (outcome.ok) {
        set({ snapshot: outcome.snapshot });
        return true;
      }
    }
    notify('refusal', 'action-not-allowed', labels.join(' | '));
    return false;
  }

  /**
   * The machine abstracts the library to "none / one / several". When the real
   * stored pages are loaded or changed, bring those two variables back in line.
   */
  function reconcileLibrary(pages: SpellPage[]): MachineSnapshot {
    return {
      ...state.snapshot,
      vars: {
        ...state.snapshot.vars,
        library_has_pages: pages.length > 0 ? 1 : 0,
        library_has_many: pages.length > 1 ? 1 : 0,
      },
    };
  }

  async function refreshLibrary(): Promise<void> {
    try {
      const pages = await store.list();
      set({ library: pages, libraryLoaded: true, snapshot: reconcileLibrary(pages) });
    } catch (error) {
      set({ libraryLoaded: true });
      notify('error', 'library-load-failed', errorText(error));
    }
  }

  function openPageState(page: SpellPage): Partial<AppState> {
    return {
      page,
      inputValues: {},
      validation: null,
      simulation: null,
      selection: null,
      traceRound: 0,
      saveError: null,
      discardPromptOpen: false,
    };
  }

  const closedPageState: Partial<AppState> = {
    page: null,
    validation: null,
    simulation: null,
    selection: null,
    traceRound: 0,
    discardPromptOpen: false,
    saveError: null,
  };

  /** Applies a content edit, but only if the machine allows editing right now. */
  function edit(label: string, change: (page: SpellPage) => SpellPage): boolean {
    const page = state.page;
    if (!page || !fire(label)) return false;
    set({ page: change(page), validation: null, simulation: null });
    return true;
  }

  function runSimulation(page: SpellPage): void {
    set({ simulation: simulate(page, state.inputValues) });
    fire('evaluation-result-ready');
  }

  async function attemptSave(): Promise<void> {
    const page = state.page;
    if (!page) return;
    try {
      await store.put(page);
    } catch (error) {
      set({ saveError: errorText(error) });
      fire('save-failed');
      return;
    }
    set({ saveError: null });
    fireFirst([
      'save-succeeded-existing-page',
      'save-succeeded-additional-page',
      'save-succeeded-first-page',
    ]);
    await refreshLibrary();
  }

  return {
    getState: (): AppState => state,

    subscribe(listener: (state: AppState) => void): () => void {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },

    /** Loads saved pages. Call once at startup. */
    init: refreshLibrary,

    dismissNotice(): void {
      set({ notice: null });
    },

    // ----- Library -----------------------------------------------------

    createNewPage(): void {
      if (!fire('create-new-page')) return;
      set(openPageState(createEmptyPage()));
    },

    async openSavedPage(id: string): Promise<void> {
      let page: SpellPage | undefined;
      try {
        page = await store.get(id);
      } catch (error) {
        notify('error', 'open-failed', errorText(error));
        return;
      }
      if (!page) {
        notify('error', 'page-missing');
        await refreshLibrary();
        return;
      }
      if (!fire('open-saved-page')) return;
      set(openPageState(page));
    },

    async duplicateSavedPage(id: string): Promise<void> {
      const original = await store.get(id);
      if (!original) return notify('error', 'page-missing');
      if (!fire('duplicate-page')) return;
      await store.put(duplicatePage(original));
      await refreshLibrary();
    },

    async renameSavedPage(id: string, title: string): Promise<void> {
      const original = await store.get(id);
      if (!original) return notify('error', 'page-missing');
      if (!fire('rename-page')) return;
      await store.put(renamePage(original, title));
      await refreshLibrary();
    },

    requestDeletePage(id: string): void {
      if (!fire('request-delete-page')) return;
      set({ pendingDeleteId: id });
    },

    cancelDelete(): void {
      if (!fire('cancel-delete')) return;
      set({ pendingDeleteId: null });
    },

    async confirmDeletePage(): Promise<void> {
      const id = state.pendingDeleteId;
      if (!id) return;
      const remaining = state.library.filter((page) => page.id !== id).length;
      try {
        await store.delete(id);
      } catch (error) {
        notify('error', 'delete-failed', errorText(error));
        fire('cancel-delete');
        set({ pendingDeleteId: null });
        return;
      }
      const label =
        remaining === 0
          ? 'confirm-delete-only-page'
          : remaining === 1
            ? 'confirm-delete-leaves-one'
            : 'confirm-delete-leaves-many';
      fire(label);
      set({ pendingDeleteId: null });
      await refreshLibrary();
    },

    /** Adds a page from an exported .spell.json file. Always gets a fresh id. */
    async importPage(text: string): Promise<void> {
      const parsed = deserializePage(text);
      if (!parsed.ok) return notify('error', 'import-failed', parsed.error);
      const now = Date.now();
      await store.put({ ...parsed.page, id: makeId('page'), createdAt: now, updatedAt: now });
      await refreshLibrary();
      notify('info', 'import-succeeded');
    },

    // ----- Leaving the editor ---------------------------------------------

    /** Returns to the library, or asks for confirmation when edits are unsaved. */
    async requestReturnToLibrary(): Promise<void> {
      if (state.snapshot.state !== 'editing') {
        return notify('refusal', 'action-not-allowed', 'return-to-library: wrong-state');
      }
      if ((state.snapshot.vars.dirty ?? 0) > 0) {
        set({ discardPromptOpen: true });
        return;
      }
      if (!fire('return-to-library')) return;
      set(closedPageState);
      await refreshLibrary();
    },

    cancelDiscardPrompt(): void {
      set({ discardPromptOpen: false });
    },

    async confirmDiscardAndReturn(): Promise<void> {
      if (!fire('confirm-discard-and-return')) return;
      set(closedPageState);
      await refreshLibrary();
    },

    // ----- Editing -------------------------------------------------------

    select(selection: Selection | null): void {
      if (selection && !fire('select-rune-or-connection')) return;
      set({ selection });
    },

    /**
     * Picks a rune to explain while previewing or tracing. This is view state only
     * (nothing about the page or workflow changes), so it bypasses the machine.
     */
    inspectRune(runeId: string | null): void {
      const mode = state.snapshot.state;
      if (mode !== 'preview' && mode !== 'tracing') return;
      set({ selection: runeId ? { type: 'rune', id: runeId } : null });
    },

    placeRune(kind: RuneKind, x: number, y: number): string | undefined {
      let created: string | undefined;
      edit('place-rune', (page) => {
        const result = placeRune(page, kind, x, y);
        created = result.rune.id;
        return result.page;
      });
      return created;
    },

    moveRune(runeId: string, x: number, y: number): void {
      edit('move-rune', (page) => moveRune(page, runeId, x, y));
    },

    deleteRune(runeId: string): void {
      if (edit('delete-rune', (page) => deleteRune(page, runeId))) {
        if (state.selection?.type === 'rune' && state.selection.id === runeId) set({ selection: null });
      }
    },

    renameRune(runeId: string, label: string): void {
      edit('edit-scene-or-page-settings', (page) => renameRune(page, runeId, label));
    },

    /** Returns the refusal code if the ink could not be drawn (e.g. "would-cycle"). */
    connectInk(from: string, to: string): string | undefined {
      const page = state.page;
      if (!page) return 'no-page';
      const check = canConnect(page, from, to, rules);
      if (!check.ok) {
        notify('refusal', check.reason);
        return check.reason;
      }
      edit('connect-ink-path', (current) => {
        const result = connectInk(current, from, to, rules);
        return result.page;
      });
      return undefined;
    },

    deleteInk(inkId: string): void {
      if (edit('delete-ink-path', (page) => deleteInk(page, inkId))) {
        if (state.selection?.type === 'ink' && state.selection.id === inkId) set({ selection: null });
      }
    },

    renameCurrentPage(title: string): void {
      edit('edit-scene-or-page-settings', (page) => renamePage(page, title));
    },

    setSceneTheme(themeId: string): void {
      edit('edit-scene-or-page-settings', (page) => setSceneTheme(page, themeId));
    },

    // ----- Validation ----------------------------------------------------

    async requestValidation(): Promise<void> {
      const page = state.page;
      if (!page || !fire('request-validation')) return;
      set({ validation: null, simulation: null });
      // Yield once so the "validating" state is observable before the result arrives.
      await Promise.resolve();
      const result = validate(page, rules);
      set({ validation: result });
      fire(result.ok ? 'validation-succeeded' : 'validation-failed');
    },

    returnToFixErrors(): void {
      fire('return-to-fix-errors');
    },

    // ----- Preview and trace ---------------------------------------------

    runSpell(): void {
      const page = state.page;
      if (!page || !fire('run-spell')) return;
      runSimulation(page);
    },

    toggleSceneInput(runeId: string): void {
      const page = state.page;
      if (!page || !page.runes.some((rune) => rune.id === runeId && rune.kind === 'input')) return;
      if (!fire('toggle-scene-input')) return;
      set({ inputValues: { ...state.inputValues, [runeId]: !(state.inputValues[runeId] === true) } });
      runSimulation(page);
    },

    stopPreview(): void {
      fire('stop-preview');
    },

    explainSpell(): void {
      if (!fire('explain-spell')) return;
      set({ traceRound: 0 });
    },

    /** Moves the trace inspector to a propagation round (clamped to what exists). */
    inspectTraceRound(round: number): void {
      const total = state.simulation?.rounds.length ?? 0;
      if (total === 0 || !fire('inspect-explanation')) return;
      set({ traceRound: Math.min(Math.max(round, 0), total - 1) });
    },

    closeExplanation(): void {
      fire('close-explanation');
    },

    // ----- Saving ----------------------------------------------------------

    async savePage(): Promise<void> {
      if (!state.page || !fire('save-page')) return;
      await attemptSave();
    },

    async retrySave(): Promise<void> {
      if (!fire('retry-save')) return;
      await attemptSave();
    },

    returnToEditorAfterSaveError(): void {
      if (fire('return-to-editor-after-save-error')) set({ saveError: null });
    },

    /** Text of the open page as a .spell.json file, for the UI to offer as a download. */
    exportCurrentPage(): { filename: string; text: string } | undefined {
      const page = state.page;
      if (!page) return undefined;
      const slug = page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'spell';
      return { filename: `${slug}.spell.json`, text: serializePage(page) };
    },
  };
}

export type Controller = ReturnType<typeof createController>;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
