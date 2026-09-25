// Reference tests: every live metric is checked against a value computed by
// hand from a tiny event log. The arithmetic is written out in comments so a
// reviewer can verify it without running code.

import { describe, expect, it } from 'vitest'
import { COMPUTE } from './defs'
import { monteCarloWhen } from './defs/forecast'
import { percentile } from './stats'
import { ASOF, Fixture, T0, ctxFor, day, hours } from './testkit'

const run = (id: string, f: Fixture, teams?: string[], asOf?: number) => COMPUTE[id](ctxFor(f.store(), teams, asOf))
const sec = (r: ReturnType<typeof run>, label: string) => r.secondary!.find((s) => s.label === label)!.value

describe('percentile (nearest rank)', () => {
  it('takes element ⌈p/100 · n⌉ of the sorted sample', () => {
    expect(percentile([10, 1, 3, 2, 4], 85)).toBe(10) // ⌈4.25⌉ = 5th
    expect(percentile([10, 1, 3, 2, 4], 50)).toBe(3) // ⌈2.5⌉ = 3rd
    expect(percentile([5, 1, 2, 4], 50)).toBe(2) // ⌈2⌉ = 2nd
    expect(percentile([], 50)).toBeNull()
  })
})

describe('metric:throughput', () => {
  it('counts flow items done in the window, per week', () => {
    const f = new Fixture()
    for (let i = 0; i < 5; i++) f.flow(`A-${i}`, 'a', day(i), day(i + 2)) // done d2..d6 → in window
    f.flow('A-old', 'a', day(-5), day(-1)) // done before window
    f.flow('A-edge', 'a', day(-5), T0) // exactly at window start → excluded (window is (start, asOf])
    f.flow('A-feat', 'a', day(1), day(3), { type: 'feature' }) // container, not a flow item
    f.flow('B-1', 'b', day(1), day(3)) // other team
    // Team A: 5 items / 4 weeks = 1.25 per week
    expect(run('throughput', f, ['a']).value).toBe(1.25)
    // Program: 6 items / 4 weeks = 1.5
    expect(run('throughput', f).value).toBe(1.5)
  })
})

describe('metric:cycle-time', () => {
  it('P85 and P50 of (Done − first In Progress) in days, over the merged sample', () => {
    const f = new Fixture()
    f.flow('A-1', 'a', day(10), day(11)) // 1 d
    f.flow('A-2', 'a', day(10), day(12)) // 2 d
    f.flow('A-3', 'a', day(10), day(13)) // 3 d
    f.flow('B-1', 'b', day(10), day(14)) // 4 d
    f.flow('B-2', 'b', day(10), day(20)) // 10 d
    const r = run('cycle-time', f)
    // sorted [1,2,3,4,10]: P85 = ⌈4.25⌉ = 5th = 10, P50 = ⌈2.5⌉ = 3rd = 3
    expect(r.value).toBe(10)
    expect(sec(r, 'P50')).toBe(3)
    // Not the mean of team P85s (A: 3, B: 10 → 6.5): percentiles are recomputed on the union.
    expect(run('cycle-time', f, ['a']).value).toBe(3)
  })
})

describe('metric:flow-efficiency', () => {
  it('Σ active time / Σ cycle time; blocked time counts as waiting', () => {
    const f = new Fixture()
    // A-1: In Progress d0–d2 (2 d active), Ready for Review d2–d3 (1 d wait), In Review d3–d3.5 (0.5 d active)
    f.item('A-1', 'a')
      .status('A-1', 'In Progress', day(0.5))
      .status('A-1', 'Ready for Review', day(2.5))
      .status('A-1', 'In Review', day(3.5))
      .status('A-1', 'Done', day(4))
    // A-2: In Progress d10–d12 but blocked d10.5–d11.5 → 1 d active, 1 d waiting
    f.flow('A-2', 'a', day(10), day(12)).block('A-2', day(10.5), day(11.5))
    // active = 2.5 + 1 = 3.5 d, total = 3.5 + 2 = 5.5 d → 63.64 %
    expect(run('flow-efficiency', f).value).toBeCloseTo((100 * 3.5) / 5.5, 9)
  })
})

