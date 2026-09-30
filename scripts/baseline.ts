// Dev helper: status of every Pulse tile at the end of the history, then the
// PI forecast and tile health through every live PI (PI 4–14; forecast every
// 4 working hours, tiles every 8, as the worker produces it at any speed).
// Run: npm run baseline [seed]
import { checkLivePi, forecastByPi } from '../src/app/liveBaseline'
import { computePulse, computeTile, PROGRAM_SCOPE } from '../src/app/pulse'
import { buildStore } from '../src/domain/store'
import { METRICS } from '../src/metrics/registry'
import { HISTORY_W, workToTime } from '../src/sim/calendar'
import { DEFAULT_SEED, Simulator } from '../src/sim/simulator'

const seed = Number(process.argv[2] ?? DEFAULT_SEED)
const store = buildStore(new Simulator(seed).advanceToWork(HISTORY_W))
const asOf = workToTime(HISTORY_W)
const p = computePulse(store, asOf, PROGRAM_SCOPE)
console.log(`seed ${seed} @ history end:`, [p.forecast!, ...p.tiles].map((t) => `${t.def.id}=${t.result.value?.toFixed(1)}(${t.status})`).join(' '))
const all = METRICS.map((d) => computeTile(d, store, asOf, store.teams.map((t) => t.id)))
const counts: Record<string, number> = {}
for (const t of all) counts[t.status] = (counts[t.status] ?? 0) + 1
console.log('all 54 tiles:', counts, '· not green:', all.filter((t) => t.status === 'warn' || t.status === 'bad').map((t) => `${t.def.id}:${t.status}`).join(' ') || '-')
const live = checkLivePi(seed)
console.log('live forecast per PI (start / minimum):', forecastByPi(live).map((r) => `PI ${r.pi} ${r.start.toFixed(0)}/${r.min.toFixed(0)}`).join(' · '))
const tally = (xs: { id: string }[]) => xs.reduce<Record<string, number>>((a, x) => ((a[x.id] = (a[x.id] ?? 0) + 1), a), {})
console.log(`live tile checks (${live.tileChecks}): off target`, tally(live.offTarget), '· near limit', tally(live.nearLimit))
