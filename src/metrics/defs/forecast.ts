import { HOURS_PER_DAY, SIM_EPOCH, timeToWork, workToTimeEnd } from '../../sim/calendar'
import { Rng } from '../../sim/rng'
import { inScope, isFlowItem } from '../flow'
import { percentile } from '../stats'
import type { MetricCompute, MetricContext, MetricResult } from '../types'

export const MC_TRIALS = 2000
export const MC_SAMPLE_DAYS = 30
/** Throughput is sampled in 5-day (weekly) blocks: keeps day-to-day correlation, so the spread is not understated. */
export const MC_BLOCK_DAYS = 5
export const MC_MAX_DAYS = 500
const MC_SEED = 7

export interface McWhenResult {
  /** Working days needed, one entry per trial (capped at MC_MAX_DAYS). */
  days: number[]
}

/**
 * Monte Carlo "When will it be done?" (Vacanti): repeatedly draw a throughput
 * sample from the recent history until `remaining` items are finished.
 * Each sample covers `blockDays` working days; the last block is prorated.
 */
export function monteCarloWhen(
  remaining: number,
  samples: readonly number[],
  trials = MC_TRIALS,
  seed = MC_SEED,
  blockDays = 1,
): McWhenResult {
  const rng = new Rng(seed)
  const days: number[] = []
  if (remaining <= 0) return { days: Array(trials).fill(0) }
  if (!samples.some((v) => v > 0)) return { days: Array(trials).fill(MC_MAX_DAYS) }
  for (let t = 0; t < trials; t++) {
    let left = remaining
    let d = 0
    while (left > 0 && d < MC_MAX_DAYS) {
      const s = samples[Math.floor(rng.next() * samples.length)]
      if (s >= left && blockDays > 1) {
        d += Math.max(1, Math.ceil((blockDays * left) / s))
        left = 0
      } else {
        d += blockDays
        left -= s
      }
    }
    days.push(d)
  }
  return { days }
}

/**
 * Moving-block bootstrap: every run of MC_BLOCK_DAYS consecutive days is a
 * sample (30 days → 26 overlapping weeks). Keeps the week-level spread without
 * the day-to-day jumps of re-cutting the history into 6 fixed weeks.
 */
export function movingBlocks(daily: readonly number[], blockDays = MC_BLOCK_DAYS): number[] {
  const out: number[] = []
  for (let i = 0; i + blockDays <= daily.length; i++) out.push(daily.slice(i, i + blockDays).reduce((a, b) => a + b, 0))
  return out
}

export function currentPi(ctx: MetricContext) {
  return ctx.store.iterationList.find((it) => it.kind === 'pi' && it.start <= ctx.asOf && ctx.asOf < it.end)
}

/** Trial-level detail of the PI forecast (for the Forecast tab histogram). */
export function piForecastDetail(ctx: MetricContext): { days: number[]; daysLeft: number } | null {
  const r = piForecastInternal(ctx)
  return r.detail ?? null
}

export const piForecast: MetricCompute = (ctx) => {
  const { detail: _detail, ...result } = piForecastInternal(ctx)
  void _detail
  return result
}

