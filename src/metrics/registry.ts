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
}

export interface Target {
  op?: '<=' | '>='
  value?: number
  warn?: number
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
  benchmark: { summary: string; flag?: string; sources: Source[] }
  xmr: boolean
}

export interface MetricDef extends MetricMeta {
  compute: MetricCompute
}

type RawMeta = Omit<MetricMeta, 'benchmark'> & { benchmark: { summary: string; flag?: string; sources: string[] } }

export const SOURCES: Record<string, Source> = Object.fromEntries(
  Object.entries(sourcesYaml as Record<string, Omit<Source, 'key'>>).map(([key, s]) => [key, { key, ...s }]),
)

const files = import.meta.glob<{ default: RawMeta }>('../../registry/metrics/*.yaml', { eager: true })

export const RAW_METRICS: RawMeta[] = Object.values(files).map((m) => m.default)

export const METRICS: MetricDef[] = RAW_METRICS.map((m) => ({
  ...m,
  benchmark: {
    ...m.benchmark,
    sources: m.benchmark.sources.map((k) => {
      const s = SOURCES[k]
      if (!s) throw new Error(`Metric ${m.id}: unknown source "${k}"`)
      return s
    }),
  },
  compute: COMPUTE[m.id],
})).sort((a, b) => a.order - b.order)

export const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]))
