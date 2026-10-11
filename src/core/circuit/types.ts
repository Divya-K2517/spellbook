/**
 * Core data model for a spell page's circuit.
 *
 * Everything here is plain, serializable data. No classes, no DOM,
 * no framework imports. The UI layer decides how any of this looks.
 */

export type RuneKind = 'input' | 'output' | 'or' | 'and' | 'not';

export interface Rune {
  id: string;
  kind: RuneKind;
  /** Position on the page, in abstract page units (the UI maps these to pixels). */
  x: number;
  y: number;
  /** Optional author-chosen name, e.g. "moonstone". */
  label?: string;
}

/**
 * A directed connection of glowing ink from one rune's output
 * to another rune's input. Fan-in happens at the destination rune,
 * and one rune's output may feed any number of ink paths (fan-out).
 */
export interface InkPath {
  id: string;
  from: string;
  to: string;
}

export interface SpellPage {
  id: string;
  title: string;
  runes: Rune[];
  ink: InkPath[];
  /** Placeholder-friendly scene settings; the UI interprets the theme id. */
  scene: SceneSettings;
  createdAt: number;
  updatedAt: number;
}

export interface SceneSettings {
  themeId: string;
}

/** Runtime values for input runes, keyed by rune id. Not part of the saved page. */
export type InputValues = Readonly<Record<string, boolean>>;
