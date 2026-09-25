import { describe, expect, it } from 'vitest'
import { COMPUTE } from './defs'
import { evaluate, statusFor, targetLabel } from './evaluate'
import { METRICS, RAW_METRICS } from './registry'

const testSources = import.meta.glob<string>('./*.test.ts', { query: '?raw', import: 'default', eager: true })
const allTests = Object.values(testSources).join('\n')

describe('metric registry', () => {
  it('holds the core 50 (SPEC §6) plus the SYNTHETIC tiles', () => {
    expect(METRICS.filter((m) => !m.synthetic)).toHaveLength(50)
    expect(METRICS.filter((m) => m.pulse).length).toBeGreaterThanOrEqual(15)
  })

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
    expect(['lagging', 'current', 'leading', 'forecast', 'synthetic']).toContain(m.column)
    expect(['flow', 'delivery', 'quality', 'program', 'forecast', 'scale', 'value', 'people', 'finance', 'ai']).toContain(m.tab)
    if (m.column === 'synthetic') expect(m.synthetic).toBe(true)
    expect(m.events.length).toBeGreaterThan(0)
    expect(m.target.note).toBeTruthy()
    // Content rule (CLAUDE.md): research benchmarks need ≥ 2 sources or a ⚠ flag;
    // a disputed claim shows every position with its own sources.
    expect(['research', 'disputed', 'team-goal', 'method', 'by-design']).toContain(m.benchmark.kind)
    expect(m.benchmark.label).toBeTruthy()
    if (m.benchmark.kind === 'research' && m.benchmark.sources.length < 2) expect(m.benchmark.flag).toMatch(/^⚠/)
    // Framework lens: ≈ pairs are checked against the source and flagged ⚠ (SPEC §6).
    for (const a of Object.values(m.aka ?? {})) {
      expect(a!.sources.length).toBeGreaterThan(0)
      if (a!.eq === '≈') expect(a!.flag).toMatch(/^⚠/)
    }
    for (const r of m.related ?? []) expect(METRICS.map((x) => x.id)).toContain(r)
    if (m.benchmark.kind === 'disputed') {
      expect(m.benchmark.positions!.length).toBeGreaterThanOrEqual(2)
      for (const p of m.benchmark.positions!) expect(p.sources.length).toBeGreaterThan(0)
    }
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

  it('handles a corridor target (Say/Do 80–90 %)', () => {
    const t = { op: 'range' as const, min: 80, max: 90, warnMin: 70, note: '' }
    expect(evaluate(85, t)).toBe('ok')
    expect(evaluate(80, t)).toBe('ok')
    expect(evaluate(92, t)).toBe('warn') // above the corridor
    expect(evaluate(97, t)).toBe('warn') // sandbagging is a flag, not red
    expect(evaluate(75, t)).toBe('warn')
    expect(evaluate(65, t)).toBe('bad')
    expect(targetLabel(t, '%')).toBe('80–90%')
  })

  it('does not colour a value computed from fewer than minSample records', () => {
    const def = { minSample: 10, target: { op: '<=' as const, value: 60, note: '' } }
    expect(statusFor(def, { value: 90, n: 6, records: [] })).toBe('low')
    expect(statusFor(def, { value: 90, n: 10, records: [] })).toBe('bad')
    expect(statusFor(def, { value: null, n: 0, records: [] })).toBe('none')
  })
})