describe('metric:wip', () => {
  it('counts items past the commitment point and not Done at asOf', () => {
    const f = new Fixture()
    f.flow('A-1', 'a', day(20)) // started, not done → WIP
    f.flow('A-2', 'a', day(5), day(27)) // done before asOf
    f.flow('A-3', 'a', day(27), day(29)) // done after asOf → still WIP at asOf
    f.item('A-4', 'a').status('A-4', 'To Do', day(10)) // To Do is before commitment
    f.flow('A-5', 'a', day(29)) // starts after asOf
    expect(run('wip', f).value).toBe(2)
  })
})

describe('metric:blocked-items', () => {
  it('WIP items with an open block at asOf', () => {
    const f = new Fixture()
    f.flow('A-1', 'a', day(20)).block('A-1', day(25)) // blocked now
    f.flow('A-2', 'a', day(8)).block('A-2', day(10), day(12)) // was blocked, not now
    f.flow('A-3', 'a', day(1), day(5)).block('A-3', day(2)) // Done → not WIP
    const r = run('blocked-items', f)
    expect(r.value).toBe(1)
    expect(sec(r, 'of WIP')).toBe(50) // 1 of 2 WIP items
  })
})

describe('metric:net-flow', () => {
  it('(arrivals − departures) per week', () => {
    const f = new Fixture()
    for (let i = 0; i < 6; i++) f.flow(`A-${i}`, 'a', day(1 + i)) // 6 arrivals
    for (let i = 0; i < 4; i++) f.flow(`B-${i}`, 'b', day(-10), day(3 + i)) // 4 departures (arrived before window)
    // (6 − 4) / 4 weeks = 0.5 per week (positive = WIP growing)
    expect(run('net-flow', f).value).toBe(0.5)
  })
})

describe('metric:aging-wip', () => {
  it('WIP items older than the team SLE (P85 cycle time, last 12 weeks)', () => {
    const f = new Fixture()
    for (let ct = 1; ct <= 10; ct++) f.flow(`A-d${ct}`, 'a', day(-40), day(-40 + ct))
    // SLE = P85 of [1..10] = ⌈8.5⌉ = 9th = 9 d
    f.flow('A-old', 'a', day(18)) // age 10 d > 9 → aging
    f.flow('A-eq', 'a', day(19)) // age 9 d, not above SLE
    f.flow('A-new', 'a', day(26)) // age 2 d
    const r = run('aging-wip', f, ['a'])
    expect(r.value).toBe(1)
    expect(r.records[0].id).toBe('A-old')
  })
})

describe('metric:unplanned-work', () => {
  it('unplanned share of items done in the window', () => {
    const f = new Fixture()
    for (let i = 0; i < 6; i++) f.flow(`A-${i}`, 'a', day(1), day(2 + i))
    f.flow('A-bug', 'a', day(1), day(3), { type: 'bug', planned: false })
    f.flow('A-urgent', 'a', day(1), day(4), { type: 'task', planned: false })
    // 2 of 8 = 25 %
    expect(run('unplanned-work', f).value).toBe(25)
  })
})

function deploy(f: Fixture, id: string, teamId: string, t: number, mrIds: string[] = [], kind: 'regular' | 'rollback' = 'regular') {
  const service = teamId === 'a' ? 'a-svc' : 'b-svc'
  return f.at(t, { type: 'deployment', deployment: { id, teamId, service, mrIds, kind } })
}

describe('metric:deployment-frequency', () => {
  it('regular deployments per service per working day', () => {
    const f = new Fixture()
    for (let i = 0; i < 30; i++) deploy(f, `DA-${i}`, 'a', day(1) + i * hours(1))
    deploy(f, 'DA-rb1', 'a', day(3), [], 'rollback') // rollbacks are remediation, not counted
    deploy(f, 'DA-rb2', 'a', day(4), [], 'rollback')
    for (let i = 0; i < 10; i++) deploy(f, `DB-${i}`, 'b', day(2) + i * hours(1))
    // Window = 4 weeks = 20 working days. Program: 40 / 20 / 2 services = 1.0
    expect(run('deployment-frequency', f).value).toBe(1)
    // Team A: 30 / 20 / 1 = 1.5
    expect(run('deployment-frequency', f, ['a']).value).toBe(1.5)
  })
})

