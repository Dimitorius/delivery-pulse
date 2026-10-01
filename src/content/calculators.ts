// Logic of the Learn calculators (articles with a `calculator` field). Pure
// functions, tested against the worked examples in the articles.

import { percentile } from '../metrics/stats'
import { Rng } from '../sim/rng'

/** Numbers from free text: "1, 2 2;3" → [1, 2, 2, 3]. Negative and non-numeric entries are dropped. */
export function parseNumbers(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter((v) => Number.isFinite(v) && v >= 0)
}

export function cyclePercentiles(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const p50 = percentile(sorted, 50)!
  const p85 = percentile(sorted, 85)!
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  return {
    sorted,
    n: sorted.length,
    p50,
    p85,
    /** 1-based rank picked for P85 (nearest rank: ⌈0.85 · n⌉). */
    p85Rank: Math.ceil(0.85 * sorted.length),
    p50Rank: Math.ceil(0.5 * sorted.length),
    mean,
    belowMean: sorted.filter((v) => v < mean).length,
    tailRatio: p50 > 0 ? p85 / p50 : null,
  }
}

export function sayDo(planned: number, doneOfPlanned: number) {
  if (!(planned > 0) || doneOfPlanned < 0) return null
  const ratio = (100 * Math.min(doneOfPlanned, planned)) / planned
  // Bands from the say-do-ratio article ("How to read it").
  const reading =
    ratio > 95
      ? 'Above ~95 % — suspicious rather than excellent: often conservative planning (sandbagging). Look at 3+ sprints.'
      : ratio >= 80 && ratio <= 90
        ? 'Inside the 80–90 % corridor: plans are realistic and still ambitious.'
        : ratio < 70
          ? 'Below ~70 % — over-commitment, items too large, or unplanned work crowding the plan. Check scope change and unplanned work first.'
          : 'Just outside the 80–90 % corridor — read the trend over 3+ sprints before drawing conclusions.'
  return { ratio, reading }
}

export const MC_CALC_TRIALS = 10_000
const MC_CALC_SEED = 2026
const MAX_WEEKS = 520

/**
 * Monte Carlo "when" in whole weeks (the article's method): each trial draws
 * a random past week's throughput until the remaining items are done.
 */
export function monteCarloWeeks(history: number[], remaining: number, trials = MC_CALC_TRIALS, seed = MC_CALC_SEED) {
  if (!history.length || remaining <= 0 || !history.some((v) => v > 0)) return null
  const rng = new Rng(seed)
  const weeks: number[] = []
  for (let t = 0; t < trials; t++) {
    let left = remaining
    let w = 0
    while (left > 0 && w < MAX_WEEKS) {
      left -= history[Math.floor(rng.next() * history.length)]
      w++
    }
    weeks.push(w)
  }
  const max = Math.max(...weeks)
  const min = Math.min(...weeks)
  const byWeek: { weeks: number; share: number; cumulative: number }[] = []
  let cum = 0
  for (let w = min; w <= max; w++) {
    const share = (100 * weeks.filter((x) => x === w).length) / trials
    cum += share
    byWeek.push({ weeks: w, share, cumulative: Math.min(100, cum) })
  }
  return {
    trials,
    p50: percentile(weeks, 50)!,
    p85: percentile(weeks, 85)!,
    p95: percentile(weeks, 95)!,
    byWeek,
    /** Share of trials finished within `deadline` weeks. */
    within: (deadline: number) => (100 * weeks.filter((x) => x <= deadline).length) / trials,
  }
}
