// Metric detail: the transparency contract — value, target, benchmark with
// sources, the formula, the event types used, trend, XmR limits, the
// distribution, the per-team breakdown and every contributing record.

import { useEffect, useMemo, useState } from 'react'
import { fmtDateTime, fmtNumber, fmtValue, unitLabel } from '../app/format'
import { WINDOW_DAYS, weeklySeries } from '../app/pulse'
import { eventStore, useApp } from '../app/state'
import { evaluate, scaledTarget, targetLabel } from '../metrics/evaluate'
import { METRIC_BY_ID, type MetricDef } from '../metrics/registry'
import { percentile } from '../metrics/stats'
import type { MetricResult } from '../metrics/types'
import { xmrCheck } from '../metrics/xmr'
import { CHART, EChart, type EChartsOption } from './EChart'
import { StatusBadge, TEAM_COLORS } from './Status'

const TIME_UNITS = new Set(['d', 'h', 'min'])

export function MetricDrawer({ teamIds }: { teamIds: string[] }) {
  const { selected, select, version, now } = useApp()
  const def = selected ? METRIC_BY_ID.get(selected) : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  const result = useMemo(
    () => (def ? def.compute({ store: eventStore, asOf: now, teamIds, windowDays: WINDOW_DAYS }) : undefined),
    [def, version, teamIds, now],
  )
  if (!def || !result) return null
  const status = evaluate(result.value, def.target, teamIds.length)

  return (
    <div className="drawer-backdrop" onClick={() => select(null)}>
      <aside className="drawer" role="dialog" aria-label={`${def.name} details`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <div className="chips">
              <span className="chip">{def.domain}</span>
              {def.levels.map((l) => (
                <span key={l} className="chip subtle">
                  {l}
                </span>
              ))}
              <span className="chip subtle">source: {def.source}</span>
            </div>
            <h2>{def.name}</h2>
            <p className="question">{def.question}</p>
          </div>
          <button className="close" onClick={() => select(null)} aria-label="Close">
            ×
          </button>
        </header>

        <section className="drawer-value">
          <div className="big">
            <span className="num">{fmtValue(def, result.value)}</span>
            <span className="unit">{unitLabel(def.unit)}</span>
          </div>
          <div className="value-meta">
            <StatusBadge status={status} />
            <span>target {targetLabel(def.target, def.unit, teamIds.length)}</span>
            <span className="muted">
              {def.window} · as of {fmtDateTime(now)} UTC · n = {result.n}
            </span>
            {result.secondary?.length ? (
              <span className="muted">
                {result.secondary
                  .filter((s) => s.unit !== 'date')
                  .map((s) => `${s.label} ${fmtNumber(s.value, Number.isInteger(s.value) ? 0 : 1)}${s.unit ? ` ${s.unit}` : ''}`)
                  .join(' · ')}
              </span>
            ) : null}
            {result.note ? <span className="muted">{result.note}</span> : null}
          </div>
        </section>

        <section>
          <h3>How it is calculated</h3>
          <p>{def.definition}</p>
          <pre className="formula">{def.formula}</pre>
          <p className="small muted">
            Source events:{' '}
            {def.events.map((e) => (
              <code key={e}>{e}</code>
            ))}
          </p>
        </section>

        <section className="two-col">
          <div>
            <h3>Target (team goal)</h3>
            <p>
              <strong>{targetLabel(def.target, def.unit, teamIds.length)}</strong>
              {def.target.op && def.target.warn !== undefined ? (
                <span className="muted">
                  {' '}
                  · watch until {fmtNumber(scaledTarget(def.target, teamIds.length).warn, 1)}
                  {def.target.per === 'team' ? ` (scaled × ${teamIds.length} teams)` : ''}
                </span>
              ) : null}
            </p>
            <p className="small">{def.target.note}</p>
          </div>
          <div>
            <h3>Industry benchmark</h3>
            <p className="small">{def.benchmark.summary}</p>
            {def.benchmark.flag ? <p className="flag small">{def.benchmark.flag}</p> : null}
            <ul className="sources small">
              {def.benchmark.sources.map((s) => (
                <li key={s.key}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}{' '}
                  <span className="muted">
                    — {s.publisher}
                    {s.year ? `, ${s.year}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <TrendCharts def={def} teamIds={teamIds} now={now} version={version} />
        {TIME_UNITS.has(def.unit) && result.records.length ? <Distribution def={def} result={result} /> : null}
        {teamIds.length > 1 ? <TeamBreakdown def={def} teamIds={teamIds} now={now} version={version} /> : null}
        <Records def={def} result={result} />
      </aside>
    </div>
  )
}

function axisStyle() {
  return {
    axisLine: { lineStyle: { color: CHART.grid } },
    axisTick: { show: false },
    axisLabel: { color: CHART.text, fontFamily: CHART.font, fontSize: 10 },
    splitLine: { lineStyle: { color: CHART.grid } },
  }
}

const dateLabel = (t: number) => new Date(t).toISOString().slice(5, 10)

function TrendCharts({ def, teamIds, now, version }: { def: MetricDef; teamIds: string[]; now: number; version: number }) {
  const { trend, xmr } = useMemo(() => {
    const rolling = weeklySeries(def, eventStore, now, teamIds, 27, WINDOW_DAYS)
    const target = def.target.op ? scaledTarget(def.target, teamIds.length).value : undefined
    const trend: EChartsOption = {
      animation: false,
      grid: { left: 44, right: 52, top: 16, bottom: 24 },
      tooltip: { trigger: 'axis', backgroundColor: CHART.surface, borderColor: CHART.grid, textStyle: { color: '#e6edf3', fontFamily: CHART.font } },
      xAxis: { type: 'category', data: rolling.map((p) => dateLabel(p.t)), ...axisStyle(), splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, ...axisStyle() },
      series: [
        {
          type: 'line',
          name: def.short,
          data: rolling.map((p) => p.v),
          showSymbol: false,
          lineStyle: { width: 2, color: CHART.line },
          itemStyle: { color: CHART.line },
          markLine:
            target !== undefined
              ? {
                  symbol: 'none',
                  label: { color: CHART.text, fontFamily: CHART.font, formatter: 'target' },
                  lineStyle: { color: CHART.ok, type: 'dashed' },
                  data: [{ yAxis: target }],
                }
              : undefined,
        },
      ],
    }
    if (!def.xmr) return { trend, xmr: null }
    const weekly = weeklySeries(def, eventStore, now, teamIds, 20, 7).filter((p) => p.v !== null) as { t: number; v: number }[]
    const { limits, findings } = xmrCheck(weekly.map((p) => p.v))
    const xmr: EChartsOption = {
      animation: false,
      grid: { left: 44, right: 60, top: 16, bottom: 24 },
      tooltip: { trigger: 'axis', backgroundColor: CHART.surface, borderColor: CHART.grid, textStyle: { color: '#e6edf3', fontFamily: CHART.font } },
      xAxis: { type: 'category', data: weekly.map((p) => dateLabel(p.t)), ...axisStyle(), splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, ...axisStyle() },
      series: [
        {
          type: 'line',
          name: 'week',
          data: weekly.map((p) => ({
            value: p.v,
            itemStyle: { color: limits && (p.v > limits.upper || p.v < limits.lower) ? CHART.bad : CHART.line },
          })),
          symbolSize: 8,
          lineStyle: { width: 2, color: CHART.line },
          markLine: limits
            ? {
                symbol: 'none',
                label: { color: CHART.text, fontFamily: CHART.font, position: 'end' },
                data: [
                  { yAxis: limits.centre, name: 'centre', label: { formatter: 'median' }, lineStyle: { color: CHART.muted, type: 'solid' } },
                  { yAxis: limits.upper, label: { formatter: 'UNPL' }, lineStyle: { color: CHART.warn, type: 'dashed' } },
                  ...(limits.lower > 0 ? [{ yAxis: limits.lower, label: { formatter: 'LNPL' }, lineStyle: { color: CHART.warn, type: 'dashed' } }] : []),
                ],
              }
            : undefined,
        },
      ],
    }
    return { trend, xmr: { option: xmr, findings, limits } }
  }, [def, teamIds, now, version])
  return (
    <>
      <section>
        <h3>Trend · rolling {WINDOW_DAYS}-day value at each week start</h3>
        <EChart option={trend} height={170} />
      </section>
      {xmr ? (
        <section>
          <h3>Process behaviour chart · weekly values (XmR)</h3>
          <EChart option={xmr.option} height={170} />
          <p className="small muted">
            Limits = median of the 12 weeks before the last 8 ± 3.145 × median moving range (Wheeler). Signals: a point outside the
            limits, or 8 weeks in a row on one side of the centre.{' '}
            {xmr.findings.length ? <strong className="warn-text">Signal: {xmr.findings.map((f) => `${f.rule} (${f.side})`).join(', ')}</strong> : 'No signal.'}
          </p>
        </section>
      ) : null}
    </>
  )
}

function Distribution({ def, result }: { def: MetricDef; result: MetricResult }) {
  const option = useMemo(() => {
    const values = result.records.map((r) => r.value)
    const cap = percentile(values, 98)!
    const bins = 14
    const width = cap / bins || 1
    const counts = Array(bins + 1).fill(0)
    for (const v of values) counts[Math.min(bins, Math.floor(v / width))]++
    const labels = counts.map((_, i) => (i === bins ? `≥${fmtNumber(bins * width, 1)}` : fmtNumber(i * width, 1)))
    const p50 = percentile(values, 50)!
    const p85 = percentile(values, 85)!
    const idx = (v: number) => Math.min(bins, Math.floor(v / width))
    return {
      animation: false,
      grid: { left: 36, right: 16, top: 24, bottom: 24 },
      tooltip: { trigger: 'axis', backgroundColor: CHART.surface, borderColor: CHART.grid, textStyle: { color: '#e6edf3', fontFamily: CHART.font } },
      xAxis: { type: 'category', data: labels, ...axisStyle(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axisStyle(), minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: counts,
          barMaxWidth: 24,
          itemStyle: { color: CHART.line, borderRadius: [4, 4, 0, 0] },
          markLine: {
            symbol: 'none',
            label: { color: CHART.text, fontFamily: CHART.font },
            lineStyle: { color: CHART.muted, type: 'dashed' },
            data: [
              { xAxis: idx(p50), label: { formatter: `P50 ${fmtNumber(p50, 1)}` } },
              { xAxis: idx(p85), label: { formatter: `P85 ${fmtNumber(p85, 1)}` } },
            ],
          },
        },
      ],
    } as EChartsOption
  }, [result])
  return (
    <section>
      <h3>Distribution ({def.unit}) · the tail is the story</h3>
      <EChart option={option} height={160} />
    </section>
  )
}

function TeamBreakdown({ def, teamIds, now, version }: { def: MetricDef; teamIds: string[]; now: number; version: number }) {
  const rows = useMemo(
    () =>
      teamIds.map((id) => {
        const r = def.compute({ store: eventStore, asOf: now, teamIds: [id], windowDays: WINDOW_DAYS })
        return { id, r, status: evaluate(r.value, def.target, 1) }
      }),
    [def, teamIds, now, version],
  )
  return (
    <section>
      <h3>By team</h3>
      <p className="small muted">
        Program value is recomputed over the merged sample of all teams — percentiles are never averaged across teams.
      </p>
      <table className="records">
        <tbody>
          {rows.map(({ id, r, status }) => (
            <tr key={id}>
              <td>
                <span className="swatch" style={{ background: TEAM_COLORS[id] }} />
                {eventStore.teamById.get(id)?.name}
              </td>
              <td className="num right">
                {fmtValue(def, r.value)} {unitLabel(def.unit)}
              </td>
              <td>
                <StatusBadge status={status} />
              </td>
              <td className="muted right">n={r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Records({ def, result }: { def: MetricDef; result: MetricResult }) {
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => [...result.records].sort((a, b) => b.value - a.value), [result])
  const shown = all ? sorted : sorted.slice(0, 25)
  const showValue = !result.records.every((r) => r.value === 1 || r.value === 0 || r.value === -1)
  return (
    <section>
      <h3>
        Source records <span className="muted">({result.records.length})</span>
      </h3>
      {result.records.length === 0 ? (
        <p className="small muted">No contributing records in this window.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th>id</th>
                  <th>team</th>
                  <th>what</th>
                  <th>from</th>
                  <th>to</th>
                  {showValue ? <th className="right">{result.recordValue ?? def.unit}</th> : null}
                  <th>detail</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.id}-${r.detail}-${r.value}`}>
                    <td className="num">{r.id}</td>
                    <td>{r.teamId ? eventStore.teamById.get(r.teamId)?.key : ''}</td>
                    <td className="ellipsis">{r.label}</td>
                    <td className="num muted">{r.from ? fmtDateTime(r.from) : ''}</td>
                    <td className="num muted">{r.to ? fmtDateTime(r.to) : ''}</td>
                    {showValue ? <td className="num right">{fmtNumber(r.value, 1)}</td> : null}
                    <td className="muted ellipsis">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length > shown.length ? (
            <button className="link" onClick={() => setAll(true)}>
              Show all {sorted.length}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
