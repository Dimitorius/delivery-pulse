// Scenario check used by tests and scripts/scenarios.ts: run the curated
// history twice from the same seed — once as calibrated (control), once with
// the scenario injected at `injectW` — and find when each signal metric
// first moves away from the control run in its "worse" direction.
//
// "Reacts" = the scenario run is worse than the control run at the same
// moment by at least `threshold` (25 % of the control value, see below), at
// two checks in a row (8 working hours), so one noisy point is not a reaction.

import { apply, buildStore, type Store } from '../domain/store'
import { PLAYBOOK_BY_ID } from '../content/symptoms'
import { COMPUTE } from '../metrics/defs'
import { METRIC_BY_ID, windowOf } from '../metrics/registry'
import { HISTORY_W, HOURS_PER_DAY, PI_W, SPRINT_W, workToTime } from '../sim/calendar'
import { SCENARIO_BY_ID, type SignalRef } from '../sim/scenarios'
import { Simulator } from '../sim/simulator'

/** Default injection point: day 1 of the 2nd sprint of PI 5 (a live PI, mid-flow). */
export const INJECT_W = HISTORY_W + PI_W + SPRINT_W

export const REL = 0.25
const STEP_W = 4

export interface SignalReaction {
  id: string
  group: 'early' | 'confirming'
  worse: 'up' | 'down'
  /** Working days after injection when the signal reacted; null = not within the horizon. */
  days: number | null
  control: number | null
  scenario: number | null
}

/** Early and confirming signals: the symptom's content file when it exists, otherwise the scenario's own list. */
export function scenarioSignals(id: string): { early: SignalRef[]; confirming: SignalRef[]; fromContent: boolean } {
  const sc = SCENARIO_BY_ID.get(id)!
  const pb = PLAYBOOK_BY_ID.get(id)
  if (pb && pb.earlySignals.length && pb.confirmingSignals.length) {
    const own = (x: { id: string }) => [...sc.early, ...sc.confirming].find((s) => s.id === x.id)?.worse
    return {
      early: pb.earlySignals.map((x) => ({ id: x.id, worse: own(x) })),
      confirming: pb.confirmingSignals.map((x) => ({ id: x.id, worse: own(x) })),
      fromContent: true,
    }
  }
  return { early: sc.early, confirming: sc.confirming, fromContent: false }
}

export function worseDirection(s: SignalRef): 'up' | 'down' {
  if (s.worse) return s.worse
  return METRIC_BY_ID.get(s.id)?.direction === 'higher-better' ? 'down' : 'up'
}

/**
 * How far the scenario run must be worse than the control run to count.
 * Relative to the control value — or, for a "higher is better" percentage
 * above 80 % (Say/Do, build success, SLO, forecast), relative to its shortfall
 * from 100 %, so 97 % → 94 % counts as much as 3 → 6 incidents. Floors: 2 points
 * for a percentage, 2 for a count (never more than the base itself).
 */
export function threshold(id: string, worse: 'up' | 'down', control: number): number {
  const unit = METRIC_BY_ID.get(id)?.unit ?? ''
  const shortfall = worse === 'down' && unit === '%' && control > 80
  const base = shortfall ? 100 - control : Math.abs(control)
  const floor = unit === '%' || ['items', 'epics', '/wk'].includes(unit) ? 2 : 0
  return Math.max(REL * base, Math.min(floor, base))
}

function value(store: Store, id: string, w: number): number | null {
  const def = METRIC_BY_ID.get(id)!
  return COMPUTE[id]({ store, asOf: workToTime(w), teamIds: store.teams.map((t) => t.id), windowDays: windowOf(def) }).value
}

export function checkScenario(id: string, opts: { injectW?: number; days?: number; seed?: number; signals?: { early: SignalRef[]; confirming: SignalRef[] } } = {}): SignalReaction[] {
  const injectW = opts.injectW ?? INJECT_W
  const endW = injectW + (opts.days ?? CHECK_DAYS) * HOURS_PER_DAY
  const control = new Simulator(opts.seed)
  const test = new Simulator(opts.seed)
  const a = buildStore(control.advanceToWork(injectW))
  const b = buildStore(test.advanceToWork(injectW))
  test.inject(id)
  const { early, confirming } = opts.signals ?? scenarioSignals(id)
  const signals = [...early.map((s) => ({ s, group: 'early' as const })), ...confirming.map((s) => ({ s, group: 'confirming' as const }))]
  const out: SignalReaction[] = signals.map(({ s, group }) => ({ id: s.id, group, worse: worseDirection(s), days: null, control: null, scenario: null }))
  const streak = new Map<string, number>()
  for (let w = injectW + STEP_W; w <= endW; w += STEP_W) {
    for (const e of control.advanceToWork(w)) apply(a, e)
    for (const e of test.advanceToWork(w)) apply(b, e)
    for (const r of out) {
      if (r.days !== null) continue
      const va = value(a, r.id, w)
      const vb = value(b, r.id, w)
      if (va === null || vb === null) continue
      const delta = r.worse === 'up' ? vb - va : va - vb
      const hit = delta > 0 && delta >= threshold(r.id, r.worse, va)
      const n = hit ? (streak.get(r.id) ?? 0) + 1 : 0
      streak.set(r.id, n)
      if (n >= 2) {
        r.days = (w - STEP_W - injectW) / HOURS_PER_DAY
        r.control = va
        r.scenario = vb
      }
    }
    if (out.every((r) => r.days !== null)) break
  }
  return out
}

/** Injection points checked by the tests: a sprint start early in the live tail and one in a later PI, mid-sprint. */
export const INJECT_POINTS = [
  { label: 'PI 5 S2', w: INJECT_W },
  { label: 'PI 9 S3+3d', w: HISTORY_W + 5 * PI_W + 2 * SPRINT_W + 3 * HOURS_PER_DAY },
]

/** Horizon of the check: 40 working days (8 weeks) after injection. */
export const CHECK_DAYS = 40

/**
 * The scenario's promise: every early signal and every confirming signal moves
 * within the horizon, the first early signal moves before the first confirming
 * one, and on average early signals move earlier.
 */
export function leadsLag(rs: SignalReaction[]): boolean {
  const early = rs.filter((r) => r.group === 'early').map((r) => r.days)
  const conf = rs.filter((r) => r.group === 'confirming').map((r) => r.days)
  if ([...early, ...conf].some((d) => d === null)) return false
  const e = early as number[]
  const c = conf as number[]
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.min(...e) < Math.min(...c) && mean(e) < mean(c)
}
