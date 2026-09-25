// Everything the Pulse screen shows, computed from the projection store.
// Past weekly points are immutable (they only read events ≤ their asOf), so
// they are cached; only the "now" point is recomputed on every clock tick.

import type { Store } from '../domain/store'
import { evaluate, type Status } from '../metrics/evaluate'
import { METRICS, type MetricDef } from '../metrics/registry'
import type { MetricResult } from '../metrics/types'
import { xmrCheck } from '../metrics/xmr'
import { SIM_EPOCH, WEEK_MS } from '../sim/calendar'

export const WINDOW_DAYS = 28
export const TREND_WEEKS = 12
export const XMR_WEEKS = 20

export interface TileData {
  def: MetricDef
  result: MetricResult
  status: Status
  /** Rolling-window value at each of the last week boundaries, then now. */
  trend: (number | null)[]
}

export interface Signal {
  id: string
  metricId: string
  kind: 'xmr' | 'aging' | 'dependency'
  severity: 'warn' | 'bad'
  title: string
  detail: string
}

export interface PulseData {
  asOf: number
  teamIds: string[]
  forecast?: TileData
  tiles: TileData[]
  signals: Signal[]
}

export const PROGRAM_SCOPE = 'program'

export function scopeTeams(store: Store, scope: string): string[] {
  return scope === PROGRAM_SCOPE ? store.teams.map((t) => t.id) : [scope]
}

export function weekAnchor(t: number): number {
  return SIM_EPOCH + Math.floor((t - SIM_EPOCH) / WEEK_MS) * WEEK_MS
}

const caches = new WeakMap<Store, Map<string, number | null>>()

export function pointAt(def: MetricDef, store: Store, asOf: number, teamIds: string[], windowDays: number): number | null {
  let cache = caches.get(store)
  if (!cache) caches.set(store, (cache = new Map()))
  const key = `${def.id}|${teamIds.join(',')}|${asOf}|${windowDays}`
  if (cache.has(key)) return cache.get(key)!
  const v = def.compute({ store, asOf, teamIds, windowDays }).value
  if (asOf <= store.now) cache.set(key, v)
  return v
}

/** Values at the last `weeks` week boundaries (oldest first), each over `windowDays`. */
export function weeklySeries(def: MetricDef, store: Store, asOf: number, teamIds: string[], weeks: number, windowDays: number) {
  const anchor = weekAnchor(asOf)
  const out: { t: number; v: number | null }[] = []
  for (let k = weeks - 1; k >= 0; k--) {
    const t = anchor - k * WEEK_MS
    if (t <= SIM_EPOCH) continue
    out.push({ t, v: pointAt(def, store, t, teamIds, windowDays) })
  }
  return out
}

export function computeTile(def: MetricDef, store: Store, asOf: number, teamIds: string[]): TileData {
  const result = def.compute({ store, asOf, teamIds, windowDays: WINDOW_DAYS })
  const trend = [...weeklySeries(def, store, asOf, teamIds, TREND_WEEKS, WINDOW_DAYS).map((p) => p.v), result.value]
  return { def, result, status: evaluate(result.value, def.target, teamIds.length), trend }
}

const RULE_TEXT = { 'beyond-limit': 'outside natural process limits', 'run-of-8': '8 weeks in a row on one side of the centre' }

export function computeSignals(store: Store, asOf: number, teamIds: string[], tiles: TileData[]): Signal[] {
  const out: Signal[] = []
  for (const tile of tiles) {
    const { def } = tile
    if (def.xmr) {
      const series = weeklySeries(def, store, asOf, teamIds, XMR_WEEKS, 7)
        .map((p) => p.v)
        .filter((v): v is number => v !== null)
      for (const f of xmrCheck(series).findings) {
        const worse =
          def.direction === 'neutral' ||
          (def.direction === 'lower-better' && f.side === 'above') ||
          (def.direction === 'higher-better' && f.side === 'below')
        if (!worse) continue
        out.push({
          id: `xmr:${def.id}:${f.rule}`,
          metricId: def.id,
          kind: 'xmr',
          severity: f.rule === 'beyond-limit' && def.direction !== 'neutral' ? 'bad' : 'warn',
          title: `${def.name} ${f.side === 'above' ? '↑' : '↓'}`,
          detail: `Last full week ${RULE_TEXT[f.rule]} (XmR)`,
        })
      }
    }
    if (def.id === 'aging-wip') {
      for (const r of tile.result.records) {
        out.push({
          id: `aging:${r.id}`,
          metricId: def.id,
          kind: 'aging',
          severity: 'warn',
          title: `${r.id} aging ${r.value.toFixed(1)} d`,
          detail: `${r.detail} — older than its team's 85th percentile`,
        })
      }
    }
    if (def.id === 'overdue-dependencies') {
      for (const r of tile.result.records) {
        out.push({
          id: `dep:${r.id}`,
          metricId: def.id,
          kind: 'dependency',
          severity: 'bad',
          title: `${r.label}`,
          detail: `Dependency overdue by ${r.value.toFixed(1)} d (${r.detail})`,
        })
      }
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'bad' ? -1 : 1))
}

export function computePulse(store: Store, asOf: number, scope: string): PulseData {
  const teamIds = scopeTeams(store, scope)
  const all = METRICS.map((def) => computeTile(def, store, asOf, teamIds))
  const forecast = all.find((t) => t.def.column === 'forecast')
  const tiles = all.filter((t) => t.def.column !== 'forecast')
  return { asOf, teamIds, forecast, tiles, signals: computeSignals(store, asOf, teamIds, tiles) }
}
