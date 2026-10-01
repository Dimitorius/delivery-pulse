// Catalog "views" (status: view) — charts rather than single numbers, all
// computed from simulator events. Shown on their tab when switched on in the
// Library (CFD and the scatterplot are on by default).

import { useMemo, type ComponentType } from 'react'
import { fmtNumber } from '../app/format'
import { weekAnchor } from '../app/pulse'
import { eventStore } from '../app/state'
import { riskExposure } from '../metrics/defs/program'
import { cycleTimeDays, isFlowItem } from '../metrics/flow'
import { percentile } from '../metrics/stats'
import { DAY_MS, WEEK_MS } from '../sim/calendar'
import type { Iteration, WorkItem } from '../domain/model'
import { CHART, EChart, timeAxis, type EChartsOption } from './EChart'
import { ObjectivesPanel, SLOTS, axis, legend, tooltip, useNow } from './TabCharts'

type ViewProps = { teamIds: string[] }

const line = (name: string, color: string, data: (number | null)[][], extra: Record<string, unknown> = {}) => ({
  type: 'line',
  name,
  showSymbol: false,
  lineStyle: { width: 2, color },
  itemStyle: { color },
  data,
  ...extra,
})

export function CfdPanel({ teamIds }: ViewProps) {
  const { now, version } = useNow()
  const option = useMemo(() => {
    const start = weekAnchor(now) - 12 * WEEK_MS
    const items = eventStore.itemList.filter((i) => isFlowItem(i) && teamIds.includes(i.teamId) && i.firstActiveAt !== undefined)
    const firstAt = (i: WorkItem, statuses: string[]) => i.transitions.find((t) => statuses.includes(t.to))?.at
    const marks = items.map((i) => ({
      started: i.firstActiveAt!,
      review: firstAt(i, ['Ready for Review', 'In Review', 'Ready for QA', 'In QA', 'Done']),
      qa: firstAt(i, ['Ready for QA', 'In QA', 'Done']),
      done: i.doneAt,
    }))
    const days: number[] = []
    for (let t = start; t <= now; t += DAY_MS) days.push(t)
    const count = (t: number, k: 'started' | 'review' | 'qa' | 'done') => marks.filter((m) => m[k] !== undefined && m[k]! <= t).length
    const base = count(start, 'done')
    const rows = days.map((t) => {
      const s = count(t, 'started')
      const r = count(t, 'review')
      const q = count(t, 'qa')
      const d = count(t, 'done')
      return { t, done: d - base, qa: q - d, review: r - q, progress: s - r }
    })
    const band = (name: string, key: 'done' | 'qa' | 'review' | 'progress', color: string) =>
      line(name, color, rows.map((r) => [r.t, r[key]]), { stack: 'cfd', lineStyle: { width: 1, color }, areaStyle: { color, opacity: 0.35 } })
    return {
      animation: false,
      grid: { left: 44, right: 16, top: 32, bottom: 24 },
      tooltip,
      legend,
      xAxis: timeAxis(),
      yAxis: { type: 'value', ...axis() },
      series: [band('Done', 'done', SLOTS[2]), band('QA stage', 'qa', SLOTS[3]), band('Review stage', 'review', SLOTS[1]), band('In progress', 'progress', SLOTS[0])],
    } as EChartsOption
  }, [teamIds, now, version])
  return (
    <section className="panel">
      <h3>Cumulative flow · last 12 weeks</h3>
      <EChart option={option} height={230} />
      <p className="small muted">Band thickness = items in that stage; the top edge = everything started. Parallel bands = stable flow.</p>
    </section>
  )
}

