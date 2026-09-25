// Everything the Pulse screen shows, computed from the projection store.
// Past weekly points are immutable (they only read events ≤ their asOf), so
// they are cached; only the "now" point is recomputed on every clock tick.

import type { Store } from '../domain/store'
import { statusFor, targetLabel, type Status } from '../metrics/evaluate'
import { METRICS, windowOf, type MetricDef } from '../metrics/registry'
import type { MetricResult } from '../metrics/types'
import { xmrCheck } from '../metrics/xmr'
import { SIM_EPOCH, WEEK_MS } from '../sim/calendar'
import { fmtValue } from './format'
import type { Stabilizer } from './hysteresis'

export { DEFAULT_WINDOW_DAYS as WINDOW_DAYS } from '../metrics/registry'
export const TREND_WEEKS = 12
export const XMR_WEEKS = 20

export interface TileData {
  def: MetricDef
  result: MetricResult
  status: Status
  /** Rolling-window value at each of the last week boundaries, then now. */
  trend: (number | null)[]
}

/** A process signal: an XmR rule fired, or a metric is off its target. Counted in the header. */
export interface Signal {
  id: string
  metricId: string
  kind: 'xmr' | 'target'
  severity: 'warn' | 'bad'
  title: string
  detail: string
}

/** A single work item or dependency worth a look (not a process signal). */
export interface WatchItem {
  id: string
  metricId: string
  kind: 'aging' | 'dependency'
  severity: 'warn' | 'bad'
  title: string
  detail: string
}

export interface PulseData {
  asOf: number
  teamIds: string[]
  forecast?: TileData
  tiles: TileData[]
  /** XmR findings on the raw data (target signals are added after stabilisation). */
  xmr: Signal[]
  watch: WatchItem[]
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
  const result = def.compute({ store, asOf, teamIds, windowDays: windowOf(def) })
  const trend = [...weeklySeries(def, store, asOf, teamIds, TREND_WEEKS, windowOf(def)).map((p) => p.v), result.value]
  return { def, result, status: statusFor(def, result, teamIds.length), trend }
}

const RULE_TEXT = { 'beyond-limit': 'outside natural process limits', 'run-of-8': '8 weeks in a row on one side of the centre' }

export function computeXmrSignals(store: Store, asOf: number, teamIds: string[], tiles: TileData[]): Signal[] {
  const out: Signal[] = []
  for (const tile of tiles) {
    const { def } = tile
    if (!def.xmr || tile.status === 'low') continue
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
  return out
}

export function computeWatchItems(tiles: TileData[]): WatchItem[] {
  const out: WatchItem[] = []
  for (const tile of tiles) {
    if (tile.def.id === 'aging-wip') {
      for (const r of tile.result.records) {
        out.push({
          id: `aging:${r.id}`,
          metricId: tile.def.id,
          kind: 'aging',
          severity: 'warn',
          title: `${r.id} aging ${r.value.toFixed(1)} d`,
          detail: `${r.detail} — older than its team's 85th percentile`,
        })
      }
    }
    if (tile.def.id === 'overdue-dependencies') {
      for (const r of tile.result.records) {
        out.push({
          id: `dep:${r.id}`,
          metricId: tile.def.id,
          kind: 'dependency',
          severity: 'bad',
          title: r.label,
          detail: `Dependency overdue by ${r.value.toFixed(1)} d (${r.detail})`,
        })
      }
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'bad' ? -1 : 1))
}

/** Target signals: tiles whose (stabilised) status is off target. */
export function targetSignals(tiles: TileData[], teams: number): Signal[] {
  return tiles
    .filter((t) => t.status === 'bad')
    .map((t) => ({
      id: `target:${t.def.id}`,
      metricId: t.def.id,
      kind: 'target' as const,
      severity: 'bad' as const,
      title: `${t.def.name} off target`,
      detail: `${fmtValue(t.def, t.result.value)} ${t.def.unit === 'items' ? '' : t.def.unit} vs target ${targetLabel(t.def.target, t.def.unit, teams)}`,
    }))
}

export function computePulse(store: Store, asOf: number, scope: string): PulseData {
  const teamIds = scopeTeams(store, scope)
  const all = METRICS.filter((m) => m.pulse).map((def) => computeTile(def, store, asOf, teamIds))
  const forecast = all.find((t) => t.def.column === 'forecast')
  const tiles = all.filter((t) => t.def.column !== 'forecast')
  const xmr = computeXmrSignals(store, asOf, teamIds, tiles)
  const signals = [...targetSignals(forecast ? [forecast, ...tiles] : tiles, teamIds.length), ...xmr]
  return { asOf, teamIds, forecast, tiles, xmr, watch: computeWatchItems(tiles), signals }
}

/**
 * Apply status hysteresis (per scope and metric) and rebuild the signal list
 * from the stabilised statuses, so tiles and the header counter always agree.
 */
export function stabilizePulse(p: PulseData, scope: string, tick: number, st: Stabilizer<Status>): PulseData {
  const fix = (t: TileData): TileData => ({ ...t, status: st.apply(`${scope}|${t.def.id}`, t.status, tick) })
  const tiles = p.tiles.map(fix)
  const forecast = p.forecast ? fix(p.forecast) : undefined
  const signals = [...targetSignals(forecast ? [forecast, ...tiles] : tiles, p.teamIds.length), ...p.xmr]
  return { ...p, tiles, forecast, signals }
}
