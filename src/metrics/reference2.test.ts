// Reference tests for the stage-2 metrics (core 50 + SYNTHETIC). As in
// reference.test.ts, every expected value is computed by hand in a comment.

import { describe, expect, it } from 'vitest'
import { COMPUTE } from './defs'
import { ASOF, Fixture, T0, ctxFor, day, hours } from './testkit'

const run = (id: string, f: Fixture, teams?: string[], asOf = ASOF, windowDays = 28) =>
  COMPUTE[id](ctxFor(f.store(), teams, asOf, windowDays))
const sec = (r: ReturnType<typeof run>, label: string) => r.secondary!.find((s) => s.label === label)!.value
const MIN = 60_000

function sprint(f: Fixture, id: string, teamId: string, n: number, start: number, items: string[], goalMet?: boolean, ip = false) {
  const end = start + 14 * 86_400_000
  f.at(start, { type: 'iteration.planned', iteration: { id, kind: 'sprint', teamId, name: id, index: n, start, end, ip: ip || undefined } })
  f.at(start, { type: 'iteration.committed', iterationId: id, itemIds: items, goalItemIds: [] })
  for (const it of items) f.at(start, { type: 'item.sprint', itemId: it, iterationId: id })
  f.at(end, { type: 'iteration.closed', iterationId: id, goalMet })
  return end
}

function mr(f: Fixture, id: string, opts: { opened: number; merged?: number; deployed?: number; size?: number; ai?: boolean; team?: string }) {
  const teamId = opts.team ?? 'a'
  f.at(opts.opened, { type: 'mr.opened', mr: { id, itemId: `I-${id}`, teamId, firstCommitAt: opts.opened, size: opts.size ?? 50, aiAssisted: !!opts.ai } })
  if (opts.merged !== undefined) f.at(opts.merged, { type: 'mr.merged', mrId: id })
  if (opts.deployed !== undefined) {
    f.at(opts.deployed, { type: 'deployment', deployment: { id: `D-${id}`, teamId, service: `${teamId}-svc`, mrIds: [id], kind: 'regular' } })
  }
  return f
}

function run_(f: Fixture, id: string, start: number, mins: number, result: 'success' | 'failed', team = 'a', retryOf?: string) {
  return f.at(start + mins * MIN, { type: 'pipeline.finished', run: { id, teamId: team, branch: 'main', startedAt: start, result, retryOf } })
}

function incident(f: Fixture, id: string, o: { sev: 1 | 2 | 3 | 4; started: number; detected: number; acked?: number; resolved?: number; causeMrId?: string }) {
  f.at(o.detected, { type: 'incident.opened', incident: { id, teamId: 'a', service: 'a-svc', sev: o.sev, title: id, startedAt: o.started, causeMrId: o.causeMrId } })
  if (o.acked !== undefined) f.at(o.acked, { type: 'incident.acked', incidentId: id })
  if (o.resolved !== undefined) f.at(o.resolved, { type: 'incident.resolved', incidentId: id })
  return f
}

// ---- Flow -------------------------------------------------------------------

describe('metric:lead-time', () => {
  it('P85 of (Done − created) in days', () => {
    const f = new Fixture()
    f.flow('A-1', 'a', day(1), day(5), { createdAt: day(-10) }) // 15 d
    f.flow('A-2', 'a', day(1), day(2), { createdAt: day(0) }) // 2 d
    f.flow('A-3', 'a', day(3), day(8), { createdAt: day(-2) }) // 10 d
    const r = run('lead-time', f)
    // sorted [2,10,15]: P85 = ⌈2.55⌉ = 3rd = 15, P50 = ⌈1.5⌉ = 2nd = 10
    expect(r.value).toBe(15)
    expect(sec(r, 'P50')).toBe(10)
  })
})

