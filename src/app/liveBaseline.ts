// Live-tail check used by tests and dev scripts: run the simulator through
// the live PIs exactly as the worker does (any step size gives the same
// events) and record the PI forecast and the Pulse tile statuses.

import { apply, buildStore, type Store } from '../domain/store'
import { COMPUTE } from '../metrics/defs'
import { HISTORY_W, PI_W, workToTime } from '../sim/calendar'
import { Simulator } from '../sim/simulator'
import { PROGRAM_SCOPE, computePulse } from './pulse'

/** Live PIs checked by default: PI 4 … PI 14, about two years at 100×. */
export const LIVE_PIS = 11

export interface LiveCheck {
  store: Store
  /** PI forecast (%) every `forecastStepW` working hours; `pi` = 4 for the first live PI. */
  forecasts: { w: number; pi: number; value: number | null }[]
  /** Pulse tiles off target (raw status, before hysteresis), with the working hour they were seen. */
  offTarget: { w: number; id: string }[]
  nearLimit: { w: number; id: string }[]
  tileChecks: number
}

export function checkLivePi(seed?: number, pis = LIVE_PIS, forecastStepW = 4, tileStepW = 8): LiveCheck {
  const sim = new Simulator(seed)
  const store = buildStore(sim.advanceToWork(HISTORY_W))
  const teamIds = store.teams.map((t) => t.id)
  const out: LiveCheck = { store, forecasts: [], offTarget: [], nearLimit: [], tileChecks: 0 }
  for (let w = HISTORY_W; w < HISTORY_W + pis * PI_W; w += forecastStepW) {
    for (const e of sim.advanceToWork(w)) apply(store, e)
    const asOf = workToTime(w)
    const pi = 4 + Math.floor((w - HISTORY_W) / PI_W)
    out.forecasts.push({ w, pi, value: COMPUTE['pi-forecast']({ store, asOf, teamIds, windowDays: 28 }).value })
    if ((w - HISTORY_W) % tileStepW === 0) {
      for (const t of computePulse(store, asOf, PROGRAM_SCOPE).tiles) {
        out.tileChecks++
        if (t.status === 'bad') out.offTarget.push({ w, id: t.def.id })
        if (t.status === 'warn') out.nearLimit.push({ w, id: t.def.id })
      }
    }
  }
  return out
}

/** Start and minimum of the forecast per live PI. */
export function forecastByPi(live: LiveCheck): { pi: number; start: number; min: number }[] {
  const rows = new Map<number, { pi: number; start: number; min: number }>()
  for (const f of live.forecasts) {
    const v = f.value ?? 0
    const r = rows.get(f.pi)
    if (!r) rows.set(f.pi, { pi: f.pi, start: v, min: v })
    else r.min = Math.min(r.min, v)
  }
  return [...rows.values()]
}
