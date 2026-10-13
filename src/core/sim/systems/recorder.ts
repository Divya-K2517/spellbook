import { ORDER, type StepContext, type System } from '../system';

/**
 * Writes down what happens so it can be told later: who was near whom, whose
 * flashes matched, and where each firefly went. Reads the simulation; never
 * changes it.
 */
export function recorderSystem(): System {
  let accumulated = 0;
  let sincePath = 0;
  /** Pairs currently counted as together, so meeting and parting are recorded once each. */
  const together = new Set<number>();

  return {
    id: 'recorder',
    order: ORDER.recorder,
    update(ctx: StepContext) {
      const { world: w, cfg, grid, terrain, log } = ctx;
      const r = cfg.recorder;
      log.ensure(w.count);

      // Flash matches: neighbors that lit within a moment of each other.
      for (const f of ctx.flashes) {
        grid.forEachNear(w, w.x[f]!, w.y[f]!, ctx.settings.vision, (j) => {
          if (j === f) return;
          const gap = w.lastFlash[f]! - w.lastFlash[j]!;
          if (gap < 0 || gap > r.matchWindowSeconds) return;
          if (gap === 0 && j > f) return;
          if (!terrain.visible(w.x[f]!, w.y[f]!, w.x[j]!, w.y[j]!)) return;
          log.addMatch(f, j, ctx.time);
        });
      }

      sincePath += ctx.dt;
      if (sincePath >= r.pathIntervalSeconds) {
        sincePath = 0;
        for (let i = 0; i < w.count; i++) log.samplePath(i, w.x[i]!, w.y[i]!);
      }

      accumulated += ctx.dt;
      if (accumulated < r.intervalSeconds) return;
      const elapsed = accumulated;
      accumulated = 0;

      const seen = new Set<number>();
      for (let i = 0; i < w.count; i++) {
        grid.forEachNear(w, w.x[i]!, w.y[i]!, r.meetExit, (j, d2) => {
          if (j <= i) return;
          const key = i * 100003 + j;
          const wasTogether = together.has(key);
          const limit = wasTogether ? r.meetExit : r.meetEnter;
          if (d2 > limit * limit) return;
          if (!terrain.visible(w.x[i]!, w.y[i]!, w.x[j]!, w.y[j]!)) return;
          seen.add(key);
          log.addDwell(i, j, elapsed);
          if (!wasTogether) {
            together.add(key);
            log.push({ t: ctx.time, kind: 'meet', a: i, b: j });
          }
        });
      }
      for (const key of [...together]) {
        if (seen.has(key)) continue;
        together.delete(key);
        log.push({ t: ctx.time, kind: 'part', a: Math.floor(key / 100003), b: key % 100003 });
      }
    },
  };
}
