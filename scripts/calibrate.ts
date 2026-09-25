// Dev helper: simulate the history and print every metric for the whole
// history and the last 28 days. Run: npx vite-node scripts/calibrate.ts
import { buildStore } from '../src/domain/store'
import { COMPUTE } from '../src/metrics/defs'
import { recentSprints } from '../src/metrics/defs/scrum'
import { DAY_MS, HISTORY_W, workToTime } from '../src/sim/calendar'
import { DEFAULT_SEED, simulateHistory } from '../src/sim/simulator'

const seed = Number(process.argv[2] ?? DEFAULT_SEED)
const t0 = performance.now()
const { events } = simulateHistory(seed, HISTORY_W)
const store = buildStore(events)
console.log(`seed ${seed}: ${events.length} events, ${store.itemList.length} items in ${(performance.now() - t0).toFixed(0)} ms`)
const asOf = workToTime(HISTORY_W)
const teamIds = store.teams.map((t) => t.id)
const fmt = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v) > 1e11 ? new Date(v).toISOString().slice(0, 10) : v.toFixed(2))
for (const [label, windowDays] of [['whole history (minus PI 1)', (asOf - workToTime(320)) / DAY_MS], ['last 28 days', 28]] as const) {
  console.log(`\n== ${label}`)
  for (const [id, fn] of Object.entries(COMPUTE)) {
    const r = fn({ store, asOf, teamIds, windowDays })
    console.log(id.padEnd(34), fmt(r.value).padStart(8), (r.secondary ?? []).map((s) => `${s.label}=${fmt(s.value)}`).join(' '), `n=${r.n}`)
  }
}
const sprints = recentSprints({ store, asOf, teamIds, windowDays: 28 }, 100)
const goals = sprints.filter((s) => s.goalMet !== undefined)
console.log('\nsprint goal success', ((100 * goals.filter((s) => s.goalMet).length) / goals.length).toFixed(1), '% of', goals.length)
let carried = 0, committed = 0
for (const s of sprints) { committed += s.committedItemIds.length; const next = store.iterationList.find((x) => x.kind === 'sprint' && x.teamId === s.teamId && x.index === s.index + 1); if (next) carried += s.committedItemIds.filter((id) => next.committedItemIds.includes(id)).length }
console.log('carry-over', ((100 * carried) / committed).toFixed(1), '%')
const runs = store.pipelines
console.log('flaky', ((100 * runs.filter((r) => r.retryOf).length) / runs.length).toFixed(2), '%; pipeline P95 min', (runs.map((r) => (r.finishedAt - r.startedAt) / 60000).sort((a, b) => a - b)[Math.ceil(0.95 * runs.length) - 1]).toFixed(1))
const inv: Record<string, number> = {}
for (const i of store.itemList) if (i.doneAt && i.type !== 'feature') inv[i.investment] = (inv[i.investment] ?? 0) + 1
console.log('investment (done items)', inv)
for (const t of store.teams) {
  const r = COMPUTE['cycle-time']({ store, asOf, teamIds: [t.id], windowDays: 84 })
  const th = COMPUTE['throughput']({ store, asOf, teamIds: [t.id], windowDays: 84 })
  const backlog = store.itemList.filter((i) => i.teamId === t.id && i.type !== 'feature' && i.status === 'Backlog').length
  console.log(t.key, 'CT P85', fmt(r.value), 'P50', fmt(r.secondary![0].value), 'TH/wk', fmt(th.value), 'backlog', backlog)
}
for (const pi of store.iterationList.filter((i) => i.kind === 'pi')) {
  const scope = store.itemList.filter((i) => i.type === 'story' && i.piId === pi.id)
  const done = scope.filter((i) => i.doneAt !== undefined && i.doneAt <= pi.end)
  const byTeam = store.teams.map((t) => `${t.key}:${scope.filter((i) => i.teamId === t.id).length}/${done.filter((i) => i.teamId === t.id).length}`).join(' ')
  console.log(pi.name, 'scope', scope.length, 'done by end', done.length, `(${((100 * done.length) / scope.length).toFixed(0)}%)`, byTeam)
}
const pf: string[] = []
for (let w = 320; w <= HISTORY_W; w += 40) {
  const r = COMPUTE['pi-forecast']({ store, asOf: workToTime(w), teamIds, windowDays: 28 })
  pf.push(`${new Date(workToTime(w)).toISOString().slice(5, 10)}:${r.value?.toFixed(0)}`)
}
console.log('pi-forecast weekly', pf.join(' '))