export function ScatterPanel({ teamIds }: ViewProps) {
  const { now, version } = useNow()
  const option = useMemo(() => {
    const start = weekAnchor(now) - 12 * WEEK_MS
    const done = eventStore.itemList.filter((i) => isFlowItem(i) && teamIds.includes(i.teamId) && i.doneAt !== undefined && i.doneAt > start && i.doneAt <= now)
    const ct = done.map(cycleTimeDays)
    return {
      animation: false,
      grid: { left: 40, right: 48, top: 16, bottom: 24 },
      tooltip: { ...tooltip, trigger: 'item', formatter: (p: { data: [number, number, string] }) => `${p.data[2]} · ${fmtNumber(p.data[1], 1)} d` },
      xAxis: timeAxis(),
      yAxis: { type: 'value', name: 'days', nameTextStyle: { color: CHART.muted }, ...axis() },
      series: [
        {
          type: 'scatter',
          symbolSize: 6,
          itemStyle: { color: CHART.line, opacity: 0.7 },
          data: done.map((i, k) => [i.doneAt!, ct[k], i.id]),
          markLine: {
            symbol: 'none',
            label: { color: CHART.text, fontFamily: CHART.font, position: 'end' },
            lineStyle: { color: CHART.muted, type: 'dashed' },
            data: [
              { yAxis: percentile(ct, 50) ?? 0, label: { formatter: 'P50' } },
              { yAxis: percentile(ct, 85) ?? 0, label: { formatter: 'P85' } },
            ],
          },
        },
      ],
    } as EChartsOption
  }, [teamIds, now, version])
  return (
    <section className="panel">
      <h3>Cycle time scatterplot · last 12 weeks</h3>
      <EChart option={option} height={230} />
      <p className="small muted">Each dot is a finished item. Dots above P85 are the tail worth a conversation.</p>
    </section>
  )
}

/** Current sprint of every Scrum team in scope (sprints share one cadence). */
function currentSprints(teamIds: string[], now: number): Iteration[] {
  return eventStore.iterationList.filter((i) => i.kind === 'sprint' && teamIds.includes(i.teamId!) && i.start <= now && now < i.end)
}

const pts = (id: string) => eventStore.items.get(id)?.points ?? 0

/** When an item joined the sprint: created during it, or its first status change inside it; else at the start. */
function addedAt(item: WorkItem, s: Iteration): number {
  if (item.createdAt >= s.start) return item.createdAt
  return item.transitions.find((t) => t.at >= s.start)?.at ?? s.start
}

function sprintDays(s: Iteration, now: number): number[] {
  const out: number[] = []
  for (let t = s.start; t <= Math.min(now, s.end); t += DAY_MS) out.push(t)
  if (out[out.length - 1] !== Math.min(now, s.end)) out.push(Math.min(now, s.end))
  return out
}

function NoSprint() {
  return <p className="small muted">No Scrum sprint in scope right now (Kanban teams have none).</p>
}

export function SprintBurndownPanel({ teamIds }: ViewProps) {
  const { now, version } = useNow()
  const data = useMemo(() => {
    const sprints = currentSprints(teamIds, now)
    if (!sprints.length) return null
    const s0 = sprints[0]
    const committed = sprints.flatMap((s) => s.committedItemIds)
    const total = committed.reduce((a, id) => a + pts(id), 0)
    const remaining = (t: number) => committed.filter((id) => !((eventStore.items.get(id)?.doneAt ?? Infinity) <= t)).reduce((a, id) => a + pts(id), 0)
    const option: EChartsOption = {
      animation: false,
      grid: { left: 40, right: 16, top: 32, bottom: 24 },
      tooltip,
      legend,
      xAxis: { ...timeAxis(), min: s0.start, max: s0.end },
      yAxis: { type: 'value', name: 'points', nameTextStyle: { color: CHART.muted }, ...axis() },
      series: [
        line('Remaining (committed)', CHART.line, sprintDays(s0, now).map((t) => [t, remaining(t)]), { step: 'end' }),
        line('Ideal', CHART.muted, [[s0.start, total], [s0.end, 0]], { lineStyle: { width: 1, color: CHART.muted, type: 'dashed' } }),
      ],
    }
    return { option, name: sprints.length > 1 ? `${sprints.length} Scrum teams` : `${eventStore.teamById.get(s0.teamId!)?.name} · ${s0.name}`, ip: s0.ip }
  }, [teamIds, now, version])
  return (
    <section className="panel">
      <h3>Sprint burndown {data ? `· ${data.name}` : ''}</h3>
      {data ? <EChart option={data.option} height={210} /> : <NoSprint />}
      <p className="small muted">
        Story points of the work committed at sprint planning that are not Done yet. Items added later are not in this line (see the
        burn-up).{data?.ip ? ' This is the IP iteration — little committed work by design.' : ''}
      </p>
    </section>
  )
}

