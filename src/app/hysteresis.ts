// Status hysteresis on simulated time (review 30.09: identical at 1×, 10× and
// 100×). A status "update" is one tick of the simulation clock — one working
// hour. The status is read at every tick boundary; the shown status is the
// status of the most recent run of HYSTERESIS_TICKS equal readings. That is a
// pure function of simulated time, so it does not depend on how often the
// screen refreshes. While a different status is not yet confirmed, the tile
// and the signal say so ("confirming 1/3") instead of contradicting the value.

import type { Store } from '../domain/store'
import { statusFor, type Status } from '../metrics/evaluate'
import { windowOf, type MetricDef } from '../metrics/registry'
import { timeToWork, workToTime } from '../sim/calendar'

export const HYSTERESIS_TICKS = 3
/** Readings looked back when the status keeps flipping (one working week). */
export const HYSTERESIS_LOOKBACK = 40
/** Tick length in working hours: the simulator's hourly tick. */
export const STATUS_TICK_W = 1

export function statusTick(t: number): number {
  return Math.floor(timeToWork(t) / STATUS_TICK_W)
}

export function tickTime(k: number): number {
  return workToTime(k * STATUS_TICK_W)
}

const SEVERITY: Record<Status, number> = { bad: 4, warn: 3, low: 2, none: 1, ok: 0 }

export interface Stable<S> {
  shown: S
  /** A different current status, seen on `count` consecutive ticks so far (< HYSTERESIS_TICKS). */
  pending?: { status: S; count: number }
}

/**
 * Shown status at tick `k` from the readings at ticks ≤ k: the status of the
 * latest run of `ticks` equal readings. If the readings flip for the whole
 * lookback, the most severe reading of that window is shown (no blinking).
 * `current` is the status of the value on screen right now (between ticks);
 * when it differs from the shown status the result carries `pending`.
 */
export function stableAt<S extends Status>(
  read: (k: number) => S,
  k: number,
  current: S = read(k),
  ticks = HYSTERESIS_TICKS,
  lookback = HYSTERESIS_LOOKBACK,
): Stable<S> {
  const seen: S[] = [] // seen[i] = read(k - i)
  const at = (i: number) => (seen[i] ??= read(k - i))
  let shown: S | undefined
  for (let j = 0; j + ticks - 1 < lookback && shown === undefined; j++) {
    let run = true
    for (let i = 1; i < ticks && run; i++) run = at(j + i) === at(j)
    if (run) shown = at(j)
  }
  if (shown === undefined) {
    shown = at(0)
    for (let i = 1; i < lookback; i++) if (SEVERITY[at(i)] > SEVERITY[shown]) shown = at(i)
  }
  if (current === shown) return { shown }
  let count = 0
  while (count < ticks - 1 && at(count) === current) count++
  return { shown, pending: { status: current, count } }
}

/** Readings per metric and scope, cached per tick (past ticks never change: metrics only read events ≤ asOf). */
export class StatusBook {
  private readings = new Map<string, Map<number, Status>>()

  constructor(private readonly store: Store) {}

  reading(def: MetricDef, teamIds: string[], k: number): Status {
    const key = `${def.id}|${teamIds.join(',')}`
    let m = this.readings.get(key)
    if (!m) this.readings.set(key, (m = new Map()))
    const hit = m.get(k)
    if (hit !== undefined) return hit
    const asOf = tickTime(k)
    const s = statusFor(def, def.compute({ store: this.store, asOf, teamIds, windowDays: windowOf(def) }), teamIds.length)
    if (asOf <= this.store.now) {
      m.set(k, s)
      if (m.size > 4 * HYSTERESIS_LOOKBACK) for (const old of m.keys()) if (old < k - 2 * HYSTERESIS_LOOKBACK) m.delete(old)
    }
    return s
  }

  /** Stabilised status of `def` at time `now`, given the status of its current value. */
  stable(def: MetricDef, teamIds: string[], now: number, current: Status): Stable<Status> {
    return stableAt((k) => this.reading(def, teamIds, k), statusTick(now), current)
  }
}
