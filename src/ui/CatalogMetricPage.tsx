// Metric page for catalog entries that are not live registry metrics:
// SYNTHETIC series (generated), views (charts), anti-metrics and entries
// that the catalog lists as live but that are not computed yet.

import { AssessmentRadar } from './AssessmentRadar'
import { isAssessment } from '../synthetic/assessments'
import { useMemo } from 'react'
import { fmtNumber, fmtValue, unitLabel } from '../app/format'
import { metricOn, switchable, useLibrary } from '../app/library'
import { TABS } from '../app/route'
import { eventStore, useApp } from '../app/state'
import { catalogEntry, isPendingLive, LIVE_PANELS, SOURCE_LABEL } from '../content/catalog'
import { symptomsForMetric } from '../content/symptoms'
import { SIM_EPOCH, WEEK_MS } from '../sim/calendar'
import { SYNTHETIC_BY_ID, syntheticValue, weekIndex } from '../synthetic/series'
import { SYNTH_SPECS } from '../synthetic/specs'
import { AliasChips, EntryChips, LearnSummary } from './catalogBits'
import { CHART, EChart, timeAxis, type EChartsOption } from './EChart'
import { TEAM_COLORS } from './Status'
import { axis, legend, tooltip } from './TabCharts'
import { VIEW_PANELS } from './ViewCharts'