describe('metric:queue-size', () => {
  it('WIP items waiting in a queue status at asOf, by stage', () => {
    const f = new Fixture()
    f.flow('A-1', 'a', day(1)).status('A-1', 'Ready for Review', day(20)) // waiting for review
    f.flow('A-2', 'a', day(2)).status('A-2', 'Ready for QA', day(25)) // waiting for QA
    f.flow('A-3', 'a', day(3)).status('A-3', 'In Review', day(26)) // active, not queued
    f.flow('A-4', 'a', day(4)).status('A-4', 'Ready for QA', day(10)).status('A-4', 'Done', day(12)) // done
    const r = run('queue-size', f)
    expect(r.value).toBe(2)
    expect(sec(r, 'Ready for Review')).toBe(1)
    expect(sec(r, 'Ready for QA')).toBe(1)
  })
})

describe('metric:sle-attainment', () => {
  it('share of items done within the SLE fixed at the window start', () => {
    const f = new Fixture()
    for (let ct = 1; ct <= 10; ct++) f.flow(`A-h${ct}`, 'a', day(-50), day(-50 + ct)) // before the window
    // SLE = P85 of [1..10] = ⌈8.5⌉ = 9th = 9 d
    f.flow('A-1', 'a', day(1), day(6)) // 5 d ✓
    f.flow('A-2', 'a', day(2), day(11)) // 9 d ✓ (≤ SLE)
    f.flow('A-3', 'a', day(3), day(15)) // 12 d ✗
    f.flow('A-4', 'a', day(4), day(7)) // 3 d ✓
    // 3 of 4 = 75 %
    expect(run('sle-attainment', f, ['a']).value).toBe(75)
  })
})

describe('metric:flow-distribution', () => {
  it('feature share of items done, other flow types alongside', () => {
    const f = new Fixture()
    for (let i = 0; i < 3; i++) f.flow(`A-f${i}`, 'a', day(1), day(3))
    f.flow('A-bug', 'a', day(1), day(3), { type: 'bug', flowType: 'defect' })
    f.flow('A-debt', 'a', day(1), day(3), { type: 'task', flowType: 'debt' })
    const r = run('flow-distribution', f)
    // 3 of 5 features = 60 %; defect 1/5 = 20 %; debt 20 %; risk 0 %
    expect(r.value).toBe(60)
    expect(sec(r, 'defect')).toBe(20)
    expect(sec(r, 'debt')).toBe(20)
    expect(sec(r, 'risk')).toBe(0)
  })
})

// ---- Scrum ------------------------------------------------------------------

describe('metric:sprint-goal-success', () => {
  it('share of closed sprints whose goal was met', () => {
    const f = new Fixture()
    const outcomes = [true, true, false, true, undefined] // the last sprint had no goal
    outcomes.forEach((g, n) => sprint(f, `A-S${n}`, 'a', n, day(-80 + 14 * n), [], g))
    // 3 met of 4 sprints with a goal = 75 %
    const r = run('sprint-goal-success', f, ['a'])
    expect(r.value).toBe(75)
    expect(r.n).toBe(4)
  })
})

describe('metric:carry-over', () => {
  it('committed items not Done by sprint end / committed', () => {
    const f = new Fixture()
    const s1 = day(-30)
    for (const id of ['c1', 'c2', 'c3', 'c4']) f.item(id, 'a', { createdAt: s1 - 1 })
    f.flow('c-done1', 'a', s1 + 1, s1 + 86_400_000) // placeholder not in sprint
    sprint(f, 'A-S1', 'a', 1, s1, ['c1', 'c2', 'c3', 'c4'])
    for (const id of ['c1', 'c2', 'c3']) f.status(id, 'In Progress', s1 + 1).status(id, 'Done', s1 + 5 * 86_400_000) // c4 not done
    const s2 = s1 + 14 * 86_400_000
    for (const id of ['d1', 'd2']) f.item(id, 'a', { createdAt: s2 - 1 })
    sprint(f, 'A-S2', 'a', 2, s2, ['d1', 'd2'])
    for (const id of ['d1', 'd2']) f.status(id, 'In Progress', s2 + 1).status(id, 'Done', s2 + 3 * 86_400_000)
    // 1 of 6 committed not done = 16.67 %
    expect(run('carry-over', f, ['a']).value).toBeCloseTo(100 / 6, 9)
  })
})

