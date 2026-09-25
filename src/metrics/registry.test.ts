import { describe, expect, it } from 'vitest'
import { COMPUTE } from './defs'
import { evaluate } from './evaluate'
import { METRICS, RAW_METRICS } from './registry'

const testSources = import.meta.glob<string>('./*.test.ts', { query: '?raw', import: 'default', eager: true })
const allTests = Object.values(testSources).join('\n')

describe('metric registry', () => {
  it('every YAML entry has a compute function and vice versa', () => {
    expect(RAW_METRICS.map((m) => m.id).sort()).toEqual(Object.keys(COMPUTE).sort())
  })

  it.each(METRICS.map((m) => m.id))('%s has a hand-computed reference test', (id) => {
    expect(allTests).toContain(`describe('metric:${id}'`)
  })

  it.each(METRICS.map((m) => [m.id, m] as const))('%s is fully documented', (_, m) => {
    for (const k of ['name', 'short', 'domain', 'question', 'definition', 'formula', 'window', 'unit'] as const) {
      expect(m[k], k).toBeTruthy()
    }
    expect(['lagging', 'current', 'leading', 'forecast']).toContain(m.column)
    expect(m.events.length).toBeGreaterThan(0)
    expect(m.target.note).toBeTruthy()
    // ≥ 2 independent sources, or an explicit ⚠ flag for Dmitry's call (CLAUDE.md content rule)
    if (m.benchmark.sources.length < 2) expect(m.benchmark.flag).toMatch(/^⚠/)
  })
})

describe('evaluate', () => {
  it('colours values against the target and warn thresholds', () => {
    const t = { op: '<=' as const, value: 7, warn: 9, note: '' }
    expect(evaluate(6, t)).toBe('ok')
    expect(evaluate(7, t)).toBe('ok')
    expect(evaluate(8, t)).toBe('warn')
    expect(evaluate(9.5, t)).toBe('bad')
    expect(evaluate(null, t)).toBe('none')
    expect(evaluate(90, { op: '>=', value: 95, warn: 90, note: '' })).toBe('warn')
    // per-team thresholds scale with scope: ≤ 1 per team, 5 teams → ≤ 5
    expect(evaluate(5, { op: '<=', value: 1, warn: 2, per: 'team', note: '' }, 5)).toBe('ok')
    expect(evaluate(3, { note: 'no target' })).toBe('none')
  })
})