function mr(f: Fixture, id: string, firstCommitAt: number, openedAt: number, firstReviewAt?: number) {
  f.at(openedAt, { type: 'mr.opened', mr: { id, itemId: `I-${id}`, teamId: 'a', firstCommitAt, size: 50, aiAssisted: false } })
  if (firstReviewAt !== undefined) f.at(firstReviewAt, { type: 'mr.review.started', mrId: id })
  return f
}

describe('metric:lead-time-for-changes', () => {
  it('P50 of (deployed − first commit) in hours', () => {
    const f = new Fixture()
    const lts = [2, 5, 8, 30]
    lts.forEach((h, i) => {
      const deployAt = day(10 + i)
      mr(f, `M${i}`, deployAt - hours(h), deployAt - hours(h) + hours(0.5))
      deploy(f, `D${i}`, 'a', deployAt, [`M${i}`])
    })
    const r = run('lead-time-for-changes', f)
    // sorted [2,5,8,30]: P50 = ⌈2⌉ = 2nd = 5 h, P85 = ⌈3.4⌉ = 4th = 30 h
    expect(r.value).toBeCloseTo(5, 9)
    expect(sec(r, 'P85')).toBeCloseTo(30, 9)
  })
})

function incident(f: Fixture, id: string, deploymentId: string | undefined, startedAt: number, detectedAt: number, resolvedAt: number) {
  f.at(detectedAt, { type: 'incident.opened', incident: { id, teamId: 'a', service: 'a-svc', sev: 2, title: 'x', startedAt, deploymentId } })
  return f.at(resolvedAt, { type: 'incident.resolved', incidentId: id })
}

describe('metric:change-failure-rate', () => {
  it('regular deployments that caused an incident / regular deployments', () => {
    const f = new Fixture()
    for (let i = 0; i < 20; i++) deploy(f, `D${i}`, 'a', day(1 + i))
    deploy(f, 'RB', 'a', day(5) + hours(1), [], 'rollback')
    deploy(f, 'D-old', 'a', day(-3))
    incident(f, 'INC-1', 'D4', day(5), day(5) + hours(0.1), day(5) + hours(1))
    incident(f, 'INC-old', 'D-old', day(-3), day(-3), day(-2)) // deployment outside the window
    incident(f, 'INC-infra', undefined, day(8), day(8), day(8) + hours(2)) // not caused by a deployment
    // 1 failed of 20 regular deployments = 5 %
    expect(run('change-failure-rate', f).value).toBe(5)
  })
})

describe('metric:failed-deployment-recovery-time', () => {
  it('P50 of (incident resolved − failed deployment) in minutes', () => {
    const f = new Fixture()
    const mins = [20, 40, 90]
    mins.forEach((m, i) => {
      const t = day(3 + i)
      deploy(f, `D${i}`, 'a', t)
      incident(f, `INC-${i}`, `D${i}`, t, t + 5 * 60_000, t + m * 60_000)
    })
    incident(f, 'INC-infra', undefined, day(9), day(9), day(9) + hours(5)) // not deployment-caused
    // sorted [20,40,90]: P50 = ⌈1.5⌉ = 2nd = 40 min
    expect(run('failed-deployment-recovery-time', f).value).toBeCloseTo(40, 9)
  })
})

describe('metric:pr-pickup-time', () => {
  it('P50 of (first review − opened) in hours', () => {
    const f = new Fixture()
    const waits = [0.5, 1, 3, 26]
    waits.forEach((w, i) => mr(f, `M${i}`, day(4 + i), day(4 + i) + hours(1), day(4 + i) + hours(1 + w)))
    mr(f, 'M-unreviewed', day(20), day(20) + hours(1)) // no review yet → not in sample
    const r = run('pr-pickup-time', f)
    // sorted [0.5,1,3,26]: P50 = 2nd = 1 h, P85 = ⌈3.4⌉ = 4th = 26 h
    expect(r.value).toBeCloseTo(1, 9)
    expect(sec(r, 'P85')).toBeCloseTo(26, 9)
  })
})

