import { describe, expect, it } from 'vitest'
import type { SimEvent } from '../domain/events'
import { buildStore } from '../domain/store'
import { HISTORY_W, SPRINT_W, workToTime } from './calendar'
import { DEFAULT_SEED, Simulator } from './simulator'

function fingerprint(events: SimEvent[]): string {
  let h = 2166136261
  const s = JSON.stringify(events)
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return `${events.length}:${(h >>> 0).toString(16)}`
}

describe('Simulator', () => {
  const history = new Simulator(DEFAULT_SEED).advanceToWork(HISTORY_W)

  it('is reproducible: same seed → identical event log', () => {
    expect(fingerprint(new Simulator(DEFAULT_SEED).advanceToWork(HISTORY_W))).toBe(fingerprint(history))
    expect(fingerprint(new Simulator(DEFAULT_SEED + 1).advanceToWork(HISTORY_W))).not.toBe(fingerprint(history))
  })

  it('does not depend on how the clock is stepped (live tail at any speed)', () => {
    const sim = new Simulator(DEFAULT_SEED)
    const stepped: SimEvent[] = []
    for (let w = 0.37; w < 2 * SPRINT_W; w += 0.37) stepped.push(...sim.advanceToWork(w))
    stepped.push(...sim.advanceToWork(2 * SPRINT_W))
    const once = new Simulator(DEFAULT_SEED).advanceToWork(2 * SPRINT_W)
    expect(fingerprint(stepped)).toBe(fingerprint(once))
  })

  it('emits events in time order and never past the clock', () => {
    const end = workToTime(HISTORY_W)
    for (let i = 1; i < history.length; i++) expect(history[i].t).toBeGreaterThanOrEqual(history[i - 1].t)
    expect(history[history.length - 1].t).toBeLessThanOrEqual(end)
  })

  it('produces a consistent projection', () => {
    const store = buildStore(history)
    expect(store.teams).toHaveLength(5)
    expect(store.teams.filter((t) => t.method === 'kanban')).toHaveLength(1)
    for (const item of store.itemList) {
      if (item.doneAt !== undefined && item.type !== 'feature') {
        expect(item.firstActiveAt).toBeDefined()
        expect(item.doneAt).toBeGreaterThanOrEqual(item.firstActiveAt!)
      }
    }
    // Workflow invariant: an item never re-enters In Progress from Ready for Review/QA
    // without a review or QA verdict in between (no double-booked work).
    for (const item of store.itemList) {
      const t = item.transitions
      for (let i = 1; i < t.length; i++) {
        if (t[i].to === 'In Progress') expect(['Backlog', 'To Do', 'In Review', 'In QA', 'In Progress']).toContain(t[i].from)
      }
    }
    for (const mr of store.mrList) {
      if (mr.mergedAt) expect(mr.firstReviewAt).toBeLessThanOrEqual(mr.mergedAt)
      if (mr.deployedAt) expect(mr.deployedAt).toBeGreaterThanOrEqual(mr.mergedAt!)
    }
    // 3 PIs × (4 development + 1 IP iteration) = 15 closed; iteration 16 (PI 4) starts at the boundary
    const sprints = store.iterationList.filter((i) => i.kind === 'sprint' && i.teamId === 'checkout')
    expect(sprints).toHaveLength(16)
    expect(sprints.filter((i) => i.ip).map((i) => i.index)).toEqual([4, 9, 14])
    expect(store.iterationList.filter((i) => i.kind === 'pi').map((i) => i.name)).toEqual(['PI 1', 'PI 2', 'PI 3', 'PI 4'])
    const pi1 = store.iterationList.find((i) => i.id === 'PI-1')!
    expect((pi1.end - pi1.start) / (7 * 86_400_000)).toBe(10) // 10 weeks
  })
})
