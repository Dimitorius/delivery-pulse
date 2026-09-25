// Status colour against the team's target (SPEC §6: status from the team
// goal; the industry benchmark is only a reference).

import type { MetricDef, Target } from './registry'
import type { MetricResult } from './types'

/** ok / warn (near limit) / bad (off target) / none (no target) / low (sample too small to colour). */
export type Status = 'ok' | 'warn' | 'bad' | 'none' | 'low'

export function scaledTarget(target: Target, teamsInScope: number): { value?: number; warn?: number } {
  const k = target.per === 'team' ? teamsInScope : 1
  return {
    value: target.value === undefined ? undefined : target.value * k,
    warn: target.warn === undefined ? undefined : target.warn * k,
  }
}

export function evaluate(value: number | null, target: Target, teamsInScope = 1): Status {
  if (value === null || !target.op) return 'none'
  if (target.op === 'range') {
    if (target.min === undefined || target.max === undefined) return 'none'
    if (value >= target.min && value <= target.max) return 'ok'
    return target.warnMin !== undefined && value < target.warnMin ? 'bad' : 'warn'
  }
  if (target.value === undefined) return 'none'
  const t = scaledTarget(target, teamsInScope)
  if (target.op === '<=') {
    if (value <= t.value!) return 'ok'
    return t.warn !== undefined && value <= t.warn ? 'warn' : 'bad'
  }
  if (value >= t.value!) return 'ok'
  return t.warn !== undefined && value >= t.warn ? 'warn' : 'bad'
}

/** Status of a computed result: low confidence first, then the target. */
export function statusFor(def: Pick<MetricDef, 'minSample' | 'target'>, result: MetricResult, teamsInScope = 1): Status {
  if (result.value !== null && def.minSample !== undefined && result.n < def.minSample) return 'low'
  return evaluate(result.value, def.target, teamsInScope)
}

export function targetLabel(target: Target, unit: string, teamsInScope = 1): string {
  if (target.op === 'range' && target.min !== undefined && target.max !== undefined) {
    return `${fmtNum(target.min)}–${fmtNum(target.max)}${unit === '%' ? '%' : ` ${unit}`}`
  }
  if (!target.op || target.value === undefined) return 'no target'
  const t = scaledTarget(target, teamsInScope)
  const u = unit === '%' ? '%' : unit === 'items' ? '' : ` ${unit}`
  return `${target.op === '<=' ? '≤' : '≥'} ${fmtNum(t.value!)}${u}`
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
