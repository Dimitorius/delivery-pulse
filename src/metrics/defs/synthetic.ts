// SYNTHETIC tiles (SPEC §6): computed from simulated survey / finance events.
// The inputs are synthetic by nature — in production they come from surveys
// and finance systems — so the tiles carry the SYNTHETIC badge.
import { inScope, inWindow, isFlowItem } from '../flow'
import { median } from '../stats'
import type { MetricCompute, MetricContext } from '../types'

/** Budgeted cost per story point (k€), set at PI planning — synthetic plan data. */
export const BUDGET_PER_POINT = 0.56

function latestPerTeam(ctx: MetricContext, instrument: 'DXI' | 'eNPS') {
  return ctx.teamIds.flatMap((t) => {
    const s = ctx.store.surveys.filter((x) => x.instrument === instrument && x.teamId === t && x.at <= ctx.asOf)
    return s.length ? [s[s.length - 1]] : []
  })
}

function surveyMetric(instrument: 'DXI' | 'eNPS'): MetricCompute {
  return (ctx) => {
    const latest = latestPerTeam(ctx, instrument)
    return {
      value: median(latest.map((s) => s.score)),
      secondary: [{ label: 'teams', value: latest.length }],
      n: latest.reduce((a, s) => a + s.responses, 0),
      recordValue: 'score',
      records: latest.map((s) => ({ id: s.id, teamId: s.teamId, label: `${instrument} survey`, to: s.at, value: s.score, detail: `${s.responses} responses` })),
    }
  }
}

export const dxi = surveyMetric('DXI')
export const enps = surveyMetric('eNPS')

export const ebmCurrentValue: MetricCompute = (ctx) => {
  const v = ctx.store.values.filter((x) => x.measure === 'csat' && x.at <= ctx.asOf)
  const last = v[v.length - 1]
  return {
    value: last ? last.value : null,
    secondary: [{ label: 'previous', value: v.length > 1 ? v[v.length - 2].value : null }],
    n: v.length,
    records: v.slice(-6).map((x) => ({ id: x.id, label: 'CSAT', to: x.at, value: x.value })),
  }
}

/** Cost performance index = earned value / actual cost over the window. */
export const cpi: MetricCompute = (ctx) => {
  const points = ctx.store.itemList
    .filter((i) => isFlowItem(i) && inScope(ctx, i.teamId) && inWindow(ctx, i.doneAt))
    .reduce((a, i) => a + (i.points ?? 0), 0)
  const costs = ctx.store.costs.filter((c) => inScope(ctx, c.teamId) && inWindow(ctx, c.at))
  const ac = costs.reduce((a, c) => a + c.amount, 0)
  const ev = points * BUDGET_PER_POINT
  return {
    value: ac ? ev / ac : null,
    secondary: [
      { label: 'EV k€', value: ev },
      { label: 'AC k€', value: ac },
    ],
    n: costs.length,
    recordValue: 'k€',
    records: costs.map((c) => ({ id: c.id, teamId: c.teamId, label: c.category, to: c.at, value: c.amount })),
  }
}