describe('metric:main-build-success', () => {
  it('green runs on main / all runs on main', () => {
    const f = new Fixture()
    for (let i = 0; i < 50; i++) {
      const t = day(1) + i * hours(3)
      f.at(t, {
        type: 'pipeline.finished',
        run: { id: `CI-${i}`, teamId: 'a', branch: 'main', startedAt: t - hours(0.1), result: i < 2 ? 'failed' : 'success' },
      })
    }
    // 48 / 50 = 96 %
    expect(run('main-build-success', f).value).toBe(96)
  })
})

describe('metric:say-do-ratio', () => {
  it('points done by sprint end / points committed, last 3 closed sprints per team', () => {
    const f = new Fixture()
    const sprint = (n: number, items: [string, number, number | undefined][]) => {
      const start = day(-60 + 14 * n)
      const end = start + 14 * 86_400_000
      const id = `A-S${n}`
      f.at(start, { type: 'iteration.planned', iteration: { id, kind: 'sprint', teamId: 'a', name: id, index: n, start, end } })
      for (const [itemId, points, doneOffset] of items) {
        f.item(itemId, 'a', { points, createdAt: start - 1 })
        if (doneOffset !== undefined) f.status(itemId, 'In Progress', start + 1).status(itemId, 'Done', start + doneOffset * 86_400_000)
      }
      f.at(start, { type: 'iteration.committed', iterationId: id, itemIds: items.map((i) => i[0]), goalItemIds: [] })
      f.at(end, { type: 'iteration.closed', iterationId: id, goalMet: true })
    }
    sprint(0, [['S0-a', 5, undefined]]) // oldest: outside the last 3
    sprint(1, [['S1-a', 5, 3], ['S1-b', 3, 5], ['S1-c', 2, undefined]]) // 8 of 10
    sprint(2, [['S2-a', 8, 2], ['S2-b', 4, 9]]) // 12 of 12
    sprint(3, [['S3-a', 5, 4], ['S3-b', 3, 15]]) // 5 of 8 (S3-b finished after sprint end)
    // (8 + 12 + 5) / (10 + 12 + 8) = 25 / 30 = 83.33 %
    const r = run('say-do-ratio', f, ['a'])
    expect(r.value).toBeCloseTo((100 * 25) / 30, 9)
    expect(r.n).toBe(7) // committed items with points in the 3 sprints: 3 + 2 + 2
    expect(r.flags).toBeUndefined()
  })

  it('flags possible sandbagging when every one of the last 3 sprints is above 95 %', () => {
    const f = new Fixture()
    for (let n = 0; n < 3; n++) {
      const start = day(-60 + 14 * n)
      const end = start + 14 * 86_400_000
      const id = `A-S${n}`
      f.at(start, { type: 'iteration.planned', iteration: { id, kind: 'sprint', teamId: 'a', name: id, index: n, start, end } })
      f.item(`${id}-x`, 'a', { points: 10, createdAt: start - 1 }).status(`${id}-x`, 'In Progress', start + 1).status(`${id}-x`, 'Done', start + 86_400_000)
      f.at(start, { type: 'iteration.committed', iterationId: id, itemIds: [`${id}-x`], goalItemIds: [] })
      f.at(end, { type: 'iteration.closed', iterationId: id, goalMet: true })
    }
    const r = run('say-do-ratio', f, ['a'])
    expect(r.value).toBe(100)
    expect(r.flags).toEqual(['possible sandbagging: A'])
  })
})

describe('metric:overdue-dependencies', () => {
  it('open dependencies past their need-by date', () => {
    const f = new Fixture()
    const dep = (id: string, needBy: number) =>
      f.at(day(-10), { type: 'dependency.created', dependency: { id, fromItemId: `${id}-c`, toItemId: `${id}-p`, fromTeamId: 'a', toTeamId: 'b', needBy } })
    dep('D1', day(20)) // open, need-by passed → overdue
    dep('D2', day(30)) // open, not due yet
    dep('D3', day(10)).at(day(15), { type: 'dependency.resolved', dependencyId: 'D3' }) // delivered late, closed
    const r = run('overdue-dependencies', f)
    expect(r.value).toBe(1)
    expect(sec(r, 'open')).toBe(2)
  })
})