export function SprintBurnupPanel({ teamIds }: ViewProps) {
  const { now, version } = useNow()
  const data = useMemo(() => {
    const sprints = currentSprints(teamIds, now)
    if (!sprints.length) return null
    const s0 = sprints[0]
    const items = sprints.flatMap((s) => eventStore.itemList.filter((i) => i.sprintIds.includes(s.id)).map((i) => ({ i, s })))
    const days = sprintDays(s0, now)
    const scope = days.map((t) => [t, items.filter(({ i, s }) => addedAt(i, s) <= t).reduce((a, { i }) => a + (i.points ?? 0), 0)])
    const done = days.map((t) => [t, items.filter(({ i }) => i.doneAt !== undefined && i.doneAt <= t && i.doneAt >= s0.start).reduce((a, { i }) => a + (i.points ?? 0), 0)])
    const option: EChartsOption = {
      animation: false,
      grid: { left: 40, right: 16, top: 32, bottom: 24 },
      tooltip,
      legend,
      xAxis: { ...timeAxis(), min: s0.start, max: s0.end },
      yAxis: { type: 'value', name: 'points', nameTextStyle: { color: CHART.muted }, ...axis() },
      series: [line('Scope', SLOTS[1], scope, { step: 'end' }), line('Done', SLOTS[2], done, { step: 'end' })],
    }
    return { option, name: sprints.length > 1 ? `${sprints.length} Scrum teams` : `${eventStore.teamById.get(s0.teamId!)?.name} · ${s0.name}` }
  }, [teamIds, now, version])
  return (
    <section className="panel">
      <h3>Sprint burn-up {data ? `· ${data.name}` : ''}</h3>
      {data ? <EChart option={data.option} height={210} /> : <NoSprint />}
      <p className="small muted">
        Scope = points of every item in the sprint, counted from when it joined (created in the sprint, or its first status change in
        it). A rising scope line is visible here and hidden in a burndown.
      </p>
    </section>
  )
}

export function RiskBurndownPanel({ teamIds }: ViewProps) {
  const { now, version } = useNow()
  const option = useMemo(() => {
    const anchor = weekAnchor(now)
    const points: number[][] = []
    for (let k = 19; k >= 0; k--) {
      const t = anchor - k * WEEK_MS
      points.push([t, riskExposure({ store: eventStore, asOf: t, teamIds, windowDays: 28 }).value ?? 0])
    }
    points.push([now, riskExposure({ store: eventStore, asOf: now, teamIds, windowDays: 28 }).value ?? 0])
    const pis = eventStore.iterationList.filter((i) => i.kind === 'pi' && i.start >= points[0][0] && i.start <= now)
    return {
      animation: false,
      grid: { left: 44, right: 16, top: 16, bottom: 24 },
      tooltip,
      xAxis: timeAxis(),
      yAxis: { type: 'value', name: 'EMV pd', nameTextStyle: { color: CHART.muted }, ...axis() },
      series: [
        line('Risk exposure (EMV)', CHART.line, points, {
          areaStyle: { color: CHART.line, opacity: 0.12 },
          markLine: {
            symbol: 'none',
            silent: true,
            label: { color: CHART.muted, fontFamily: CHART.font, fontSize: 10 },
            lineStyle: { color: CHART.grid },
            data: pis.map((p) => ({ xAxis: p.start, label: { formatter: p.name } })),
          },
        }),
      ],
    } as EChartsOption
  }, [teamIds, now, version])
  return (
    <section className="panel">
      <h3>Risk burndown · last 20 weeks</h3>
      <EChart option={option} height={210} />
      <p className="small muted">Total exposure (Σ probability × impact, person-days) of open risks at each week start — the same calculation as the Risk Exposure tile. Risks are opened at PI Planning, so the line jumps at each PI start and should fall towards its end.</p>
    </section>
  )
}

