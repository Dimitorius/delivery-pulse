import { fmtDateTime } from '../app/format'
import { PROGRAM_SCOPE } from '../app/pulse'
import { term } from '../app/lens'
import { LENSES, SPEEDS, eventStore, useApp, type Lens } from '../app/state'

function iterationLabel(now: number, scope: string, lens: Lens): string {
  const pi = eventStore.iterationList.find((i) => i.kind === 'pi' && i.start <= now && now < i.end)
  const teamId = scope === PROGRAM_SCOPE ? eventStore.teams.find((t) => t.method === 'scrum')?.id : scope
  const sprint = eventStore.iterationList.find((i) => i.kind === 'sprint' && i.teamId === teamId && i.start <= now && now < i.end)
  const it = sprint ? `${term('Sprint', lens)} ${sprint.index + 1}${sprint.ip ? ' · IP' : ''}` : scope !== PROGRAM_SCOPE ? 'continuous flow' : undefined
  return [pi?.name, it]
    .filter(Boolean)
    .join(' · ')
}

export function Header({ signalCount, onSignals }: { signalCount: number; onSignals: () => void }) {
  const { now, speed, setSpeed, scope, setScope, lens, setLens } = useApp()
  return (
    <header className="header">
      <div className="brand">
        <svg viewBox="0 0 48 24" width="32" height="16" aria-hidden="true">
          <polyline points="0,12 14,12 18,4 24,20 28,8 32,12 48,12" />
        </svg>
        <span>Delivery Pulse</span>
      </div>
      <label className="scope">
        <span className="sr-only">Level</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value={PROGRAM_SCOPE}>
            {term('Program', lens)} · {eventStore.program?.name ?? ''}
          </option>
          {eventStore.teams.map((t) => (
            <option key={t.id} value={t.id}>
              Team · {t.name} ({t.method === 'kanban' ? 'Kanban' : 'Scrum'})
            </option>
          ))}
        </select>
      </label>
      <label className="scope lens" title="Framework lens: rename the UI into a framework's vocabulary">
        <span className="lens-label small muted">Lens</span>
        <select value={lens} onChange={(e) => setLens(e.target.value as Lens)}>
          {LENSES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <div className="clock" title="Simulated time (UTC). 1× = one working hour per second.">
        <span className="clock-time num">{fmtDateTime(now)}</span>
        <span className="clock-iter">{iterationLabel(now, scope, lens)}</span>
      </div>
      <div className="speed" role="group" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button key={s} className={s === speed ? 'on' : ''} onClick={() => setSpeed(s)} aria-pressed={s === speed}>
            {s === 0 ? '❚❚' : `${s}×`}
          </button>
        ))}
      </div>
      <button className="ghost" disabled title="Scenarios arrive in stage 3">
        Inject scenario
      </button>
      <button className={`signals-count ${signalCount ? 'has' : ''}`} onClick={onSignals} title="Signals fired">
        <span className="num">{signalCount}</span> signals
      </button>
    </header>
  )
}
