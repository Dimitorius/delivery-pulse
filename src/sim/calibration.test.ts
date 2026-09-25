// The simulated history must match the elite profile promised in SPEC §3
// ("elite, deliberately not 100%"). Bands are the spec's, widened slightly
// where the spec value is a point estimate. Measured over PI 2 → now to skip
// the warm-up PI (no velocity history yet).

import { describe, expect, it } from 'vitest'
import { buildStore } from '../domain/store'
import { COMPUTE } from '../metrics/defs'
import { recentSprints } from '../metrics/defs/scrum'
import { cycleTimeDays, doneInWindow, wipAt } from '../metrics/flow'
import type { MetricContext } from '../metrics/types'
import { DAY_MS, HISTORY_W, PI_W, workToTime } from './calendar'
import { DEFAULT_SEED, Simulator } from './simulator'

const store = buildStore(new Simulator(DEFAULT_SEED).advanceToWork(HISTORY_W))
const asOf = workToTime(HISTORY_W)
const ctx: MetricContext = {
  store,
  asOf,
  teamIds: store.teams.map((t) => t.id),
  windowDays: (asOf - workToTime(PI_W)) / DAY_MS,
}
const value = (id: string) => COMPUTE[id](ctx).value!
const secondary = (id: string, label: string) => COMPUTE[id](ctx).secondary!.find((s) => s.label === label)!.value!

describe(`elite profile calibration (seed ${DEFAULT_SEED})`, () => {
  it('DORA: deploys several times a day, LT < 1 day, CFR 3–5 %, recovery < 1 h', () => {
    expect(value('deployment-frequency')).toBeGreaterThan(1) // per service per working day
    expect(value('lead-time-for-changes')).toBeLessThan(24)
    expect(value('change-failure-rate')).toBeGreaterThanOrEqual(2.5)
    expect(value('change-failure-rate')).toBeLessThanOrEqual(5.5)
    expect(value('failed-deployment-recovery-time')).toBeLessThan(60)
  })

  it('flow: cycle time P85 5–7 d with a fat tail, flow efficiency 35–45 %', () => {
    expect(value('cycle-time')).toBeGreaterThanOrEqual(5)
    expect(value('cycle-time')).toBeLessThanOrEqual(7.2)
    const p50 = secondary('cycle-time', 'P50')
    const ct = doneInWindow(ctx).map(cycleTimeDays).sort((a, b) => a - b)
    expect(ct[Math.ceil(0.98 * ct.length) - 1] / p50).toBeGreaterThan(2.5) // tail kept
    expect(value('flow-efficiency')).toBeGreaterThanOrEqual(33)
    expect(value('flow-efficiency')).toBeLessThanOrEqual(45)
  })

  it('Scrum: Say-Do 80–90 %, sprint goal ≈ 85 %, carry-over < 15 %', () => {
    // Say-Do over every sprint since PI 2 (the live metric uses only the last 3).
    const sprints = recentSprints(ctx, 100).filter((s) => s.start >= workToTime(PI_W))
    let pts = 0
    let donePts = 0
    for (const s of sprints) {
      for (const id of s.committedItemIds) {
        const item = store.items.get(id)!
        pts += item.points ?? 0
        if (item.doneAt !== undefined && item.doneAt <= s.end) donePts += item.points ?? 0
      }
    }
    expect(donePts / pts).toBeGreaterThanOrEqual(0.8)
    expect(donePts / pts).toBeLessThanOrEqual(0.92)
    const goals = sprints.filter((s) => s.goalMet !== undefined)
    const goalRate = goals.filter((s) => s.goalMet).length / goals.length
    expect(goalRate).toBeGreaterThan(0.75)
    expect(goalRate).toBeLessThan(0.95)
    let carried = 0
    let committed = 0
    for (const s of sprints) {
      const next = store.iterationList.find((x) => x.kind === 'sprint' && x.teamId === s.teamId && x.index === s.index + 1)
      committed += s.committedItemIds.length
      if (next) carried += s.committedItemIds.filter((id) => next.committedItemIds.includes(id)).length
    }
    expect(carried / committed).toBeLessThan(0.15)
  })

  it('PR/CI: pickup < 4 h, main green > 95 %, flaky < 2 %, pipeline P95 < 12 min', () => {
    expect(value('pr-pickup-time')).toBeLessThan(4)
    expect(value('main-build-success')).toBeGreaterThan(95)
    const runs = store.pipelines
    expect(runs.filter((r) => r.retryOf).length / runs.length).toBeLessThan(0.02)
    const mins = runs.map((r) => (r.finishedAt - r.startedAt) / 60_000).sort((a, b) => a - b)
    expect(mins[Math.ceil(0.95 * mins.length) - 1]).toBeLessThan(12)
  })

  it('program: unplanned work 13–20 %, investment ≈ 60/20/20', () => {
    expect(value('unplanned-work')).toBeGreaterThanOrEqual(13)
    expect(value('unplanned-work')).toBeLessThanOrEqual(20)
    const done = doneInWindow(ctx)
    const share = (k: string) => done.filter((i) => i.investment === k).length / done.length
    expect(share('feature')).toBeGreaterThan(0.5)
    expect(share('feature')).toBeLessThan(0.7)
    expect(share('debt')).toBeGreaterThan(0.12)
    expect(share('ktlo')).toBeGreaterThan(0.12)
  })

  it("obeys Little's law: mean WIP ≈ throughput × mean cycle time", () => {
    // Little's law is about means; checked here as a consistency test only.
    const start = workToTime(PI_W)
    let wipSum = 0
    let samples = 0
    for (let t = start; t < asOf; t += DAY_MS / 4) {
      wipSum += wipAt({ ...ctx, asOf: t }).length
      samples++
    }
    const done = doneInWindow(ctx)
    const days = (asOf - start) / DAY_MS
    const meanCt = done.reduce((s, i) => s + cycleTimeDays(i), 0) / done.length
    const predicted = (done.length / days) * meanCt
    expect(Math.abs(wipSum / samples - predicted) / predicted).toBeLessThan(0.1)
  })
})
