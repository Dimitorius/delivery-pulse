import { DAY_MS, HOUR_MS } from '../../sim/calendar'
import { activeWaitMs, ageDays, cycleTimeDays, doneInWindow, inWindow, scopedFlowItems, wipAt } from '../flow'
import { percentile, sum } from '../stats'
import type { MetricCompute, MetricContext } from '../types'

export const throughput: MetricCompute = (ctx) => {
  const done = doneInWindow(ctx)
  const weeks = ctx.windowDays / 7
  return {
    value: done.length / weeks,
    secondary: [{ label: 'items done', value: done.length }],
    n: done.length,
    records: done.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, to: i.doneAt, value: 1, detail: i.type })),
  }
}

export const cycleTime: MetricCompute = (ctx) => {
  const done = doneInWindow(ctx)
  const values = done.map(cycleTimeDays)
  return {
    value: percentile(values, 85),
    secondary: [{ label: 'P50', value: percentile(values, 50), unit: 'd' }],
    n: done.length,
    records: done.map((i) => ({
      id: i.id,
      teamId: i.teamId,
      label: i.title,
      from: i.firstActiveAt,
      to: i.doneAt,
      value: cycleTimeDays(i),
      detail: i.type,
    })),
  }
}

export const flowEfficiency: MetricCompute = (ctx) => {
  const done = doneInWindow(ctx)
  const parts = done.map((i) => activeWaitMs(i))
  const active = sum(parts.map((p) => p.active))
  const total = sum(parts.map((p) => p.active + p.wait))
  return {
    value: total > 0 ? (100 * active) / total : null,
    secondary: [
      { label: 'active', value: active / DAY_MS, unit: 'd' },
      { label: 'waiting', value: (total - active) / DAY_MS, unit: 'd' },
    ],
    n: done.length,
    records: done.map((i, k) => {
      const t = parts[k].active + parts[k].wait
      return {
        id: i.id,
        teamId: i.teamId,
        label: i.title,
        from: i.firstActiveAt,
        to: i.doneAt,
        value: t > 0 ? (100 * parts[k].active) / t : 0,
        detail: `active ${(parts[k].active / HOUR_MS).toFixed(1)} h · waiting ${(parts[k].wait / HOUR_MS).toFixed(1)} h`,
      }
    }),
  }
}

export const wip: MetricCompute = (ctx) => {
  const items = wipAt(ctx)
  return {
    value: items.length,
    n: items.length,
    records: items.map((i) => ({
      id: i.id,
      teamId: i.teamId,
      label: i.title,
      from: i.firstActiveAt,
      value: ageDays(i, ctx.asOf),
      detail: i.status,
    })),
  }
}

function blockedAt(ctx: MetricContext) {
  return wipAt(ctx).flatMap((i) => {
    const b = i.blocks.find((b) => b.start <= ctx.asOf && (b.end === undefined || b.end > ctx.asOf))
    return b ? [{ item: i, block: b }] : []
  })
}

export const blockedItems: MetricCompute = (ctx) => {
  const wipCount = wipAt(ctx).length
  const blocked = blockedAt(ctx)
  return {
    value: blocked.length,
    secondary: [{ label: 'of WIP', value: wipCount ? (100 * blocked.length) / wipCount : null, unit: '%' }],
    n: blocked.length,
    records: blocked.map(({ item, block }) => ({
      id: item.id,
      teamId: item.teamId,
      label: item.title,
      from: block.start,
      value: (ctx.asOf - block.start) / DAY_MS,
      detail: block.reason === 'dependency' ? `waiting on dependency ${block.dependencyId}` : 'external blocker',
    })),
  }
}

/** Arrivals (crossed the commitment point) minus departures (Done), per week. */
export const netFlow: MetricCompute = (ctx) => {
  const items = scopedFlowItems(ctx)
  const arrivals = items.filter((i) => inWindow(ctx, i.firstActiveAt))
  const departures = items.filter((i) => i.firstActiveAt !== undefined && inWindow(ctx, i.doneAt))
  const weeks = ctx.windowDays / 7
  return {
    value: (arrivals.length - departures.length) / weeks,
    secondary: [
      { label: 'arrived', value: arrivals.length },
      { label: 'departed', value: departures.length },
    ],
    n: arrivals.length + departures.length,
    records: [
      ...arrivals.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, from: i.firstActiveAt, value: 1, detail: 'arrived' })),
      ...departures.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, to: i.doneAt, value: -1, detail: 'departed' })),
    ],
  }
}

export const SLE_LOOKBACK_DAYS = 84
export const SLE_PERCENTILE = 85

/**
 * Service level expectation per team: P85 cycle time of items the team
 * finished in the previous 12 weeks.
 */
export function teamSle(ctx: MetricContext, teamId: string): number | null {
  const sub: MetricContext = { ...ctx, teamIds: [teamId], windowDays: SLE_LOOKBACK_DAYS }
  return percentile(doneInWindow(sub).map(cycleTimeDays), SLE_PERCENTILE)
}

export const agingWip: MetricCompute = (ctx) => {
  const sle = new Map(ctx.teamIds.map((t) => [t, teamSle(ctx, t)]))
  const items = wipAt(ctx)
  const over = items.filter((i) => {
    const s = sle.get(i.teamId)
    return s != null && ageDays(i, ctx.asOf) > s
  })
  return {
    value: over.length,
    secondary: [{ label: 'of WIP', value: items.length ? (100 * over.length) / items.length : null, unit: '%' }],
    n: items.length,
    records: over.map((i) => ({
      id: i.id,
      teamId: i.teamId,
      label: i.title,
      from: i.firstActiveAt,
      value: ageDays(i, ctx.asOf),
      detail: `SLE ${sle.get(i.teamId)!.toFixed(1)} d · ${i.status}`,
    })),
  }
}

export const unplannedShare: MetricCompute = (ctx) => {
  const done = doneInWindow(ctx)
  const unplanned = done.filter((i) => !i.planned)
  return {
    value: done.length ? (100 * unplanned.length) / done.length : null,
    secondary: [
      { label: 'unplanned', value: unplanned.length },
      { label: 'all done', value: done.length },
    ],
    n: done.length,
    records: unplanned.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, to: i.doneAt, value: 1, detail: i.type })),
  }
}
