/**
 * Scene themes map the circuit's inputs and outputs to visuals.
 *
 * The logic layer only knows that "output rune 3 is true". A theme decides
 * whether that means a lantern lights, a portal opens, or a fountain runs.
 * Real art can be added later as another theme with the same shape; for now
 * everything is drawn with plain shapes.
 */
export interface SceneTheme {
  id: string;
  name: string;
  /** Words for a switch or result in each state, for the placeholder scene. */
  input: { off: string; on: string };
  output: { off: string; on: string };
}

export const placeholderTheme: SceneTheme = {
  id: 'placeholder',
  name: 'Blank page',
  input: { off: 'dormant', on: 'awake' },
  output: { off: 'closed', on: 'open' },
};

const themes: Record<string, SceneTheme> = {
  [placeholderTheme.id]: placeholderTheme,
};

export function getTheme(id: string): SceneTheme {
  return themes[id] ?? placeholderTheme;
}