describe('metric:sprint-scope-change', () => {
  it('unplanned items added after planning / committed; pull-ahead shown apart', () => {
    const f = new Fixture()
    const s = day(-20)
    for (const id of ['p1', 'p2', 'p3', 'p4']) f.item(id, 'a', { createdAt: s - 1 })
    f.item('u1', 'a', { createdAt: s + 2 * 86_400_000, planned: false, type: 'bug' })
    f.item('x1', 'a', { createdAt: s - 1 }).item('x2', 'a', { createdAt: s - 1 })
    sprint(f, 'A-S1', 'a', 1, s, ['p1', 'p2', 'p3', 'p4'])
    for (const id of ['u1', 'x1', 'x2']) f.at(s + 3 * 86_400_000, { type: 'item.sprint', itemId: id, iterationId: 'A-S1' })
    const r = run('sprint-scope-change', f, ['a'])
    // 1 unplanned added / 4 committed = 25 %; x1, x2 pulled ahead
    expect(r.value).toBe(25)
    expect(sec(r, 'pulled ahead')).toBe(2)
  })
})

describe('metric:velocity', () => {
  it('sum over teams of the median points of the last 3 development sprints', () => {
    const f = new Fixture()
    const plan: [string, number[]][] = [
      ['a', [30, 10, 14, 12]], // last 3: [10,14,12] → median 12
      ['b', [2, 5, 7, 9]], // last 3: [5,7,9] → median 7
    ]
    for (const [team, pts] of plan) {
      pts.forEach((p, n) => {
        const start = day(-100 + 14 * n)
        const id = `${team}-S${n}`
        f.item(`${id}-x`, team, { points: p, createdAt: start - 1 })
        sprint(f, id, team, n, start, [`${id}-x`])
        f.status(`${id}-x`, 'In Progress', start + 1).status(`${id}-x`, 'Done', start + 5 * 86_400_000)
      })
      // an IP iteration afterwards is ignored even with more points
      const ipStart = day(-100 + 14 * 4)
      f.item(`${team}-ip-x`, team, { points: 50, createdAt: ipStart - 1 })
      sprint(f, `${team}-IP`, team, 4, ipStart, [`${team}-ip-x`], undefined, true)
      f.status(`${team}-ip-x`, 'In Progress', ipStart + 1).status(`${team}-ip-x`, 'Done', ipStart + 86_400_000)
    }
    // 12 + 7 = 19
    expect(run('velocity', f).value).toBe(19)
  })
})

// ---- DORA / PR / CI ----------------------------------------------------------

describe('metric:rework-rate', () => {
  it('rollback + hotfix deployments / all deployments', () => {
    const f = new Fixture()
    for (let i = 0; i < 18; i++) f.at(day(1) + i * hours(3), { type: 'deployment', deployment: { id: `D${i}`, teamId: 'a', service: 'a-svc', mrIds: [], kind: 'regular' } })
    f.at(day(5), { type: 'deployment', deployment: { id: 'RB', teamId: 'a', service: 'a-svc', mrIds: [], kind: 'rollback' } })
    f.at(day(6), { type: 'deployment', deployment: { id: 'HF', teamId: 'a', service: 'a-svc', mrIds: [], kind: 'hotfix' } })
    // 2 of 20 = 10 %
    expect(run('rework-rate', f).value).toBe(10)
  })
})

describe('metric:time-to-merge', () => {
  it('P50 of (merged − opened) in hours', () => {
    const f = new Fixture()
    ;[1, 4, 20, 50].forEach((h, i) => mr(f, `M${i}`, { opened: day(3 + i), merged: day(3 + i) + hours(h) }))
    mr(f, 'M-open', { opened: day(10) }) // not merged → not in sample
    const r = run('time-to-merge', f)
    // sorted [1,4,20,50]: P50 = 2nd = 4 h, P85 = ⌈3.4⌉ = 4th = 50 h
    expect(r.value).toBeCloseTo(4, 9)
    expect(sec(r, 'P85')).toBeCloseTo(50, 9)
  })
})

