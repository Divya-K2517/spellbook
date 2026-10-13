import { ORDER, type StepContext, type System } from '../system';

/**
 * Layer one: blinking rhythms.
 *
 * Each firefly's timer charges toward a threshold, flashes, and resets. A
 * visible neighbor's flash nudges the timer. The nudge follows the pulse-coupled
 * oscillator model of Mirollo and Strogatz: the timer's phase maps through a
 * concave curve to an internal "charge", the flash adds a little charge, and the
 * result maps back. Neighbors that flash can push a firefly over its threshold
 * early, which can cascade. Whether this produces synchrony depends on the
 * coupling strength, the fireflies' own rhythms, and who can see whom; the
 * model promises nothing.
 */
export function blinkSystem(): System {
  let flagged = new Uint8Array(0);
  const queue: number[] = [];

  return {
    id: 'blink',
    order: ORDER.blink,
    update(ctx: StepContext) {
      const { world: w, cfg, grid, terrain, hooks, settings } = ctx;
      const { epsilon, curvature, refractory, glowDecay } = cfg.blink;
      const n = w.count;
      if (flagged.length < n) flagged = new Uint8Array(w.capacity);
      flagged.fill(0, 0, n);
      queue.length = 0;

      const growth = Math.exp(curvature) - 1;
      const charge = (phase: number) => Math.log1p(growth * phase) / curvature;
      const phaseOf = (c: number) => (Math.exp(curvature * c) - 1) / growth;
      const glowFade = Math.exp(-ctx.dt / glowDecay);

      for (let i = 0; i < n; i++) {
        w.refractory[i] = Math.max(0, w.refractory[i]! - ctx.dt);
        w.glow[i] = w.glow[i]! * glowFade;
        w.phase[i] = w.phase[i]! + ctx.dt / w.period[i]!;
        if (w.phase[i]! >= 1) {
          flagged[i] = 1;
          queue.push(i);
        }
      }

      // Each firefly can flash at most once per step; the queue grows as
      // flashes push neighbors over their own threshold.
      for (let head = 0; head < queue.length; head++) {
        const f = queue[head]!;
        w.phase[f] = 0;
        w.glow[f] = 1;
        w.refractory[f] = refractory;
        w.lastFlash[f] = ctx.time;
        ctx.flashes.push(f);

        const fx = w.x[f]!;
        const fy = w.y[f]!;
        grid.forEachNear(w, fx, fy, settings.vision, (j, d2) => {
          if (j === f || flagged[j] || w.refractory[j]! > 0) return;
          if (!terrain.visible(fx, fy, w.x[j]!, w.y[j]!)) return;
          const closeness = 1 - 0.5 * (Math.sqrt(d2) / settings.vision);
          const pushed = charge(w.phase[j]!) + epsilon * closeness * hooks.coupling(j, f);
          if (pushed >= 1) {
            flagged[j] = 1;
            queue.push(j);
          } else {
            w.phase[j] = phaseOf(pushed);
          }
        });
      }
    },
  };
}