function piForecastInternal(ctx: MetricContext): MetricResult & { detail?: { days: number[]; daysLeft: number } } {
  const pi = currentPi(ctx)
  const planned = pi
    ? ctx.store.itemList.filter((i) => i.type === 'story' && i.piId === pi.id && inScope(ctx, i.teamId) && i.createdAt <= ctx.asOf)
    : []
  const scope = planned.filter((i) => !i.piStretch)
  if (!pi || !scope.length) {
    return { value: null, n: 0, records: [], note: 'No PI scope for the selected teams (Kanban flow is not PI-planned).' }
  }
  const open = (i: { doneAt?: number }) => i.doneAt === undefined || i.doneAt > ctx.asOf
  const remaining = scope.filter(open)
  const remainingAll = planned.filter(open)
  // Daily throughput samples per team: stories finished in each of the last
  // 20 completed working days before today, development iterations only.
  // Teams are simulated separately and the PI is done when the last team is
  // done — pooling throughput would assume any team can finish any story.
  const nowW = timeToWork(ctx.asOf)
  const todayW = Math.floor(nowW / HOURS_PER_DAY) * HOURS_PER_DAY
  const teamSamples = new Map<string, number[]>()
  const doneStories = ctx.store.itemList.filter(
    (i) => i.type === 'story' && inScope(ctx, i.teamId) && i.doneAt !== undefined && i.doneAt <= ctx.asOf,
  )
  const teams = [...new Set(scope.map((i) => i.teamId))].sort()
  const allTeams = [...new Set(planned.map((i) => i.teamId))].sort()
  for (const teamId of allTeams) {
    const doneW = doneStories.filter((i) => i.teamId === teamId).map((i) => timeToWork(i.doneAt!))
    // IP iterations are skipped: the days ahead are development iterations.
    const ipRanges = ctx.store.iterationList
      .filter((it) => it.kind === 'sprint' && it.ip && it.teamId === teamId)
      .map((it) => [timeToWork(it.start), timeToWork(it.end)] as const)
    const samples: number[] = []
    for (let d = 0; samples.length < MC_SAMPLE_DAYS && d < MC_SAMPLE_DAYS * 3; d++) {
      const hi = todayW - d * HOURS_PER_DAY
      const lo = hi - HOURS_PER_DAY
      if (lo < 0) break
      if (ipRanges.some(([a, b]) => lo >= a && lo < b)) continue
      samples.push(doneW.filter((w) => w >= lo && w < hi).length)
    }
    teamSamples.set(teamId, samples)
  }
  const trials = (left: typeof remaining, ts: string[]) => {
    let days: number[] = Array(MC_TRIALS).fill(0)
    ts.forEach((teamId) => {
      const n = left.filter((i) => i.teamId === teamId).length
      const weekly = movingBlocks(teamSamples.get(teamId)!)
      // Same seed per team in both runs, so the two numbers differ only by the stretch stories.
      const team = monteCarloWhen(n, weekly, MC_TRIALS, MC_SEED + allTeams.indexOf(teamId), MC_BLOCK_DAYS).days
      days = days.map((d, t) => Math.max(d, team[t]))
    })
    return days
  }
  const days = trials(remaining, teams)
  const samples = teams.map((t) => `${t}: ${teamSamples.get(t)!.join(' ')}`).join(' | ')
  const daysLeft = (timeToWork(pi.end) - nowW) / HOURS_PER_DAY
  const onTime = days.filter((d) => d <= daysLeft).length
  // Committed + uncommitted (stretch) objectives: a neutral second number, no target.
  const stretchScope = planned.length - scope.length
  const withStretch = stretchScope ? (100 * trials(remainingAll, allTeams).filter((d) => d <= daysLeft).length) / MC_TRIALS : null
  const p50 = percentile(days, 50)!
  const p85 = percentile(days, 85)!
  return {
    value: (100 * onTime) / days.length,
    secondary: [
      { label: 'P50 date', value: workToTimeEnd(nowW + p50 * HOURS_PER_DAY), unit: 'date' },
      { label: 'P85 date', value: workToTimeEnd(nowW + p85 * HOURS_PER_DAY), unit: 'date' },
      { label: 'PI end', value: pi.end, unit: 'date' },
      { label: 'remaining', value: remaining.length },
      { label: 'scope', value: scope.length },
      { label: 'working days left', value: daysLeft },
      { label: 'with stretch', value: withStretch, unit: '%' },
      { label: 'stretch remaining', value: remainingAll.length - remaining.length },
      { label: 'stretch scope', value: stretchScope },
    ],
    n: days.length,
    detail: { days, daysLeft },
    records: remaining.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, value: 1, detail: i.status })),
    note: `${pi.name}: ${remaining.length} of ${scope.length} stories remaining · daily samples (newest first) ${samples}`,
  }
}

// ---- Stage 2: How many, forecast accuracy -----------------------------------

export const HOW_MANY_DAYS = 10
export const HOW_MANY_CONFIDENCE = 85

