// Tour (SPEC §7, stage 3b): a 3–4 minute guide — Pulse → inject the review
// bottleneck → a leading signal moves → Diagnose → playbook → the Monte Carlo
// date shifts. Every number in the tour panel is computed live from the same
// events as the screens; nothing is scripted.

import { useEffect, useMemo } from 'react'
import { fmtDate, fmtValue } from '../app/format'
import { activeScenario, eventStore, useApp, type Speed } from '../app/state'
import { PLAYBOOK_BY_ID } from '../content/symptoms'
import { COMPUTE } from '../metrics/defs'
import { METRIC_BY_ID, windowOf } from '../metrics/registry'
import { HOURS_PER_DAY, timeToWork } from '../sim/calendar'
import { Blocks } from './Markdown'
import type { Route } from '../app/route'

const SCENARIO = 'review-bottleneck'

interface Step {
  title: string
  route?: Route
  target?: string
  text: string
  say?: string
  /** Live comparison: values when the scenario was injected vs now. */
  compare?: { early: string[]; later: string[] }
  forecast?: boolean
  speed?: Speed
  action?: 'inject' | 'clear'
  sayFromContent?: boolean
}

const STEPS: Step[] = [
  {
    title: 'Delivery Pulse in three minutes',
    route: { page: 'pulse' },
    text: 'A simulated payments program: four stream teams and a platform team, SAFe PIs of ten weeks. Every number is computed from simulator events — click any tile for its formula and source records.',
    say: 'I read delivery health from leading signals first and dates last.',
  },
  {
    title: 'The question everyone asks',
    route: { page: 'pulse' },
    target: 'forecast',
    text: 'Will we deliver the committed PI objectives? A Monte Carlo forecast over the teams’ own recent throughput gives a probability and a date range (P50–P85), not a single date.',
    say: 'I don’t promise a date. I give a probability and a range, and I show what it is based on.',
  },
  {
    title: 'Lagging, current, leading',
    route: { page: 'pulse' },
    target: 'col-leading',
    text: 'Lagging tiles say what already happened, current tiles what is happening now, leading tiles what is coming. The baseline is deliberately healthy: almost everything is green.',
  },
  {
    title: 'Break something: reviews and QA become a queue',
    route: { page: 'pulse' },
    target: 'inject',
    action: 'inject',
    speed: 10,
    text: 'Inject scenario changes how the simulated teams work from this moment — pull requests wait longer for review and QA becomes a capacity limit. It never edits a number. The clock runs at 10×.',
  },
  {
    title: 'The leading signals move first',
    route: { page: 'pulse' },
    target: 'col-current',
    compare: { early: ['queue-size', 'pr-pickup-time', 'aging-wip'], later: ['cycle-time', 'flow-efficiency'] },
    text: 'Within a few simulated days the queue in front of review and QA grows and PR pickup time jumps. Cycle time has barely moved yet: it only counts finished work.',
    say: 'By the time cycle time moves, the work is already late. Queue size and pickup time tell me days earlier.',
  },
  {
    title: 'Diagnose: from what people say to what to check',
    route: { page: 'diagnose', id: SCENARIO },
    target: 'signals',
    speed: 0,
    text: '“It’s done, it’s just waiting for review.” The symptom card lists the early and the confirming signals with live values, and competing hypotheses with the one check that tells them apart. The clock is paused while you read.',
  },
  {
    title: 'The playbook',
    route: { page: 'diagnose', id: SCENARIO },
    target: 'playbook',
    text: 'What to do now, over the next sprints, and what to watch afterwards — with the anti-patterns that only move the queue around.',
    sayFromContent: true,
  },
  {
    title: 'And now the date moves',
    route: { page: 'pulse' },
    target: 'forecast',
    speed: 10,
    forecast: true,
    compare: { early: [], later: ['throughput', 'cycle-time'] },
    text: 'With QA capping how much gets finished, throughput falls and the Monte Carlo dates slide. The early signals gave us that time to act.',
    say: 'The queue showed up before the forecast moved — that gap is when a delivery manager earns their keep.',
  },
  {
    title: 'Back to normal',
    route: { page: 'pulse' },
    target: 'clear',
    action: 'clear',
    speed: 1,
    text: 'Clear the scenario and the organisation behaves as calibrated again; the charts keep a marker where it was injected. Eleven more scenarios are in Inject scenario and on their Diagnose cards.',
  },
]

export const TOUR_STEPS = STEPS.length

