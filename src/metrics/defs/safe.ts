import { wsjfScore, type WorkItem, type WsjfEstimate } from '../../domain/model'
import type { Store } from '../../domain/store'
import { DAY_MS } from '../../sim/calendar'
import { inScope, inWindow, windowStart } from '../flow'
import { percentile } from '../stats'
import type { MetricCompute, MetricContext } from '../types'

/**
 * SAFe PI Predictability (Flow Predictability): actual business value of all
 * objectives / planned business value of the committed objectives, for the
 * last PI scored at or before asOf.
 */
export const piPredictability: MetricCompute = (ctx) => {
  const scored = ctx.store.objectiveList.filter((o) => inScope(ctx, o.teamId) && o.scoredAt !== undefined && o.scoredAt <= ctx.asOf)
  if (!scored.length) return { value: null, n: 0, records: [], note: 'No PI scored yet (first Inspect & Adapt is at the end of PI 1).' }
  const lastPi = scored.reduce((a, o) => (o.scoredAt! > a.scoredAt! ? o : a)).piId
  const objs = scored.filter((o) => o.piId === lastPi)
  const planned = objs.filter((o) => o.committed).reduce((a, o) => a + o.plannedBv, 0)
  const actual = objs.reduce((a, o) => a + (o.actualBv ?? 0), 0)
  return {
    value: planned ? (100 * actual) / planned : null,
    secondary: [
      { label: 'actual BV', value: actual },
      { label: 'planned BV (committed)', value: planned },
    ],
    n: objs.length,
    recordValue: 'BV',
    records: objs.map((o) => ({ id: o.id, teamId: o.teamId, label: o.title, to: o.scoredAt, value: o.actualBv ?? 0, detail: `${o.committed ? 'committed' : 'uncommitted'} · planned ${o.plannedBv}` })),
    note: `${lastPi.replace('-', ' ')} (last Inspect & Adapt)`,
  }
}

// ---- Stage 3b: feature / epic level (registry drafts by Cowork) -------------

const isDone = (i: WorkItem, asOf: number) => i.doneAt !== undefined && i.doneAt <= asOf
const isStarted = (i: WorkItem, asOf: number) => i.firstActiveAt !== undefined && i.firstActiveAt <= asOf

/** Features planned at PI Planning under a portfolio epic (roadmap features pulled ahead by a team have no epic). */
function epicFeatures(ctx: MetricContext): WorkItem[] {
  return ctx.store.itemList.filter((i) => i.type === 'feature' && i.parentId !== undefined && i.createdAt <= ctx.asOf)
}

/** Epics with their child features in scope, as known at asOf. */
function epicsInScope(ctx: MetricContext): { epic: WorkItem; children: WorkItem[] }[] {
  const byEpic = new Map<string, WorkItem[]>()
  for (const f of epicFeatures(ctx)) if (inScope(ctx, f.teamId)) (byEpic.get(f.parentId!) ?? byEpic.set(f.parentId!, []).get(f.parentId!)!).push(f)
  return ctx.store.itemList
    .filter((i) => i.type === 'epic' && i.createdAt <= ctx.asOf && byEpic.has(i.id))
    .map((epic) => ({ epic, children: byEpic.get(epic.id)! }))
}

export const featureLeadTime: MetricCompute = (ctx) => {
  const done = epicFeatures(ctx).filter((f) => inScope(ctx, f.teamId) && inWindow(ctx, f.doneAt))
  const days = done.map((f) => (f.doneAt! - f.createdAt) / DAY_MS)
  return {
    value: percentile(days, 85),
    secondary: [{ label: 'P50', value: percentile(days, 50), unit: 'd' }],
    n: done.length,
    recordValue: 'days',
    records: done.map((f, k) => ({ id: f.id, teamId: f.teamId, label: f.title, from: f.createdAt, to: f.doneAt, value: days[k], detail: `${f.piId ?? ''}${f.piStretch ? ' · stretch' : ''} · ${f.parentId}` })),
  }
}

export const epicLeadTime: MetricCompute = (ctx) => {
  const done = epicsInScope(ctx)
    .filter(({ children }) => children.every((f) => isDone(f, ctx.asOf)))
    .map(({ epic, children }) => ({ epic, children, end: Math.max(...children.map((f) => f.doneAt!)) }))
    .filter((x) => inWindow(ctx, x.end))
  const days = done.map((x) => (x.end - x.epic.createdAt) / DAY_MS)
  return {
    value: percentile(days, 50),
    secondary: [{ label: 'epics finished', value: done.length }],
    n: done.length,
    recordValue: 'days',
    records: done.map((x, k) => ({ id: x.epic.id, label: x.epic.title, from: x.epic.createdAt, to: x.end, value: days[k], detail: `${x.children.length} features` })),
  }
}

