import { describe, expect, it } from 'vitest'
import { buildStore } from '../domain/store'
import { HISTORY_W, workToTime } from '../sim/calendar'
import { Simulator } from '../sim/simulator'
import { METRICS, windowOf } from './registry'

// Statuses are read at past ticks (hysteresis on simulated time): a metric as
// of time t must depend only on events up to t, whatever happened after.
describe('every metric depends only on events up to its asOf', () => {
  const asW = HISTORY_W + 37
  const exact = buildStore(new Simulator().advanceToWork(asW))
  const later = buildStore(new Simulator().advanceToWork(asW + 80))
  const asOf = workToTime(asW)

  for (const teamIds of [exact.teams.map((t) => t.id), ['checkout'], ['platform']]) {
    it(`same value and sample for ${teamIds.length > 1 ? 'the program' : teamIds[0]}`, () => {
      const diff = METRICS.flatMap((def) => {
        const a = def.compute({ store: exact, asOf, teamIds, windowDays: windowOf(def) })
        const b = def.compute({ store: later, asOf, teamIds, windowDays: windowOf(def) })
        return a.value === b.value && a.n === b.n ? [] : [`${def.id}: ${a.value}/${a.n} vs ${b.value}/${b.n}`]
      })
      expect(diff).toEqual([])
    })
  }
})
