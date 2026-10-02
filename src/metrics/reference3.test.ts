// Reference tests for the stage-3b SAFe metrics (registry drafts by Cowork):
// feature and epic lead time, portfolio WIP and WSJF sequencing adherence.
// Every expected value is computed by hand in a comment.

import { describe, expect, it } from 'vitest'
import { COMPUTE } from './defs'
import { wsjfBacklog } from './defs/safe'
import { ASOF, Fixture, ctxFor, day } from './testkit'

const run = (id: string, f: Fixture, windowDays = 28, teams?: string[], asOf = ASOF) => COMPUTE[id](ctxFor(f.store(), teams, asOf, windowDays))
const sec = (r: ReturnType<typeof run>, label: string) => r.secondary!.find((s) => s.label === label)!.value

function epic(f: Fixture, id: string, created: number) {
  return f.item(id, 'p', { type: 'epic', createdAt: created })
}
function feature(f: Fixture, id: string, team: string, epicId: string | undefined, created: number, start?: number, done?: number) {
  f.item(id, team, { type: 'feature', parentId: epicId, createdAt: created })
  if (start !== undefined) f.status(id, 'In Progress', start)
  if (done !== undefined) f.status(id, 'Done', done)
  return f
}
function wsjf(f: Fixture, id: string, t: number, ubv: number, tc: number, rroe: number, jobSize: number) {
  return f.at(t, { type: 'feature.wsjf', featureId: id, ubv, tc, rroe, jobSize })
}

describe('metric:feature-lead-time', () => {
  it('P85 and P50 of (Done − created) over features under an epic', () => {
    const f = new Fixture()
    epic(f, 'E-1', day(-60))
    feature(f, 'F-1', 'a', 'E-1', day(-30), day(-20), day(5)) // 35 d
    feature(f, 'F-2', 'a', 'E-1', day(-10), day(-5), day(10)) // 20 d
    feature(f, 'F-3', 'b', 'E-1', day(0), day(1), day(14)) // 14 d
    feature(f, 'F-4', 'b', 'E-1', day(-40), day(-30), day(20)) // 60 d
    feature(f, 'F-5', 'a', undefined, day(-200), day(1), day(6)) // roadmap feature, no epic: excluded
    feature(f, 'F-6', 'a', 'E-1', day(-90), day(-80), day(-50)) // done before the window
    const r = run('feature-lead-time', f)
    // sorted [14, 20, 35, 60]: P85 = ⌈3.4⌉ = 4th = 60, P50 = ⌈2⌉ = 2nd = 20
    expect(r.n).toBe(4)
    expect(r.value).toBe(60)
    expect(sec(r, 'P50')).toBe(20)
    // team b only: [14, 60] → P85 = ⌈1.7⌉ = 2nd = 60, P50 = 1st = 14
    const b = run('feature-lead-time', f, 28, ['b'])
    expect(b.value).toBe(60)
    expect(sec(b, 'P50')).toBe(14)
  })
})

describe('metric:epic-lead-time', () => {
  it('P50 of (last child feature Done − epic created) for epics finished in the window', () => {
    const f = new Fixture()
    epic(f, 'E-1', day(-40))
    feature(f, 'F-1', 'a', 'E-1', day(-40), day(-35), day(-10))
    feature(f, 'F-2', 'b', 'E-1', day(-40), day(-30), day(4)) // last child → 44 d
    epic(f, 'E-2', day(-20))
    feature(f, 'F-3', 'a', 'E-2', day(-20), day(-15), day(10)) // → 30 d
    epic(f, 'E-3', day(0))
    feature(f, 'F-4', 'a', 'E-3', day(0), day(2), day(12)) // → 12 d
    epic(f, 'E-4', day(-10))
    feature(f, 'F-5', 'a', 'E-4', day(-10), day(-5), day(3))
    feature(f, 'F-6', 'b', 'E-4', day(-10), day(-2)) // not done → E-4 not finished
    const r = run('epic-lead-time', f)
    // finished: E-1 44, E-2 30, E-3 12 → sorted [12, 30, 44], P50 = ⌈1.5⌉ = 2nd = 30
    expect(r.n).toBe(3)
    expect(r.value).toBe(30)
    // as of day 8: E-1 (44 d, ended day 4) only → 44
    expect(run('epic-lead-time', f, 28, undefined, day(8)).value).toBe(44)
  })
})

