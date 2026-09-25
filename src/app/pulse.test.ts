import { describe, expect, it } from 'vitest'
import { buildStore } from '../domain/store'
import { HISTORY_W, workToTime } from '../sim/calendar'
import { DEFAULT_SEED, Simulator } from '../sim/simulator'
import { PROGRAM_SCOPE, TREND_WEEKS, computePulse, weekAnchor } from './pulse'

describe('Pulse screen data', () => {
  const store = buildStore(new Simulator(DEFAULT_SEED).advanceToWork(HISTORY_W))
  const now = workToTime(HISTORY_W)

  it('computes every tile for the program and for a single team', () => {
    const p = computePulse(store, now, PROGRAM_SCOPE)
    expect(p.teamIds).toHaveLength(5)
    expect(p.forecast?.def.id).toBe('pi-forecast')
    expect(p.tiles.length).toBeGreaterThanOrEqual(15)
    for (const t of p.tiles) {
      expect(t.trend).toHaveLength(TREND_WEEKS + 1)
      expect(t.trend[t.trend.length - 1]).toBe(t.result.value)
    }
    const kanban = computePulse(store, now, 'onboarding')
    expect(kanban.tiles.find((t) => t.def.id === 'say-do-ratio')!.result.value).toBeNull()
  })

  it('keeps watch items out of the signal count; signals = XmR + off-target tiles', () => {
    const p = computePulse(store, now, PROGRAM_SCOPE)
    expect(p.signals.every((s) => s.kind === 'xmr' || s.kind === 'target')).toBe(true)
    expect(p.watch.every((w) => w.kind === 'aging' || w.kind === 'dependency')).toBe(true)
    const offTarget = [p.forecast!, ...p.tiles].filter((t) => t.status === 'bad').map((t) => t.def.id)
    expect(p.signals.filter((s) => s.kind === 'target').map((s) => s.metricId)).toEqual(offTarget)
  })

  it('elite baseline at the end of the history: forecast 85–95 %, tiles green (≤ 1 near limit, none off target)', () => {
    const p = computePulse(store, now, PROGRAM_SCOPE)
    expect(p.forecast!.result.value).toBeGreaterThanOrEqual(85)
    expect(p.forecast!.result.value).toBeLessThanOrEqual(95)
    expect(p.tiles.filter((t) => t.status === 'bad')).toHaveLength(0)
    expect(p.tiles.filter((t) => t.status === 'warn').length).toBeLessThanOrEqual(1)
  })

  it('anchors trend points on Monday 00:00 UTC', () => {
    expect(new Date(weekAnchor(now + 3.3 * 86_400_000)).getUTCDay()).toBe(1)
    expect(weekAnchor(now) % 86_400_000).toBe(0)
  })
})
