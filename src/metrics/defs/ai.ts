import { inScope, inWindow } from '../flow'
import type { MetricCompute } from '../types'

export const aiShare: MetricCompute = (ctx) => {
  const mrs = ctx.store.mrList.filter((m) => inScope(ctx, m.teamId) && inWindow(ctx, m.mergedAt))
  const ai = mrs.filter((m) => m.aiAssisted)
  return {
    value: mrs.length ? (100 * ai.length) / mrs.length : null,
    secondary: [
      { label: 'AI-assisted', value: ai.length },
      { label: 'merged', value: mrs.length },
    ],
    n: mrs.length,
    records: ai.map((m) => ({ id: m.id, teamId: m.teamId, label: m.itemId, to: m.mergedAt, value: 1, detail: `${m.size} lines` })),
  }
}

/**
 * Change failure rate of AI-assisted changes divided by that of other changes.
 * A change "failed" when an incident names it as the cause.
 */
export const aiCfrRatio: MetricCompute = (ctx) => {
  const deployed = ctx.store.mrList.filter((m) => inScope(ctx, m.teamId) && inWindow(ctx, m.deployedAt))
  const causes = new Set(ctx.store.incidentList.filter((i) => i.causeMrId && i.detectedAt <= ctx.asOf).map((i) => i.causeMrId!))
  const rate = (list: typeof deployed) => (list.length ? (100 * list.filter((m) => causes.has(m.id)).length) / list.length : null)
  const ai = deployed.filter((m) => m.aiAssisted)
  const other = deployed.filter((m) => !m.aiAssisted)
  const aiRate = rate(ai)
  const otherRate = rate(other)
  const failed = deployed.filter((m) => causes.has(m.id))
  return {
    value: aiRate !== null && otherRate ? aiRate / otherRate : null,
    secondary: [
      { label: 'AI CFR', value: aiRate, unit: '%' },
      { label: 'other CFR', value: otherRate, unit: '%' },
      { label: 'failed changes', value: failed.length },
    ],
    n: failed.length,
    records: failed.map((m) => ({ id: m.id, teamId: m.teamId, label: m.itemId, to: m.deployedAt, value: 1, detail: m.aiAssisted ? 'AI-assisted' : 'not AI-assisted' })),
  }
}
