// Dev helper: find seeds whose history matches the elite baseline criteria —
// at the end of the history AND through every live PI (PI 4–14).
// Run: npx vite-node scripts/seed-search.ts [from] [count]
// Stages, cheapest first: history end → forecast over the live PIs (8 h step)
// → the full live check (forecast every 4 h, Pulse tiles every 8 h).
import { LIVE_PIS, checkLivePi, forecastByPi } from '../src/app/liveBaseline'
import { computePulse, computeTile, PROGRAM_SCOPE } from '../src/app/pulse'
import { apply, buildStore } from '../src/domain/store'
import { COMPUTE } from '../src/metrics/defs'
import { METRICS } from '../src/metrics/registry'
import { HISTORY_W, PI_W, workToTime } from '../src/sim/calendar'
import { Simulator } from '../src/sim/simulator'

const MIN_FORECAST = 86
const from = Number(process.argv[2] ?? 1)
const count = Number(process.argv[3] ?? 50)
for (let seed = from; seed < from + count; seed++) {
  const sim = new Simulator(seed)
  const store = buildStore(sim.advanceToWork(HISTORY_W))
  const asOf = workToTime(HISTORY_W)
  const teamIds = store.teams.map((t) => t.id)
  const p = computePulse(store, asOf, PROGRAM_SCOPE)
  const fc = p.forecast!.result.value ?? 0
  const sayDo = p.tiles.find((t) => t.def.id === 'say-do-ratio')!.result.value ?? 0
  if (fc < 88 || sayDo < 80 || sayDo > 90) continue
  // Calibration bands over PI 2 → now (same as calibration.test.ts)
  const hctx = { store, asOf, teamIds, windowDays: (asOf - workToTime(PI_W)) / 86_400_000 }
  const v = (id: string) => COMPUTE[id](hctx).value!
  const bands: [string, number, number][] = [
    ['change-failure-rate', 2.5, 5.2], ['flow-efficiency', 34, 45], ['cycle-time', 5, 7.1], ['unplanned-work', 13.5, 19.5],
    ['lead-time-for-changes', 0, 23.5], ['failed-deployment-recovery-time', 0, 55], ['pr-pickup-time', 0, 3.5], ['main-build-success', 95.5, 100],
  ]
  if (bands.some(([id, lo, hi]) => v(id) < lo || v(id) > hi)) continue
  // Every metric on every tab: none off target, at most 3 near the limit.
  const all = METRICS.map((d) => computeTile(d, store, asOf, teamIds))
  const allWarn = all.filter((t) => t.status === 'warn').map((t) => t.def.id)
  if (all.some((t) => t.status === 'bad') || allWarn.length > 3) continue
  // Quick pass: forecast every 8 working hours through the live PIs.
  let quickMin = 100
  for (let w = HISTORY_W; w < HISTORY_W + LIVE_PIS * PI_W && quickMin >= MIN_FORECAST; w += 8) {
    for (const e of sim.advanceToWork(w)) apply(store, e)
    quickMin = Math.min(quickMin, COMPUTE['pi-forecast']({ store, asOf: workToTime(w), teamIds, windowDays: 28 }).value ?? 0)
  }
  if (quickMin < MIN_FORECAST) {
    console.log(`seed ${seed}: start ${fc.toFixed(1)} · live forecast < ${MIN_FORECAST}`)
    continue
  }
  // Full check (as at 100×): forecast every 4 h ≥ 86, no Pulse tile off target.
  const live = checkLivePi(seed)
  const pis = forecastByPi(live)
  const min = Math.min(...pis.map((r) => r.min))
  const nearShare = live.nearLimit.length / live.tileChecks
  const ok = min >= MIN_FORECAST && live.offTarget.length === 0 && nearShare <= 0.05
  console.log(
    `seed ${seed}${ok ? ' ✅' : ''}: start ${fc.toFixed(1)} liveMin ${min.toFixed(0)} off ${live.offTarget.length} near ${(100 * nearShare).toFixed(1)}% sayDo ${sayDo.toFixed(1)} tabWarn [${allWarn.join(',')}] · PI minima ${pis.map((r) => r.min.toFixed(0)).join(' ')}`,
  )
}
