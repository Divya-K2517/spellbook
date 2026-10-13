import { circularDistance } from '../../math/vec';
import { ORDER, type StepContext, type System } from '../system';

export interface ObserverOutput {
  /** Number of synchronized groups seen at the last tick. */
  groups: number;
  /** Size of the largest synchronized group at the last tick. */
  largest: number;
  /** Whether synchrony is currently reported, after hysteresis. */
  syncSeen: boolean;
}

/**
 * Watches for fireflies flashing together and reports it. A synchronized group
 * is a set of mutually visible neighbors whose timers sit close together on
 * the cycle. The observer never influences the simulation: it only labels
 * groups (so they can be drawn in their own colors), keeps those labels stable
 * from tick to tick, and reports gain and loss of synchrony once the state has
 * held for a moment, so a brief coincidence does not flicker the interface.
 */
export function observerSystem(
  output: ObserverOutput,
  onChange: (syncSeen: boolean, time: number) => void,
): System {
  let accumulated = 0;
  let parent = new Int32Array(0);
  let nextLabel = 0;
  let candidateSince = 0;
  let candidate = false;

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };

  return {
    id: 'observer',
    order: ORDER.observer,
    update(ctx: StepContext) {
      const { world: w, cfg, grid, terrain, settings, log } = ctx;
      const o = cfg.observer;
      accumulated += ctx.dt;
      if (accumulated < o.intervalSeconds) return;
      const elapsed = accumulated;
      accumulated = 0;

      const n = w.count;
      if (parent.length < n) parent = new Int32Array(w.capacity);
      for (let i = 0; i < n; i++) parent[i] = i;

      for (let i = 0; i < n; i++) {
        grid.forEachNear(w, w.x[i]!, w.y[i]!, settings.vision, (j) => {
          if (j <= i) return;
          if (circularDistance(w.phase[i]!, w.phase[j]!) >= o.phaseTolerance) return;
          if (!terrain.visible(w.x[i]!, w.y[i]!, w.x[j]!, w.y[j]!)) return;
          const a = find(i);
          const b = find(j);
          if (a !== b) parent[a] = b;
        });
      }

      const members = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        const list = members.get(root);
        if (list) list.push(i);
        else members.set(root, [i]);
      }
      const clusters = [...members.values()]
        .filter((c) => c.length >= o.minGroupSize)
        .sort((a, b) => b.length - a.length);

      // Keep labels stable: a cluster inherits the label most of its members
      // already carried, unless a larger cluster has taken it this tick.
      const taken = new Set<number>();
      const labelOf = new Int32Array(n).fill(-1);
      for (const cluster of clusters) {
        const votes = new Map<number, number>();
        for (const i of cluster) {
          const previous = w.group[i]!;
          if (previous >= 0) votes.set(previous, (votes.get(previous) ?? 0) + 1);
        }
        let label = -1;
        let best = 0;
        for (const [candidateLabel, count] of votes) {
          if (!taken.has(candidateLabel) && count > best) {
            best = count;
            label = candidateLabel;
          }
        }
        if (label < 0) label = nextLabel++;
        taken.add(label);
        for (const i of cluster) labelOf[i] = label;
      }
      for (let i = 0; i < n; i++) {
        w.group[i] = labelOf[i]!;
        if (labelOf[i]! >= 0) log.syncSeconds[i] = (log.syncSeconds[i] ?? 0) + elapsed;
      }

      output.groups = clusters.length;
      output.largest = clusters[0]?.length ?? 0;
      if (clusters[0]) {
        const best = clusters[0];
        log.noteGathering({
          t: ctx.time,
          size: best.length,
          members: [...best],
          points: best.map((i) => ({ x: w.x[i]!, y: w.y[i]! })),
        });
      }

      // Hysteresis on the reported state.
      const present = clusters.length > 0;
      if (present !== candidate) {
        candidate = present;
        candidateSince = ctx.time;
      }
      if (candidate !== output.syncSeen && ctx.time - candidateSince >= o.holdSeconds) {
        output.syncSeen = candidate;
        log.push({ t: ctx.time, kind: candidate ? 'sync-gained' : 'sync-lost' });
        onChange(candidate, ctx.time);
      }
    },
  };
}
