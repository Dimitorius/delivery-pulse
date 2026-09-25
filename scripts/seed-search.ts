// Dev helper: find seeds whose history matches the elite baseline criteria.
// Run: npx vite-node scripts/seed-search.ts [from] [count]
import { computePulse, computeTile, PROGRAM_SCOPE } from '../src/app/pulse'
import { METRICS } from '../src/metrics/registry'
import { apply, buildStore } from '../src/domain/store'
import { COMPUTE } from '../src/metrics/defs'
import { HISTORY_W, PI_W, workToTime } from '../src/sim/calendar'
import { Simulator } from '../src/sim/simulator'

const from = Number(process.argv[2] ?? 1)
const count = Number(process.argv[3] ?? 50)
for (let seed = from; seed < from + count; seed++) {
  const sim = new Simulator(seed)
  const store = buildStore(sim.advanceToWork(HISTORY_W))
  const asOf = workToTime(HISTORY_W)
  const p = computePulse(store, asOf, PROGRAM_SCOPE)
  const fc = p.forecast!.result.value ?? 0
  const sayDo = p.tiles.find((t) => t.def.id === 'say-do-ratio')!.result.value ?? 0
  const notGreen = p.tiles.filter((t) => t.status === 'warn' || t.status === 'bad')
  if (fc < 84 || fc > 93 || sayDo < 80 || sayDo > 90 || notGreen.length > 1) continue
  // Calibration bands over PI 2 → now (same as calibration.test.ts)
  const hctx = { store, asOf, teamIds: store.teams.map((t) => t.id), windowDays: (asOf - workToTime(PI_W)) / 86_400_000 }
  const v = (id: string) => COMPUTE[id](hctx).value!
  const bands: [string, number, number][] = [
    ['change-failure-rate', 2.8, 5.2], ['flow-efficiency', 34, 45], ['cycle-time', 5, 7.1], ['unplanned-work', 13.5, 19.5],
    ['lead-time-for-changes', 0, 23.5], ['failed-deployment-recovery-time', 0, 55], ['pr-pickup-time', 0, 3.5], ['main-build-success', 95.5, 100],
  ]
  if (bands.some(([id, lo, hi]) => v(id) < lo || v(id) > hi)) continue
  // Every metric on every tab: none off target, at most 3 near the limit.
  const all = METRICS.map((d) => computeTile(d, store, asOf, store.teams.map((t) => t.id)))
  const allWarn = all.filter((t) => t.status === 'warn').map((t) => t.def.id)
  if (all.some((t) => t.status === 'bad') || allWarn.length > 3) continue
  // Live PI 4: forecast weekly and tile health daily.
  const teamIds = store.teams.map((t) => t.id)
  const weekly: number[] = []
  let bad = 0
  let warnDays = 0
  for (let w = HISTORY_W + 8; w <= HISTORY_W + PI_W; w += 8) {
    for (const e of sim.advanceToWork(w)) apply(store, e)
    const at = workToTime(w - 1)
    if ((w - HISTORY_W) % 40 === 0) weekly.push(COMPUTE['pi-forecast']({ store, asOf: at, teamIds, windowDays: 28 }).value ?? 0)
    for (const t of computePulse(store, at, PROGRAM_SCOPE).tiles) {
      if (t.status === 'bad') bad++
      if (t.status === 'warn') warnDays++
    }
  }
  console.log(`seed ${seed}: all-tabs warn [${allWarn.join(',')}] forecast ${fc.toFixed(1)} sayDo ${sayDo.toFixed(1)} notGreen ${notGreen.map((t) => t.def.id).join(',') || '-'} | live min ${Math.min(...weekly).toFixed(0)} [${weekly.map((v) => v.toFixed(0)).join(' ')}] bad ${bad} warnDays ${warnDays}`)
}
