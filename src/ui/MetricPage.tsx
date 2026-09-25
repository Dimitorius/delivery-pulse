// Full metric page (SPEC §7): value / target / benchmark / trend; series with
// the XmR corridor and annotations; distribution + scatterplot for time
// metrics; per-team breakdown; related metrics; side card with definition,
// sources, framework equivalents and the definition change log.

import { useMemo, useState } from 'react'
import { fmtDate, fmtDateTime, fmtNumber, fmtValue, unitLabel } from '../app/format'
import { displayName, lensAka, LENS_NAME } from '../app/lens'
import { computeTile, weeklySeries } from '../app/pulse'
import { TABS } from '../app/route'
import { eventStore, statusStabilizer, useApp, type Lens } from '../app/state'
import { scaledTarget, statusFor, targetLabel } from '../metrics/evaluate'
import { METRIC_BY_ID, windowOf, type MetricDef, type Source } from '../metrics/registry'
import { percentile } from '../metrics/stats'
import type { MetricResult } from '../metrics/types'
import { xmrCheck } from '../metrics/xmr'
import { CHART, EChart, type EChartsOption } from './EChart'
import { Sparkline } from './Sparkline'
import { StatusBadge, TEAM_COLORS } from './Status'

const TIME_UNITS = new Set(['d', 'h', 'min', 'wd'])
const tooltip = { trigger: 'axis', backgroundColor: CHART.surface, borderColor: CHART.grid, textStyle: { color: '#e6edf3', fontFamily: CHART.font } }

function axis() {
  return {
    axisLine: { lineStyle: { color: CHART.grid } },
    axisTick: { show: false },
    axisLabel: { color: CHART.text, fontFamily: CHART.font, fontSize: 10 },
    splitLine: { lineStyle: { color: CHART.grid } },
  }
}

/** PI and IP iteration starts as vertical annotations. */
function annotations(from: number, to: number) {
  const out: { xAxis: number; label: { formatter: string } }[] = []
  for (const it of eventStore.iterationList) {
    if (it.start < from || it.start > to) continue
    if (it.kind === 'pi') out.push({ xAxis: it.start, label: { formatter: it.name } })
    if (it.kind === 'sprint' && it.ip && it.teamId === eventStore.teams[0]?.id) out.push({ xAxis: it.start, label: { formatter: 'IP' } })
  }
  return out
}

export function MetricPage({ id, teamIds }: { id: string; teamIds: string[] }) {
  const { version, now, scope, lens, navigate } = useApp()
  const def = METRIC_BY_ID.get(id)
  const result = useMemo(
    () => (def ? def.compute({ store: eventStore, asOf: now, teamIds, windowDays: windowOf(def) }) : undefined),
    [def, version, teamIds, now],
  )
  if (!def || !result) {
    return (
      <main className="page">
        <p>Unknown metric “{id}”.</p>
        <button className="link" onClick={() => navigate({ page: 'pulse' })}>
          Back to Pulse
        </button>
      </main>
    )
  }
  const status = statusStabilizer.get(`${scope}|${def.id}`) ?? statusFor(def, result, teamIds.length)
  const tab = TABS.find((t) => t.id === def.tab)
  const aka = lensAka(def, lens)

  return (
    <main className="page metric-page">
      <nav className="crumbs small">
        <button className="link" onClick={() => history.back()}>
          ← Back
        </button>
        <span className="muted"> · </span>
        <a href={`#/${def.tab}`}>{tab?.title}</a>
        <span className="muted"> / {displayName(def, lens)}</span>
      </nav>
      <div className="metric-layout">
        <div className="metric-main">
          <header>
            <div className="chips">
              <span className="chip">{def.domain}</span>
              {def.synthetic ? <span className="chip synthetic">SYNTHETIC</span> : null}
              {def.levels.map((l) => (
                <span key={l} className="chip subtle">
                  {l}
                </span>
              ))}
            </div>
            <h1>{displayName(def, lens)}</h1>
            {aka ? (
              <p className="small muted">
                {LENS_NAME[lens]} name · Default: {def.name}
              </p>
            ) : null}
            <p className="question">{def.question}</p>
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
                {def.window} · as of {fmtDateTime(now)} UTC · n = {result.n.toLocaleString('en-US')}
              </span>
              {result.secondary?.length ? (
                <span className="muted">
                  {result.secondary
                    .map((s) =>
                      s.unit === 'date'
                        ? `${s.label} ${s.value ? fmtDate(s.value) : '—'}`
                        : `${s.label} ${fmtNumber(s.value, s.value !== null && Number.isInteger(s.value) ? 0 : 1)}${s.unit ? ` ${s.unit}` : ''}`,
                    )
                    .join(' · ')}
                </span>
              ) : null}
              {status === 'low' ? (
                <span className="muted">
                  Low confidence: only {result.n} records (fewer than {def.minSample}), so the value is not coloured.
                </span>
              ) : null}
              {result.flags?.map((f) => (
                <span key={f} className="warn-text">
                  {f}
                </span>
              ))}
              {result.note ? <span className="muted">{result.note}</span> : null}
            </div>
          </section>

          <TrendSection def={def} teamIds={teamIds} now={now} version={version} />
          {TIME_UNITS.has(def.unit) && result.records.some((r) => r.to) ? <Distribution def={def} result={result} /> : null}
          {teamIds.length > 1 ? <TeamBreakdown def={def} teamIds={teamIds} now={now} version={version} /> : null}
          <Related def={def} teamIds={teamIds} now={now} version={version} />
          <Records def={def} result={result} />
        </div>
        <SideCard def={def} teams={teamIds.length} lens={lens} />
      </div>
    </main>
  )
}