export const portfolioWip: MetricCompute = (ctx) => {
  const all = epicsInScope(ctx)
  const inProgress = all.filter(({ children }) => children.some((f) => isStarted(f, ctx.asOf)) && children.some((f) => !isDone(f, ctx.asOf)))
  return {
    value: inProgress.length,
    secondary: [{ label: 'features open', value: inProgress.reduce((a, x) => a + x.children.filter((f) => !isDone(f, ctx.asOf)).length, 0) }],
    n: inProgress.length,
    recordValue: 'features done',
    records: inProgress.map(({ epic, children }) => ({
      id: epic.id,
      label: epic.title,
      from: Math.min(...children.filter((f) => isStarted(f, ctx.asOf)).map((f) => f.firstActiveAt!)),
      value: children.filter((f) => isDone(f, ctx.asOf)).length,
      detail: `${children.filter((f) => isDone(f, ctx.asOf)).length} of ${children.length} features done`,
    })),
  }
}

/** The WSJF estimate of a feature in force at `t`. */
export function wsjfAt(f: WorkItem, t: number): WsjfEstimate | undefined {
  let e: WsjfEstimate | undefined
  for (const x of f.wsjf ?? []) if (x.at <= t) e = x
  return e
}

export interface WsjfRow {
  feature: WorkItem
  est: WsjfEstimate
  score: number
  rank: number
}

/** The ART backlog at `t`: features with a WSJF estimate not started before `t`, ranked by WSJF (ties share the better rank). */
export function wsjfBacklog(store: Store, t: number): WsjfRow[] {
  const rows = store.itemList
    .filter((f) => f.type === 'feature' && f.createdAt <= t && !(f.firstActiveAt !== undefined && f.firstActiveAt < t))
    .flatMap((feature) => {
      const est = wsjfAt(feature, t)
      return est ? [{ feature, est, score: wsjfScore(est), rank: 0 }] : []
    })
  for (const r of rows) r.rank = 1 + rows.filter((x) => x.score > r.score).length
  return rows.sort((a, b) => a.rank - b.rank || a.feature.id.localeCompare(b.feature.id))
}

/** Start of the window "current and previous PI" (falls back to the rolling window without PI data). */
function twoPiStart(ctx: MetricContext): number {
  const pis = ctx.store.iterationList.filter((i) => i.kind === 'pi' && i.start <= ctx.asOf).sort((a, b) => a.start - b.start)
  if (!pis.length) return windowStart(ctx)
  return pis[Math.max(0, pis.length - 2)].start
}

export const wsjfAdherence: MetricCompute = (ctx) => {
  const from = twoPiStart(ctx)
  const started = ctx.store.itemList.filter(
    (f) => f.type === 'feature' && inScope(ctx, f.teamId) && f.firstActiveAt !== undefined && f.firstActiveAt > from && f.firstActiveAt <= ctx.asOf && wsjfAt(f, f.firstActiveAt),
  )
  const checks = started.map((f) => {
    const backlog = wsjfBacklog(ctx.store, f.firstActiveAt!)
    const row = backlog.find((r) => r.feature === f)!
    const cut = Math.ceil(backlog.length / 3)
    return { f, row, size: backlog.length, top: row.rank <= cut }
  })
  const inOrder = checks.filter((c) => c.top).length
  return {
    value: checks.length ? (100 * inOrder) / checks.length : null,
    secondary: [
      { label: 'in top ⅓', value: inOrder },
      { label: 'started', value: checks.length },
    ],
    n: checks.length,
    recordValue: 'WSJF rank',
    records: checks.map((c) => ({
      id: c.f.id,
      teamId: c.f.teamId,
      label: c.f.title,
      from: c.f.firstActiveAt,
      value: c.row.rank,
      detail: `rank ${c.row.rank} of ${c.size} (top ⅓ = ≤ ${Math.ceil(c.size / 3)}) · WSJF ${c.row.score.toFixed(1)} ${c.top ? '✓' : '✗ out of order'}`,
    })),
  }
}
