import type { Iteration } from '../../domain/model'
import { inScope } from '../flow'
import type { MetricCompute, MetricContext } from '../types'

export const SAY_DO_SPRINTS = 3

/** The last N sprints (per team) closed at or before asOf. */
export function recentSprints(ctx: MetricContext, count = SAY_DO_SPRINTS): Iteration[] {
  const out: Iteration[] = []
  for (const teamId of ctx.teamIds) {
    const closed = ctx.store.iterationList.filter(
      (it) => it.kind === 'sprint' && it.teamId === teamId && it.closedAt !== undefined && it.closedAt <= ctx.asOf,
    )
    out.push(...closed.slice(-count))
  }
  return out
}

export const sayDoRatio: MetricCompute = (ctx) => {
  const sprints = recentSprints(ctx).filter((s) => inScope(ctx, s.teamId!))
  let committed = 0
  let delivered = 0
  const records = sprints.map((s) => {
    let c = 0
    let d = 0
    for (const id of s.committedItemIds) {
      const item = ctx.store.items.get(id)
      if (!item) continue
      const pts = item.points ?? 0
      c += pts
      if (item.doneAt !== undefined && item.doneAt <= s.end) d += pts
    }
    committed += c
    delivered += d
    return {
      id: s.id,
      teamId: s.teamId,
      label: s.name,
      from: s.start,
      to: s.end,
      value: c ? (100 * d) / c : 0,
      detail: `${d} of ${c} points`,
    }
  })
  return {
    value: committed ? (100 * delivered) / committed : null,
    secondary: [
      { label: 'done pts', value: delivered },
      { label: 'committed pts', value: committed },
    ],
    n: sprints.length,
    records,
    note: sprints.length ? undefined : 'No closed sprints in scope (Kanban teams have none).',
  }
}
