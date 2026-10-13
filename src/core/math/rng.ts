/** Seedable random numbers, so any garden can be replayed exactly from its seed. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Standard normal (mean 0, deviation 1). */
  gaussian(): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

/** mulberry32: small, fast, and good enough for a simulation. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    gaussian() {
      const u = 1 - next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
    int: (n) => Math.floor(next() * n),
  };
}
