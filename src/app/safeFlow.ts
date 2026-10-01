// The six SAFe flow metrics on the Scale tab, under their SAFe names. They are
// the same registry metrics (same compute, same page) — the name comes from the
// metric's `aka.safe`, so nothing is duplicated.

import { METRIC_BY_ID, type MetricDef } from '../metrics/registry'

export const SAFE_FLOW_IDS = ['flow-distribution', 'throughput', 'lead-time', 'wip', 'flow-efficiency', 'pi-predictability'] as const

export const SAFE_FLOW: MetricDef[] = SAFE_FLOW_IDS.map((id) => {
  const def = METRIC_BY_ID.get(id)
  if (!def?.aka?.safe) throw new Error(`SAFe flow metric ${id} needs aka.safe in its registry YAML`)
  return def
})
