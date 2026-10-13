/**
 * The night's record. Stories, path replays, relationship maps, and the
 * postcard are all read from here and from nowhere else, so anything the
 * garden should be able to tell later must first be written down here.
 */

export type EditKind =
  | 'pond-added'
  | 'pond-erased'
  | 'bush-added'
  | 'bush-removed'
  | 'firefly-added'
  | 'vision-changed'
  | 'layers-changed'
  | 'personality-changed'
  | 'barrier-lifted'
  | 'barrier-restored';

export type SimEvent =
  | { t: number; kind: 'meet' | 'part'; a: number; b: number }
  | { t: number; kind: 'edit'; what: EditKind; x?: number; y?: number }
  | { t: number; kind: 'restless'; a: number }
  | { t: number; kind: 'sync-gained' | 'sync-lost' };

export interface Gathering {
  t: number;
  size: number;
  members: number[];
  /** Positions at that moment, aligned with `members`. */
  points: { x: number; y: number }[];
}

export const pairKey = (a: number, b: number): number => (a < b ? a * 100003 + b : b * 100003 + a);
export const pairOf = (key: number): [number, number] => [Math.floor(key / 100003), key % 100003];

export class EventLog {
  readonly events: SimEvent[] = [];
  /** Seconds each pair spent close together. */
  readonly dwell = new Map<number, number>();
  /** How often each pair flashed together, and when last. */
  readonly matches = new Map<number, { count: number; last: number }>();
  /** Seconds each firefly spent inside a synchronized group. */
  syncSeconds: number[] = [];
  restlessCount: number[] = [];
  private paths: Float32Array[] = [];
  private pathLength: number[] = [];
  private pathStart: number[] = [];
  gathering: Gathering | undefined;
  /** True once anything at all has been recorded this night. */
  recorded = false;

  constructor(
    private readonly maxEvents: number,
    private readonly pathCapacity: number,
  ) {}

  /** Makes sure per-firefly tables cover `count` fireflies. */
  ensure(count: number): void {
    while (this.syncSeconds.length < count) {
      this.syncSeconds.push(0);
      this.restlessCount.push(0);
      this.paths.push(new Float32Array(this.pathCapacity * 2));
      this.pathLength.push(0);
      this.pathStart.push(0);
    }
  }

  push(event: SimEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
    this.recorded = true;
  }

  addDwell(a: number, b: number, seconds: number): void {
    const key = pairKey(a, b);
    this.dwell.set(key, (this.dwell.get(key) ?? 0) + seconds);
    this.recorded = true;
  }

  addMatch(a: number, b: number, t: number): void {
    const key = pairKey(a, b);
    const entry = this.matches.get(key);
    if (entry) {
      entry.count += 1;
      entry.last = t;
    } else {
      this.matches.set(key, { count: 1, last: t });
    }
    this.recorded = true;
  }

  samplePath(index: number, x: number, y: number): void {
    const buffer = this.paths[index]!;
    const cap = this.pathCapacity;
    let length = this.pathLength[index]!;
    let start = this.pathStart[index]!;
    const slot = (start + length) % cap;
    buffer[slot * 2] = x;
    buffer[slot * 2 + 1] = y;
    if (length < cap) length += 1;
    else start = (start + 1) % cap;
    this.pathLength[index] = length;
    this.pathStart[index] = start;
    this.recorded = true;
  }

  /** The recorded path of a firefly, oldest first. */
  pathOf(index: number): { x: number; y: number }[] {
    const buffer = this.paths[index];
    if (!buffer) return [];
    const cap = this.pathCapacity;
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < this.pathLength[index]!; k++) {
      const slot = (this.pathStart[index]! + k) % cap;
      out.push({ x: buffer[slot * 2]!, y: buffer[slot * 2 + 1]! });
    }
    return out;
  }

  noteGathering(candidate: Gathering): void {
    this.recorded = true;
    if (!this.gathering || candidate.size > this.gathering.size) this.gathering = candidate;
  }

  /** The companion a firefly spent the most time near, if any. */
  topCompanion(index: number): { other: number; seconds: number } | undefined {
    let best: { other: number; seconds: number } | undefined;
    for (const [key, seconds] of this.dwell) {
      const [a, b] = pairOf(key);
      if (a !== index && b !== index) continue;
      if (!best || seconds > best.seconds) best = { other: a === index ? b : a, seconds };
    }
    return best;
  }
}
