import { describe, expect, it } from 'vitest'
import { apply, buildStore } from '../domain/store'
import type { Status } from '../metrics/evaluate'
import { METRICS } from '../metrics/registry'
import { HISTORY_W, workToTime } from '../sim/calendar'
import { Simulator } from '../sim/simulator'
import { StatusBook, stableAt, statusTick } from './hysteresis'
import { PROGRAM_SCOPE, computePulse, stabilizePulse, targetSignals, type TileData } from './pulse'

// Readings from a value series against a ">= 85, warn 60" target (PI forecast).
const status = (v: number): Status => (v >= 85 ? 'ok' : v >= 60 ? 'warn' : 'bad')
const series = (values: number[]) => (k: number) => status(values[Math.max(0, Math.min(k, values.length - 1))])

describe('status hysteresis on simulated time', () => {
  it('changes only after 3 consecutive hourly readings of the new status', () => {
    const read = series([90, 90, 90, 50, 50, 50, 50])
    expect(stableAt(read, 2).shown).toBe('ok')
    expect(stableAt(read, 3)).toEqual({ shown: 'ok', pending: { status: 'bad', count: 1 } })
    expect(stableAt(read, 4)).toEqual({ shown: 'ok', pending: { status: 'bad', count: 2 } })
    expect(stableAt(read, 5).shown).toBe('bad')
  })

  it('ignores a value blinking across the threshold (85 % ↔ 84 %)', () => {
    const read = series([90, 90, 90, 84, 86, 84, 86, 84, 86])
    for (let k = 3; k <= 8; k++) expect(stableAt(read, k).shown).toBe('ok')
  })

  it('shows the most severe reading when the status keeps flipping for a whole week', () => {
    const values = Array.from({ length: 60 }, (_, k) => (k % 2 ? 84 : 86))
    expect(stableAt(series(values), 59).shown).toBe('warn')
  })

  it('after returning above the threshold for 3 ticks the status is green again — at any speed', () => {
    // 10 h on target, 10 h off target (confirmed red), then back at 93 %.
    const values = [...Array(10).fill(90), ...Array(10).fill(50), ...Array(20).fill(93)]
    const read = series(values)
    // Screen refreshes: 1× every half tick, 10× every 5 ticks, 100× every 50 ticks (only the last one lands here).
    for (const every of [0.5, 5, 50]) {
      const seen = new Map<number, Status>()
      for (let t = 0; t <= 39; t += every) seen.set(Math.floor(t), stableAt(read, Math.floor(t)).shown)
      if (seen.has(19)) expect(seen.get(19)).toBe('bad')
      if (seen.has(21)) expect(seen.get(21)).toBe('bad') // back for 2 ticks: not confirmed yet
      for (const [k, s] of seen) if (k >= 22) expect(s).toBe('ok') // 3 ticks back above 85 %
    }
    expect(stableAt(read, 22).shown).toBe('ok')
  })

  it('the signal text never contradicts the value: an unconfirmed recovery reads "recovering"', () => {
    const def = METRICS.find((m) => m.id === 'pi-forecast')!
    const tile = (value: number, pending?: TileData['pending']): TileData => ({
      def,
      result: { value, n: 2000, records: [] },
      status: 'bad',
      pending,
      trend: [],
    })
    const [off] = targetSignals([tile(40)], 5)
    expect(off.title).toBe('PI Forecast (Monte Carlo When) off target')
    expect(off.detail).toBe('40% vs target ≥ 85%')
    const [back] = targetSignals([tile(93, { status: 'ok', count: 1 })], 5)
    expect(back.title).toBe('PI Forecast (Monte Carlo When) recovering')
    expect(back.detail).toContain('93% — back on target (target ≥ 85%); clears after 2 more hourly updates')
  })

  it('on the real event log: stabilised Pulse statuses are identical at 1×, 10× and 100×', () => {
    const runAt = (stepW: number, untilW: number) => {
      const sim = new Simulator()
      const store = buildStore(sim.advanceToWork(HISTORY_W))
      const book = new StatusBook(store)
      const out = new Map<number, string>()
      for (let w = HISTORY_W; w <= untilW; w += stepW) {
        for (const e of sim.advanceToWork(w)) apply(store, e)
        const p = stabilizePulse(computePulse(store, workToTime(w), PROGRAM_SCOPE), book)
        out.set(w, [p.forecast!, ...p.tiles].map((t) => `${t.def.id}:${t.status}:${t.pending?.status ?? ''}`).join(' '))
      }
      return out
    }
    const until = HISTORY_W + 50
    const x100 = runAt(50, until)
    const x10 = runAt(5, until)
    const x1 = runAt(0.5, HISTORY_W + 10)
    for (const [w, s] of x100) expect(x10.get(w)).toBe(s)
    for (const [w, s] of x1) if (x10.has(w)) expect(x10.get(w)).toBe(s)
    expect(statusTick(workToTime(HISTORY_W + 10.5))).toBe(HISTORY_W + 10)
  })
})