describe('metric:pr-size', () => {
  it('median changed lines of merged MRs', () => {
    const f = new Fixture()
    ;[50, 80, 300].forEach((size, i) => mr(f, `M${i}`, { opened: day(2 + i), merged: day(2 + i) + hours(2), size }))
    const r = run('pr-size', f)
    // sorted [50,80,300]: P50 = 2nd = 80, P85 = ⌈2.55⌉ = 3rd = 300
    expect(r.value).toBe(80)
    expect(sec(r, 'P85')).toBe(300)
  })
})

describe('metric:pipeline-duration', () => {
  it('P95 of main pipeline run durations in minutes', () => {
    const f = new Fixture()
    ;[5, 6, 7, 8, 20].forEach((m, i) => run_(f, `CI-${i}`, day(1 + i), m, 'success'))
    const r = run('pipeline-duration', f)
    // sorted [5,6,7,8,20]: P95 = ⌈4.75⌉ = 5th = 20, P50 = 3rd = 7
    expect(r.value).toBeCloseTo(20, 9)
    expect(sec(r, 'P50')).toBeCloseTo(7, 9)
  })
})

describe('metric:flaky-rate', () => {
  it('failed runs that went green on a re-run / all runs', () => {
    const f = new Fixture()
    for (let i = 0; i < 47; i++) run_(f, `OK-${i}`, day(1) + i * hours(4), 7, 'success')
    run_(f, 'F1', day(20), 7, 'failed')
    run_(f, 'R1', day(20) + 10 * MIN, 7, 'success', 'a', 'F1') // re-run of F1 → F1 was flaky
    run_(f, 'F2', day(22), 7, 'failed') // real failure, no re-run
    // 50 runs, 1 flaky = 2 %
    expect(run('flaky-rate', f).value).toBe(2)
  })
})

describe('metric:red-main-time', () => {
  it('share of team-time main was red', () => {
    const f = new Fixture()
    run_(f, 'F', day(10) - 7 * MIN, 7, 'failed') // red from day 10 00:00
    run_(f, 'OK', day(10) + hours(6) - 7 * MIN, 7, 'success') // green at 06:00 → 6 h red
    run_(f, 'B-OK', day(12), 7, 'success', 'b')
    // 6 h / (28 d × 24 h × 2 teams = 1,344 h) = 0.4464 %
    expect(run('red-main-time', f).value).toBeCloseTo((100 * 6) / 1344, 9)
  })
})

// ---- Quality & reliability -----------------------------------------------------

describe('metric:escaped-defects', () => {
  it('production bugs created in the window, per week', () => {
    const f = new Fixture()
    for (let i = 0; i < 3; i++) f.item(`P${i}`, 'a', { type: 'bug', foundIn: 'production', createdAt: day(2 + i) })
    f.item('I1', 'a', { type: 'bug', foundIn: 'internal', createdAt: day(5) })
    f.item('P-old', 'a', { type: 'bug', foundIn: 'production', createdAt: day(-3) })
    // 3 / 4 weeks = 0.75
    expect(run('escaped-defects', f).value).toBe(0.75)
  })
})

describe('metric:reopen-rate', () => {
  it('items moved out of Done in the window / items reaching Done in the window', () => {
    const f = new Fixture()
    for (let i = 0; i < 9; i++) f.flow(`A-${i}`, 'a', day(1), day(3))
    f.flow('A-r', 'a', day(1), day(4)).status('A-r', 'In Progress', day(6)).status('A-r', 'Done', day(9)) // reopened
    // 1 reopened of 10 done = 10 %
    expect(run('reopen-rate', f).value).toBe(10)
  })
})

