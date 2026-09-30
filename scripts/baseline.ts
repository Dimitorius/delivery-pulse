// Dev helper: status of every Pulse tile at the end of the history, then the
// PI forecast and tile health through the whole live PI 4 (every 4 working
// hours, as the worker produces it at any speed). Run: npm run baseline [seed]
import { checkLivePi } from '../src/app/liveBaseline'
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
const values = live.forecasts.map((f) => f.value ?? 0)
console.log(`live PI 4 forecast: start ${values[0].toFixed(1)} · min ${Math.min(...values).toFixed(1)} · every 5 days: ${values.filter((_, i) => i % 10 === 0).map((v) => v.toFixed(0)).join(' ')}`)
const tally = (xs: { id: string }[]) => xs.reduce<Record<string, number>>((a, x) => ((a[x.id] = (a[x.id] ?? 0) + 1), a), {})
console.log('live PI 4 tile checks (every working day): off target', tally(live.offTarget), '· near limit', tally(live.nearLimit))
