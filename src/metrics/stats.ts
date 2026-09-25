// Statistics used by metrics. Percentiles use the nearest-rank method so every
// value can be checked by hand: sort ascending, take element ⌈p/100 · n⌉.

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[rank - 1]
}

export function median(values: readonly number[]): number | null {
  return percentile(values, 50)
}

export function sum(values: readonly number[]): number {
  let s = 0
  for (const v of values) s += v
  return s
}