describe('metric:incidents-by-severity', () => {
  it('SEV1 + SEV2 incidents detected in the window', () => {
    const f = new Fixture()
    const sevs: (1 | 2 | 3)[] = [1, 2, 2, 3, 3, 3]
    sevs.forEach((sev, i) => incident(f, `INC-${i}`, { sev, started: day(2 + i), detected: day(2 + i) + MIN }))
    incident(f, 'INC-old', { sev: 1, started: day(-5), detected: day(-5) })
    const r = run('incidents-by-severity', f)
    expect(r.value).toBe(3)
    expect(sec(r, 'SEV3')).toBe(3)
  })
})

describe('metric:mtta', () => {
  it('P50 of (acknowledged − detected) in minutes', () => {
    const f = new Fixture()
    ;[2, 4, 10].forEach((m, i) => incident(f, `INC-${i}`, { sev: 3, started: day(3 + i), detected: day(3 + i), acked: day(3 + i) + m * MIN }))
    // sorted [2,4,10]: P50 = 2nd = 4 min
    expect(run('mtta', f).value).toBeCloseTo(4, 9)
  })
})

describe('metric:incident-mttr', () => {
  it('P50 of (resolved − impact start) in minutes, all incidents', () => {
    const f = new Fixture()
    ;[30, 45, 200].forEach((m, i) => incident(f, `INC-${i}`, { sev: 3, started: day(3 + i), detected: day(3 + i) + 5 * MIN, resolved: day(3 + i) + m * MIN }))
    // sorted [30,45,200]: P50 = 45 min
    expect(run('incident-mttr', f).value).toBeCloseTo(45, 9)
  })
})

function sli(f: Fixture, start: number, total: number, bad: number, teamId = 'a') {
  return f.at(start + hours(1), { type: 'sli.windows', windows: [{ service: `${teamId}-svc`, teamId, start, total, bad }] })
}

describe('metric:slo-attainment', () => {
  it('good / total requests over the window, with error budget left', () => {
    const f = new Fixture()
    sli(f, day(1), 400_000, 100)
    sli(f, day(10), 600_000, 400)
    sli(f, day(-2), 1_000_000, 900_000) // outside the window
    const r = run('slo-attainment', f)
    // bad 500 of 1,000,000 → 99.95 %; budget = 0.1 % · 1,000,000 = 1,000 → 50 % left
    expect(r.value).toBeCloseTo(99.95, 9)
    expect(sec(r, 'error budget left')).toBeCloseTo(50, 9)
  })
})

describe('metric:error-budget-burn', () => {
  it('7-day error rate / allowed error rate (0.1 %)', () => {
    const f = new Fixture()
    sli(f, day(23), 60_000, 100)
    sli(f, day(26), 40_000, 100)
    sli(f, day(10), 1_000_000, 50_000) // older than 7 days
    // 200 / 100,000 = 0.2 % → 0.2 / 0.1 = 2.0
    expect(run('error-budget-burn', f).value).toBeCloseTo(2, 9)
  })
})

describe('metric:postmortem-action-closure', () => {
  it('actions of postmortems held 30–120 days ago closed within 30 days', () => {
    const f = new Fixture()
    incident(f, 'INC-1', { sev: 1, started: day(-45), detected: day(-45), resolved: day(-44) })
    f.at(day(-40), { type: 'incident.postmortem', incidentId: 'INC-1', actionItemIds: ['X1', 'X2', 'X3', 'X4'] })
    for (const [id, doneDay] of [['X1', -35], ['X2', -20], ['X3', -11], ['X4', -5]] as const) {
      f.flow(id, 'a', day(-39), day(doneDay), { type: 'task' })
    }
    // deadline = day −40 + 30 = day −10: X1, X2, X3 on time, X4 late
    incident(f, 'INC-2', { sev: 2, started: day(8), detected: day(8), resolved: day(9) })
    f.at(day(10), { type: 'incident.postmortem', incidentId: 'INC-2', actionItemIds: ['Y1'] }) // only 18 days old → excluded
    f.item('Y1', 'a', { type: 'task' })
    // 3 of 4 = 75 %
    expect(run('postmortem-action-closure', f).value).toBe(75)
  })
})

