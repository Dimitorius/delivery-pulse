// Dev helper: status of every Pulse tile at the end of the history, plus the PI
// forecast week by week through the live PI 4. Run: npx vite-node scripts/baseline.ts [seed]
import { computePulse, PROGRAM_SCOPE } from '../src/app/pulse'
import { apply as applyFn, buildStore } from '../src/domain/store'
import { COMPUTE } from '../src/metrics/defs'
import { HISTORY_W, PI_W, workToTime } from '../src/sim/calendar'
import { DEFAULT_SEED, Simulator } from '../src/sim/simulator'

const seed = Number(process.argv[2] ?? DEFAULT_SEED)
const sim = new Simulator(seed)
const events = sim.advanceToWork(HISTORY_W)
const store = buildStore(events)
const asOf = workToTime(HISTORY_W)
const p = computePulse(store, asOf, PROGRAM_SCOPE)
const line = [p.forecast!, ...p.tiles].map((t) => `${t.def.id}=${t.result.value?.toFixed(1)}(${t.status})`)
console.log(`seed ${seed} @ history end:`, line.join(' '))
const counts: Record<string, number> = {}
for (const t of p.tiles) counts[t.status] = (counts[t.status] ?? 0) + 1
console.log('tile statuses', counts, 'signals', p.signals.length)
const teamIds = store.teams.map((t) => t.id)
const live: string[] = []
const offTarget: Record<string, number> = {}
let checks = 0
for (let w = HISTORY_W + 8; w <= HISTORY_W + PI_W; w += 8) {
  for (const e of sim.advanceToWork(w)) applyFn(store, e)
  const at = workToTime(w - 1)
  if ((w - HISTORY_W) % 40 === 0) {
    const r = COMPUTE['pi-forecast']({ store, asOf: at, teamIds, windowDays: 28 })
    live.push(r.value === null ? '—' : r.value.toFixed(0))
  }
  checks++
  for (const t of computePulse(store, at, PROGRAM_SCOPE).tiles) {
    if (t.status === 'warn' || t.status === 'bad') offTarget[`${t.def.id}:${t.status}`] = (offTarget[`${t.def.id}:${t.status}`] ?? 0) + 1
  }
}
console.log('PI 4 forecast by week (live):', live.join(' '))
console.log(`live PI 4, daily checks=${checks}: days not green per tile`, offTarget)
