// Metric metadata from registry/metrics/*.yaml joined with compute functions.

import sourcesYaml from '../../registry/sources.yaml'
import { COMPUTE } from './defs'
import type { MetricCompute } from './types'

export type Column = 'lagging' | 'current' | 'leading' | 'forecast'
export type Direction = 'lower-better' | 'higher-better' | 'neutral'

export interface Source {
  key: string
  title: string
  publisher: string
  year?: number
  url?: string
  altUrl?: string
}

export interface Target {
  op?: '<=' | '>=' | 'range'
  value?: number
  warn?: number
  /** op = range: [min, max] is on target, below warnMin is off target, anything else near the limit. */
  min?: number
  max?: number
  warnMin?: number
  /** "team": thresholds scale with the number of teams in scope. */
  per?: 'team'
  note: string
}

export interface MetricMeta {
  id: string
  order: number
  name: string
  short: string
  domain: string
  column: Column
  levels: string[]
  source: string
  unit: string
  format: 'number' | 'signed'
  decimals: number
  direction: Direction
  window: string
  question: string
  definition: string
  formula: string
  events: string[]
  target: Target
  benchmark: Benchmark<Source>
  /** How many secondary values the tile shows (default 1). */
  tileSecondary?: number
  /** Below this sample size the value is shown as low confidence and not coloured. */
  minSample?: number
  xmr: boolean
}

export type BenchmarkKind = 'research' | 'disputed' | 'team-goal' | 'method' | 'by-design'

export interface Benchmark<S> {
  kind: BenchmarkKind
  label: string
  summary: string
  note?: string
  flag?: string
  sources: S[]
  positions?: { label: string; summary: string; sources: S[] }[]
}

export interface MetricDef extends MetricMeta {
  compute: MetricCompute
}

type RawMeta = Omit<MetricMeta, 'benchmark'> & { benchmark: Benchmark<string> }

export const SOURCES: Record<string, Source> = Object.fromEntries(
  Object.entries(sourcesYaml as Record<string, Omit<Source, 'key'>>).map(([key, s]) => [key, { key, ...s }]),
)

const files = import.meta.glob<{ default: RawMeta }>('../../registry/metrics/*.yaml', { eager: true })

export const RAW_METRICS: RawMeta[] = Object.values(files).map((m) => m.default)

function resolve(metricId: string, keys: string[]): Source[] {
  return keys.map((k) => {
    const s = SOURCES[k]
    if (!s) throw new Error(`Metric ${metricId}: unknown source "${k}"`)
    return s
  })
}

export const METRICS: MetricDef[] = RAW_METRICS.map((m) => ({
  ...m,
  benchmark: {
    ...m.benchmark,
    sources: resolve(m.id, m.benchmark.sources),
    positions: m.benchmark.positions?.map((p) => ({ ...p, sources: resolve(m.id, p.sources) })),
  },
  compute: COMPUTE[m.id],
})).sort((a, b) => a.order - b.order)

export const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]))
