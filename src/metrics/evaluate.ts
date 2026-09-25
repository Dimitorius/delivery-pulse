// Status colour against the team's target (SPEC §6: status from the team
// goal; the industry benchmark is only a reference).

import type { Target } from './registry'

export type Status = 'ok' | 'warn' | 'bad' | 'none'

export function scaledTarget(target: Target, teamsInScope: number): { value?: number; warn?: number } {
  const k = target.per === 'team' ? teamsInScope : 1
  return {
    value: target.value === undefined ? undefined : target.value * k,
    warn: target.warn === undefined ? undefined : target.warn * k,
  }
}

export function evaluate(value: number | null, target: Target, teamsInScope = 1): Status {
  if (value === null || !target.op || target.value === undefined) return 'none'
  const t = scaledTarget(target, teamsInScope)
  if (target.op === '<=') {
    if (value <= t.value!) return 'ok'
    return t.warn !== undefined && value <= t.warn ? 'warn' : 'bad'
  }
  if (value >= t.value!) return 'ok'
  return t.warn !== undefined && value >= t.warn ? 'warn' : 'bad'
}

export function targetLabel(target: Target, unit: string, teamsInScope = 1): string {
  if (!target.op || target.value === undefined) return 'no target'
  const t = scaledTarget(target, teamsInScope)
  const u = unit === '%' ? '%' : unit === 'items' ? '' : ` ${unit}`
  return `${target.op === '<=' ? '≤' : '≥'} ${fmtNum(t.value!)}${u}`
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
