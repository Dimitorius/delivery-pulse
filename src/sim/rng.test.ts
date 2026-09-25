import { describe, expect, it } from 'vitest'
import { Rng } from './rng'

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(123)
    const b = new Rng(123)
    const xs = Array.from({ length: 5 }, () => a.next())
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs)
    expect(new Rng(124).next()).not.toBe(xs[0])
  })

  it('stays in [0, 1) and int() is inclusive', () => {
    const r = new Rng(1)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      const x = r.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      seen.add(r.int(1, 3))
    }
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('lognormal has the requested median and a fat right tail', () => {
    const r = new Rng(7)
    const xs = Array.from({ length: 20000 }, () => r.lognormal(10, 0.8)).sort((a, b) => a - b)
    const median = xs[xs.length / 2]
    expect(median).toBeGreaterThan(9.5)
    expect(median).toBeLessThan(10.5)
    // P95/P50 = e^(1.645·0.8) ≈ 3.7 — a long tail, unlike a normal distribution
    expect(xs[Math.floor(0.95 * xs.length)] / median).toBeGreaterThan(3.3)
  })

  it('poisson mean ≈ lambda', () => {
    const r = new Rng(9)
    let total = 0
    for (let i = 0; i < 20000; i++) total += r.poisson(0.4)
    expect(total / 20000).toBeCloseTo(0.4, 1)
  })
})