function useHighlight(target: string | undefined, key: number) {
  useEffect(() => {
    if (!target) return
    let el: Element | null = null
    let tries = 0
    const id = setInterval(() => {
      el = document.querySelector(`[data-tour="${target}"]`)
      if (el || ++tries > 20) {
        clearInterval(id)
        if (el) {
          el.classList.add('tour-target')
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }
    }, 60)
    return () => {
      clearInterval(id)
      el?.classList.remove('tour-target')
    }
  }, [target, key])
}

export function Tour() {
  const { tour, setTour, navigate, setSpeed, injectScenario, clearScenario, now, version, route } = useApp()
  const step = tour === null ? undefined : STEPS[tour]
  const run = activeScenario()
  useHighlight(step?.target, (tour ?? -1) * 1000 + (route.page === 'diagnose' ? 1 : 0))

  useEffect(() => {
    if (!step) return
    if (step.route && JSON.stringify(step.route) !== JSON.stringify(route)) navigate(step.route)
    if (step.speed !== undefined) setSpeed(step.speed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour])

  const compare = useMemo(() => {
    if (!step?.compare || !run || run.id !== SCENARIO) return undefined
    const teamIds = eventStore.teams.map((t) => t.id)
    const row = (id: string) => {
      const def = METRIC_BY_ID.get(id)!
      const at = (asOf: number) => COMPUTE[id]({ store: eventStore, asOf, teamIds, windowDays: windowOf(def) }).value
      return { id, name: def.short, unit: def.unit, def, before: at(run.from), now: at(now) }
    }
    return { early: step.compare.early.map(row), later: step.compare.later.map(row) }
  }, [step, run, now, version])

  const forecast = useMemo(() => {
    if (!step?.forecast || !run || run.id !== SCENARIO) return undefined
    const teamIds = eventStore.teams.map((t) => t.id)
    const at = (asOf: number) => {
      const r = COMPUTE['pi-forecast']({ store: eventStore, asOf, teamIds, windowDays: 28 })
      const sec = (l: string) => r.secondary?.find((x) => x.label === l)?.value ?? null
      return { p: r.value, p50: sec('P50 date'), p85: sec('P85 date'), pi: eventStore.iterationList.find((i) => i.kind === 'pi' && i.start <= asOf && asOf < i.end)?.name }
    }
    return { before: at(run.from), now: at(now) }
  }, [step, run, now, version])

  if (!step || tour === null) return null
  const days = run ? (timeToWork(now) - timeToWork(run.from)) / HOURS_PER_DAY : 0
  const say = step.sayFromContent ? PLAYBOOK_BY_ID.get(SCENARIO)?.sections.find((s) => s.title === 'Say it in an interview') : undefined
  const fc = METRIC_BY_ID.get('pi-forecast')!
  const injected = run?.id === SCENARIO

  return (
    <aside className="tour" role="dialog" aria-label="Tour">
      <div className="tour-head">
        <span className="small muted">
          Tour · {tour + 1} / {STEPS.length}
        </span>
        <button className="link small" onClick={() => (setTour(null), setSpeed(1))}>
          Close ✕
        </button>
      </div>
      <h3>{step.title}</h3>
      <p className="small">{step.text}</p>
      {step.action === 'inject' ? (
        injected ? (
          <p className="small ok-text">Injected — the banner under the header says so on every screen.</p>
        ) : (
          <button className="inject" onClick={() => (injectScenario(SCENARIO), setSpeed(10))}>
            Inject “work gets stuck in review”
          </button>
        )
      ) : null}
      {step.action === 'clear' && run ? (
        <button className="clear" onClick={clearScenario}>
          Clear scenario
        </button>
      ) : null}
      {(step.compare || step.forecast) && !injected ? <p className="small muted">Inject the scenario in step 4 to see the live comparison.</p> : null}
      {compare ? (
        <table className="records tour-compare small">
          <thead>
            <tr>
              <th />
              <th className="num">at inject</th>
              <th className="num">now</th>
            </tr>
          </thead>
          <tbody>
            {(['early', 'later'] as const).flatMap((g) =>
              compare[g].map((r, i) => (
                <tr key={r.id} className={i === 0 ? 'group-start' : ''}>
                  <td>
                    {i === 0 ? <span className="muted">{g === 'early' ? 'early · ' : 'later · '}</span> : null}
                    {r.name}
                  </td>
                  <td className="num">{fmtValue(r.def, r.before)}</td>
                  <td className="num">
                    {fmtValue(r.def, r.now)} {r.unit === '%' ? '%' : r.unit}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      ) : null}
      {forecast ? (
        <table className="records tour-compare small">
          <thead>
            <tr>
              <th />
              <th className="num">at inject</th>
              <th className="num">now</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Committed objectives</td>
              <td className="num">{fmtValue(fc, forecast.before.p)} %</td>
              <td className="num">{fmtValue(fc, forecast.now.p)} %</td>
            </tr>
            {(['p50', 'p85'] as const).map((k) => (
              <tr key={k}>
                <td>Monte Carlo {k.toUpperCase()} date</td>
                <td className="num">{forecast.before[k] ? fmtDate(forecast.before[k]!) : '—'}</td>
                <td className="num">{forecast.now[k] ? fmtDate(forecast.now[k]!) : '—'}</td>
              </tr>
            ))}
            {forecast.before.pi !== forecast.now.pi ? (
              <tr>
                <td colSpan={3} className="muted">
                  A new PI started since the injection ({forecast.now.pi}), so the dates belong to different PIs.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      {injected && (step.compare || step.forecast) ? <p className="small muted">{days.toFixed(1)} simulated working days since the injection.</p> : null}
      {step.say ? (
        <p className="tour-say small">
          <strong>What to say:</strong> “{step.say}”
        </p>
      ) : null}
      {say ? (
        <div className="tour-say small">
          <strong>What to say</strong> <span className="muted">(from the symptom card)</span>
          <Blocks blocks={say.blocks} />
        </div>
      ) : null}
      <div className="tour-nav">
        <button className="link" disabled={tour === 0} onClick={() => setTour(tour - 1)}>
          ← Back
        </button>
        {tour < STEPS.length - 1 ? (
          <button className="primary" onClick={() => setTour(tour + 1)}>
            Next →
          </button>
        ) : (
          <button className="primary" onClick={() => (setTour(null), setSpeed(1))}>
            Finish
          </button>
        )}
      </div>
    </aside>
  )
}
