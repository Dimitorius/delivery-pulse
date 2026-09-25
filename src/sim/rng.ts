// Seeded pseudo-random generator (mulberry32) plus the distributions the
// simulator needs. Same seed → same sequence → same history for every visitor.

export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  /** Standard normal (Box–Muller). */
  normal(): number {
    const u = 1 - this.next()
    const v = this.next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /**
   * Log-normal parameterised by its median and log-space sigma. This is the
   * fat-tailed shape real cycle times, review waits and outages have.
   */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal())
  }

  exponential(mean: number): number {
    return -mean * Math.log(1 - this.next())
  }

  /** Poisson count (Knuth); fine for the small rates used here. */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0
    const limit = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= this.next()
    } while (p > limit)
    return k - 1
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let r = this.next() * total
    for (const [value, w] of entries) {
      r -= w
      if (r < 0) return value
    }
    return entries[entries.length - 1][0]
  }
}
