import { HOURS_PER_DAY, timeToWork, workToTimeEnd } from '../../sim/calendar'
import { Rng } from '../../sim/rng'
import { inScope } from '../flow'
import { percentile } from '../stats'
import type { MetricCompute, MetricContext } from '../types'

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

export function currentPi(ctx: MetricContext) {
  return ctx.store.iterationList.find((it) => it.kind === 'pi' && it.start <= ctx.asOf && ctx.asOf < it.end)
}

export const piForecast: MetricCompute = (ctx) => {
  const pi = currentPi(ctx)
  const scope = pi
    ? ctx.store.itemList.filter((i) => i.type === 'story' && i.piId === pi.id && !i.piStretch && inScope(ctx, i.teamId) && i.createdAt <= ctx.asOf)
    : []
  if (!pi || !scope.length) {
    return { value: null, n: 0, records: [], note: 'No PI scope for the selected teams (Kanban flow is not PI-planned).' }
  }
  const remaining = scope.filter((i) => i.doneAt === undefined || i.doneAt > ctx.asOf)
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
  for (const teamId of teams) {
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
  let days: number[] = Array(MC_TRIALS).fill(0)
  teams.forEach((teamId, k) => {
    const left = remaining.filter((i) => i.teamId === teamId).length
    const daily = teamSamples.get(teamId)!
    const weekly: number[] = []
    for (let i = 0; i + MC_BLOCK_DAYS <= daily.length; i += MC_BLOCK_DAYS) weekly.push(daily.slice(i, i + MC_BLOCK_DAYS).reduce((a, b) => a + b, 0))
    const team = monteCarloWhen(left, weekly, MC_TRIALS, MC_SEED + k, MC_BLOCK_DAYS).days
    days = days.map((d, t) => Math.max(d, team[t]))
  })
  const samples = teams.map((t) => `${t}: ${teamSamples.get(t)!.join(' ')}`).join(' | ')
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
    note: `${pi.name}: ${remaining.length} of ${scope.length} stories remaining · daily samples (newest first) ${samples}`,
  }
}
