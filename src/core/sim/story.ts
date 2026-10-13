import { formatClock } from '../math/vec';
import { pairKey, type Gathering } from './log';
import type { Simulation } from './simulation';

/**
 * Observations written from recorded events with templates. There is no
 * chatbot: every sentence below is true of the log it was built from, or it
 * is not said.
 */

const PAIR_WINDOW_SECONDS = 10;

/** True if the pair parted within a few seconds after an edit of the given kind. */
function partedAfter(sim: Simulation, a: number, b: number, what: 'pond-added'): boolean {
  const events = sim.log.events;
  for (const edit of events) {
    if (edit.kind !== 'edit' || edit.what !== what) continue;
    for (const e of events) {
      if (e.kind !== 'part' || e.t < edit.t || e.t > edit.t + PAIR_WINDOW_SECONDS) continue;
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return true;
    }
  }
  return false;
}

/** True if the pair met within a few seconds after the barrier was lifted. */
function metAfterLift(sim: Simulation, a: number, b: number): boolean {
  const events = sim.log.events;
  for (const edit of events) {
    if (edit.kind !== 'edit' || edit.what !== 'barrier-lifted') continue;
    for (const e of events) {
      if (e.kind !== 'meet' || e.t < edit.t || e.t > edit.t + 25) continue;
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return true;
    }
  }
  return false;
}

export function generateStory(sim: Simulation, index: number): string[] {
  const { world, log } = sim;
  const name = world.names[index];
  if (name === undefined) return [];
  const lines: string[] = [];

  const top = log.topCompanion(index);
  if (top && top.seconds >= 6) {
    const other = world.names[top.other]!;
    const share = Math.min(100, Math.round((top.seconds / Math.max(sim.time, 1)) * 100));
    lines.push(`${name} spent about ${share}% of the night near ${other}.`);

    const matched = log.matches.get(pairKey(index, top.other));
    const parted = partedAfter(sim, index, top.other, 'pond-added');
    if (matched && matched.count >= 1 && parted) {
      lines.push(`They matched rhythms${matched.count > 2 ? ' several times' : ' briefly'}, then separated when you added the pond.`);
    } else if (matched && matched.count >= 3) {
      lines.push(`${name} and ${other} flashed together ${matched.count} times.`);
    } else if (matched) {
      lines.push(`${name} and ${other} matched rhythms briefly.`);
    } else if (parted) {
      lines.push(`They separated when you added the pond.`);
    }
    if (metAfterLift(sim, index, top.other)) {
      lines.push(`They met after you lifted the pond.`);
    }
  }

  const together = log.syncSeconds[index] ?? 0;
  if (together >= 3) {
    lines.push(`${name} spent about ${Math.round(together)} seconds flashing in step with a group.`);
  }

  const restless = log.restlessCount[index] ?? 0;
  if (restless >= 1) {
    lines.push(`${name} wandered off on its own ${restless === 1 ? 'once' : `${restless} times`}.`);
  }

  if (sim.settings.layers.social) {
    let best = -1;
    let bestValue = 0.25;
    for (let j = 0; j < world.count; j++) {
      if (j === index) continue;
      const value = sim.familiarityOf(index, j);
      if (value > bestValue) {
        bestValue = value;
        best = j;
      }
    }
    if (best >= 0) lines.push(`${name} knows ${world.names[best]} best by now.`);
  }

  const rule = sim.ruleOf(index);
  if (world.personality[index] !== 0) {
    lines.push(`${name} is ${rule.label.toLowerCase()}. ${rule.blurb}`);
  }

  if (lines.length === 0) lines.push(`${name} has only just started its night. Give the garden a little longer.`);
  return lines;
}

export interface Postcard {
  title: string;
  lines: string[];
  /** The largest gathering seen, if any. */
  gathering: Gathering | undefined;
}

export function describePostcard(sim: Simulation): Postcard {
  const g = sim.log.gathering;
  const lines: string[] = [];
  if (g) {
    const names = g.members.slice(0, 4).map((i) => sim.world.names[i]);
    const more = g.members.length > 4 ? ` and ${g.members.length - 4} more` : '';
    lines.push(`At ${formatClock(g.t)}, ${g.size} fireflies were flashing together.`);
    lines.push(`${names.join(', ')}${more}.`);
  } else {
    lines.push('No gathering yet. Let the garden run a little longer.');
  }
  lines.push(`${sim.world.count} fireflies, watched for ${formatClock(sim.time)}.`);
  return { title: 'A night in the garden', lines, gathering: g };
}

export interface Constellation {
  center: number;
  nodes: { index: number; name: string; weight: number }[];
  /** What the lines mean: familiarity when society is on, otherwise time spent near. */
  basis: 'familiarity' | 'time together';
}

/** The firefly's closest companions, for drawing a relationship map. */
export function constellation(sim: Simulation, index: number, limit = 6): Constellation {
  const social = sim.settings.layers.social;
  const scored: { index: number; name: string; weight: number }[] = [];
  for (let j = 0; j < sim.world.count; j++) {
    if (j === index) continue;
    const raw = social ? sim.familiarityOf(index, j) : (sim.log.dwell.get(pairKey(index, j)) ?? 0);
    if (raw > 0) scored.push({ index: j, name: sim.world.names[j]!, weight: raw });
  }
  scored.sort((a, b) => b.weight - a.weight);
  const nodes = scored.slice(0, limit);
  const max = nodes[0]?.weight ?? 1;
  for (const node of nodes) node.weight = node.weight / max;
  return { center: index, nodes, basis: social ? 'familiarity' : 'time together' };
}