describe('metric:pi-forecast', () => {
  it('Monte Carlo: constant throughput gives an exact answer', () => {
    const build = (piEnd: number) => {
      const f = new Fixture()
      f.at(day(-30), { type: 'iteration.planned', iteration: { id: 'PI-9', kind: 'pi', name: 'PI 9', index: 8, start: day(-30), end: piEnd } })
      for (let i = 0; i < 10; i++) f.item(`P-${i}`, 'a', { piId: 'PI-9', createdAt: day(-30) })
      // Exactly one story done at 12:00 on each of the last 20 weekdays (4 of them PI stories).
      let n = 0
      for (let d = 27; n < 30; d--) {
        const dow = new Date(day(d)).getUTCDay()
        if (dow === 0 || dow === 6) continue
        const doneAt = day(d) + hours(12)
        if (n < 4) f.status(`P-${n}`, 'In Progress', doneAt - hours(3)).status(`P-${n}`, 'Done', doneAt)
        else f.flow(`X-${n}`, 'a', doneAt - hours(3), doneAt)
        n++
      }
      return f
    }
    // Remaining 6 stories at 1 per day → every trial needs 6 working days.
    // asOf Mon 29 Jun 00:00 → done by the end of the 6th working day: Mon 6 Jul 17:00 UTC.
    const onTime = run('pi-forecast', build(Date.UTC(2026, 6, 10)), ['a']) // PI ends Fri 10 Jul → 9 working days left
    expect(onTime.value).toBe(100)
    expect(sec(onTime, 'P50 date')).toBe(Date.UTC(2026, 6, 6, 17))
    expect(sec(onTime, 'P85 date')).toBe(Date.UTC(2026, 6, 6, 17))
    expect(sec(onTime, 'remaining')).toBe(6)
    const late = run('pi-forecast', build(Date.UTC(2026, 6, 3)), ['a']) // ends Fri 3 Jul → 4 days left
    expect(late.value).toBe(0)
    expect(ASOF).toBe(Date.UTC(2026, 5, 29))
  })

  it('Monte Carlo: the program is done when the last team is done (no pooling)', () => {
    const f = new Fixture()
    f.at(day(-30), { type: 'iteration.planned', iteration: { id: 'PI-9', kind: 'pi', name: 'PI 9', index: 8, start: day(-30), end: Date.UTC(2026, 6, 31) } })
    for (let i = 0; i < 6; i++) f.item(`A-${i}`, 'a', { piId: 'PI-9', createdAt: day(-30) }) // A: 6 remaining
    for (let i = 0; i < 2; i++) f.item(`B-${i}`, 'b', { piId: 'PI-9', createdAt: day(-30) }) // B: 2 remaining
    let n = 0
    for (let d = 27; n < 30; d--) {
      const dow = new Date(day(d)).getUTCDay()
      if (dow === 0 || dow === 6) continue
      const doneAt = day(d) + hours(12)
      f.flow(`XA-${n}`, 'a', doneAt - hours(3), doneAt).flow(`XB-${n}`, 'b', doneAt - hours(3), doneAt) // 1/day each
      n++
    }
    // A needs 6 days, B needs 2 → program needs max(6, 2) = 6 working days → Mon 6 Jul 17:00.
    // (Pooled throughput 2/day would wrongly say 8 / 2 = 4 days.)
    const r = run('pi-forecast', f)
    expect(sec(r, 'P50 date')).toBe(Date.UTC(2026, 6, 6, 17))
    expect(r.value).toBe(100)
  })

  it('Monte Carlo sampler: 4 items, daily throughput 0 or 4 → geometric', () => {
    // P(done on day 1) = 1/2, by day 2 = 3/4, by day 3 = 7/8 → P85 = 3 days
    const { days } = monteCarloWhen(4, [0, 4], 4000)
    expect(percentile(days, 85)).toBe(3)
    expect(days.filter((d) => d === 1).length / days.length).toBeCloseTo(0.5, 1)
  })
})
