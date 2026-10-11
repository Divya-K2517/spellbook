import type { MachineSnapshot } from '@core/machine';
import type { SpellPage } from '@core/circuit';
import type { SimulationResult } from '@core/simulator';
import type { ValidationResult } from '@core/validator';

export type Selection = { type: 'rune'; id: string } | { type: 'ink'; id: string };

/**
 * A short message for the UI to phrase however it likes. The app layer only
 * supplies a stable `code`; wording and tone belong to the ui layer.
 */
export interface Notice {
  /** Increments with each notice so the UI can re-trigger animations. */
  seq: number;
  kind: 'refusal' | 'error' | 'info';
  code: string;
  detail?: string;
}

export interface AppState {
  /** Workflow state and variables, straight from the spell.yaml machine. */
  snapshot: MachineSnapshot;
  /** The page open in the editor, if any. */
  page: SpellPage | null;
  /** Saved pages, newest first. */
  library: SpellPage[];
  libraryLoaded: boolean;
  /** Runtime switch positions in preview. Not saved with the page. */
  inputValues: Record<string, boolean>;
  validation: ValidationResult | null;
  simulation: SimulationResult | null;
  selection: Selection | null;
  /** Which propagation round the trace inspector is showing. */
  traceRound: number;
  /** Page id awaiting delete confirmation. */
  pendingDeleteId: string | null;
  /** Whether the "discard unsaved edits?" prompt is showing. */
  discardPromptOpen: boolean;
  saveError: string | null;
  notice: Notice | null;
}
