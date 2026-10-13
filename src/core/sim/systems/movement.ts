import { clamp } from '../../math/vec';
import { ORDER, type StepContext, type System } from '../system';

/**
 * Layer two: movement.
 *
 * Fireflies drift, keep their distance from close neighbors, settle near
 * bushes, steer around ponds and walls, and now and then wander off alone.
 * Movement never touches blink timers; it only changes who is near whom.
 * Other layers add forces through `hooks.steering`.
 */
export function movementSystem(): System {
  const force = { x: 0, y: 0 };
  const extra = { x: 0, y: 0 };

  return {
    id: 'movement',
    order: ORDER.movement,
    update(ctx: StepContext) {
      const { world: w, cfg, terrain, rng, dt, hooks } = ctx;
      const m = cfg.movement;
      const width = ctx.grid.bounds.width;
      const height = ctx.grid.bounds.height;
      const sepSq = m.separationDistance * m.separationDistance;

      for (let i = 0; i < w.count; i++) {
        const x = w.x[i]!;
        const y = w.y[i]!;

        // Wandering: a slowly turning heading gives each firefly its own drift.
        w.heading[i] = w.heading[i]! + rng.gaussian() * m.wanderTurn * Math.sqrt(dt);
        const rule = hooks.rule(i);

        if (w.restless[i]! > 0) {
          w.restless[i] = w.restless[i]! - dt;
        } else if (rng.chance(m.restlessRate * rule.restlessMultiplier * dt)) {
          w.restless[i] = m.restlessSeconds;
          w.heading[i] = rng.range(0, Math.PI * 2);
          ctx.log.push({ t: ctx.time, kind: 'restless', a: i });
          ctx.log.restlessCount[i] = (ctx.log.restlessCount[i] ?? 0) + 1;
        }
        const speed = m.cruiseSpeed * (w.restless[i]! > 0 ? m.restlessBoost : 1);
        let fx = Math.cos(w.heading[i]!) * speed;
        let fy = Math.sin(w.heading[i]!) * speed;

        // Separation from close neighbors.
        ctx.grid.forEachNear(w, x, y, m.separationDistance, (j, d2) => {
          if (j === i || d2 === 0 || d2 > sepSq) return;
          const d = Math.sqrt(d2);
          const push = (1 - d / m.separationDistance) * m.separationPush;
          fx += ((x - w.x[j]!) / d) * push;
          fy += ((y - w.y[j]!) / d) * push;
        });

        // Bushes are appealing places: pulled in from a distance, then settled.
        const near = terrain.nearestBush(x, y, m.bushRange);
        if (near && near.distance > m.bushSettle) {
          const pull = (1 - near.distance / m.bushRange) * m.bushPull + m.bushPull * 0.3;
          fx += ((near.bush.x - x) / near.distance) * pull;
          fy += ((near.bush.y - y) / near.distance) * pull;
        }

        // Layers add their own forces.
        force.x = 0;
        force.y = 0;
        for (const contribute of hooks.steering) {
          extra.x = 0;
          extra.y = 0;
          contribute(i, extra);
          force.x += extra.x;
          force.y += extra.y;
        }
        fx += force.x;
        fy += force.y;

        // Walls push back softly.
        if (x < m.wallMargin) fx += ((m.wallMargin - x) / m.wallMargin) * m.wallPush;
        if (x > width - m.wallMargin) fx -= ((x - (width - m.wallMargin)) / m.wallMargin) * m.wallPush;
        if (y < m.wallMargin) fy += ((m.wallMargin - y) / m.wallMargin) * m.wallPush;
        if (y > height - m.wallMargin) fy -= ((y - (height - m.wallMargin)) / m.wallMargin) * m.wallPush;

        // Ponds push back, harder the closer a firefly gets.
        for (const pond of terrain.activePonds) {
          const dx = x - pond.x;
          const dy = y - pond.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const reach = pond.r + m.pondMargin;
          if (d < reach) {
            const push = ((reach - d) / m.pondMargin) * m.pondPush;
            fx += (dx / d) * push;
            fy += (dy / d) * push;
          }
        }

        // Velocity eases toward the desired velocity.
        const ease = Math.min(1, m.responsiveness * dt);
        let vx = w.vx[i]! + (fx - w.vx[i]!) * ease;
        let vy = w.vy[i]! + (fy - w.vy[i]!) * ease;
        const v = Math.hypot(vx, vy);
        if (v > m.maxSpeed) {
          vx = (vx / v) * m.maxSpeed;
          vy = (vy / v) * m.maxSpeed;
        }
        w.vx[i] = vx;
        w.vy[i] = vy;

        let nx = clamp(x + vx * dt, 6, width - 6);
        let ny = clamp(y + vy * dt, 6, height - 6);

        // A pond is a hard edge: a firefly is placed back on its shore.
        for (const pond of terrain.activePonds) {
          const dx = nx - pond.x;
          const dy = ny - pond.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < pond.r) {
            nx = pond.x + (dx / d) * pond.r;
            ny = pond.y + (dy / d) * pond.r;
          }
        }
        w.x[i] = nx;
        w.y[i] = ny;
      }
    },
  };
}
