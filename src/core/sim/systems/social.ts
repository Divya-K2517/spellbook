import { PERSONALITY_RULES } from '../config';
import { pairKey } from '../log';
import { ORDER, type Familiarity, type Hooks, type StepContext, type System } from '../system';
import { personalityOf, type World } from '../world';

/**
 * Layer three: a fictional society.
 *
 * Familiarity grows when two fireflies share peaceful company and fades after
 * a long separation. It has to matter: it scales how strongly a neighbor's
 * flash nudges a firefly (blinking) and how strongly a firefly is drawn to a
 * neighbor (movement), and each personality bends both. None of this claims
 * anything about real fireflies.
 */
export function socialSystem(): System {
  let sinceDecay = 0;

  return {
    id: 'social',
    order: ORDER.social,
    update(ctx: StepContext) {
      const { world: w, cfg, grid, terrain, familiarity } = ctx;
      const s = cfg.social;
      const minGap = cfg.movement.separationDistance * 0.6;

      // Peaceful company: close enough to meet, not so close it is crowding.
      for (let i = 0; i < w.count; i++) {
        grid.forEachNear(w, w.x[i]!, w.y[i]!, s.encounterRadius, (j, d2) => {
          if (j <= i || d2 < minGap * minGap) return;
          if (!terrain.visible(w.x[i]!, w.y[i]!, w.x[j]!, w.y[j]!)) return;
          const key = pairKey(i, j);
          let entry = familiarity.get(key);
          if (!entry) {
            entry = { value: 0, lastContact: ctx.time };
            familiarity.set(key, entry);
          }
          entry.value += s.gain * (1 - entry.value) * ctx.dt;
          entry.lastContact = ctx.time;
        });
      }

      // Long separation: familiarity slowly fades once the grace period passes.
      sinceDecay += ctx.dt;
      if (sinceDecay >= 0.5) {
        for (const [key, entry] of familiarity) {
          if (ctx.time - entry.lastContact <= s.graceSeconds) continue;
          entry.value -= s.decay * sinceDecay;
          if (entry.value < 0.01) familiarity.delete(key);
        }
        sinceDecay = 0;
      }
    },
  };
}

/** Installs the society layer's effect on blinking and movement. */
export function installSocialHooks(env: {
  hooks: Hooks;
  world: World;
  familiarity: Map<number, Familiarity>;
  cfg: StepContext['cfg'];
  settings: StepContext['settings'];
  terrain: StepContext['terrain'];
  grid: StepContext['grid'];
}): void {
  const { hooks, familiarity, cfg, settings, terrain, grid } = env;
  const familiarityOf = (i: number, j: number) => familiarity.get(pairKey(i, j))?.value ?? 0;

  hooks.coupling = (i, j) => 1 + cfg.social.couplingBoost * familiarityOf(i, j);
  hooks.rule = (i) => PERSONALITY_RULES[personalityOf(env.world.personality[i]!)];

  const sepFloor = cfg.movement.separationDistance * 1.2;
  hooks.steering.push((i, out) => {
    const w = env.world;
    const rule = PERSONALITY_RULES[personalityOf(w.personality[i]!)];
    const x = w.x[i]!;
    const y = w.y[i]!;
    let seen = 0;
    let cx = 0;
    let cy = 0;
    let ax = 0;
    let ay = 0;
    grid.forEachNear(w, x, y, settings.vision, (j, d2) => {
      if (j === i || d2 === 0) return;
      if (!terrain.visible(x, y, w.x[j]!, w.y[j]!)) return;
      seen += 1;
      cx += w.x[j]!;
      cy += w.y[j]!;
      const d = Math.sqrt(d2);
      if (d <= sepFloor) return;
      const fam = familiarityOf(i, j);
      const weight = rule.familiarAttraction * fam + rule.strangerAttraction * (1 - fam);
      const falloff = 1 - 0.5 * (d / settings.vision);
      ax += ((w.x[j]! - x) / d) * weight * falloff;
      ay += ((w.y[j]! - y) / d) * weight * falloff;
    });
    if (seen === 0) return;
    const norm = 1 / Math.sqrt(seen);
    out.x += ax * norm * cfg.social.attractionPull;
    out.y += ay * norm * cfg.social.attractionPull;

    // A shy firefly backs away from a crowd.
    if (seen > rule.crowdLimit) {
      const dx = x - cx / seen;
      const dy = y - cy / seen;
      const d = Math.hypot(dx, dy) || 1;
      const over = (seen - rule.crowdLimit) / seen;
      out.x += (dx / d) * cfg.social.crowdPush * over;
      out.y += (dy / d) * cfg.social.crowdPush * over;
    }
  });
}
