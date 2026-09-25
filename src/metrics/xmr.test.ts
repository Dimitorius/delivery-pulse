import { describe, expect, it } from 'vitest'
import { xmrCheck, xmrLimits } from './xmr'

describe('XmR (median-based)', () => {
  const baseline = [10, 12, 11, 13, 12, 11, 12, 10, 11, 12, 13, 12]

  it('computes limits by hand', () => {
    // sorted baseline [10,10,11,11,11,12,12,12,12,12,13,13] → median = 6th = 12
    // moving ranges [2,1,2,1,1,1,2,1,1,1,1] → sorted, median = 6th = 1
    // limits 12 ± 3.145 · 1
    const l = xmrLimits(baseline)!
    expect(l.centre).toBe(12)
    expect(l.medianMr).toBe(1)
    expect(l.upper).toBeCloseTo(15.145, 9)
    expect(l.lower).toBeCloseTo(8.855, 9)
  })

  const calm = [12, 11, 12, 13, 12, 11, 12, 13] // inside the limits, both sides of 12

  it('flags a point beyond the limits (baseline = the 12 points before the last 8)', () => {
    expect(xmrCheck([...baseline, ...calm.slice(0, 7), 30]).findings).toEqual([{ rule: 'beyond-limit', side: 'above' }])
    expect(xmrCheck([...baseline, ...calm]).findings).toEqual([])
  })

  it('flags a run of 8 on one side of the centre', () => {
    // last 8 all above the centre (12) but inside the upper limit (15.145)
    const { findings } = xmrCheck([...baseline, 13, 14, 13, 14, 13, 13, 14, 13])
    expect(findings).toEqual([{ rule: 'run-of-8', side: 'above' }])
    // a single point on the centre line breaks the run
    expect(xmrCheck([...baseline, 13, 14, 13, 12, 13, 13, 14, 13]).findings).toEqual([])
  })
})
