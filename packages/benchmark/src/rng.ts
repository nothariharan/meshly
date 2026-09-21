/**
 * Deterministic PRNG for the Meshly execution benchmark.
 *
 * Every trial derives its seed from (suite seed, scenario, mode, trial index).
 * The same seed reproduces the same fault placement, so a reported number can
 * always be re-run.
 */

export interface Rng {
  next(): number
  int(minInclusive: number, maxExclusive: number): number
  pick<T>(items: readonly T[]): T
  chance(probability: number): boolean
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min)) + min,
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
  }
}

/** Stable 32-bit hash so (seed, scenario, mode, trial) maps to a reproducible stream. */
export function deriveSeed(...parts: Array<string | number>): number {
  let h = 2166136261 >>> 0
  const text = parts.join(":")
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
