import { DAY_MS } from '../../sim/calendar'
import { inScope, inWindow, isFlowItem, windowStart } from '../flow'
import { percentile } from '../stats'
import type { MetricCompute } from '../types'

export const SLO_TARGET = 99.9
export const BURN_WINDOW_DAYS = 7

export const escapedDefects: MetricCompute = (ctx) => {
  const bugs = ctx.store.itemList.filter((i) => i.type === 'bug' && i.foundIn === 'production' && inScope(ctx, i.teamId) && inWindow(ctx, i.createdAt))
  return {
    value: bugs.length / (ctx.windowDays / 7),
    secondary: [{ label: 'bugs', value: bugs.length }],
    n: bugs.length,
    records: bugs.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, from: i.createdAt, to: i.doneAt, value: 1, detail: i.status })),
  }
}

/** Items reopened (Done → back in progress) in the window vs items finished in the window. */
export const reopenRate: MetricCompute = (ctx) => {
  const items = ctx.store.itemList.filter((i) => isFlowItem(i) && inScope(ctx, i.teamId))
  const reopened = items.filter((i) => i.transitions.some((t) => t.from === 'Done' && t.to !== 'Done' && inWindow(ctx, t.at)))
  const done = items.filter((i) => i.transitions.some((t) => t.to === 'Done' && inWindow(ctx, t.at)))
  return {
    value: done.length ? (100 * reopened.length) / done.length : null,
    secondary: [
      { label: 'reopened', value: reopened.length },
      { label: 'done', value: done.length },
    ],
    n: done.length,
    records: reopened.map((i) => ({
      id: i.id,
      teamId: i.teamId,
      label: i.title,
      to: i.transitions.find((t) => t.from === 'Done' && inWindow(ctx, t.at))!.at,
      value: 1,
      detail: 'reopened',
    })),
  }
}

function incidentsInWindow(ctx: Parameters<MetricCompute>[0]) {
  return ctx.store.incidentList.filter((i) => inScope(ctx, i.teamId) && inWindow(ctx, i.detectedAt))
}

/** High-severity (SEV1–2) incidents detected in the window; all severities alongside. */
export const incidentsBySeverity: MetricCompute = (ctx) => {
  const inc = incidentsInWindow(ctx)
  const count = (s: number) => inc.filter((i) => i.sev === s).length
  return {
    value: count(1) + count(2),
    secondary: [1, 2, 3, 4].map((s) => ({ label: `SEV${s}`, value: count(s) })),
    n: inc.length,
    records: inc.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, from: i.detectedAt, to: i.resolvedAt, value: i.sev, detail: `SEV${i.sev}` })),
  }
}

export const mtta: MetricCompute = (ctx) => {
  const inc = ctx.store.incidentList.filter((i) => inScope(ctx, i.teamId) && inWindow(ctx, i.ackedAt))
  const mins = inc.map((i) => (i.ackedAt! - i.detectedAt) / 60_000)
  return {
    value: percentile(mins, 50),
    secondary: [{ label: 'P85', value: percentile(mins, 85), unit: 'min' }],
    n: inc.length,
    recordValue: 'minutes',
    records: inc.map((i, k) => ({ id: i.id, teamId: i.teamId, label: `SEV${i.sev} ${i.title}`, from: i.detectedAt, to: i.ackedAt, value: mins[k] })),
  }
}

/** Time to restore service for all incidents (impact start → resolved), median. */
export const incidentMttr: MetricCompute = (ctx) => {
  const inc = ctx.store.incidentList.filter((i) => inScope(ctx, i.teamId) && inWindow(ctx, i.resolvedAt))
  const mins = inc.map((i) => (i.resolvedAt! - i.startedAt) / 60_000)
  return {
    value: percentile(mins, 50),
    secondary: [{ label: 'P85', value: percentile(mins, 85), unit: 'min' }],
    n: inc.length,
    recordValue: 'minutes',
    records: inc.map((i, k) => ({ id: i.id, teamId: i.teamId, label: `SEV${i.sev} ${i.title}`, from: i.startedAt, to: i.resolvedAt, value: mins[k] })),
  }
}

