import type { MetricDef } from '../metrics/registry'

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const dateYearFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })

export const fmtDate = (t: number) => dateFmt.format(t)
export const fmtDateYear = (t: number) => dateYearFmt.format(t)
export const fmtTime = (t: number) => timeFmt.format(t)
export const fmtDateTime = (t: number) => `${dateFmt.format(t)} ${timeFmt.format(t)}`

export function fmtNumber(v: number | null | undefined, decimals = 1, signed = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return signed && v > 0 ? `+${s}` : s
}

export function fmtValue(def: MetricDef, v: number | null | undefined): string {
  return fmtNumber(v, def.decimals, def.format === 'signed')
}

export function unitLabel(unit: string): string {
  return unit === 'items' ? '' : unit
}
