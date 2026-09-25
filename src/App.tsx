import { useMemo } from 'react'
import { computePulse, stabilizePulse } from './app/pulse'
import { eventStore, statusStabilizer, useApp } from './app/state'
import { DependencyGraph } from './ui/DependencyGraph'
import { ForecastBar } from './ui/ForecastBar'
import { Header } from './ui/Header'
import { MetricDrawer } from './ui/MetricDrawer'
import { EventFeed, SignalsPanel, WatchPanel } from './ui/SideRail'
import { Tile } from './ui/Tile'

const COLUMNS = [
  { id: 'lagging', title: 'Lagging', hint: 'what already happened' },
  { id: 'current', title: 'Current', hint: 'what is happening now' },
  { id: 'leading', title: 'Leading', hint: 'what is coming' },
] as const

export default function App() {
  const { ready, version, now, scope } = useApp()
  const raw = useMemo(() => (ready ? computePulse(eventStore, now, scope) : undefined), [ready, version, now, scope])
  const pulse = useMemo(() => raw && stabilizePulse(raw, scope, version, statusStabilizer), [raw, scope, version])

  if (!pulse) {
    return (
      <main className="loading">
        <svg className="pulse-line" viewBox="0 0 240 48" aria-hidden="true">
          <polyline points="0,24 70,24 84,8 100,42 114,16 124,24 240,24" />
        </svg>
        <p>Simulating six months of delivery…</p>
      </main>
    )
  }

  return (
    <div className="app">
      <Header signalCount={pulse.signals.length} onSignals={() => document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth' })} />
      <div className="layout">
        <main className="main">
          <ForecastBar tile={pulse.forecast} now={now} />
          <div className="columns">
            {COLUMNS.map((c) => (
              <section key={c.id} className="column" aria-label={`${c.title} metrics`}>
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
        <aside className="rail">
          <SignalsPanel signals={pulse.signals} />
          <WatchPanel items={pulse.watch} />
          <EventFeed teamIds={pulse.teamIds} />
        </aside>
      </div>
      <footer className="footer small muted">
        Simulated data (seed-fixed, identical for every visitor). Every number is computed from simulator events — click any tile
        for its formula, source records, target and benchmark.
      </footer>
      <MetricDrawer teamIds={pulse.teamIds} />
    </div>
  )
}