describe('metric:portfolio-wip', () => {
  it('epics with ≥ 1 child started and ≥ 1 child not done', () => {
    const f = new Fixture()
    epic(f, 'E-1', day(-30))
    feature(f, 'F-1', 'a', 'E-1', day(-30), day(-20), day(-5))
    feature(f, 'F-2', 'b', 'E-1', day(-30), day(-10)) // started, open → E-1 in progress
    epic(f, 'E-2', day(-30))
    feature(f, 'F-3', 'a', 'E-2', day(-30)) // nothing started → not WIP
    epic(f, 'E-3', day(-30))
    feature(f, 'F-4', 'a', 'E-3', day(-30), day(-20), day(-2)) // all children done → not WIP
    epic(f, 'E-4', day(-5))
    feature(f, 'F-5', 'a', 'E-4', day(-5), day(-1)) // in progress
    feature(f, 'F-6', 'b', 'E-4', day(-5))
    const r = run('portfolio-wip', f)
    expect(r.value).toBe(2) // E-1, E-4
    // open features of the two: F-2 + F-5 + F-6 = 3
    expect(sec(r, 'features open')).toBe(3)
    // team b scope: E-1 (F-2 started, open) yes; E-4 (only F-6, not started) no → 1
    expect(run('portfolio-wip', f, 28, ['b']).value).toBe(1)
    // as of day −15: E-1 (F-1 started day −20, open) and E-3 (F-4 started, open) → 2; E-4 not created yet
    expect(run('portfolio-wip', f, 28, undefined, day(-15)).value).toBe(2)
  })
})

describe('metric:wsjf', () => {
  it('share of started features that were in the top third of the WSJF-ranked ART backlog when they started', () => {
    const f = new Fixture()
    // Six features estimated at day 0: WSJF = (UBV + TC + RR|OE) / job size
    const est: [string, string, number, number, number, number][] = [
      ['F-1', 'a', 8, 5, 3, 2], // 16/2 = 8
      ['F-2', 'b', 5, 5, 2, 3], // 12/3 = 4
      ['F-3', 'a', 3, 2, 1, 2], // 6/2 = 3
      ['F-4', 'b', 2, 2, 2, 3], // 6/3 = 2
      ['F-5', 'a', 1, 2, 1, 4], // 4/4 = 1
      ['F-6', 'b', 1, 1, 1, 6], // 3/6 = 0.5
    ]
    for (const [id, team, ubv, tc, rroe, js] of est) {
      feature(f, id, team, 'E-1', day(-1))
      wsjf(f, id, day(0), ubv, tc, rroe, js)
    }
    f.status('F-1', 'In Progress', day(2)) // backlog 6 → top ⅓ = ranks ≤ 2; F-1 rank 1 ✓
    f.status('F-4', 'In Progress', day(5)) // backlog 5 (F-2..F-6) → top = ≤ 2; F-4 (2) rank 3 ✗
    f.status('F-2', 'In Progress', day(8)) // backlog 4 (F-2,F-3,F-5,F-6) → top = ≤ 2; F-2 rank 1 ✓
    f.status('F-5', 'In Progress', day(12)) // backlog 3 (F-3,F-5,F-6) → top = ≤ 1; F-5 rank 2 ✗
    const r = run('wsjf', f)
    // 2 of 4 in order → 50 %
    expect(r.value).toBe(50)
    expect(sec(r, 'in top ⅓')).toBe(2)
    expect(sec(r, 'started')).toBe(4)
    // the backlog as it was when F-4 started
    expect(wsjfBacklog(f.store(), day(5)).map((x) => [x.feature.id, x.rank])).toEqual([
      ['F-2', 1],
      ['F-3', 2],
      ['F-4', 3],
      ['F-5', 4],
      ['F-6', 5],
    ])
  })

  it('uses the estimate in force when the feature started (re-estimated at PI Planning)', () => {
    const f = new Fixture()
    for (const id of ['F-1', 'F-2', 'F-3']) feature(f, id, 'a', 'E-1', day(-1))
    wsjf(f, 'F-1', day(0), 1, 1, 1, 3) // 1
    wsjf(f, 'F-2', day(0), 5, 5, 5, 3) // 5
    wsjf(f, 'F-3', day(0), 3, 3, 3, 3) // 3
    wsjf(f, 'F-1', day(10), 8, 8, 8, 2) // re-estimated: 12 → rank 1
    f.status('F-1', 'In Progress', day(12)) // backlog 3, top = ≤ 1: rank 1 ✓ (with the old estimate it would be 3 ✗)
    const r = run('wsjf', f)
    expect(r.value).toBe(100)
    expect(r.records[0].value).toBe(1)
  })
})
