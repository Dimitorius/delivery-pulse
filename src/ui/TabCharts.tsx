// One or two key charts per tab — details stay on the metric pages.
import { useMemo } from 'react'
import { fmtDate, fmtNumber } from '../app/format'
import { eventStore, useApp } from '../app/state'
import { weekAnchor } from '../app/pulse'
import type { Tab } from '../metrics/registry'
import { piForecastDetail, howManyAt } from '../metrics/defs/forecast'
import { SLO_TARGET } from '../metrics/defs/quality'
import { cycleTimeDays, isFlowItem } from '../metrics/flow'
import { percentile } from '../metrics/stats'
import { DAY_MS, WEEK_MS } from '../sim/calendar'
import { CHART, EChart, type EChartsOption } from './EChart'
import { DependencyGraph } from './DependencyGraph'
import { TEAM_COLORS } from './Status'

const tooltip = { trigger: 'axis', backgroundColor: CHART.surface, borderColor: CHART.grid, textStyle: { color: '#e6edf3', fontFamily: CHART.font } }
const legend = { top: 0, textStyle: { color: CHART.text, fontFamily: CHART.font, fontSize: 11 }, itemWidth: 10, itemHeight: 10 }
function axis() {
  return {
    axisLine: { lineStyle: { color: CHART.grid } },
    axisTick: { show: false },
    axisLabel: { color: CHART.text, fontFamily: CHART.font, fontSize: 10 },
    splitLine: { lineStyle: { color: CHART.grid } },
  }
}
// Categorical slots (dark) for non-team series, fixed order.
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']

export function TabCharts({ tab, teamIds }: { tab: Tab; teamIds: string[] }) {
  switch (tab) {
    case 'flow':
      return <FlowCharts teamIds={teamIds} />
    case 'delivery':
      return <DeliveryChart teamIds={teamIds} />
    case 'quality':
      return <QualityChart teamIds={teamIds} />
    case 'program':
      return <ProgramPanels teamIds={teamIds} />
    case 'forecast':
      return <ForecastCharts teamIds={teamIds} />
    case 'scale':
      return <ScalePanels teamIds={teamIds} />
    case 'ai':
      return <AiChart teamIds={teamIds} />
    case 'people':
      return <SurveyChart teamIds={teamIds} />
    default:
      return null
  }
}

function useNow() {
  const { now, version } = useApp()
  return { now, version }
}

function FlowCharts({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const { cfd, scatter } = useMemo(() => {
    const start = weekAnchor(now) - 12 * WEEK_MS
    const items = eventStore.itemList.filter((i) => isFlowItem(i) && teamIds.includes(i.teamId) && i.firstActiveAt !== undefined)
    const firstAt = (i: (typeof items)[number], statuses: string[]) => i.transitions.find((t) => statuses.includes(t.to))?.at
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
    const band = (name: string, key: 'done' | 'qa' | 'review' | 'progress', color: string) => ({
      type: 'line',
      name,
      stack: 'cfd',
      showSymbol: false,
      lineStyle: { width: 1, color },
      itemStyle: { color },
      areaStyle: { color, opacity: 0.35 },
      data: rows.map((r) => [r.t, r[key]]),
    })
    const cfd: EChartsOption = {
      animation: false,
      grid: { left: 44, right: 16, top: 32, bottom: 24 },
      tooltip,
      legend,
      xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axis() },
      series: [band('Done', 'done', SLOTS[2]), band('QA stage', 'qa', SLOTS[3]), band('Review stage', 'review', SLOTS[1]), band('In progress', 'progress', SLOTS[0])],
    }
    const done = items.filter((i) => i.doneAt !== undefined && i.doneAt > start && i.doneAt <= now)
    const ct = done.map(cycleTimeDays)
    const scatter: EChartsOption = {
      animation: false,
      grid: { left: 40, right: 48, top: 16, bottom: 24 },
      tooltip: { ...tooltip, trigger: 'item', formatter: (p: { data: [number, number, string] }) => `${p.data[2]} · ${fmtNumber(p.data[1], 1)} d` },
      xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
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
    }
    return { cfd, scatter }
  }, [teamIds, now, version])
  return (
    <div className="tab-charts two-col">
      <section className="panel">
        <h3>Cumulative flow · last 12 weeks</h3>
        <EChart option={cfd} height={230} />
        <p className="small muted">Band thickness = items in that stage; the top edge = everything started. Parallel bands = stable flow.</p>
      </section>
      <section className="panel">
        <h3>Cycle time scatterplot · last 12 weeks</h3>
        <EChart option={scatter} height={230} />
        <p className="small muted">Each dot is a finished item. Dots above P85 are the tail worth a conversation.</p>
      </section>
    </div>
  )
}

