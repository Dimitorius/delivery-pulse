// Stage 3b: Inject scenario. For every scenario, the symptom's early signals
// must move before its confirming signals (content/symptoms/<id>.md when the
// file exists, otherwise the scenario's own list), checked against a control
// run without the scenario, at two injection points.

import { describe, expect, it } from 'vitest'
import { PLAYBOOK_BY_ID, SYMPTOMS } from '../content/symptoms'
import { METRIC_BY_ID } from '../metrics/registry'
import { HISTORY_W, PI_W, SPRINT_W } from '../sim/calendar'
import { SCENARIOS, SCENARIO_BY_ID } from '../sim/scenarios'
import { Simulator } from '../sim/simulator'
import { CHECK_DAYS, checkScenario, INJECT_POINTS, leadsLag, scenarioSignals, threshold } from './scenarioCheck'

describe('scenarios match the Diagnose symptoms (content/symptoms/index.yaml)', () => {
  it('one simulator scenario per symptom that names one — twelve in all', () => {
    const named = SYMPTOMS.filter((s) => s.scenario).map((s) => s.scenario!).sort()
    expect(named).toHaveLength(12)
    expect(SCENARIOS.map((s) => s.id).sort()).toEqual(named)
  })

  it('every signal is a live registry metric; content files win over the defaults', () => {
    for (const sc of SCENARIOS) {
      const sig = scenarioSignals(sc.id)
      expect(sig.early.length, sc.id).toBeGreaterThan(0)
      expect(sig.confirming.length, sc.id).toBeGreaterThan(0)
      for (const s of [...sig.early, ...sig.confirming]) expect(METRIC_BY_ID.get(s.id)?.compute, `${sc.id}: ${s.id}`).toBeTruthy()
      expect(sig.fromContent, sc.id).toBe(PLAYBOOK_BY_ID.has(sc.id))
    }
    expect(scenarioSignals('review-bottleneck').early.map((s) => s.id)).toEqual(['queue-size', 'pr-pickup-time', 'aging-wip'])
  })

  it('reaction threshold: 25 % of the value, or of the shortfall from 100 % for a high "higher is better" percentage', () => {
    expect(threshold('cycle-time', 'up', 6)).toBe(1.5) // 25 % of 6 d
    expect(threshold('say-do-ratio', 'down', 84)).toBe(4) // shortfall 16 → 4 points
    expect(threshold('main-build-success', 'down', 97)).toBe(2) // shortfall 3 → 0.75, floor 2 points
    expect(threshold('slo-attainment', 'down', 99.98)).toBeCloseTo(0.02) // floor never above the shortfall itself
    expect(threshold('wip', 'up', 20)).toBe(5)
    expect(threshold('blocked-items', 'up', 1)).toBe(1) // count floor 2, capped by the base
  })
})

describe.each(SCENARIOS.map((s) => [s.id]))('scenario %s: early signals move before confirming ones', (id) => {
  it.each(INJECT_POINTS.map((p) => [p.label, p.w] as const))('injected at %s', (_, w) => {
    const rs = checkScenario(id, { injectW: w })
    const table = rs.map((r) => `${r.group} ${r.id}: ${r.days === null ? `no reaction in ${CHECK_DAYS} d` : `${r.days} d`}`).join('\n')
    expect(leadsLag(rs), table).toBe(true)
  })
})

describe('inject and clear', () => {
  const at = HISTORY_W + PI_W + SPRINT_W

  it('changes nothing before the injection point and logs scenario.injected / scenario.cleared', () => {
    const plain = new Simulator()
    const sim = new Simulator()
    expect(JSON.stringify(sim.advanceToWork(at))).toBe(JSON.stringify(plain.advanceToWork(at)))
    sim.inject('red-ci')
    const injected = sim.advanceToWork(at)
    expect(injected.map((e) => e.type)).toEqual(['scenario.injected'])
    expect(sim.scenario).toBe('red-ci')
    sim.advanceToWork(at + 40)
    sim.clearScenario()
    expect(sim.scenario).toBeUndefined()
    expect(sim.advanceToWork(at + 40).some((e) => e.type === 'scenario.cleared')).toBe(true)
  })

  it('a new injection replaces the active one', () => {
    const sim = new Simulator()
    sim.advanceToWork(at)
    sim.inject('incidents')
    sim.inject('fat-tail')
    expect(sim.advanceToWork(at).map((e) => e.type)).toEqual(['scenario.injected', 'scenario.cleared', 'scenario.injected'])
  })

  it('after Clear the organisation recovers: extra multitasking slots retire and WIP falls back', async () => {
    const { buildStore, apply } = await import('../domain/store')
    const { COMPUTE } = await import('../metrics/defs')
    const { workToTime } = await import('../sim/calendar')
    const sim = new Simulator()
    const store = buildStore(sim.advanceToWork(at))
    const wip = (w: number) => COMPUTE.wip({ store, asOf: workToTime(w), teamIds: store.teams.map((t) => t.id), windowDays: 28 }).value!
    const before = wip(at)
    sim.inject('too-much-started')
    for (const e of sim.advanceToWork(at + 80)) apply(store, e)
    const during = wip(at + 80)
    expect(during).toBeGreaterThan(before * 1.4)
    sim.clearScenario()
    for (const e of sim.advanceToWork(at + 240)) apply(store, e)
    expect(wip(at + 240)).toBeLessThan(during * 0.8)
    expect(SCENARIO_BY_ID.get('too-much-started')!.slotsPerDev).toBe(2)
  })
})
