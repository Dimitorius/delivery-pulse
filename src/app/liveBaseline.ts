// Live-tail check used by tests and dev scripts: run the simulator through the
// whole live PI 4 exactly as the worker does (any step size gives the same
// events) and record the PI forecast and the Pulse tile statuses.

import { apply, buildStore, type Store } from '../domain/store'
import { COMPUTE } from '../metrics/defs'
import { HISTORY_W, PI_W, workToTime } from '../sim/calendar'
import { Simulator } from '../sim/simulator'
import { PROGRAM_SCOPE, computePulse } from './pulse'

export interface LiveCheck {
  store: Store
  /** PI forecast (%) every `forecastStepW` working hours through PI 4. */
  forecasts: { w: number; value: number | null }[]
  /** Pulse tiles off target, with the working hour they were seen. */
  offTarget: { w: number; id: string }[]
  nearLimit: { w: number; id: string }[]
}

export function checkLivePi(seed?: number, forecastStepW = 4, tileStepW = 8): LiveCheck {
  const sim = new Simulator(seed)
  const store = buildStore(sim.advanceToWork(HISTORY_W))
  const teamIds = store.teams.map((t) => t.id)
  const forecasts: LiveCheck['forecasts'] = []
  const offTarget: LiveCheck['offTarget'] = []
  const nearLimit: LiveCheck['nearLimit'] = []
  for (let w = HISTORY_W; w < HISTORY_W + PI_W; w += forecastStepW) {
    for (const e of sim.advanceToWork(w)) apply(store, e)
    const asOf = workToTime(w)
    forecasts.push({ w, value: COMPUTE['pi-forecast']({ store, asOf, teamIds, windowDays: 28 }).value })
    if ((w - HISTORY_W) % tileStepW === 0) {
      for (const t of computePulse(store, asOf, PROGRAM_SCOPE).tiles) {
        if (t.status === 'bad') offTarget.push({ w, id: t.def.id })
        if (t.status === 'warn') nearLimit.push({ w, id: t.def.id })
      }
    }
  }
  return { store, forecasts, offTarget, nearLimit }
}