function DeliveryChart({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const option = useMemo(() => {
    const start = weekAnchor(now) - 11 * WEEK_MS
    const weeks = Array.from({ length: 12 }, (_, i) => start + i * WEEK_MS)
    const series = teamIds.map((teamId) => {
      const team = eventStore.teamById.get(teamId)!
      return {
        type: 'bar',
        name: team.key,
        stack: 'deploys',
        barMaxWidth: 24,
        itemStyle: { color: TEAM_COLORS[teamId], borderColor: CHART.surface, borderWidth: 1 },
        data: weeks.map((w) => [w, eventStore.deployments.filter((d) => d.teamId === teamId && d.kind === 'regular' && d.at >= w && d.at < w + WEEK_MS).length]),
      }
    })
    return {
      animation: false,
      grid: { left: 40, right: 16, top: 32, bottom: 24 },
      tooltip,
      legend,
      xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axis() },
      series,
    } as EChartsOption
  }, [teamIds, now, version])
  return (
    <section className="panel tab-charts">
      <h3>Production deployments per week · by team</h3>
      <EChart option={option} height={220} />
    </section>
  )
}

function QualityChart({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const option = useMemo(() => {
    const start = now - 56 * DAY_MS
    const byDay = new Map<number, { total: number; bad: number }>()
    for (const w of eventStore.sli) {
      if (w.end <= start || w.end > now || !teamIds.includes(w.teamId)) continue
      const d = Math.floor(w.start / DAY_MS) * DAY_MS
      const s = byDay.get(d) ?? { total: 0, bad: 0 }
      s.total += w.total
      s.bad += w.bad
      byDay.set(d, s)
    }
    const data = [...byDay].sort((a, b) => a[0] - b[0]).map(([d, s]) => [d, 100 * (1 - s.bad / s.total)])
    return {
      animation: false,
      grid: { left: 56, right: 90, top: 16, bottom: 24 },
      tooltip,
      xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', min: (v: { min: number }) => Math.min(v.min, 99.5), max: 100, ...axis() },
      series: [
        {
          type: 'line',
          name: 'availability %',
          showSymbol: false,
          lineStyle: { width: 2, color: CHART.line },
          data,
          markLine: {
            symbol: 'none',
            label: { color: CHART.text, fontFamily: CHART.font, formatter: 'SLO 99.9 %' },
            lineStyle: { color: CHART.ok, type: 'dashed' },
            data: [{ yAxis: SLO_TARGET }],
          },
        },
      ],
    } as EChartsOption
  }, [teamIds, now, version])
  return (
    <section className="panel tab-charts">
      <h3>Daily availability · last 8 weeks</h3>
      <EChart option={option} height={200} />
      <p className="small muted">Good requests / all requests per day across the services in scope. Dips are incidents.</p>
    </section>
  )
}

function ProgramPanels({ teamIds }: { teamIds: string[] }) {
  const { now, version, select } = { ...useNow(), select: useApp((s) => s.select) }
  const { milestones, risks } = useMemo(() => {
    const milestones = eventStore.milestoneList.filter((m) => m.plannedAt <= now).slice(-6).reverse()
    const risks = eventStore.riskList
      .filter((r) => r.openedAt <= now && (r.closedAt === undefined || r.closedAt > now) && (!r.ownerTeamId || teamIds.includes(r.ownerTeamId)))
      .map((r) => ({ r, h: [...r.history].reverse().find((h) => h.at <= now)! }))
      .sort((a, b) => b.h.probability * b.h.impact - a.h.probability * a.h.impact)
    return { milestones, risks }
  }, [teamIds, now, version])
  return (
    <div className="tab-charts two-col">
      <DependencyGraph now={now} />
      <section className="panel">
        <h3>
          Milestones
          <button className="link" onClick={() => select('milestone-hit-rate')}>
            details
          </button>
        </h3>
        <div className="table-wrap">
        <table className="records">
          <tbody>
            {milestones.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="num muted">due {fmtDate(m.due)}</td>
                <td className={m.achievedAt !== undefined && m.achievedAt <= now ? (m.achievedAt <= m.due ? 'ok-text' : 'warn-text') : m.due < now ? 'bad-text' : 'muted'}>
                  {m.achievedAt !== undefined && m.achievedAt <= now ? (m.achievedAt <= m.due ? 'hit' : 'late') : m.due < now ? 'missed' : 'open'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <h3 className="mt">
          Risk register (open)
          <button className="link" onClick={() => select('risk-exposure')}>
            details
          </button>
        </h3>
        <div className="table-wrap">
        <table className="records">
          <tbody>
            {risks.map(({ r, h }) => (
              <tr key={r.id}>
                <td className="ellipsis">{r.title}</td>
                <td className="num right">P {h.probability.toFixed(2)}</td>
                <td className="num right">{h.impact} pd</td>
                <td className="num right">EMV {(h.probability * h.impact).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  )
}

function ForecastCharts({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const { when, howMany } = useMemo(() => {
    const ctx = { store: eventStore, asOf: now, teamIds, windowDays: 28 }
    const detail = piForecastDetail(ctx)
    let when: EChartsOption | null = null
    if (detail) {
      const max = Math.max(...detail.days, Math.ceil(detail.daysLeft))
      const counts = Array(max + 1).fill(0)
      for (const d of detail.days) counts[d]++
      when = {
        animation: false,
        grid: { left: 40, right: 16, top: 24, bottom: 28 },
        tooltip,
        xAxis: { type: 'category', data: counts.map((_, i) => String(i)), name: 'working days', nameLocation: 'middle', nameGap: 20, nameTextStyle: { color: CHART.muted }, ...axis(), splitLine: { show: false } },
        yAxis: { type: 'value', ...axis() },
        series: [
          {
            type: 'bar',
            data: counts.map((c, i) => ({ value: c, itemStyle: { color: i <= detail.daysLeft ? CHART.line : CHART.muted, borderRadius: [3, 3, 0, 0] } })),
            barMaxWidth: 18,
            markLine: {
              symbol: 'none',
              label: { color: CHART.text, fontFamily: CHART.font, formatter: 'PI end' },
              lineStyle: { color: CHART.text, type: "dashed" },
              data: [{ xAxis: String(Math.floor(detail.daysLeft)) }],
            },
          },
        ],
      }
    }
    const hm = howManyAt(ctx)
    const hist = new Map<number, number>()
    for (const v of hm.totals) hist.set(v, (hist.get(v) ?? 0) + 1)
    const lo = Math.min(...hist.keys())
    const hi = Math.max(...hist.keys())
    const xs = hist.size ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : []
    const howMany: EChartsOption = {
      animation: false,
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip,
      xAxis: { type: 'category', data: xs.map(String), name: 'items in 10 working days', nameLocation: 'middle', nameGap: 20, nameTextStyle: { color: CHART.muted }, ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axis() },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: xs.map((x) => ({ value: hist.get(x) ?? 0, itemStyle: { color: hm.value !== null && x >= hm.value ? CHART.line : CHART.muted, borderRadius: [3, 3, 0, 0] } })),
          markLine: hm.value !== null ? { symbol: 'none', label: { color: CHART.text, formatter: '85 %' }, lineStyle: { color: CHART.text, type: 'dashed' }, data: [{ xAxis: String(hm.value) }] } : undefined,
        },
      ],
    }
    return { when, howMany }
  }, [teamIds, now, version])
  return (
    <div className="tab-charts two-col">
      <section className="panel">
        <h3>When will the committed PI scope be done? · 2,000 trials</h3>
        {when ? <EChart option={when} height={220} /> : <p className="small muted">No PI scope for the selected teams.</p>}
        <p className="small muted">Blue = trials that finish by the PI end. Each team is simulated on its own throughput; the PI is done when the last team is.</p>
      </section>
      <section className="panel">
        <h3>How many items in the next 10 working days?</h3>
        <EChart option={howMany} height={220} />
        <p className="small muted">Blue = outcomes at or above the 85 % line (the number to promise).</p>
      </section>
    </div>
  )
}

function ScalePanels({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const { option, current } = useMemo(() => {
    const scored = eventStore.objectiveList.filter((o) => teamIds.includes(o.teamId) && o.scoredAt !== undefined && o.scoredAt <= now)
    const pis = [...new Set(scored.map((o) => o.piId))]
    const vals = pis.map((pi) => {
      const objs = scored.filter((o) => o.piId === pi)
      const planned = objs.filter((o) => o.committed).reduce((a, o) => a + o.plannedBv, 0)
      const actual = objs.reduce((a, o) => a + (o.actualBv ?? 0), 0)
      return planned ? (100 * actual) / planned : 0
    })
    const option: EChartsOption = {
      animation: false,
      grid: { left: 40, right: 16, top: 16, bottom: 24 },
      tooltip,
      xAxis: { type: 'category', data: pis.map((p) => p.replace('-', ' ')), ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axis() },
      series: [
        {
          type: 'bar',
          barMaxWidth: 24,
          data: vals,
          itemStyle: { color: CHART.line, borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: CHART.text, fontFamily: CHART.font, formatter: (p: { value: number }) => `${p.value.toFixed(0)} %` },
          markArea: { silent: true, itemStyle: { color: 'rgba(12,163,12,0.08)' }, data: [[{ yAxis: 80 }, { yAxis: 100 }]] },
        },
      ],
    }
    const pi = eventStore.iterationList.find((i) => i.kind === 'pi' && i.start <= now && now < i.end)
    const current = eventStore.objectiveList.filter((o) => pi && o.piId === pi.id && teamIds.includes(o.teamId))
    return { option, current }
  }, [teamIds, now, version])
  return (
    <div className="tab-charts two-col">
      <section className="panel">
        <h3>PI predictability by PI</h3>
        <EChart option={option} height={200} />
        <p className="small muted">Green band: 80–100 %, the range SAFe describes as predictable.</p>
      </section>
      <section className="panel">
        <h3>Current PI objectives ({current.length})</h3>
        <div className="table-wrap scroll-y">
          <table className="records">
            <tbody>
              {current.map((o) => {
                const f = eventStore.items.get(o.featureId)
                return (
                  <tr key={o.id}>
                    <td className="ellipsis">{o.title}</td>
                    <td>{eventStore.teamById.get(o.teamId)?.key}</td>
                    <td className="muted">{o.committed ? 'committed' : 'uncommitted'}</td>
                    <td className="num right">BV {o.plannedBv}</td>
                    <td className="muted">{f?.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function AiChart({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const option = useMemo(() => {
    const from = now - 84 * DAY_MS
    const deployed = eventStore.mrList.filter((m) => teamIds.includes(m.teamId) && m.deployedAt !== undefined && m.deployedAt > from && m.deployedAt <= now)
    const causes = new Set(eventStore.incidentList.filter((i) => i.causeMrId && i.detectedAt <= now).map((i) => i.causeMrId!))
    const rate = (ai: boolean) => {
      const g = deployed.filter((m) => m.aiAssisted === ai)
      return g.length ? (100 * g.filter((m) => causes.has(m.id)).length) / g.length : 0
    }
    return {
      animation: false,
      grid: { left: 110, right: 48, top: 8, bottom: 24 },
      tooltip,
      xAxis: { type: 'value', ...axis() },
      yAxis: { type: 'category', data: ['Other changes', 'AI-assisted'], ...axis(), splitLine: { show: false } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 22,
          data: [rate(false), rate(true)],
          itemStyle: { color: CHART.line, borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: CHART.text, fontFamily: CHART.font, formatter: (p: { value: number }) => `${p.value.toFixed(1)} %` },
        },
      ],
    } as EChartsOption
  }, [teamIds, now, version])
  return (
    <section className="panel tab-charts">
      <h3>Change failure rate by change type · last 12 weeks</h3>
      <EChart option={option} height={130} />
      <p className="small muted">Simulation assumption: AI-assisted changes are 1.2× as likely to be named as the cause of an incident.</p>
    </section>
  )
}

function SurveyChart({ teamIds }: { teamIds: string[] }) {
  const { now, version } = useNow()
  const option = useMemo(
    () =>
      ({
        animation: false,
        grid: { left: 40, right: 16, top: 32, bottom: 24 },
        tooltip,
        legend,
        xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
        yAxis: { type: 'value', scale: true, ...axis() },
        series: teamIds.map((teamId) => ({
          type: 'line',
          name: eventStore.teamById.get(teamId)?.key,
          showSymbol: true,
          symbolSize: 6,
          lineStyle: { width: 2, color: TEAM_COLORS[teamId] },
          itemStyle: { color: TEAM_COLORS[teamId] },
          data: eventStore.surveys.filter((s) => s.instrument === 'DXI' && s.teamId === teamId && s.at <= now).map((s) => [s.at, s.score]),
        })),
      }) as EChartsOption,
    [teamIds, now, version],
  )
  return (
    <section className="panel tab-charts">
      <h3>Developer experience survey by team · SYNTHETIC</h3>
      <EChart option={option} height={200} />
    </section>
  )
}