function SideCard({ def, teams, lens }: { def: MetricDef; teams: number; lens: Lens }) {
  return (
    <aside className="side-card">
      <section>
        <h3>Definition</h3>
        <p>{def.definition}</p>
        <pre className="formula">{def.formula}</pre>
        <p className="small muted">
          Window: {def.window} · Source: {def.source}
        </p>
        <p className="small muted">
          Source events:{' '}
          {def.events.map((e) => (
            <code key={e}>{e}</code>
          ))}
        </p>
      </section>
      <section>
        <h3>Target (team goal)</h3>
        <p>
          <strong>{targetLabel(def.target, def.unit, teams)}</strong>
          {def.target.op && def.target.op !== 'range' && def.target.warn !== undefined ? (
            <span className="muted">
              {' '}
              · near limit until {fmtNumber(scaledTarget(def.target, teams).warn, 1)}
              {def.target.per === 'team' ? ` (scaled × ${teams} teams)` : ''}
            </span>
          ) : null}
        </p>
        <p className="small">{def.target.note}</p>
        {def.minSample ? <p className="small muted">Low confidence below n = {def.minSample}.</p> : null}
      </section>
      <section>
        <h3>Benchmark</h3>
        <p className="chips">
          <span className={`chip bench-${def.benchmark.kind}`}>{def.benchmark.label}</span>
        </p>
        <p className="small">{def.benchmark.summary}</p>
        {def.benchmark.positions?.map((p) => (
          <div key={p.label} className="position small">
            <strong>{p.label}.</strong> {p.summary}
            <SourceList sources={p.sources} />
          </div>
        ))}
        {def.benchmark.note ? <p className="small muted">{def.benchmark.note}</p> : null}
        {def.benchmark.flag ? <p className="flag small">{def.benchmark.flag}</p> : null}
        <SourceList sources={def.benchmark.sources} />
      </section>
      <section>
        <h3>Also known as</h3>
        {def.aka && Object.keys(def.aka).length ? (
          Object.entries(def.aka).map(([k, a]) => (
            <div key={k} className={`aka small ${k === lens ? 'current' : ''}`}>
              <span className="chip" title={a!.note}>
                {a!.eq} {LENS_NAME[k as Lens]}: {a!.name}
              </span>
              <p className="muted">{a!.note}</p>
              {a!.flag ? <p className="flag">{a!.flag}</p> : null}
              <SourceList sources={a!.sources} />
            </div>
          ))
        ) : (
          <p className="small muted">No named equivalent in SAFe or the Flow Framework — dimmed in those lenses.</p>
        )}
      </section>
      <section>
        <h3>Definition change log</h3>
        {def.changelog?.length ? (
          <ul className="changelog small">
            {def.changelog.map((c) => (
              <li key={c.date + c.change}>
                <span className="num muted">{c.date}</span> {c.change}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No changes since the definition was introduced.</p>
        )}
      </section>
    </aside>
  )
}

export function SourceList({ sources }: { sources: Source[] }) {
  if (!sources.length) return null
  return (
    <ul className="sources small">
      {sources.map((s) => (
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
          {s.altUrl ? (
            <>
              {' '}
              <a href={s.altUrl} target="_blank" rel="noreferrer" className="muted">
                (alt)
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function TrendSection({ def, teamIds, now, version }: { def: MetricDef; teamIds: string[]; now: number; version: number }) {
  const { trend, xmr } = useMemo(() => {
    const rolling = weeklySeries(def, eventStore, now, teamIds, 31, windowOf(def))
    const target = def.target.op && def.target.op !== 'range' ? scaledTarget(def.target, teamIds.length).value : undefined
    const from = rolling[0]?.t ?? now
    const marks = annotations(from, now)
    const trend: EChartsOption = {
      animation: false,
      grid: { left: 48, right: 56, top: 24, bottom: 24 },
      tooltip,
      xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, ...axis() },
      series: [
        {
          type: 'line',
          name: def.short,
          data: rolling.map((p) => [p.t, p.v]),
          showSymbol: false,
          lineStyle: { width: 2, color: CHART.line },
          itemStyle: { color: CHART.line },
          markLine: {
            symbol: 'none',
            silent: true,
            label: { color: CHART.muted, fontFamily: CHART.font, fontSize: 10 },
            data: [
              ...marks.map((m) => ({ ...m, lineStyle: { color: CHART.grid, type: 'solid' } })),
              ...(target !== undefined ? [{ yAxis: target, label: { formatter: 'target', color: CHART.text }, lineStyle: { color: CHART.ok, type: 'dashed' } }] : []),
              ...(def.target.op === 'range'
                ? [
                    { yAxis: def.target.min, label: { formatter: 'min' }, lineStyle: { color: CHART.ok, type: 'dashed' } },
                    { yAxis: def.target.max, label: { formatter: 'max' }, lineStyle: { color: CHART.ok, type: 'dashed' } },
                  ]
                : []),
            ],
          },
        },
      ],
    }
    if (!def.xmr) return { trend, xmr: null }
    const weekly = weeklySeries(def, eventStore, now, teamIds, 24, 7).filter((p) => p.v !== null) as { t: number; v: number }[]
    const { limits, findings } = xmrCheck(weekly.map((p) => p.v))
    const xmr: EChartsOption = {
      animation: false,
      grid: { left: 48, right: 56, top: 16, bottom: 24 },
      tooltip,
      xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, ...axis() },
      series: [
        {
          type: 'line',
          name: 'week',
          data: weekly.map((p) => ({
            value: [p.t, p.v],
            itemStyle: { color: limits && (p.v > limits.upper || p.v < limits.lower) ? CHART.bad : CHART.line },
          })),
          symbolSize: 8,
          lineStyle: { width: 2, color: CHART.line },
          markArea: limits
            ? { silent: true, itemStyle: { color: 'rgba(57,135,229,0.08)' }, data: [[{ yAxis: Math.max(limits.lower, 0) }, { yAxis: limits.upper }]] }
            : undefined,
          markLine: limits
            ? {
                symbol: 'none',
                silent: true,
                label: { color: CHART.text, fontFamily: CHART.font, position: 'end', fontSize: 10 },
                data: [
                  { yAxis: limits.centre, label: { formatter: 'median' }, lineStyle: { color: CHART.muted, type: 'solid' } },
                  { yAxis: limits.upper, label: { formatter: 'UNPL' }, lineStyle: { color: CHART.warn, type: 'dashed' } },
                  ...(limits.lower > 0 ? [{ yAxis: limits.lower, label: { formatter: 'LNPL' }, lineStyle: { color: CHART.warn, type: 'dashed' } }] : []),
                ],
              }
            : undefined,
        },
      ],
    }
    return { trend, xmr: { option: xmr, findings } }
  }, [def, teamIds, now, version])
  return (
    <>
      <section>
        <h3>Trend · rolling {windowOf(def)}-day value at each week start</h3>
        <EChart option={trend} height={200} />
        <p className="small muted">Vertical lines: PI starts and IP iterations.</p>
      </section>
      {xmr ? (
        <section>
          <h3>Process behaviour chart · weekly values with the XmR corridor</h3>
          <EChart option={xmr.option} height={190} />
          <p className="small muted">
            Corridor = median of the 12 weeks before the last 8 ± 3.145 × median moving range (Wheeler). Signals: a point outside
            the corridor, or 8 weeks in a row on one side of the centre.{' '}
            {xmr.findings.length
              ? xmr.findings.map((f) => {
                  const worse =
                    def.direction === 'neutral' ||
                    (def.direction === 'lower-better' && f.side === 'above') ||
                    (def.direction === 'higher-better' && f.side === 'below')
                  return worse ? (
                    <strong key={f.rule + f.side} className="warn-text">
                      Signal: {f.rule} ({f.side}).{' '}
                    </strong>
                  ) : (
                    <span key={f.rule + f.side}>Improvement: {f.rule} ({f.side}) — not counted as a signal. </span>
                  )
                })
              : 'No signal.'}
          </p>
        </section>
      ) : null}
    </>
  )
}

function Distribution({ def, result }: { def: MetricDef; result: MetricResult }) {
  const { hist, scatter } = useMemo(() => {
    const values = result.records.map((r) => r.value)
    const cap = percentile(values, 98) || 1
    const bins = 14
    const width = cap / bins || 1
    const counts = Array(bins + 1).fill(0)
    for (const v of values) counts[Math.min(bins, Math.floor(v / width))]++
    const labels = counts.map((_, i) => (i === bins ? `≥${fmtNumber(bins * width, 1)}` : fmtNumber(i * width, 1)))
    const p50 = percentile(values, 50)!
    const p85 = percentile(values, 85)!
    const idx = (v: number) => Math.min(bins, Math.floor(v / width))
    const hist: EChartsOption = {
      animation: false,
      grid: { left: 36, right: 16, top: 24, bottom: 24 },
      tooltip,
      xAxis: { type: 'category', data: labels, ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axis(), minInterval: 1 },
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
    }
    const pts = result.records.filter((r) => r.to)
    const scatter: EChartsOption = {
      animation: false,
      grid: { left: 44, right: 56, top: 16, bottom: 24 },
      tooltip: { ...tooltip, trigger: 'item', formatter: (p: { data: [number, number, string] }) => `${p.data[2]} · ${fmtNumber(p.data[1], 1)} ${def.unit}` },
      xAxis: { type: 'time', ...axis(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axis() },
      series: [
        {
          type: 'scatter',
          symbolSize: 7,
          itemStyle: { color: CHART.line, opacity: 0.75, borderColor: CHART.surface, borderWidth: 1 },
          data: pts.map((r) => [r.to!, r.value, r.id]),
          markLine: {
            symbol: 'none',
            label: { color: CHART.text, fontFamily: CHART.font, position: 'end' },
            lineStyle: { color: CHART.muted, type: 'dashed' },
            data: [
              { yAxis: p50, label: { formatter: 'P50' } },
              { yAxis: p85, label: { formatter: 'P85' } },
            ],
          },
        },
      ],
    }
    return { hist, scatter }
  }, [result, def])
  return (
    <section className="two-col">
      <div>
        <h3>Distribution ({def.unit}) · the tail is the story</h3>
        <EChart option={hist} height={180} />
      </div>
      <div>
        <h3>Scatterplot · each record by finish date</h3>
        <EChart option={scatter} height={180} />
      </div>
    </section>
  )
}

function TeamBreakdown({ def, teamIds, now, version }: { def: MetricDef; teamIds: string[]; now: number; version: number }) {
  const rows = useMemo(
    () =>
      teamIds.map((id) => {
        const r = def.compute({ store: eventStore, asOf: now, teamIds: [id], windowDays: windowOf(def) })
        return { id, r, status: statusFor(def, r, 1) }
      }),
    [def, teamIds, now, version],
  )
  return (
    <section>
      <h3>By team</h3>
      <p className="small muted">The program value is recomputed over the merged sample of all teams — percentiles are never averaged across teams.</p>
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
              <td className="muted right">n={r.n.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Related({ def, teamIds, now, version }: { def: MetricDef; teamIds: string[]; now: number; version: number }) {
  const { select, lens } = useApp()
  const tiles = useMemo(
    () => (def.related ?? []).map((id) => METRIC_BY_ID.get(id)).filter((d): d is MetricDef => !!d).map((d) => computeTile(d, eventStore, now, teamIds)),
    [def, teamIds, now, version],
  )
  if (!tiles.length) return null
  return (
    <section>
      <h3>Read together with</h3>
      <div className="related">
        {tiles.map((t) => (
          <button key={t.def.id} className="related-card" onClick={() => select(t.def.id)}>
            <span className="tile-name">{displayName(t.def, lens, true)}</span>
            <span className="num">
              {fmtValue(t.def, t.result.value)} <span className="unit">{unitLabel(t.def.unit)}</span>
            </span>
            <Sparkline values={t.trend} width={110} height={24} />
          </button>
        ))}
      </div>
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
                {shown.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
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
