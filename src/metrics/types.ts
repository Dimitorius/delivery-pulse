import type { Store } from '../domain/store'

export interface MetricContext {
  store: Store
  /** Evaluate the metric as of this instant (epoch ms). */
  asOf: number
  /** Teams in scope. Percentiles are computed over the union of their samples. */
  teamIds: readonly string[]
  /** Rolling window length for windowed metrics. */
  windowDays: number
}

/** One contributing record — the "source events" behind a number. */
export interface TraceRecord {
  id: string
  teamId?: string
  label: string
  from?: number
  to?: number
  value: number
  detail?: string
}

export interface MetricResult {
  value: number | null
  secondary?: { label: string; value: number | null; unit?: string }[]
  /** Sample size the value was computed from. */
  n: number
  records: TraceRecord[]
  note?: string
}

export type MetricCompute = (ctx: MetricContext) => MetricResult