// ---- Program ------------------------------------------------------------------

function dep(f: Fixture, id: string, created: number, needBy: number, resolved?: number) {
  f.at(created, { type: 'dependency.created', dependency: { id, fromItemId: `${id}-c`, toItemId: `${id}-p`, fromTeamId: 'a', toTeamId: 'b', needBy } })
  if (resolved !== undefined) f.at(resolved, { type: 'dependency.resolved', dependencyId: id })
  return f
}

describe('metric:dependency-lead-time', () => {
  it('P50 of (resolved − created) in days over the 12-week window', () => {
    const f = new Fixture()
    dep(f, 'L1', day(-20), day(0), day(5)) // 25 d
    dep(f, 'L2', day(0), day(9), day(10)) // 10 d
    dep(f, 'L3', day(1), day(9), day(4)) // 3 d
    dep(f, 'L4', day(2), day(9)) // still open
    // sorted [3,10,25]: P50 = 10
    expect(run('dependency-lead-time', f, undefined, ASOF, 84).value).toBe(10)
  })
})

function milestone(f: Fixture, id: string, due: number, achieved?: number) {
  f.at(day(-50), { type: 'milestone.planned', milestone: { id, name: id, piId: 'PI-9', due, featureIds: [] } })
  if (achieved !== undefined) f.at(achieved, { type: 'milestone.achieved', milestoneId: id })
}

describe('metric:milestone-hit-rate', () => {
  it('milestones due in the window reached by their due date', () => {
    const f = new Fixture()
    milestone(f, 'M1', day(10), day(9)) // hit
    milestone(f, 'M2', day(20), day(22)) // late
    milestone(f, 'M3', day(25)) // not reached
    milestone(f, 'M4', day(40)) // not due yet
    // 1 of 3 = 33.3 %
    expect(run('milestone-hit-rate', f).value).toBeCloseTo(100 / 3, 9)
  })
})

describe('metric:critical-path-drift', () => {
  it('largest slip of a current-PI dependency past its need-by date, in working days', () => {
    const f = new Fixture()
    f.at(day(-10), { type: 'iteration.planned', iteration: { id: 'PI-9', kind: 'pi', name: 'PI 9', index: 8, start: day(-10), end: day(60) } })
    dep(f, 'L1', day(-9), day(10), day(14)) // need Thu 11 Jun, delivered Mon 15 Jun → Thu + Fri = 2 wd
    dep(f, 'L2', day(-9), day(20)) // need Sun 21 Jun (= Mon 22 start), open at Mon 29 Jun → 5 wd
    dep(f, 'L3', day(-9), day(30)) // not due yet → 0
    dep(f, 'L-old', day(-30), day(-20)) // created before this PI
    const r = run('critical-path-drift', f)
    expect(r.value).toBe(5)
    expect(sec(r, 'links')).toBe(3)
  })
})

describe('metric:program-scope-growth', () => {
  it('committed PI stories added after PI planning / committed at planning', () => {
    const f = new Fixture()
    f.at(day(-10), { type: 'iteration.planned', iteration: { id: 'PI-9', kind: 'pi', name: 'PI 9', index: 8, start: day(-10), end: day(60) } })
    for (let i = 0; i < 10; i++) f.item(`S${i}`, 'a', { piId: 'PI-9', createdAt: day(-10) })
    f.item('G1', 'a', { piId: 'PI-9', createdAt: day(3) }).item('G2', 'a', { piId: 'PI-9', createdAt: day(12) })
    f.item('ST', 'a', { piId: 'PI-9', piStretch: true, createdAt: day(5) }) // stretch: not committed scope
    // 2 / 10 = 20 %
    expect(run('program-scope-growth', f).value).toBe(20)
  })
})

