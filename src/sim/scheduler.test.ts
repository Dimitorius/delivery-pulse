import { describe, expect, it } from 'vitest'
import { Scheduler } from './scheduler'

describe('Scheduler', () => {
  it('pops in time order, ties in insertion order', () => {
    const s = new Scheduler()
    const out: string[] = []
    const times = [5, 1, 3, 1, 9, 3, 0]
    times.forEach((t, i) => s.push(t, () => out.push(`${t}:${i}`)))
    while (s.size) s.pop()!.run()
    expect(out).toEqual(['0:6', '1:1', '1:3', '3:2', '3:5', '5:0', '9:4'])
  })
})
