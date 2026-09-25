import { HOURS_PER_DAY, timeToWork, workToTimeEnd } from '../../sim/calendar'
import { Rng } from '../../sim/rng'
import { inScope } from '../flow'
import { percentile } from '../stats'
import type { MetricCompute, MetricContext } from '../types'

export const MC_TRIALS = 2000
export const MC_SAMPLE_DAYS = 20
export const MC_MAX_DAYS = 500
const MC_SEED = 7

export interface McWhenResult {
  /** Working days needed, one entry per trial (capped at MC_MAX_DAYS). */
  days: number[]
}

/**
 * Monte Carlo "When will it be done?" (Vacanti): repeatedly draw a daily
 * throughput from the recent history until `remaining` items are finished.
 */
export function monteCarloWhen(remaining: number, dailySamples: readonly number[], trials = MC_TRIALS, seed = MC_SEED): McWhenResult {
  const rng = new Rng(seed)
  const days: number[] = []
  if (remaining <= 0) return { days: Array(trials).fill(0) }
  if (!dailySamples.some((v) => v > 0)) return { days: Array(trials).fill(MC_MAX_DAYS) }
  for (let t = 0; t < trials; t++) {
    let left = remaining
    let d = 0
    while (left > 0 && d < MC_MAX_DAYS) {
      d++
      left -= dailySamples[Math.floor(rng.next() * dailySamples.length)]
    }
    days.push(d)
  }
  return { days }
}

export function currentPi(ctx: MetricContext) {
  return ctx.store.iterationList.find((it) => it.kind === 'pi' && it.start <= ctx.asOf && ctx.asOf < it.end)
}

export const piForecast: MetricCompute = (ctx) => {
  const pi = currentPi(ctx)
  const scope = pi
    ? ctx.store.itemList.filter((i) => i.type === 'story' && i.piId === pi.id && inScope(ctx, i.teamId) && i.createdAt <= ctx.asOf)
    : []
  if (!pi || !scope.length) {
    return { value: null, n: 0, records: [], note: 'No PI scope for the selected teams (Kanban flow is not PI-planned).' }
  }
  const remaining = scope.filter((i) => i.doneAt === undefined || i.doneAt > ctx.asOf)
  // Daily throughput samples: stories finished in each of the last 20 working
  // days (8 working hours each), counted backwards from asOf.
  const nowW = timeToWork(ctx.asOf)
  const doneW = ctx.store.itemList
    .filter((i) => i.type === 'story' && inScope(ctx, i.teamId) && i.doneAt !== undefined && i.doneAt <= ctx.asOf)
    .map((i) => timeToWork(i.doneAt!))
  const samples = Array.from({ length: MC_SAMPLE_DAYS }, (_, d) => {
    const hi = nowW - d * HOURS_PER_DAY
    const lo = hi - HOURS_PER_DAY
    return doneW.filter((w) => w > lo && w <= hi).length
  })
  const { days } = monteCarloWhen(remaining.length, samples)
  const daysLeft = (timeToWork(pi.end) - nowW) / HOURS_PER_DAY
  const onTime = days.filter((d) => d <= daysLeft).length
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
    ],
    n: days.length,
    records: remaining.map((i) => ({ id: i.id, teamId: i.teamId, label: i.title, value: 1, detail: i.status })),
    note: `${pi.name}: ${remaining.length} of ${scope.length} stories remaining · samples ${samples.join(', ')}`,
  }
}
