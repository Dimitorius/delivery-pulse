import type { Iteration } from '../../domain/model'
import { inScope } from '../flow'
import { median } from '../stats'
import type { MetricCompute, MetricContext, MetricResult } from '../types'

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

export const SANDBAGGING_THRESHOLD = 95

export const sayDoRatio: MetricCompute = (ctx) => {
  const sprints = recentSprints(ctx).filter((s) => inScope(ctx, s.teamId!))
  let committed = 0
  let delivered = 0
  let items = 0
  const records = sprints.map((s) => {
    let c = 0
    let d = 0
    for (const id of s.committedItemIds) {
      const item = ctx.store.items.get(id)
      if (!item) continue
      const pts = item.points ?? 0
      if (pts > 0) items++
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
  // Possible sandbagging: every one of a team's last sprints above 95 %.
  const sandbagging = ctx.teamIds.filter((teamId) => {
    const own = records.filter((r) => r.teamId === teamId)
    return own.length >= SAY_DO_SPRINTS && own.every((r) => r.value > SANDBAGGING_THRESHOLD)
  })
  return {
    value: committed ? (100 * delivered) / committed : null,
    flags: sandbagging.length
      ? [`possible sandbagging: ${sandbagging.map((t) => ctx.store.teamById.get(t)?.key ?? t).join(', ')}`]
      : undefined,
    secondary: [
      { label: 'done pts', value: delivered },
      { label: 'committed pts', value: committed },
    ],
    n: items, // committed items with points — the sample behind the ratio
    recordValue: 'say/do %',
    records,
    note: sprints.length ? undefined : 'No closed sprints in scope (Kanban teams have none).',
  }
}

// ---- Stage 2 Scrum metrics --------------------------------------------------

export const GOAL_SPRINTS = 6

export const sprintGoalSuccess: MetricCompute = (ctx) => {
  const sprints = recentSprints(ctx, GOAL_SPRINTS).filter((s) => s.goalMet !== undefined)
  const met = sprints.filter((s) => s.goalMet)
  return {
    value: sprints.length ? (100 * met.length) / sprints.length : null,
    secondary: [
      { label: 'met', value: met.length },
      { label: 'sprints', value: sprints.length },
    ],
    n: sprints.length,
    records: sprints.map((s) => ({ id: s.id, teamId: s.teamId, label: s.goal ?? s.name, from: s.start, to: s.end, value: s.goalMet ? 1 : 0, detail: s.goalMet ? 'goal met' : 'goal missed' })),
    note: sprints.length ? undefined : 'No closed sprints in scope (Kanban teams have none).',
  }
}

export const carryOver: MetricCompute = (ctx) => {
  const sprints = recentSprints(ctx)
  let committed = 0
  let carried = 0
  const records = sprints.map((s) => {
    const open = s.committedItemIds.filter((id) => {
      const it = ctx.store.items.get(id)
      return it && (it.doneAt === undefined || it.doneAt > s.end)
    })
    committed += s.committedItemIds.length
    carried += open.length
    return { id: s.id, teamId: s.teamId, label: s.name, from: s.start, to: s.end, value: s.committedItemIds.length ? (100 * open.length) / s.committedItemIds.length : 0, detail: `${open.length} of ${s.committedItemIds.length} items not done` }
  })
  return {
    value: committed ? (100 * carried) / committed : null,
    secondary: [
      { label: 'not done', value: carried },
      { label: 'committed', value: committed },
    ],
    n: committed,
    recordValue: 'carry-over %',
    records,
    note: sprints.length ? undefined : 'No closed sprints in scope (Kanban teams have none).',
  }
}

/**
 * Unplanned items added to a sprint after planning vs the commitment. Work the
 * team pulled ahead from the backlog is not a scope change; it is shown apart.
 */
export const sprintScopeChange: MetricCompute = (ctx) => {
  const sprints = recentSprints(ctx)
  let committed = 0
  let added = 0
  let pulled = 0
  const records = sprints.map((s) => {
    const inSprint = ctx.store.itemList.filter((i) => i.sprintIds.includes(s.id))
    const plan = new Set(s.committedItemIds)
    const extra = inSprint.filter((i) => !plan.has(i.id))
    const unplanned = extra.filter((i) => !i.planned).length
    committed += plan.size
    added += unplanned
    pulled += extra.length - unplanned
    return { id: s.id, teamId: s.teamId, label: s.name, from: s.start, to: s.end, value: plan.size ? (100 * unplanned) / plan.size : 0, detail: `${unplanned} unplanned added to ${plan.size} committed` }
  })
  return {
    value: committed ? (100 * added) / committed : null,
    secondary: [
      { label: 'unplanned added', value: added },
      { label: 'committed', value: committed },
      { label: 'pulled ahead', value: pulled },
    ],
    n: committed,
    recordValue: 'change %',
    records,
    note: sprints.length ? undefined : 'No closed sprints in scope (Kanban teams have none).',
  }
}

/** Median story points completed per development sprint (last 3), summed over teams. */
export const velocity: MetricCompute = (ctx) => {
  let total = 0
  const records: MetricResult['records'] = []
  let teams = 0
  for (const teamId of ctx.teamIds) {
    const closed = ctx.store.iterationList.filter(
      (it) => it.kind === 'sprint' && !it.ip && it.teamId === teamId && it.closedAt !== undefined && it.closedAt <= ctx.asOf,
    )
    const last = closed.slice(-SAY_DO_SPRINTS)
    if (!last.length) continue
    const pts = last.map((s) =>
      ctx.store.itemList
        .filter((i) => i.sprintIds.includes(s.id) && i.doneAt !== undefined && i.doneAt > s.start && i.doneAt <= s.end)
        .reduce((a, i) => a + (i.points ?? 0), 0),
    )
    last.forEach((s, k) => records.push({ id: s.id, teamId, label: s.name, from: s.start, to: s.end, value: pts[k], detail: 'points completed' }))
    total += median(pts)!
    teams++
  }
  return {
    value: teams ? total : null,
    secondary: [{ label: 'teams', value: teams }],
    n: records.length,
    recordValue: 'points',
    records,
    note: teams ? undefined : 'No closed sprints in scope (Kanban teams have none).',
  }
}
