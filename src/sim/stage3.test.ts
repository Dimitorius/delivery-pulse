// Stage 3b additions to the simulator must not move the curated history:
// portfolio epics and WSJF estimates draw from their own stream, and a
// scenario only acts while injected. The pinned fingerprint is the event log
// of seed 83 through the whole live horizon as it was before stage 3b, with the
// stage-3b events (epics, feature.wsjf, scenario.*) and the features' epic link
// left out.

import { describe, expect, it } from 'vitest'
import type { SimEvent } from '../domain/events'
import { buildStore } from '../domain/store'
import { HORIZON_W, PI_W } from './calendar'
import { DEFAULT_SEED, Simulator } from './simulator'

function preStage3(events: SimEvent[]): SimEvent[] {
  return events
    .filter((e) => !(e.type === 'item.created' && e.item.type === 'epic') && !(e.type === 'item.status' && e.itemId.startsWith('EPIC-')) && e.type !== 'feature.wsjf' && !e.type.startsWith('scenario.'))
    .map((e) => (e.type === 'item.created' && e.item.type === 'feature' ? { ...e, item: { ...e.item, parentId: undefined } } : e))
}

export function fingerprint(events: SimEvent[]): string {
  let h = 2166136261
  const s = JSON.stringify(events)
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return `${events.length}:${(h >>> 0).toString(16)}`
}

describe('stage 3b keeps the curated history (seed 83, PI 1–14)', () => {
  const events = new Simulator(DEFAULT_SEED).advanceToWork(HORIZON_W)

  it('the pre-3b event log is unchanged', () => {
    expect(fingerprint(preStage3(events))).toBe(PINNED)
  })

  it('three portfolio epics per PI; every PI-planned feature belongs to one, roadmap features to none', () => {
    const s = buildStore(events)
    const epics = s.itemList.filter((i) => i.type === 'epic')
    const pis = s.iterationList.filter((i) => i.kind === 'pi').length
    expect(epics.length).toBe(3 * pis)
    for (const f of s.itemList.filter((i) => i.type === 'feature')) {
      if (f.piId) expect(s.items.get(f.parentId!)?.type, f.id).toBe('epic')
      else expect(f.parentId, f.id).toBeUndefined()
    }
    // an epic is Done exactly when its last feature is
    for (const e of epics.filter((x) => x.doneAt !== undefined)) {
      const kids = s.itemList.filter((f) => f.parentId === e.id)
      expect(e.doneAt).toBe(Math.max(...kids.map((f) => f.doneAt!)))
    }
  })

  it('every feature started under an epic had a WSJF estimate (Fibonacci components) before it started', () => {
    const s = buildStore(events)
    const fib = [1, 2, 3, 5, 8, 13, 20]
    for (const f of s.itemList.filter((i) => i.type === 'feature' && i.parentId && i.firstActiveAt !== undefined && i.firstActiveAt > PI_W)) {
      expect(f.wsjf?.some((e) => e.at <= f.firstActiveAt!), f.id).toBe(true)
      for (const e of f.wsjf!) for (const v of [e.ubv, e.tc, e.rroe, e.jobSize]) expect(fib).toContain(v)
    }
  })
})

// Computed from the stage-3a code (commit 92d785a) — identical.
const PINNED = '208151:4ee2c525'
