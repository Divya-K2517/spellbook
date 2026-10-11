import type { Rune } from '@core/circuit';

/** The editor canvas is a fixed coordinate space that scales to fit its container. */
export const CANVAS = { width: 800, height: 560 };

/** Rune body size in canvas units. */
export const RUNE = { width: 116, height: 58 };

export interface Point {
  x: number;
  y: number;
}

export function outputPort(rune: Pick<Rune, 'x' | 'y'>): Point {
  return { x: rune.x + RUNE.width / 2, y: rune.y };
}

export function inputPort(rune: Pick<Rune, 'x' | 'y'>): Point {
  return { x: rune.x - RUNE.width / 2, y: rune.y };
}

/** A gentle horizontal S-curve between two ports, like a drawn line of ink. */
export function inkPathData(from: Point, to: Point): string {
  const reach = Math.max(40, Math.abs(to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + reach} ${from.y}, ${to.x - reach} ${to.y}, ${to.x} ${to.y}`;
}

export function clampToCanvas(point: Point): Point {
  return {
    x: Math.min(Math.max(point.x, RUNE.width / 2 + 8), CANVAS.width - RUNE.width / 2 - 8),
    y: Math.min(Math.max(point.y, RUNE.height / 2 + 8), CANVAS.height - RUNE.height / 2 - 8),
  };
}
