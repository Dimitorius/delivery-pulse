import { DAY_MS } from '../../sim/calendar'
import { inScope } from '../flow'
import type { MetricCompute } from '../types'

export const overdueDependencies: MetricCompute = (ctx) => {
  const open = ctx.store.dependencyList.filter(
    (d) =>
      (inScope(ctx, d.fromTeamId) || inScope(ctx, d.toTeamId)) &&
      d.createdAt <= ctx.asOf &&
      (d.resolvedAt === undefined || d.resolvedAt > ctx.asOf),
  )
  const overdue = open.filter((d) => d.needBy < ctx.asOf)
  return {
    value: overdue.length,
    secondary: [{ label: 'open', value: open.length }],
    n: open.length,
    recordValue: 'overdue d',
    records: overdue.map((d) => ({
      id: d.id,
      teamId: d.fromTeamId,
      label: `${d.fromItemId} needs ${d.toItemId}`,
      from: d.needBy,
      value: (ctx.asOf - d.needBy) / DAY_MS,
      detail: `${d.fromTeamId} ← ${d.toTeamId}`,
    })),
  }
}
