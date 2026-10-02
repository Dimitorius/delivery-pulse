// Inject scenario (stage 3b): the header menu, the "Scenario active" banner
// shown on every screen, and the inject / clear controls on a Diagnose card.

import { useEffect, useRef, useState } from 'react'
import { fmtDateTime } from '../app/format'
import { SCENARIO_INFO, scenarioInfo } from '../app/scenarioInfo'
import { activeScenario, useApp } from '../app/state'

export function ScenarioMenu() {
  const { injectScenario, navigate, ended } = useApp()
  useApp((s) => s.version)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = activeScenario()
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const groups = [...new Set(SCENARIO_INFO.map((s) => s.symptom.group))]
  return (
    <div className="scenario-menu" ref={ref}>
      <button className={`inject ${active ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={ended} data-tour="inject">
        Inject scenario ▾
      </button>
      {open ? (
        <div className="scenario-pop" role="menu">
          <p className="small muted">
            Switch on a known problem from now on. It changes how the simulated teams work — never a number on screen. Clear it any time.
          </p>
          {groups.map((g) => (
            <div key={g}>
              <h4 className="small muted">{g}</h4>
              {SCENARIO_INFO.filter((s) => s.symptom.group === g).map((s) => (
                <button
                  key={s.def.id}
                  role="menuitem"
                  className={`scenario-item ${active?.id === s.def.id ? 'on' : ''}`}
                  data-tour={`inject-${s.def.id}`}
                  onClick={() => {
                    injectScenario(s.def.id)
                    setOpen(false)
                  }}
                >
                  <span>{s.symptom.name}</span>
                  <span className="small muted">{s.def.mechanics}</span>
                </button>
              ))}
            </div>
          ))}
          <button className="link small" onClick={() => (setOpen(false), navigate({ page: 'diagnose' }))}>
            All 42 symptoms in Diagnose →
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Shown under the header on every screen while a scenario is active. */
export function ScenarioBanner() {
  const { clearScenario, navigate } = useApp()
  useApp((s) => s.version)
  const run = activeScenario()
  if (!run) return null
  const info = scenarioInfo(run.id)
  return (
    <div className="scenario-banner" role="status" data-tour="banner">
      <span className="dot" aria-hidden="true" />
      <div>
        <strong>Scenario active: {info?.symptom.name ?? run.name}</strong>
        <span className="small"> · since {fmtDateTime(run.from)}</span>
        {info ? <p className="small">{info.def.mechanics}</p> : null}
      </div>
      {info ? (
        <button className="link small" onClick={() => navigate({ page: 'diagnose', id: info.symptom.id })}>
          What to watch →
        </button>
      ) : null}
      <button className="clear" onClick={clearScenario} data-tour="clear">
        Clear
      </button>
    </div>
  )
}

/** Inject / clear on a Diagnose symptom card that has a simulator scenario. */
export function ScenarioControl({ scenarioId }: { scenarioId: string }) {
  const { injectScenario, clearScenario, ended } = useApp()
  useApp((s) => s.version)
  const info = scenarioInfo(scenarioId)
  const active = activeScenario()
  if (!info) return null
  const on = active?.id === scenarioId
  return (
    <section className={`notice scenario-control ${on ? 'on' : ''}`}>
      <div>
        <strong>{on ? 'This scenario is active' : 'Reproduce it in the simulator'}</strong>
        <p className="small">{info.def.mechanics}</p>
        <p className="small muted">
          {on
            ? 'Watch the early signals below turn first; the confirming ones follow days to weeks later.'
            : 'Injecting starts it at the current simulated moment; it stays on until you clear it.'}
        </p>
      </div>
      {on ? (
        <button className="clear" onClick={clearScenario}>
          Clear
        </button>
      ) : (
        <button className="inject" onClick={() => injectScenario(scenarioId)} disabled={ended} data-tour="inject-card">
          Inject scenario
        </button>
      )}
    </section>
  )
}
