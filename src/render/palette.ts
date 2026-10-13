/** Colors for a night garden. Everything the renderer draws is named here. */

export const COLORS = {
  skyTop: '#07111c',
  skyBottom: '#0d1f1a',
  grass: 'rgba(40, 90, 60, 0.10)',
  frame: 'rgba(160, 220, 190, 0.16)',
  pondCore: 'rgba(24, 58, 96, 0.92)',
  pondEdge: 'rgba(60, 120, 170, 0.55)',
  pondRipple: 'rgba(150, 200, 235, 0.25)',
  bushDark: '#12301f',
  bushLight: '#1c4a2d',
  label: '#e8f5e0',
  labelDim: 'rgba(232, 245, 224, 0.62)',
  ring: 'rgba(255, 255, 255, 0.85)',
  ringTrack: 'rgba(255, 255, 255, 0.18)',
  vision: 'rgba(255, 255, 255, 0.28)',
  /** A firefly in no synchronized group. */
  loner: '#e7d98a',
} as const;

/** One color per independently synchronized group, cycling past eight. */
export const GROUP_COLORS = [
  '#d9ff6a',
  '#6affd9',
  '#ff9ad9',
  '#ffcb6a',
  '#9aa8ff',
  '#ff7a6a',
  '#7aff8f',
  '#e19aff',
] as const;

export const groupColor = (group: number): string =>
  group < 0 ? COLORS.loner : GROUP_COLORS[group % GROUP_COLORS.length]!;
