import { useMemo } from 'react'
import { metricOn, useLibrary } from './app/library'
import { term } from './app/lens'
import { computePulse, computeTile, stabilizePulse, stabilizeTile, type TileData } from './app/pulse'
import { eventStore, statusBook, useApp } from './app/state'
import { METRICS } from './metrics/registry'
import { ForecastBar } from './ui/ForecastBar'
import { Header } from './ui/Header'
import { MetricPage } from './ui/MetricPage'
import { Nav } from './ui/Nav'
import { ScenarioBanner } from './ui/Scenario'
import { Tour } from './ui/Tour'
import { EventFeed, SignalsPanel, WatchPanel } from './ui/SideRail'
import { TabPage } from './ui/TabPage'
import { Tile } from './ui/Tile'
import { DependencyGraph } from './ui/DependencyGraph'
import { SAFE_FLOW } from './app/safeFlow'
import { SYNTHETIC_DEFS } from './synthetic/series'
import { CatalogPage } from './ui/CatalogPage'
import { CatalogMetricPage } from './ui/CatalogMetricPage'
import { DiagnosePage } from './ui/DiagnosePage'
import { LearnPage } from './ui/LearnPage'
import { LibraryPage } from './ui/LibraryPage'

const COLUMNS = [
  { id: 'lagging', title: 'Lagging', hint: 'what already happened' },
  { id: 'current', title: 'Current', hint: 'what is happening now' },
  { id: 'leading', title: 'Leading', hint: 'what is coming' },
] as const

export default function App() {
  const { ready, version, now, scope, route, lens, navigate } = useApp()
  const raw = useMemo(() => (ready ? computePulse(eventStore, now, scope) : undefined), [ready, version, now, scope])
  const library = useLibrary((s) => s.metrics)
  const on = useMemo(() => (id: string) => metricOn({ metrics: library, symptoms: {} }, id), [library])
  const stable = useMemo(() => raw && stabilizePulse(raw, statusBook), [raw])
  // The Library hides switched-off metrics everywhere, signals and watch items included.
  const pulse = useMemo(
    () =>
      stable && {
        ...stable,
        tiles: stable.tiles.filter((t) => on(t.def.id)),
        forecast: stable.forecast && on(stable.forecast.def.id) ? stable.forecast : undefined,
        signals: stable.signals.filter((x) => on(x.metricId)),
        watch: stable.watch.filter((x) => on(x.metricId)),
      },
    [stable, on],
  )
  const tabTiles = useMemo((): TileData[] => {
    if (!ready || !pulse || route.page !== 'tab') return []
    const live = METRICS.filter((m) => m.tab === route.tab && on(m.id)).map((def) =>
      stabilizeTile(computeTile(def, eventStore, now, pulse.teamIds), pulse.teamIds, now, statusBook),
    )
    // Generated SYNTHETIC series carry no target, so no status hysteresis.
    const synthetic = SYNTHETIC_DEFS.filter((d) => d.tab === route.tab && on(d.id)).map((def) => computeTile(def, eventStore, now, pulse.teamIds))
    return [...live, ...synthetic]
  }, [ready, pulse, route, now, on])
  const safeFlowTiles = useMemo(
    () =>
      ready && pulse && route.page === 'tab' && route.tab === 'scale'
        ? SAFE_FLOW.map((def) => stabilizeTile(computeTile(def, eventStore, now, pulse.teamIds), pulse.teamIds, now, statusBook))
        : undefined,
    [ready, pulse, route, now],
  )

  if (!pulse) {
    return (
      <main className="loading">
        <svg className="pulse-line" viewBox="0 0 240 48" aria-hidden="true">
          <polyline points="0,24 70,24 84,8 100,42 114,16 124,24 240,24" />
        </svg>
        <p>Simulating seven months of delivery…</p>
      </main>
    )
  }

  const rail = (
    <aside className="rail">
      <SignalsPanel signals={pulse.signals} />
      <WatchPanel items={pulse.watch} />
      <EventFeed teamIds={pulse.teamIds} />
    </aside>
  )

  return (
    <div className="app">
      <Header
        signalCount={pulse.signals.length}
        onSignals={() => {
          if (route.page !== 'pulse') navigate({ page: 'pulse' })
          setTimeout(() => document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth' }), 50)
        }}
      />
      <ScenarioBanner />
      <Tour />
      <Nav />
      {route.page === 'metric' ? (
        METRICS.some((m) => m.id === route.metricId) ? (
          <MetricPage id={route.metricId} teamIds={pulse.teamIds} />
        ) : (
          <CatalogMetricPage id={route.metricId} teamIds={pulse.teamIds} />
        )
      ) : route.page === 'tab' ? (
        <TabPage tab={route.tab} tiles={tabTiles} safeFlow={safeFlowTiles} teamIds={pulse.teamIds} />
      ) : route.page === 'catalog' ? (
        <CatalogPage />
      ) : route.page === 'library' ? (
        <LibraryPage />
      ) : route.page === 'learn' ? (
        <LearnPage id={route.id} teamIds={pulse.teamIds} />
      ) : route.page === 'diagnose' ? (
        <DiagnosePage id={route.id} teamIds={pulse.teamIds} />
      ) : (
        <div className="layout">
          <main className="main">
            <ForecastBar tile={pulse.forecast} now={now} />
            <div className="columns">
              {COLUMNS.map((c) => (
                <section key={c.id} className="column" aria-label={`${c.title} metrics`} data-tour={`col-${c.id}`}>
                  <h2 className="column-title">
                    {c.title} <span className="muted">· {c.hint}</span>
                  </h2>
                  {pulse.tiles
                    .filter((t) => t.def.column === c.id)
                    .map((t) => (
                      <Tile key={t.def.id} tile={t} teams={pulse.teamIds.length} />
                    ))}
                  {c.id === 'leading' ? <DependencyGraph now={now} /> : null}
                </section>
              ))}
            </div>
          </main>
          {rail}
        </div>
      )}
      <footer className="footer small muted">
        Simulated data (seed-fixed, identical for every visitor) for a fictional {term('program', lens)}. Every number is computed from
        simulator events — click any tile for its formula, source records, target and benchmark.
      </footer>
    </div>
  )
}