export function CatalogMetricPage({ id, teamIds }: { id: string; teamIds: string[] }) {
  const { navigate } = useApp()
  const lib = useLibrary()
  const entry = catalogEntry(id)
  if (!entry) {
    return (
      <main className="page">
        <p>Unknown metric “{id}”.</p>
        <button className="link inline" onClick={() => navigate({ page: 'catalog' })}>
          Open the Catalog
        </button>
      </main>
    )
  }
  const tab = TABS.find((t) => t.id === entry.tab)
  const on = metricOn({ metrics: lib.metrics, symptoms: {} }, entry.id)
  const canSwitch = switchable(entry)
  const def = SYNTHETIC_BY_ID.get(entry.id)
  const Panel = VIEW_PANELS[entry.id]
  const symptoms = symptomsForMetric(entry.id)

  return (
    <main className="page metric-page">
      <nav className="crumbs small">
        <button className="link" onClick={() => history.back()}>
          ← Back
        </button>
        <span className="muted"> · </span>
        <a href="#/catalog">Catalog</a>
        <span className="muted"> / {entry.name}</span>
      </nav>
      <div className="metric-layout">
        <div className="metric-main">
          <header>
            <EntryChips entry={entry} />
            <h1>{entry.name}</h1>
            <p className="question">{entry.q}</p>
            <AliasChips aliases={entry.aliases} />
          </header>

          {canSwitch ? (
            <section className="switch-row">
              <label className="switch">
                <input type="checkbox" checked={on} onChange={(e) => lib.setMetric(entry.id, e.target.checked)} />
                <span>
                  Show on the{' '}
                  {tab ? (
                    <a href={`#/${tab.id}`} onClick={(e) => e.stopPropagation()}>
                      {tab.title}
                    </a>
                  ) : null}{' '}
                  tab
                </span>
              </label>
              <span className="small muted">Library setting, saved in this browser.</span>
            </section>
          ) : null}

          {entry.status === 'anti' ? (
            <section className="notice">
              <strong>Anti-metric.</strong> Kept in the Catalog and in Learn to explain why it misleads — it is never a tile or a
              dashboard (no per-person dashboards in Delivery Pulse).
            </section>
          ) : null}

          {isPendingLive(entry) ? (
            <section className="notice">
              <strong>Not computed yet.</strong> The catalog lists this metric as live, but it has no registry definition (formula,
              target, benchmark) and no compute function yet, so there is nothing honest to show.
            </section>
          ) : null}

          {def ? <SyntheticSection id={entry.id} teamIds={teamIds} /> : null}
          {isAssessment(entry.id) ? <AssessmentRadar id={entry.id} teamIds={teamIds} /> : null}
          {Panel ? (
            <section>
              {LIVE_PANELS.has(entry.id) ? <p className="small muted">Computed from simulator events; always shown on the {tab?.title} tab.</p> : null}
              <Panel teamIds={teamIds} />
            </section>
          ) : null}

          {symptoms.length ? (
            <section>
              <h3>Appears in Diagnose</h3>
              <ul className="small">
                {symptoms.map((s) => (
                  <li key={s.id}>
                    <a href={`#/diagnose/${s.id}`}>{s.name}</a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="side-card">
          <LearnSummary id={entry.id} />
          <section>
            <h3>In production</h3>
            <p className="small">Source: {SOURCE_LABEL[entry.source] ?? entry.source}.</p>
          </section>
        </aside>
      </div>
    </main>
  )
}

function SyntheticSection({ id, teamIds }: { id: string; teamIds: string[] }) {
  const { now, version } = useApp()
  const def = SYNTHETIC_BY_ID.get(id)!
  const spec = SYNTH_SPECS[id]
  const { value, option } = useMemo(() => {
    const idx = teamIds.map((t) => eventStore.teams.findIndex((x) => x.id === t)).filter((k) => k >= 0)
    const last = weekIndex(now)
    const weeks = Array.from({ length: Math.min(last + 1, 30) }, (_, k) => last - Math.min(last, 29) + k)
    const at = (w: number) => SIM_EPOCH + w * WEEK_MS
    const series = [
      ...(idx.length > 1
        ? idx.map((k) => ({
            type: 'line',
            name: eventStore.teams[k].key,
            showSymbol: false,
            lineStyle: { width: 1, color: TEAM_COLORS[eventStore.teams[k].id], opacity: 0.6 },
            itemStyle: { color: TEAM_COLORS[eventStore.teams[k].id] },
            step: spec.every && spec.every > 1 ? 'end' : undefined,
            data: weeks.map((w) => [at(w), syntheticValue(id, [k], at(w))]),
          }))
        : []),
      {
        type: 'line',
        name: idx.length > 1 ? (spec.agg === 'sum' ? 'program (sum)' : 'program (median)') : 'value',
        showSymbol: false,
        lineStyle: { width: 2, color: CHART.muted, type: 'dashed' },
        itemStyle: { color: CHART.muted },
        step: spec.every && spec.every > 1 ? 'end' : undefined,
        data: weeks.map((w) => [at(w), syntheticValue(id, idx, at(w))]),
      },
    ]
    const option: EChartsOption = {
      animation: false,
      grid: { left: 48, right: 16, top: 32, bottom: 24 },
      tooltip,
      legend,
      xAxis: timeAxis(),
      yAxis: { type: 'value', scale: true, ...axis() },
      series,
    }
    return { value: syntheticValue(id, idx, now), option }
  }, [id, teamIds, now, version, spec])
  return (
    <>
      <section className="drawer-value synthetic-value">
        <div className="big">
          <span className="num">{fmtValue(def, value)}</span>
          <span className="unit">{unitLabel(def.unit)}</span>
        </div>
        <div className="value-meta">
          <span className="chip synthetic">SYNTHETIC</span>
          {spec.what ? <span>{spec.what}</span> : null}
          <span className="muted">
            {def.window} · {spec.agg === 'sum' ? 'program = sum of teams' : 'program = median of teams'} · no target, never coloured
          </span>
          <span className="muted">In production the source is {def.generated!.prodSource}.</span>
        </div>
      </section>
      <section>
        <h3>Generated series · last {fmtNumber(30, 0)} weeks</h3>
        <EChart option={option} height={210} />
        <p className="small muted">
          Generated in the browser from its own random stream (seeded from the simulation seed and this metric's id) — not from
          simulator events, and it does not change the simulated history. The range is illustrative for a healthy organisation, not a
          benchmark.
        </p>
      </section>
    </>
  )
}
