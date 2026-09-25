// Process behaviour charts (XmR), robust variant (Wheeler, "Understanding
// Variation"): centre = median of the baseline, natural process limits =
// centre ± 3.145 × median moving range. Using medians keeps one extreme week
// from widening the limits — the fat tail stays visible as a signal.

import { median } from './stats'

export const XMR_SCALE = 3.145
export const RUN_LENGTH = 8

export interface XmrLimits {
  centre: number
  lower: number
  upper: number
  medianMr: number
}

export function xmrLimits(baseline: readonly number[]): XmrLimits | null {
  if (baseline.length < 4) return null
  const mr: number[] = []
  for (let i = 1; i < baseline.length; i++) mr.push(Math.abs(baseline[i] - baseline[i - 1]))
  const centre = median(baseline)!
  const medianMr = median(mr)!
  return { centre, medianMr, lower: centre - XMR_SCALE * medianMr, upper: centre + XMR_SCALE * medianMr }
}

export type XmrRule = 'beyond-limit' | 'run-of-8'

export interface XmrFinding {
  rule: XmrRule
  side: 'above' | 'below'
}

/**
 * Limits come from a baseline of up to `baselineSize` points that precede the
 * evaluation window (the last 8 points), so a recent shift cannot drag the
 * centre line along with it.
 * Rule 1: the latest point is outside the natural process limits.
 * Rule 2 (Western Electric): all of the last 8 points are on one side of the centre.
 */
export function xmrCheck(series: readonly number[], baselineSize = 12): { limits: XmrLimits | null; findings: XmrFinding[] } {
  const findings: XmrFinding[] = []
  if (series.length < RUN_LENGTH + 4) return { limits: null, findings }
  const evalStart = series.length - RUN_LENGTH
  const limits = xmrLimits(series.slice(Math.max(0, evalStart - baselineSize), evalStart))
  if (!limits) return { limits, findings }
  const latest = series[series.length - 1]
  if (latest > limits.upper) findings.push({ rule: 'beyond-limit', side: 'above' })
  if (latest < limits.lower) findings.push({ rule: 'beyond-limit', side: 'below' })
  const run = series.slice(evalStart)
  if (run.every((v) => v > limits.centre)) findings.push({ rule: 'run-of-8', side: 'above' })
  if (run.every((v) => v < limits.centre)) findings.push({ rule: 'run-of-8', side: 'below' })
  return { limits, findings }
}
