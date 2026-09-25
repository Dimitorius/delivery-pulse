import { DAY_MS, workingDaysBetween } from '../../sim/calendar'
import { inScope, inWindow, isFlowItem } from '../flow'
import { percentile } from '../stats'
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

// ---- Stage 2 program metrics ------------------------------------------------

export const dependencyLeadTime: MetricCompute = (ctx) => {
  const deps = ctx.store.dependencyList.filter((d) => (inScope(ctx, d.fromTeamId) || inScope(ctx, d.toTeamId)) && inWindow(ctx, d.resolvedAt))
  const days = deps.map((d) => (d.resolvedAt! - d.createdAt) / DAY_MS)
  return {
    value: percentile(days, 50),
    secondary: [{ label: 'P85', value: percentile(days, 85), unit: 'd' }],
    n: deps.length,
    recordValue: 'days',
    records: deps.map((d, k) => ({ id: d.id, teamId: d.fromTeamId, label: `${d.fromItemId} needs ${d.toItemId}`, from: d.createdAt, to: d.resolvedAt, value: days[k], detail: d.resolvedAt! > d.needBy ? 'late' : 'on time' })),
  }
}

/** Milestones due in the window: reached on or before the due date. */
export const milestoneHitRate: MetricCompute = (ctx) => {
  const due = ctx.store.milestoneList.filter((m) => inWindow(ctx, m.due))
  const hit = due.filter((m) => m.achievedAt !== undefined && m.achievedAt <= m.due)
  return {
    value: due.length ? (100 * hit.length) / due.length : null,
    secondary: [
      { label: 'hit', value: hit.length },
      { label: 'due', value: due.length },
    ],
    n: due.length,
    records: due.map((m) => ({ id: m.id, label: m.name, from: m.due, to: m.achievedAt, value: m.achievedAt !== undefined && m.achievedAt <= m.due ? 1 : 0, detail: m.achievedAt === undefined ? 'not reached' : m.achievedAt <= m.due ? 'hit' : 'late' })),
  }
}

/**
 * Critical path drift: the largest slip of a current-PI dependency link past
 * its need-by date, in working days (delivered late, or still open and late).
 */
export const criticalPathDrift: MetricCompute = (ctx) => {
  const pi = ctx.store.iterationList.find((it) => it.kind === 'pi' && it.start <= ctx.asOf && ctx.asOf < it.end)
  const deps = pi
    ? ctx.store.dependencyList.filter(
        (d) => (inScope(ctx, d.fromTeamId) || inScope(ctx, d.toTeamId)) && d.createdAt >= pi.start && d.createdAt <= ctx.asOf,
      )
    : []
  const slip = (d: (typeof deps)[number]) => {
    const end = d.resolvedAt !== undefined && d.resolvedAt <= ctx.asOf ? d.resolvedAt : ctx.asOf
    return Math.max(0, workingDaysBetween(d.needBy, end))
  }
  const slips = deps.map(slip)
  return {
    value: deps.length ? Math.max(...slips) : null,
    secondary: [{ label: 'links', value: deps.length }],
    n: deps.length,
    recordValue: 'slip wd',
    records: deps.map((d, k) => ({ id: d.id, teamId: d.fromTeamId, label: `${d.fromItemId} needs ${d.toItemId}`, from: d.needBy, to: d.resolvedAt, value: slips[k], detail: d.resolvedAt === undefined ? 'open' : 'delivered' })),
    note: pi ? undefined : 'No current PI.',
  }
}

/** Committed PI stories added after PI planning, as a share of the stories committed at planning. */
export const programScopeGrowth: MetricCompute = (ctx) => {
  const pi = ctx.store.iterationList.find((it) => it.kind === 'pi' && it.start <= ctx.asOf && ctx.asOf < it.end)
  if (!pi) return { value: null, n: 0, records: [], note: 'No current PI.' }
  const stories = ctx.store.itemList.filter((i) => i.type === 'story' && i.piId === pi.id && !i.piStretch && inScope(ctx, i.teamId) && i.createdAt <= ctx.asOf)
  const initial = stories.filter((i) => i.createdAt <= pi.start)
  const added = stories.filter((i) => i.createdAt > pi.start)
  return {
    value: initial.length ? (100 * added.length) / initial.length : null,
    secondary: [
      { label: 'added', value: added.length },
      { label: 'planned', value: initial.length },
    ],
    n: initial.length,
    records: added.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, from: i.createdAt, value: 1, detail: 'added after PI planning' })),
    note: undefined,
  }
}

/** Expected monetary value of open risks: Σ probability × impact (person-days). */
export const riskExposure: MetricCompute = (ctx) => {
  const open = ctx.store.riskList.filter(
    (r) => (!r.ownerTeamId || inScope(ctx, r.ownerTeamId)) && r.openedAt <= ctx.asOf && (r.closedAt === undefined || r.closedAt > ctx.asOf),
  )
  const at = (r: (typeof open)[number]) => [...r.history].reverse().find((h) => h.at <= ctx.asOf)!
  const emv = open.map((r) => at(r).probability * at(r).impact)
  return {
    value: emv.reduce((a, b) => a + b, 0),
    secondary: [{ label: 'open risks', value: open.length }],
    n: open.length,
    recordValue: 'EMV pd',
    records: open.map((r, k) => ({ id: r.id, teamId: r.ownerTeamId, label: r.title, from: r.openedAt, value: emv[k], detail: `P ${at(r).probability.toFixed(2)} × ${at(r).impact} pd` })),
  }
}

export const investmentAllocation: MetricCompute = (ctx) => {
  const done = ctx.store.itemList.filter((i) => isFlowItem(i) && inScope(ctx, i.teamId) && inWindow(ctx, i.doneAt))
  const share = (k: string) => (done.length ? (100 * done.filter((i) => i.investment === k).length) / done.length : null)
  return {
    value: share('feature'),
    secondary: [
      { label: 'debt', value: share('debt'), unit: '%' },
      { label: 'KTLO', value: share('ktlo'), unit: '%' },
    ],
    n: done.length,
    records: done.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, to: i.doneAt, value: 1, detail: i.investment })),
  }
}