export function BurnupForecastPanel({ teamIds }: ViewProps) {
  const { now, version } = useNow()
  const data = useMemo(() => {
    const pi = eventStore.iterationList.find((i) => i.kind === 'pi' && i.start <= now && now < i.end)
    if (!pi) return null
    const committed = (i: WorkItem) => i.type === 'story' && !!i.piId && !i.piStretch && teamIds.includes(i.teamId)
    const piItems = eventStore.itemList.filter((i) => committed(i) && i.piId === pi.id)
    const weeks: number[] = []
    for (let t = pi.start; t <= now; t += WEEK_MS) weeks.push(t)
    weeks.push(now)
    const scope = weeks.map((t) => [t, piItems.filter((i) => i.createdAt <= t).length])
    const doneAt = (t: number) => piItems.filter((i) => i.doneAt !== undefined && i.doneAt <= t).length
    const done = weeks.map((t) => [t, doneAt(t)])
    // Weekly throughput of committed PI stories (any PI) over the last 6 full weeks.
    const anchor = weekAnchor(now)
    const weekly = Array.from({ length: 6 }, (_, k) => {
      const to = anchor - k * WEEK_MS
      return eventStore.itemList.filter((i) => committed(i) && i.doneAt !== undefined && i.doneAt > to - WEEK_MS && i.doneAt <= to).length
    })
    const fast = percentile(weekly, 85) ?? 0
    const slow = percentile(weekly, 15) ?? 0
    const d0 = doneAt(now)
    const span = (pi.end - now) / WEEK_MS
    const option: EChartsOption = {
      animation: false,
      grid: { left: 40, right: 16, top: 32, bottom: 24 },
      tooltip,
      legend,
      xAxis: { ...timeAxis(), min: pi.start, max: pi.end },
      yAxis: { type: 'value', name: 'stories', nameTextStyle: { color: CHART.muted }, ...axis() },
      series: [
        line('Scope (committed)', SLOTS[1], scope, { step: 'end' }),
        line('Done', SLOTS[2], done),
        line('Optimistic (P85 week)', CHART.muted, [[now, d0], [pi.end, d0 + fast * span]], { lineStyle: { width: 1, color: CHART.muted, type: 'dashed' } }),
        line('Pessimistic (P15 week)', CHART.muted, [[now, d0], [pi.end, d0 + slow * span]], { lineStyle: { width: 1, color: CHART.muted, type: 'dotted' } }),
      ],
    }
    return { option, pi: pi.name, fast, slow, weekly }
  }, [teamIds, now, version])
  return (
    <section className="panel">
      <h3>Burn-up forecast range {data ? `· ${data.pi}` : ''}</h3>
      {data ? <EChart option={data.option} height={220} /> : <p className="small muted">No PI in progress.</p>}
      {data ? (
        <p className="small muted">
          Committed PI stories. Projection lines continue from today at the P85 ({fmtNumber(data.fast, 0)}/week) and P15 (
          {fmtNumber(data.slow, 0)}/week) of the last 6 weeks' throughput of committed PI stories ({data.weekly.join(', ')}); where they
          cross the scope line is the optimistic and pessimistic finish. The PI forecast tile runs the full Monte Carlo per team.
        </p>
      ) : null}
    </section>
  )
}

/** View id (catalog) → chart. `pi-objectives-status` is a catalog "live" entry shown as this panel. */
export const VIEW_PANELS: Record<string, ComponentType<ViewProps>> = {
  'cumulative-flow': CfdPanel,
  'cycle-time-scatterplot': ScatterPanel,
  'sprint-burndown': SprintBurndownPanel,
  'sprint-burnup': SprintBurnupPanel,
  'risk-burndown': RiskBurndownPanel,
  'burnup-forecast': BurnupForecastPanel,
  'pi-objectives-status': ObjectivesPanel,
}