/** Weekly program throughput (flow items) of the last 6 completed development weeks, newest first. */
export function weeklyThroughput(ctx: MetricContext): number[] {
  const nowW = timeToWork(ctx.asOf)
  const todayW = Math.floor(nowW / HOURS_PER_DAY) * HOURS_PER_DAY
  const doneW = ctx.store.itemList
    .filter((i) => isFlowItem(i) && inScope(ctx, i.teamId) && i.doneAt !== undefined && i.doneAt <= ctx.asOf)
    .map((i) => timeToWork(i.doneAt!))
  const ipRanges = ctx.store.iterationList
    .filter((it) => it.kind === 'sprint' && it.ip && ctx.teamIds.includes(it.teamId!))
    .map((it) => [timeToWork(it.start), timeToWork(it.end)] as const)
  const daily: number[] = []
  for (let d = 0; daily.length < MC_SAMPLE_DAYS && d < MC_SAMPLE_DAYS * 3; d++) {
    const hi = todayW - d * HOURS_PER_DAY
    const lo = hi - HOURS_PER_DAY
    if (lo < 0) break
    if (ipRanges.some(([a, b]) => lo >= a && lo < b)) continue
    daily.push(doneW.filter((w) => w >= lo && w < hi).length)
  }
  const weekly: number[] = []
  for (let i = 0; i + MC_BLOCK_DAYS <= daily.length; i += MC_BLOCK_DAYS) weekly.push(daily.slice(i, i + MC_BLOCK_DAYS).reduce((a, b) => a + b, 0))
  return weekly
}

/** Monte Carlo "How many?": totals over `days` working days, one per trial (weekly blocks, prorated). */
export function monteCarloHowMany(weekly: readonly number[], days = HOW_MANY_DAYS, trials = MC_TRIALS, seed = MC_SEED): number[] {
  const rng = new Rng(seed)
  const out: number[] = []
  if (!weekly.length) return out
  for (let t = 0; t < trials; t++) {
    let left = days
    let total = 0
    while (left > 0) {
      const s = weekly[Math.floor(rng.next() * weekly.length)]
      const part = Math.min(left, MC_BLOCK_DAYS)
      total += (s * part) / MC_BLOCK_DAYS
      left -= part
    }
    out.push(Math.floor(total))
  }
  return out
}

/** "At least N items in the next 10 working days" with 85 % confidence = the 15th percentile of trials. */
export function howManyAt(ctx: MetricContext): { value: number | null; weekly: number[]; totals: number[] } {
  const weekly = weeklyThroughput(ctx)
  const totals = monteCarloHowMany(weekly)
  return { value: percentile(totals, 100 - HOW_MANY_CONFIDENCE), weekly, totals }
}

export const mcHowMany: MetricCompute = (ctx) => {
  const { value, weekly, totals } = howManyAt(ctx)
  return {
    value,
    secondary: [
      { label: 'P50', value: percentile(totals, 50) },
      { label: 'weekly samples', value: weekly.length },
    ],
    n: totals.length,
    records: weekly.map((w, i) => ({ id: `week-${i + 1}`, label: `development week −${i + 1}`, value: w, detail: 'items finished' })),
    note: `weekly samples (newest first): ${weekly.join(', ')}`,
  }
}

export const ACCURACY_FORECASTS = 12

/**
 * Backtest: the "How many" forecast made at each of the last 12 week starts
 * (that have two full weeks of outcome) vs the items actually finished.
 */
export const forecastAccuracy: MetricCompute = (ctx) => {
  const WEEK = 7 * 86_400_000
  const anchor = SIM_EPOCH + Math.floor((ctx.asOf - SIM_EPOCH) / WEEK) * WEEK
  const rows: MetricResult['records'] = []
  for (let k = 2; k < 2 + ACCURACY_FORECASTS; k++) {
    const t = anchor - k * WEEK
    if (t - SIM_EPOCH < 6 * WEEK) break
    const f = howManyAt({ ...ctx, asOf: t }).value
    if (f === null) continue
    const actual = ctx.store.itemList.filter((i) => isFlowItem(i) && inScope(ctx, i.teamId) && i.doneAt !== undefined && i.doneAt > t && i.doneAt <= t + 2 * WEEK).length
    rows.push({ id: `fc-${k}`, label: `forecast ≥ ${f}, actual ${actual}`, from: t, to: t + 2 * WEEK, value: actual >= f ? 1 : 0, detail: actual >= f ? 'met' : 'missed' })
  }
  const hits = rows.filter((r) => r.value === 1).length
  return {
    value: rows.length ? (100 * hits) / rows.length : null,
    secondary: [
      { label: 'met', value: hits },
      { label: 'forecasts', value: rows.length },
    ],
    n: rows.length,
    records: rows,
  }
}
