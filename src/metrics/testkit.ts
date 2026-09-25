// Tiny builder for hand-made event logs used by metric reference tests.

import type { NewWorkItem, SimEvent } from '../domain/events'
import type { StatusName, Team } from '../domain/model'
import { buildStore, type Store } from '../domain/store'
import { DAY_MS, HOUR_MS } from '../sim/calendar'
import type { MetricContext } from './types'

/** Monday 1 June 2026, 00:00 UTC. */
export const T0 = Date.UTC(2026, 5, 1)
export const day = (n: number) => T0 + n * DAY_MS
export const hours = (n: number) => n * HOUR_MS
/** Default evaluation instant: Monday 29 June 00:00 → window (T0, ASOF]. */
export const ASOF = day(28)

export const TEAM_A: Team = { id: 'a', key: 'A', name: 'Alpha', method: 'scrum', kind: 'stream', service: 'a-svc', devs: 5, qa: 1 }
export const TEAM_B: Team = { id: 'b', key: 'B', name: 'Beta', method: 'scrum', kind: 'stream', service: 'b-svc', devs: 5, qa: 1 }

type Body = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, 't'> : never) : never

export class Fixture {
  private events: SimEvent[] = []

  constructor(teams: Team[] = [TEAM_A, TEAM_B]) {
    this.at(day(-200), { type: 'program.defined', program: { id: 'p', name: 'Test' }, teams })
  }

  at(t: number, e: Body): this {
    this.events.push({ ...e, t } as SimEvent)
    return this
  }

  item(id: string, teamId: string, opts: Partial<NewWorkItem> & { createdAt?: number } = {}): this {
    const { createdAt, ...rest } = opts
    return this.at(createdAt ?? day(-100), {
      type: 'item.created',
      item: { id, teamId, type: 'story', title: id, planned: true, flowType: 'feature', investment: 'feature', ...rest },
    })
  }

  status(id: string, to: StatusName, t: number): this {
    return this.at(t, { type: 'item.status', itemId: id, to })
  }

  /** Item that starts at `start` and (optionally) reaches Done at `end`. */
  flow(id: string, teamId: string, start: number, end?: number, opts: Partial<NewWorkItem> = {}): this {
    this.item(id, teamId, opts).status(id, 'In Progress', start)
    return end === undefined ? this : this.status(id, 'Done', end)
  }

  block(id: string, from: number, to?: number): this {
    this.at(from, { type: 'item.blocked', itemId: id, reason: 'external' })
    return to === undefined ? this : this.at(to, { type: 'item.unblocked', itemId: id })
  }

  store(): Store {
    const sorted = this.events.map((e, i) => [e, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    return buildStore(sorted.map(([e]) => e))
  }
}

export function ctxFor(store: Store, teamIds: string[] = ['a', 'b'], asOf = ASOF, windowDays = 28): MetricContext {
  return { store, asOf, teamIds, windowDays }
}