function sliSums(ctx: Parameters<MetricCompute>[0], from: number) {
  let total = 0
  let bad = 0
  const perService = new Map<string, { total: number; bad: number }>()
  const sli = ctx.store.sli // appended in time order → binary search the window start
  let lo = 0
  let hi = sli.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sli[mid].end <= from) lo = mid + 1
    else hi = mid
  }
  for (let i = lo; i < sli.length; i++) {
    const w = sli[i]
    if (w.end > ctx.asOf) break
    if (!inScope(ctx, w.teamId)) continue
    total += w.total
    bad += w.bad
    const s = perService.get(w.service) ?? { total: 0, bad: 0 }
    s.total += w.total
    s.bad += w.bad
    perService.set(w.service, s)
  }
  return { total, bad, perService }
}

export const sloAttainment: MetricCompute = (ctx) => {
  const { total, bad, perService } = sliSums(ctx, windowStart(ctx))
  const budget = total * (1 - SLO_TARGET / 100)
  return {
    value: total ? 100 * (1 - bad / total) : null,
    secondary: [
      { label: 'error budget left', value: budget ? 100 * (1 - bad / budget) : null, unit: '%' },
      { label: 'failed requests', value: bad },
    ],
    n: total,
    recordValue: 'availability %',
    records: [...perService].map(([service, s]) => ({
      id: service,
      label: `${service} · ${s.total.toLocaleString('en-US')} requests`,
      value: 100 * (1 - s.bad / s.total),
      detail: `${s.bad.toLocaleString('en-US')} failed`,
    })),
  }
}

/** Error budget burn rate over the last 7 days: 1.0 = spending the budget exactly at the SLO pace. */
export const errorBudgetBurn: MetricCompute = (ctx) => {
  const { total, bad, perService } = sliSums(ctx, ctx.asOf - BURN_WINDOW_DAYS * DAY_MS)
  const allowed = 1 - SLO_TARGET / 100
  return {
    value: total ? bad / total / allowed : null,
    secondary: [{ label: 'error rate', value: total ? (100 * bad) / total : null, unit: '%' }],
    n: total,
    recordValue: 'burn rate',
    records: [...perService].map(([service, s]) => ({ id: service, label: service, value: s.bad / s.total / allowed, detail: `${s.bad} of ${s.total} failed` })),
  }
}

export const POSTMORTEM_DEADLINE_DAYS = 30
export const POSTMORTEM_LOOKBACK_DAYS = 120

/**
 * Postmortems held 30–120 days ago: share of their action items done within
 * 30 days of the postmortem (every postmortem had the full 30 days).
 */
export const postmortemActionClosure: MetricCompute = (ctx) => {
  const lo = ctx.asOf - POSTMORTEM_LOOKBACK_DAYS * DAY_MS
  const hi = ctx.asOf - POSTMORTEM_DEADLINE_DAYS * DAY_MS
  const pms = ctx.store.incidentList.filter((i) => inScope(ctx, i.teamId) && i.postmortemAt !== undefined && i.postmortemAt > lo && i.postmortemAt <= hi)
  const rows = pms.flatMap((pm) =>
    (pm.actionItemIds ?? []).map((id) => {
      const it = ctx.store.items.get(id)
      const onTime = it?.doneAt !== undefined && it.doneAt <= pm.postmortemAt! + POSTMORTEM_DEADLINE_DAYS * DAY_MS
      return { pm, id, it, onTime }
    }),
  )
  const closed = rows.filter((r) => r.onTime)
  return {
    value: rows.length ? (100 * closed.length) / rows.length : null,
    secondary: [
      { label: 'closed in 30 d', value: closed.length },
      { label: 'actions', value: rows.length },
      { label: 'postmortems', value: pms.length },
    ],
    n: rows.length,
    records: rows.map((r) => ({ id: r.id, teamId: r.pm.teamId, label: r.it?.title ?? r.id, from: r.pm.postmortemAt, to: r.it?.doneAt, value: r.onTime ? 1 : 0, detail: r.onTime ? 'closed in time' : 'late or open' })),
  }
}