describe('metric:risk-exposure', () => {
  it('Σ probability × impact of open risks at their latest review', () => {
    const f = new Fixture()
    const raise = (id: string, t: number, probability: number, impact: number) =>
      f.at(t, { type: 'risk.raised', risk: { id, title: id, probability, impact, ownerTeamId: 'a' } })
    raise('R1', day(1), 0.5, 20) // 10
    raise('R2', day(2), 0.2, 10)
    f.at(day(20), { type: 'risk.updated', riskId: 'R2', probability: 0.4, impact: 10 }) // 4
    raise('R3', day(3), 0.9, 50)
    f.at(day(15), { type: 'risk.closed', riskId: 'R3', outcome: 'mitigated' }) // closed
    raise('R4', day(30), 0.5, 100) // raised after asOf
    // 10 + 4 = 14 person-days
    expect(run('risk-exposure', f).value).toBeCloseTo(14, 9)
  })
})

describe('metric:investment-allocation', () => {
  it('feature share of items done; debt and KTLO alongside', () => {
    const f = new Fixture()
    for (let i = 0; i < 6; i++) f.flow(`F${i}`, 'a', day(1), day(3))
    for (let i = 0; i < 2; i++) f.flow(`D${i}`, 'a', day(1), day(3), { type: 'task', investment: 'debt' })
    for (let i = 0; i < 2; i++) f.flow(`K${i}`, 'a', day(1), day(3), { type: 'bug', investment: 'ktlo' })
    const r = run('investment-allocation', f)
    // 6 / 10 = 60 %, debt 20 %, KTLO 20 %
    expect(r.value).toBe(60)
    expect(sec(r, 'KTLO')).toBe(20)
  })
})

// ---- Forecast -------------------------------------------------------------------

/** Two items finished at 12:00 on every weekday from Mon 30 Mar to Fri 26 Jun. */
function steadyThroughput(f: Fixture) {
  for (let d = -63; d < 28; d++) {
    const dow = new Date(day(d)).getUTCDay()
    if (dow === 0 || dow === 6) continue
    f.flow(`T${d}a`, 'a', day(d) + hours(9), day(d) + hours(12)).flow(`T${d}b`, 'a', day(d) + hours(9), day(d) + hours(12))
  }
  return f
}

describe('metric:mc-how-many', () => {
  it('constant throughput: 2 items/day → exactly 20 items in 10 working days', () => {
    const r = run('mc-how-many', steadyThroughput(new Fixture()), ['a'])
    // weekly samples all 10 → every trial = 10 + 10 = 20 → P15 = 20
    expect(r.value).toBe(20)
    expect(sec(r, 'weekly samples')).toBe(6)
  })
})

describe('metric:forecast-accuracy', () => {
  it('backtest: every past "at least 20" forecast was met', () => {
    const r = run('forecast-accuracy', steadyThroughput(new Fixture()), ['a'])
    // anchors 15 Jun … 11 May (k = 2…7; earlier ones lack 6 weeks of history):
    // forecast 20, actual 10 weekdays × 2 = 20 → met 6 of 6 = 100 %
    expect(r.value).toBe(100)
    expect(r.n).toBe(6)
  })
})

// ---- SAFe / AI ----------------------------------------------------------------

describe('metric:pi-predictability', () => {
  it('actual BV (all objectives) / planned BV (committed), last scored PI', () => {
    const f = new Fixture()
    const obj = (id: string, piId: string, committed: boolean, plannedBv: number, actualBv: number, scored: number) => {
      f.at(scored - 60 * 86_400_000, { type: 'objective.planned', objective: { id, piId, teamId: 'a', featureId: `F-${id}`, title: id, committed, plannedBv } })
      f.at(scored, { type: 'objective.scored', objectiveId: id, actualBv })
    }
    obj('A', 'PI-2', true, 10, 8, day(5))
    obj('B', 'PI-2', true, 5, 4, day(5))
    obj('C', 'PI-2', false, 5, 3, day(5)) // uncommitted: counts in actual only
    obj('OLD', 'PI-1', true, 10, 2, day(-60)) // earlier PI
    // (8 + 4 + 3) / (10 + 5) = 100 %
    expect(run('pi-predictability', f).value).toBe(100)
  })
})

