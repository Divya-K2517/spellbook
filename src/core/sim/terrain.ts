import type { Bush, Pond } from '../garden/types';
import { segmentPointDistSq } from '../math/vec';

/**
 * Ponds and bushes as the simulation sees them. A pond separates groups two
 * ways: fireflies cannot enter it, and a flash cannot be seen across it. The
 * temporary lift switches both off at once without touching the garden itself.
 */
export class Terrain {
  ponds: Pond[] = [];
  bushes: Bush[] = [];
  nextId = 1;
  /** True while the barrier is temporarily lifted. Never saved. */
  lifted = false;

  /** Ponds that currently act as barriers. */
  get activePonds(): readonly Pond[] {
    return this.lifted ? [] : this.ponds;
  }

  /** True when a flash at (ax, ay) can be seen from (bx, by). */
  visible(ax: number, ay: number, bx: number, by: number): boolean {
    for (const pond of this.activePonds) {
      if (segmentPointDistSq(ax, ay, bx, by, pond.x, pond.y) < pond.r * pond.r) return false;
    }
    return true;
  }

  pondAt(x: number, y: number): Pond | undefined {
    return this.ponds.find((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= p.r * p.r);
  }

  /** The nearest bush to (x, y) within `range`, if any. */
  nearestBush(x: number, y: number, range: number): { bush: Bush; distance: number } | undefined {
    let best: { bush: Bush; distance: number } | undefined;
    let bestSq = range * range;
    for (const bush of this.bushes) {
      const d2 = (bush.x - x) ** 2 + (bush.y - y) ** 2;
      if (d2 <= bestSq) {
        bestSq = d2;
        best = { bush, distance: Math.sqrt(d2) };
      }
    }
    return best;
  }
}