describe('metric:ai-share', () => {
  it('AI-assisted share of merged MRs', () => {
    const f = new Fixture()
    for (let i = 0; i < 10; i++) mr(f, `M${i}`, { opened: day(2 + i), merged: day(2 + i) + hours(3), ai: i < 4 })
    // 4 / 10 = 40 %
    expect(run('ai-share', f).value).toBe(40)
  })
})

describe('metric:ai-cfr-ratio', () => {
  it('CFR of AI-assisted changes / CFR of other changes', () => {
    const f = new Fixture()
    for (let i = 0; i < 4; i++) mr(f, `AI${i}`, { opened: day(1 + i), merged: day(1 + i) + hours(2), deployed: day(1 + i) + hours(3), ai: true })
    for (let i = 0; i < 10; i++) mr(f, `H${i}`, { opened: day(1 + i), merged: day(1 + i) + hours(2), deployed: day(1 + i) + hours(3) })
    incident(f, 'INC-1', { sev: 3, started: day(8), detected: day(8), causeMrId: 'AI0' })
    incident(f, 'INC-2', { sev: 3, started: day(9), detected: day(9), causeMrId: 'H3' })
    // AI 1/4 = 25 %, other 1/10 = 10 % → 2.5
    const r = run('ai-cfr-ratio', f)
    expect(r.value).toBeCloseTo(2.5, 9)
  })
})

// ---- SYNTHETIC ------------------------------------------------------------------

function survey(f: Fixture, id: string, teamId: string, instrument: 'DXI' | 'eNPS', score: number, t: number) {
  f.at(t, { type: 'survey.snapshot', survey: { id, teamId, instrument, score, responses: 5 } })
}

describe('metric:dxi', () => {
  it('median of the latest team scores', () => {
    const f = new Fixture()
    survey(f, 's1', 'a', 'DXI', 70, day(-30))
    survey(f, 's2', 'a', 'DXI', 74, day(20)) // latest for a
    survey(f, 's3', 'b', 'DXI', 68, day(10))
    // [68, 74] → nearest-rank median = 1st = 68
    expect(run('dxi', f).value).toBe(68)
  })
})

describe('metric:enps', () => {
  it('median of the latest team eNPS', () => {
    const f = new Fixture()
    survey(f, 'e1', 'a', 'eNPS', 30, day(5))
    survey(f, 'e2', 'b', 'eNPS', 50, day(6))
    expect(run('enps', f).value).toBe(30)
  })
})

describe('metric:ebm-current-value', () => {
  it('latest CSAT at asOf', () => {
    const f = new Fixture()
    f.at(day(-10), { type: 'value.snapshot', value: { id: 'v1', measure: 'csat', value: 4.1 } })
    f.at(day(20), { type: 'value.snapshot', value: { id: 'v2', measure: 'csat', value: 4.4 } })
    f.at(day(30), { type: 'value.snapshot', value: { id: 'v3', measure: 'csat', value: 4.6 } }) // after asOf
    const r = run('ebm-current-value', f)
    expect(r.value).toBe(4.4)
    expect(sec(r, 'previous')).toBe(4.1)
  })
})

describe('metric:cpi', () => {
  it('earned value / actual cost', () => {
    const f = new Fixture()
    f.flow('A-1', 'a', day(1), day(3), { points: 8 }).flow('A-2', 'a', day(1), day(5), { points: 12 })
    f.at(day(7), { type: 'cost.entry', cost: { id: 'c1', teamId: 'a', amount: 6, category: 'people' } })
    f.at(day(14), { type: 'cost.entry', cost: { id: 'c2', teamId: 'a', amount: 4, category: 'tooling' } })
    // EV = 20 pts × 0.56 = 11.2 k€; AC = 10 k€ → 1.12
    expect(run('cpi', f).value).toBeCloseTo(1.12, 9)
  })
})

it('fixture sanity: T0 is a Monday', () => {
  expect(new Date(T0).getUTCDay()).toBe(1)
})
